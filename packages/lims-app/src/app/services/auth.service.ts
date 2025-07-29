import { Injectable, inject } from '@angular/core';
import { 
  AccessPolicy, 
  AuditEvent, 
  Practitioner, 
  ProjectMembership,
} from '@medplum/fhirtypes';
import { BehaviorSubject, Observable, } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { LIMSErrorType, UserProfile, UserRole } from '../types/fhir-types';
import { ErrorHandlingService } from './error-handling.service';

export interface LoginCredentials {
  email: string;
  password: string;
  projectId?: string;
}

export interface PermissionContext {
  resourceType: string;
  resourceId?: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'search';
  compartment?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private medplumService = inject(MedplumService);
  private errorHandlingService = inject(ErrorHandlingService);

  private currentUser$ = new BehaviorSubject<UserProfile | null>(null);
  private isAuthenticated$ = new BehaviorSubject<boolean>(false);
  private permissions$ = new BehaviorSubject<AccessPolicy[]>([]);
  private sessionTimeout: any;
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]); // 30 minutes

  constructor() {
    this.initializeAuthState();
  }

  /**
   * Initialize authentication state on service creation
   */
  private async initializeAuthState(): Promise<void> {
    try {
      const currentPractitioner = this.medplumService.getCurrentUser();
      if (currentPractitioner) {
        await this.loadUserProfile(currentPractitioner);
        this.startSessionTimeout();
      }
    } catch (error) {
      console.warn('Failed to initialize auth state:', error);
      this.handleUnauthenticated();
    }
  }

  /**
   * Authenticate user with email and password
   */
  async login(credentials: LoginCredentials): Promise<boolean> {
    try {
      // Create audit event for login attempt
      await this.createAuditEvent('login-attempt', credentials.email);

      const response = await this.medplumService.signIn(
        credentials.email, 
        credentials.password, 
        credentials.projectId
      );

      if (response) {
        const practitioner = this.medplumService.getCurrentUser();
        if (practitioner) {
          await this.loadUserProfile(practitioner);
          this.isAuthenticated$.next(true);
          this.startSessionTimeout();
          
          // Create audit event for successful login
          await this.createAuditEvent('login-success', credentials.email);
          
          return true;
        }
      }
      
      throw new Error('Authentication failed - no user profile returned');
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.AUTHENTICATION_ERROR,
        message: 'Login failed',
        details: error,
        timestamp: new Date(),
        userId: credentials.email
      });
      
      // Create audit event for failed login
      await this.createAuditEvent('login-failure', credentials.email, error);
      
      this.handleUnauthenticated();
      return false;
    }
  }

  /**
   * Sign out current user
   */
  async logout(): Promise<void> {
    try {
      const currentUser = this.currentUser$.value;
      const userId = currentUser?.practitioner.id;
      
      // Create audit event for logout
      if (userId) {
        await this.createAuditEvent('logout', userId);
      }
      
      await this.medplumService.signOut();
      this.handleUnauthenticated();
      this.clearSessionTimeout();
      
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.AUTHENTICATION_ERROR,
        message: 'Logout failed',
        details: error,
        timestamp: new Date()
      });
      
      // Force logout even if API call fails
      this.handleUnauthenticated();
      this.clearSessionTimeout();
    }
  }

  /**
   * Load complete user profile including permissions and roles
   */
  private async loadUserProfile(practitioner: Practitioner): Promise<void> {
    try {
      // Load project membership
      const projectMembership = await this.loadProjectMembership(practitioner.id!);
      
      // Load access policies
      const accessPolicies = await this.loadAccessPolicies(practitioner.id!);
      
      // Determine user roles from access policies and project membership
      const roles = this.determineUserRoles(accessPolicies, projectMembership);
      
      const userProfile: UserProfile = {
        practitioner,
        projectMembership,
        accessPolicies,
        roles
      };
      
      this.currentUser$.next(userProfile);
      this.permissions$.next(accessPolicies);
      
    } catch (error) {
      console.error('Failed to load user profile:', error);
      throw error;
    }
  }

  /**
   * Load project membership for the user
   */
  private async loadProjectMembership(practitionerId: string): Promise<ProjectMembership | undefined> {
    try {
      const bundle = await this.medplumService.searchResources<ProjectMembership>(
        'ProjectMembership',
        { user: `Practitioner/${practitionerId}` }
      );
      
      return bundle.entry?.[0]?.resource;
    } catch (error) {
      console.warn('Failed to load project membership:', error);
      return undefined;
    }
  }

  /**
   * Load access policies for the user
   */
  private async loadAccessPolicies(practitionerId: string): Promise<AccessPolicy[]> {
    try {
      const bundle = await this.medplumService.searchResources<AccessPolicy>(
        'AccessPolicy',
        { 'resource:Practitioner': practitionerId }
      );
      
      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.warn('Failed to load access policies:', error);
      return [];
    }
  }

  /**
   * Determine user roles from access policies and project membership
   */
  private determineUserRoles(
    accessPolicies: AccessPolicy[], 
    projectMembership?: ProjectMembership
  ): UserRole[] {
    const roles: UserRole[] = [];
    
    // Check project membership for admin role
    if (projectMembership?.admin) {
      roles.push('admin');
    }
    
    // Analyze access policies to determine roles
    for (const policy of accessPolicies) {
      if (policy.name?.includes('lab-technician') || 
          policy.name?.includes('technician')) {
        roles.push('lab-technician');
      }
      
      if (policy.name?.includes('pathologist')) {
        roles.push('pathologist');
      }
      
      if (policy.name?.includes('lab-manager') || 
          policy.name?.includes('manager')) {
        roles.push('lab-manager');
      }
      
      if (policy.name?.includes('billing')) {
        roles.push('billing-staff');
      }
      
      if (policy.name?.includes('provider')) {
        roles.push('provider');
      }
      
      if (policy.name?.includes('patient')) {
        roles.push('patient');
      }
    }
    
    // Default role if no specific roles found
    if (roles.length === 0) {
      roles.push('lab-technician');
    }
    
    return [...new Set(roles)]; // Remove duplicates
  }

  /**
   * Check if user has permission for specific action
   */
  hasPermission(context: PermissionContext): boolean {
    const accessPolicies = this.permissions$.value;
    
    if (accessPolicies.length === 0) {
      return false;
    }
    
    // Check each access policy
    for (const policy of accessPolicies) {
      if (this.evaluateAccessPolicy(policy, context)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Evaluate a single access policy against permission context
   */
  private evaluateAccessPolicy(policy: AccessPolicy, context: PermissionContext): boolean {
    // This is a simplified evaluation - in production, you'd use FHIRPath
    // expressions and more sophisticated policy evaluation
    
    if (!policy.resource) {
      return false;
    }
    
    // Check if policy applies to the resource type
    const resourceMatches = policy.resource.some(resource => {
      if (resource.resourceType === context.resourceType) {
        return true;
      }
      if (resource.resourceType === '*') {
        return true;
      }
      return false;
    });
    
    if (!resourceMatches) {
      return false;
    }
    
    // Check if the action is allowed
    // This would typically involve evaluating FHIRPath expressions
    // For now, we'll use a simplified approach
    return true;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasRole(roles: UserRole | UserRole[]): boolean {
    const userRoles = this.currentUser$.value?.roles || [];
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    return requiredRoles.some(role => userRoles.includes(role));
  }

  /**
   * Check if user can access specific resource
   */
  canAccessResource(resourceType: string, resourceId?: string): boolean {
    return this.hasPermission({
      resourceType,
      resourceId,
      action: 'read'
    });
  }

  /**
   * Check if user can perform action on resource
   */
  canPerformAction(resourceType: string, action: 'create' | 'read' | 'update' | 'delete'): boolean {
    return this.hasPermission({
      resourceType,
      action
    });
  }

  /**
   * Get current user profile
   */
  getCurrentUser(): Observable<UserProfile | null> {
    return this.currentUser$.asObservable();
  }

  /**
   * Get current user synchronously
   */
  getCurrentUserSync(): UserProfile | null {
    return this.currentUser$.value;
  }

  /**
   * Get authentication status
   */
  getAuthenticationStatus(): Observable<boolean> {
    return this.isAuthenticated$.asObservable();
  }

  /**
   * Get user permissions
   */
  getPermissions(): Observable<AccessPolicy[]> {
    return this.permissions$.asObservable();
  }

  /**
   * Get user roles
   */
  getUserRoles(): UserRole[] {
    return this.currentUser$.value?.roles || [];
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.isAuthenticated$.value;
  }

  /**
   * Create audit event for security-related actions
   */
  private async createAuditEvent(
    action: string, 
    userId: string, 
    error?: any
  ): Promise<void> {
    try {
      const auditEvent: AuditEvent = {
        resourceType: 'AuditEvent',
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
          code: 'rest',
          display: 'RESTful Operation'
        },
        action: action as any,
        recorded: new Date().toISOString(),
        outcome: error ? '8' : '0', // 0 = success, 8 = serious failure
        agent: [{
          type: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/extra-security-role-type',
              code: 'humanuser',
              display: 'Human User'
            }]
          },
          who: {
            identifier: {
              value: userId
            }
          },
          requestor: true
        }],
        source: {
          site: 'LIMS Application',
          observer: {
            display: 'LIMS Auth Service'
          }
        }
      };
      
      if (error) {
        auditEvent.outcomeDesc = error.message || 'Authentication error';
      }
      
      await this.medplumService.createResource(auditEvent);
    } catch (auditError) {
      console.error('Failed to create audit event:', auditError);
      // Don't throw - audit failures shouldn't break authentication
    }
  }

  /**
   * Handle unauthenticated state
   */
  private handleUnauthenticated(): void {
    this.currentUser$.next(null);
    this.isAuthenticated$.next(false);
    this.permissions$.next([]);
    this.clearSessionTimeout();
  }

  /**
   * Start session timeout timer
   */
  private startSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      this.logout();
    }, this.SESSION_TIMEOUT_MS);
  }

  /**
   * Clear session timeout timer
   */
  private clearSessionTimeout(): void {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
  }

  /**
   * Refresh session timeout (call on user activity)
   */
  refreshSession(): void {
    if (this.isAuthenticated()) {
      this.startSessionTimeout();
    }
  }
}