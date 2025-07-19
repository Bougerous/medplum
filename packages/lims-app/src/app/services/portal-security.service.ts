import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { 
  Patient, 
  Practitioner, 
  Reference,
  Bundle,
  AuditEvent,
  AccessPolicy
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { ErrorHandlingService } from './error-handling.service';
import { SessionService } from './session.service';
import { UserProfile, LIMSErrorType } from '../types/fhir-types';

export interface PatientProviderRelationship {
  patientId: string;
  providerId: string;
  relationshipType: 'primary-care' | 'specialist' | 'consulting' | 'referring';
  startDate: string;
  endDate?: string;
  active: boolean;
  verifiedAt: string;
}

export interface PortalAccessPolicy {
  resourceType: string;
  allowedActions: string[];
  conditions: AccessCondition[];
  dataFilters: DataFilter[];
}

export interface AccessCondition {
  type: 'role' | 'relationship' | 'time' | 'location' | 'resource-owner';
  operator: 'equals' | 'in' | 'not-in' | 'before' | 'after' | 'between';
  value: any;
  description: string;
}

export interface DataFilter {
  field: string;
  operator: 'equals' | 'in' | 'not-in' | 'contains' | 'starts-with';
  value: any;
  description: string;
}

export interface SecurityAlert {
  id: string;
  type: 'suspicious-activity' | 'unauthorized-access' | 'data-breach' | 'session-anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  actions: string[];
}

export interface SessionMonitoring {
  userId: string;
  sessionId: string;
  startTime: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  location?: string;
  suspicious: boolean;
  riskScore: number;
  activities: SessionActivity[];
}

export interface SessionActivity {
  timestamp: Date;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
  riskScore: number;
}

@Injectable({
  providedIn: 'root'
})
export class PortalSecurityService {
  private patientProviderRelationships$ = new BehaviorSubject<PatientProviderRelationship[]>([]);
  private securityAlerts$ = new BehaviorSubject<SecurityAlert[]>([]);
  private activeSessions$ = new BehaviorSubject<SessionMonitoring[]>([]);
  private portalAccessPolicies: PortalAccessPolicy[] = [];
  
  // Security monitoring
  private monitoringInterval: any;
  private readonly MONITORING_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly SUSPICIOUS_ACTIVITY_THRESHOLD = 10;

  constructor(
    private medplumService: MedplumService,
    private authService: AuthService,
    private auditService: AuditService,
    private errorHandlingService: ErrorHandlingService,
    private sessionService: SessionService
  ) {
    this.initializePortalSecurity();
  }

  /**
   * Initialize portal security system
   */
  private async initializePortalSecurity(): Promise<void> {
    try {
      // Load access policies
      await this.loadPortalAccessPolicies();
      
      // Load patient-provider relationships
      await this.loadPatientProviderRelationships();
      
      // Start security monitoring
      this.startSecurityMonitoring();
      
      console.log('Portal security system initialized');
    } catch (error) {
      console.error('Failed to initialize portal security:', error);
      this.handleSecurityError('Failed to initialize portal security', error);
    }
  }

  /**
   * Load portal access policies
   */
  private async loadPortalAccessPolicies(): Promise<void> {
    try {
      const bundle = await this.medplumService.searchResources<AccessPolicy>(
        'AccessPolicy',
        {
          'name:contains': 'portal',
          '_count': '100'
        }
      );

      // Convert FHIR AccessPolicy to PortalAccessPolicy
      this.portalAccessPolicies = this.convertFHIRAccessPolicies(
        bundle.entry?.map(entry => entry.resource!).filter(Boolean) || []
      );

      console.log(`Loaded ${this.portalAccessPolicies.length} portal access policies`);
    } catch (error) {
      console.error('Failed to load portal access policies:', error);
      // Use default policies if loading fails
      this.portalAccessPolicies = this.getDefaultPortalAccessPolicies();
    }
  }

  /**
   * Convert FHIR AccessPolicy to PortalAccessPolicy
   */
  private convertFHIRAccessPolicies(fhirPolicies: AccessPolicy[]): PortalAccessPolicy[] {
    // This is a simplified conversion - in production, you'd implement
    // full FHIRPath expression parsing and evaluation
    return fhirPolicies.map(policy => ({
      resourceType: policy.resource?.[0]?.resourceType || '*',
      allowedActions: ['read'], // Simplified - would parse from policy
      conditions: [],
      dataFilters: []
    }));
  }

  /**
   * Get default portal access policies
   */
  private getDefaultPortalAccessPolicies(): PortalAccessPolicy[] {
    return [
      {
        resourceType: 'Patient',
        allowedActions: ['read', 'update'],
        conditions: [
          {
            type: 'role',
            operator: 'in',
            value: ['patient'],
            description: 'User must have patient role'
          },
          {
            type: 'resource-owner',
            operator: 'equals',
            value: true,
            description: 'User can only access their own patient record'
          }
        ],
        dataFilters: []
      },
      {
        resourceType: 'DiagnosticReport',
        allowedActions: ['read'],
        conditions: [
          {
            type: 'role',
            operator: 'in',
            value: ['patient', 'provider'],
            description: 'User must have patient or provider role'
          },
          {
            type: 'relationship',
            operator: 'equals',
            value: true,
            description: 'Must have valid patient-provider relationship'
          }
        ],
        dataFilters: []
      },
      {
        resourceType: 'ServiceRequest',
        allowedActions: ['read', 'create', 'update'],
        conditions: [
          {
            type: 'role',
            operator: 'in',
            value: ['provider'],
            description: 'User must have provider role'
          }
        ],
        dataFilters: []
      }
    ];
  }

  /**
   * Load patient-provider relationships
   */
  private async loadPatientProviderRelationships(): Promise<void> {
    try {
      // In a real implementation, this would query a specific resource type
      // or extension that tracks patient-provider relationships
      const relationships: PatientProviderRelationship[] = [];
      
      // For now, we'll derive relationships from Patient.generalPractitioner
      const patientBundle = await this.medplumService.searchResources<Patient>(
        'Patient',
        {
          '_has:general-practitioner': 'Practitioner',
          '_count': '1000'
        }
      );

      const patients = patientBundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
      
      for (const patient of patients) {
        if (patient.generalPractitioner) {
          for (const practitionerRef of patient.generalPractitioner) {
            if (practitionerRef.reference?.startsWith('Practitioner/')) {
              const providerId = practitionerRef.reference.replace('Practitioner/', '');
              relationships.push({
                patientId: patient.id!,
                providerId,
                relationshipType: 'primary-care',
                startDate: new Date().toISOString(),
                active: true,
                verifiedAt: new Date().toISOString()
              });
            }
          }
        }
      }

      this.patientProviderRelationships$.next(relationships);
      console.log(`Loaded ${relationships.length} patient-provider relationships`);
    } catch (error) {
      console.error('Failed to load patient-provider relationships:', error);
      this.patientProviderRelationships$.next([]);
    }
  }

  /**
   * Validate patient-provider relationship
   */
  async validatePatientProviderRelationship(
    patientId: string, 
    providerId: string
  ): Promise<boolean> {
    try {
      const relationships = this.patientProviderRelationships$.value;
      
      const relationship = relationships.find(rel => 
        rel.patientId === patientId && 
        rel.providerId === providerId && 
        rel.active
      );

      if (relationship) {
        // Log successful validation
        await this.auditService.logAuthorizationEvent(
          'relationship-validated',
          'Patient',
          patientId,
          { providerId, relationshipType: relationship.relationshipType }
        );
        return true;
      }

      // Log failed validation
      await this.auditService.logAuthorizationEvent(
        'relationship-validation-failed',
        'Patient',
        patientId,
        { providerId, reason: 'No active relationship found' }
      );

      // Create security alert for unauthorized access attempt
      await this.createSecurityAlert({
        type: 'unauthorized-access',
        severity: 'medium',
        userId: providerId,
        resourceType: 'Patient',
        resourceId: patientId,
        description: `Provider ${providerId} attempted to access patient ${patientId} without valid relationship`,
        actions: ['block-access', 'notify-security-team']
      });

      return false;
    } catch (error) {
      console.error('Error validating patient-provider relationship:', error);
      return false;
    }
  }

  /**
   * Check portal access permissions
   */
  async checkPortalAccess(
    userId: string,
    userRole: string,
    resourceType: string,
    action: string,
    resourceId?: string
  ): Promise<boolean> {
    try {
      // Find applicable access policy
      const policy = this.portalAccessPolicies.find(p => 
        p.resourceType === resourceType || p.resourceType === '*'
      );

      if (!policy) {
        await this.auditService.logAuthorizationEvent(
          'access-denied',
          resourceType,
          resourceId,
          { reason: 'No applicable access policy found', userId, action }
        );
        return false;
      }

      // Check if action is allowed
      if (!policy.allowedActions.includes(action) && !policy.allowedActions.includes('*')) {
        await this.auditService.logAuthorizationEvent(
          'access-denied',
          resourceType,
          resourceId,
          { reason: 'Action not allowed by policy', userId, action }
        );
        return false;
      }

      // Evaluate access conditions
      for (const condition of policy.conditions) {
        const conditionMet = await this.evaluateAccessCondition(
          condition,
          userId,
          userRole,
          resourceType,
          resourceId
        );

        if (!conditionMet) {
          await this.auditService.logAuthorizationEvent(
            'access-denied',
            resourceType,
            resourceId,
            { 
              reason: `Access condition not met: ${condition.description}`, 
              userId, 
              action,
              condition: condition.type
            }
          );
          return false;
        }
      }

      // Log successful access
      await this.auditService.logAuthorizationEvent(
        'access-granted',
        resourceType,
        resourceId,
        { userId, action, policy: policy.resourceType }
      );

      return true;
    } catch (error) {
      console.error('Error checking portal access:', error);
      return false;
    }
  }

  /**
   * Evaluate access condition
   */
  private async evaluateAccessCondition(
    condition: AccessCondition,
    userId: string,
    userRole: string,
    resourceType: string,
    resourceId?: string
  ): Promise<boolean> {
    switch (condition.type) {
      case 'role':
        return this.evaluateRoleCondition(condition, userRole);
      
      case 'relationship':
        return await this.evaluateRelationshipCondition(condition, userId, resourceId);
      
      case 'resource-owner':
        return await this.evaluateResourceOwnerCondition(condition, userId, resourceType, resourceId);
      
      case 'time':
        return this.evaluateTimeCondition(condition);
      
      default:
        console.warn(`Unknown access condition type: ${condition.type}`);
        return false;
    }
  }

  /**
   * Evaluate role condition
   */
  private evaluateRoleCondition(condition: AccessCondition, userRole: string): boolean {
    switch (condition.operator) {
      case 'equals':
        return userRole === condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(userRole);
      case 'not-in':
        return Array.isArray(condition.value) && !condition.value.includes(userRole);
      default:
        return false;
    }
  }

  /**
   * Evaluate relationship condition
   */
  private async evaluateRelationshipCondition(
    condition: AccessCondition,
    userId: string,
    resourceId?: string
  ): Promise<boolean> {
    if (!resourceId) return false;
    
    // For patient resources, check if user is the patient
    if (resourceId === userId) return true;
    
    // For other resources, check patient-provider relationship
    return await this.validatePatientProviderRelationship(resourceId, userId);
  }

  /**
   * Evaluate resource owner condition
   */
  private async evaluateResourceOwnerCondition(
    condition: AccessCondition,
    userId: string,
    resourceType: string,
    resourceId?: string
  ): Promise<boolean> {
    if (!resourceId) return false;
    
    try {
      // Check if user owns the resource
      if (resourceType === 'Patient') {
        return resourceId === userId;
      }
      
      // For other resources, check if they reference the user
      const resource = await this.medplumService.readResource(resourceType, resourceId);
      
      // Check various reference fields that might indicate ownership
      const ownershipFields = ['subject', 'patient', 'requester', 'performer'];
      
      for (const field of ownershipFields) {
        const fieldValue = (resource as any)[field];
        if (fieldValue) {
          if (Array.isArray(fieldValue)) {
            for (const ref of fieldValue) {
              if (ref.reference === `Practitioner/${userId}` || ref.reference === `Patient/${userId}`) {
                return true;
              }
            }
          } else if (fieldValue.reference === `Practitioner/${userId}` || fieldValue.reference === `Patient/${userId}`) {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error evaluating resource owner condition:', error);
      return false;
    }
  }

  /**
   * Evaluate time condition
   */
  private evaluateTimeCondition(condition: AccessCondition): boolean {
    const now = new Date();
    const conditionTime = new Date(condition.value);
    
    switch (condition.operator) {
      case 'before':
        return now < conditionTime;
      case 'after':
        return now > conditionTime;
      default:
        return true;
    }
  }

  /**
   * Create security alert
   */
  async createSecurityAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alert: SecurityAlert = {
      ...alertData,
      id: this.generateAlertId(),
      timestamp: new Date(),
      resolved: false
    };

    // Add to local alerts
    const currentAlerts = this.securityAlerts$.value;
    this.securityAlerts$.next([alert, ...currentAlerts]);

    // Log to audit service
    await this.auditService.logSecurityAlert(
      alert.type,
      {
        alertId: alert.id,
        severity: alert.severity,
        description: alert.description,
        userId: alert.userId,
        resourceType: alert.resourceType,
        resourceId: alert.resourceId
      }
    );

    // Take immediate action for critical alerts
    if (alert.severity === 'critical') {
      await this.handleCriticalSecurityAlert(alert);
    }

    console.log('Security alert created:', alert);
  }

  /**
   * Handle critical security alerts
   */
  private async handleCriticalSecurityAlert(alert: SecurityAlert): Promise<void> {
    try {
      // Immediate actions for critical alerts
      if (alert.userId) {
        // Force logout user
        await this.sessionService.terminateUserSessions(alert.userId);
        
        // Temporarily disable user account
        // This would typically involve updating the user's status
        console.log(`Critical alert: User ${alert.userId} sessions terminated`);
      }

      // Notify security team (in production, this would send actual notifications)
      console.log('CRITICAL SECURITY ALERT:', alert);
      
    } catch (error) {
      console.error('Error handling critical security alert:', error);
    }
  }

  /**
   * Start security monitoring
   */
  private startSecurityMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performSecurityChecks();
      } catch (error) {
        console.error('Error during security monitoring:', error);
      }
    }, this.MONITORING_INTERVAL_MS);
  }

  /**
   * Perform periodic security checks
   */
  private async performSecurityChecks(): Promise<void> {
    // Check for suspicious session activity
    await this.checkSuspiciousActivity();
    
    // Check for expired sessions
    await this.checkExpiredSessions();
    
    // Check for failed login attempts
    await this.checkFailedLoginAttempts();
  }

  /**
   * Check for suspicious activity
   */
  private async checkSuspiciousActivity(): Promise<void> {
    const sessions = this.activeSessions$.value;
    
    for (const session of sessions) {
      let riskScore = 0;
      
      // Check for rapid successive actions
      const recentActivities = session.activities.filter(
        activity => Date.now() - activity.timestamp.getTime() < 60000 // Last minute
      );
      
      if (recentActivities.length > 20) {
        riskScore += 5;
      }
      
      // Check for unusual access patterns
      const uniqueResourceTypes = new Set(
        recentActivities.map(activity => activity.resourceType).filter(Boolean)
      );
      
      if (uniqueResourceTypes.size > 10) {
        riskScore += 3;
      }
      
      // Update session risk score
      session.riskScore = riskScore;
      session.suspicious = riskScore >= this.SUSPICIOUS_ACTIVITY_THRESHOLD;
      
      // Create alert for suspicious activity
      if (session.suspicious && !session.activities.some(a => a.action === 'suspicious-activity-detected')) {
        await this.createSecurityAlert({
          type: 'suspicious-activity',
          severity: 'medium',
          userId: session.userId,
          description: `Suspicious activity detected for user ${session.userId} (risk score: ${riskScore})`,
          actions: ['monitor-closely', 'require-re-authentication']
        });
        
        // Add marker activity
        session.activities.push({
          timestamp: new Date(),
          action: 'suspicious-activity-detected',
          riskScore: riskScore
        });
      }
    }
  }

  /**
   * Check for expired sessions
   */
  private async checkExpiredSessions(): Promise<void> {
    const sessions = this.activeSessions$.value;
    const now = new Date();
    
    for (const session of sessions) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceLastActivity > this.SESSION_TIMEOUT_MS) {
        // Terminate expired session
        await this.sessionService.terminateSession(session.sessionId);
        
        // Remove from active sessions
        const updatedSessions = sessions.filter(s => s.sessionId !== session.sessionId);
        this.activeSessions$.next(updatedSessions);
        
        console.log(`Expired session terminated: ${session.sessionId}`);
      }
    }
  }

  /**
   * Check for failed login attempts
   */
  private async checkFailedLoginAttempts(): Promise<void> {
    // This would typically query audit logs for failed login attempts
    // For now, we'll implement a simplified version
    
    try {
      const recentAudits = await this.auditService.searchEvents({
        type: 'authentication',
        action: 'login-failure',
        fromDate: new Date(Date.now() - 3600000) // Last hour
      });
      
      // Group by user
      const failuresByUser = new Map<string, number>();
      
      for (const audit of recentAudits) {
        const userId = audit.userId || 'unknown';
        failuresByUser.set(userId, (failuresByUser.get(userId) || 0) + 1);
      }
      
      // Check for excessive failures
      for (const [userId, failures] of failuresByUser.entries()) {
        if (failures >= this.MAX_FAILED_ATTEMPTS) {
          await this.createSecurityAlert({
            type: 'suspicious-activity',
            severity: 'high',
            userId,
            description: `${failures} failed login attempts detected for user ${userId}`,
            actions: ['lock-account', 'notify-user', 'require-password-reset']
          });
        }
      }
    } catch (error) {
      console.error('Error checking failed login attempts:', error);
    }
  }

  /**
   * Get security alerts
   */
  getSecurityAlerts(): Observable<SecurityAlert[]> {
    return this.securityAlerts$.asObservable();
  }

  /**
   * Get patient-provider relationships
   */
  getPatientProviderRelationships(): Observable<PatientProviderRelationship[]> {
    return this.patientProviderRelationships$.asObservable();
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Observable<SessionMonitoring[]> {
    return this.activeSessions$.asObservable();
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle security errors
   */
  private handleSecurityError(message: string, error: unknown): void {
    this.errorHandlingService.handleError({
      type: LIMSErrorType.AUTHORIZATION_ERROR,
      message,
      details: error,
      timestamp: new Date()
    });
  }

  /**
   * Cleanup on service destruction
   */
  ngOnDestroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}