import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  Router,
  RouterStateSnapshot
} from '@angular/router';
import { from, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuditService } from '../services/audit.service';
import { AuthService } from '../services/auth.service';
import { PortalSecurityService } from '../services/portal-security.service';
import { UserProfile, UserRole } from '../types/fhir-types';

export interface PortalGuardConfig {
  requiredRoles: UserRole[];
  requiresPatientRelationship?: boolean;
  allowedActions?: string[];
  resourceType?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PortalGuard implements CanActivate, CanActivateChild {
  private authService = inject(AuthService);
  private portalSecurityService = inject(PortalSecurityService);
  private auditService = inject(AuditService);
  private router = inject(Router);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.checkPortalAccess(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.checkPortalAccess(childRoute, state);
  }

  /**
   * Check portal access permissions
   */
  private checkPortalAccess(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.authService.getCurrentUser().pipe(
      switchMap((user) => {
        if (!user) {
          this.auditService.logAuthorizationEvent(
            'access-denied',
            'Portal',
            undefined,
            { reason: 'User not authenticated', url: state.url }
          );
          this.router.navigate(['/login'], {
            queryParams: { returnUrl: state.url }
          });
          return of(false);
        }

        // Get portal configuration from route data
        const portalConfig: PortalGuardConfig = route.data.portalConfig || {};

        // Check role requirements
        if (portalConfig.requiredRoles && portalConfig.requiredRoles.length > 0) {
          const hasRequiredRole = portalConfig.requiredRoles.some(role =>
            user.roles.includes(role)
          );

          if (!hasRequiredRole) {
            this.auditService.logAuthorizationEvent(
              'access-denied',
              'Portal',
              undefined,
              {
                reason: 'Insufficient role permissions',
                requiredRoles: portalConfig.requiredRoles,
                userRoles: user.roles,
                url: state.url,
                userId: user.practitioner.id
              }
            );

            this.router.navigate(['/access-denied']);
            return of(false);
          }
        }

        // Check resource-specific permissions and patient relationship
        return from(this.checkResourcePermissions(user, portalConfig, route, state));
      }),
      catchError((error) => {
        console.error('Error in portal guard:', error);

        this.auditService.logAuthorizationEvent(
          'access-denied',
          'Portal',
          undefined,
          {
            reason: 'Guard error',
            error: error.message,
            url: state.url
          }
        );

        this.router.navigate(['/error']);
        return of(false);
      })
    );
  }

  private async checkResourcePermissions(
    user: UserProfile,
    portalConfig: PortalGuardConfig,
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    // Check resource-specific permissions
    if (portalConfig.resourceType && portalConfig.allowedActions) {
      const resourceId = route.params.id;

      for (const action of portalConfig.allowedActions) {
        const hasAccess = await this.portalSecurityService.checkPortalAccess(
          user.practitioner.id || '',
          user.roles[0], // Primary role
          portalConfig.resourceType,
          action,
          resourceId
        );

        if (!hasAccess) {
          await this.auditService.logAuthorizationEvent(
            'access-denied',
            portalConfig.resourceType,
            resourceId,
            {
              reason: 'Resource access denied',
              action,
              url: state.url,
              userId: user.practitioner.id
            }
          );

          this.router.navigate(['/access-denied']);
          return false;
        }
      }
    }

    // Check patient-provider relationship if required
    if (portalConfig.requiresPatientRelationship) {
      const patientId = route.params.patientId || route.params.id;

      if (patientId && user.roles.includes('provider')) {
        const hasRelationship = await this.portalSecurityService.validatePatientProviderRelationship(
          patientId,
          user.practitioner.id || ''
        );

        if (!hasRelationship) {
          await this.auditService.logAuthorizationEvent(
            'access-denied',
            'Patient',
            patientId,
            {
              reason: 'No valid patient-provider relationship',
              providerId: user.practitioner.id,
              url: state.url
            }
          );

          this.router.navigate(['/access-denied']);
          return false;
        }
      }
    }

    // Log successful access
    await this.auditService.logAuthorizationEvent(
      'access-granted',
      'Portal',
      undefined,
      {
        url: state.url,
        userId: user.practitioner.id,
        roles: user.roles
      }
    );

    return true;
  }
}

/**
 * Patient Portal Guard - Specific guard for patient portal routes
 */
@Injectable({
  providedIn: 'root'
})
export class PatientPortalGuard implements CanActivate, CanActivateChild {
  private portalGuard = inject(PortalGuard);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    // Set patient portal specific configuration
    route.data = {
      ...route.data,
      portalConfig: {
        requiredRoles: ['patient'],
        resourceType: 'Patient',
        allowedActions: ['read', 'update']
      }
    };

    return this.portalGuard.canActivate(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.canActivate(childRoute, state);
  }
}

/**
 * Provider Portal Guard - Specific guard for provider portal routes
 */
@Injectable({
  providedIn: 'root'
})
export class ProviderPortalGuard implements CanActivate, CanActivateChild {
  private portalGuard = inject(PortalGuard);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    // Set provider portal specific configuration
    route.data = {
      ...route.data,
      portalConfig: {
        requiredRoles: ['provider'],
        requiresPatientRelationship: true,
        resourceType: 'ServiceRequest',
        allowedActions: ['read', 'create', 'update']
      }
    };

    return this.portalGuard.canActivate(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.canActivate(childRoute, state);
  }
}