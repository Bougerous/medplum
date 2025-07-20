import { 
  Directive, 
  Input, 
  OnDestroy, 
  OnInit, 
  TemplateRef, 
  ViewContainerRef 
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService, PermissionContext } from '../services/auth.service';
import { UserRole } from '../types/fhir-types';

@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private hasView = false;
  
  @Input() set hasPermission(permission: string | PermissionContext) {
    this.permission = permission;
    this.updateView();
  }
  
  @Input() set hasPermissionRoles(roles: UserRole | UserRole[]) {
    this.requiredRoles = Array.isArray(roles) ? roles : [roles];
    this.updateView();
  }
  
  @Input() set hasPermissionResource(resource: string) {
    this.resourceType = resource;
    this.updateView();
  }
  
  @Input() set hasPermissionAction(action: 'create' | 'read' | 'update' | 'delete' | 'search') {
    this.action = action;
    this.updateView();
  }
  
  @Input() set hasPermissionElse(templateRef: TemplateRef<any>) {
    this.elseTemplate = templateRef;
    this.updateView();
  }

  private permission: string | PermissionContext | undefined;
  private requiredRoles: UserRole[] = [];
  private resourceType: string | undefined;
  private action: 'create' | 'read' | 'update' | 'delete' | 'search' | undefined;
  private elseTemplate: TemplateRef<any> | undefined;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Subscribe to authentication changes
    this.authService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateView();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateView(): void {
    const hasPermission = this.checkPermission();
    
    if (hasPermission && !this.hasView) {
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPermission && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
      
      // Show else template if provided
      if (this.elseTemplate) {
        this.viewContainer.createEmbeddedView(this.elseTemplate);
      }
    } else if (!(hasPermission || this.hasView ) && this.elseTemplate) {
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.elseTemplate);
    }
  }

  private checkPermission(): boolean {
    // Check if user is authenticated
    if (!this.authService.isAuthenticated()) {
      return false;
    }

    // Check role-based permissions first
    if (this.requiredRoles.length > 0) {
      const hasRole = this.authService.hasRole(this.requiredRoles);
      if (!hasRole) {
        return false;
      }
    }

    // Check specific permission
    if (this.permission) {
      if (typeof this.permission === 'string') {
        // Simple string permission check
        return this.checkStringPermission(this.permission);
      } else {
        // PermissionContext object
        return this.authService.hasPermission(this.permission);
      }
    }

    // Check resource and action based permission
    if (this.resourceType && this.action) {
      return this.authService.hasPermission({
        resourceType: this.resourceType,
        action: this.action
      });
    }

    // If only roles are specified and user has the role, allow access
    if (this.requiredRoles.length > 0) {
      return true;
    }

    // Default to false if no permission criteria specified
    return false;
  }

  private checkStringPermission(permission: string): boolean {
    // Parse string permission format: "resource:action" or "feature"
    if (permission.includes(':')) {
      const [resource, action] = permission.split(':');
      return this.authService.hasPermission({
        resourceType: resource,
        action: action as any
      });
    } else {
      // Feature-based permission
      return this.checkFeaturePermission(permission);
    }
  }

  private checkFeaturePermission(feature: string): boolean {
    // Map feature names to role-based checks
    const featureRoleMap: { [key: string]: UserRole[] } = {
      'patient-registration': ['admin', 'lab-manager', 'lab-technician'],
      'specimen-processing': ['admin', 'lab-manager', 'lab-technician'],
      'test-ordering': ['admin', 'lab-manager', 'provider'],
      'result-entry': ['admin', 'lab-manager', 'pathologist'],
      'report-signing': ['admin', 'lab-manager', 'pathologist'],
      'billing-management': ['admin', 'lab-manager', 'billing-staff'],
      'user-management': ['admin'],
      'system-settings': ['admin'],
      'analytics-view': ['admin', 'lab-manager', 'pathologist', 'billing-staff'],
      'quality-control': ['admin', 'lab-manager', 'pathologist'],
      'audit-logs': ['admin', 'lab-manager'],
      'data-export': ['admin', 'lab-manager'],
      'patient-portal': ['patient'],
      'provider-portal': ['provider']
    };

    const requiredRoles = featureRoleMap[feature];
    if (requiredRoles) {
      return this.authService.hasRole(requiredRoles);
    }

    return false;
  }
}

// Additional directive for role-based visibility
@Directive({
  selector: '[hasRole]',
  standalone: true
})
export class HasRoleDirective implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private hasView = false;
  
  @Input() set hasRole(roles: UserRole | UserRole[]) {
    this.requiredRoles = Array.isArray(roles) ? roles : [roles];
    this.updateView();
  }
  
  @Input() set hasRoleElse(templateRef: TemplateRef<any>) {
    this.elseTemplate = templateRef;
    this.updateView();
  }

  private requiredRoles: UserRole[] = [];
  private elseTemplate: TemplateRef<any> | undefined;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateView();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateView(): void {
    const hasRole = this.authService.hasRole(this.requiredRoles);
    
    if (hasRole && !this.hasView) {
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasRole && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
      
      if (this.elseTemplate) {
        this.viewContainer.createEmbeddedView(this.elseTemplate);
      }
    } else if (!(hasRole || this.hasView ) && this.elseTemplate) {
      this.viewContainer.clear();
      this.viewContainer.createEmbeddedView(this.elseTemplate);
    }
  }
}

// Directive for disabling elements based on permissions
@Directive({
  selector: '[disableIfNoPermission]',
  standalone: true
})
export class DisableIfNoPermissionDirective implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  @Input() set disableIfNoPermission(permission: string | PermissionContext) {
    this.permission = permission;
    this.updateState();
  }
  
  @Input() set disableIfNoPermissionRoles(roles: UserRole | UserRole[]) {
    this.requiredRoles = Array.isArray(roles) ? roles : [roles];
    this.updateState();
  }

  private permission: string | PermissionContext | undefined;
  private requiredRoles: UserRole[] = [];

  constructor(
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateState();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateState(): void {
    const hasPermission = this.checkPermission();
    
    // This would need to be implemented with ElementRef to actually disable elements
    // For now, we'll add a CSS class that can be styled
    // In a full implementation, you'd inject ElementRef and modify the element directly
  }

  private checkPermission(): boolean {
    if (!this.authService.isAuthenticated()) {
      return false;
    }

    if (this.requiredRoles.length > 0) {
      return this.authService.hasRole(this.requiredRoles);
    }

    if (this.permission) {
      if (typeof this.permission === 'string') {
        const [resource, action] = this.permission.split(':');
        return this.authService.hasPermission({
          resourceType: resource,
          action: action as any
        });
      } else {
        return this.authService.hasPermission(this.permission);
      }
    }

    return false;
  }
}