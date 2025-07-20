import { Injectable } from '@angular/core';
import { 
  ActivatedRouteSnapshot, 
  CanActivate, 
  CanActivateChild, 
  Router, 
  RouterStateSnapshot 
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';
import { UserRole } from '../types/fhir-types';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate, CanActivateChild {

  constructor(
    private authService: AuthService,
    private roleService: RoleService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.checkAccess(route, state);
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.checkAccess(childRoute, state);
  }

  private checkAccess(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.authService.getCurrentUser().pipe(
      take(1),
      map(user => {
        // Check if user is authenticated
        if (!user) {
          this.router.navigate(['/login'], { 
            queryParams: { returnUrl: state.url } 
          });
          return false;
        }

        // Get required roles from route data
        const requiredRoles = route.data.roles as UserRole[];
        const requiredPermissions = route.data.permissions as string[];
        const requireAll = route.data.requireAll as boolean;

        // If no specific requirements, allow access for authenticated users
        if (!(requiredRoles || requiredPermissions)) {
          return true;
        }

        // Check role requirements
        if (requiredRoles && requiredRoles.length > 0) {
          const hasRequiredRole = requireAll 
            ? requiredRoles.every(role => user.roles.includes(role))
            : requiredRoles.some(role => user.roles.includes(role));

          if (!hasRequiredRole) {
            this.handleAccessDenied(state.url);
            return false;
          }
        }

        // Check permission requirements
        if (requiredPermissions && requiredPermissions.length > 0) {
          const permissions = this.roleService.getRolePermissions(user.roles);
          
          const hasRequiredPermission = requireAll
            ? requiredPermissions.every(perm => this.checkPermission(permissions, perm))
            : requiredPermissions.some(perm => this.checkPermission(permissions, perm));

          if (!hasRequiredPermission) {
            this.handleAccessDenied(state.url);
            return false;
          }
        }

        return true;
      }),
      catchError(error => {
        console.error('Error checking route access:', error);
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }

  private checkPermission(permissions: any, permissionKey: string): boolean {
    return permissions[permissionKey] === true;
  }

  private handleAccessDenied(attemptedUrl: string): void {
    console.warn(`Access denied to: ${attemptedUrl}`);
    this.router.navigate(['/access-denied'], {
      queryParams: { attemptedUrl }
    });
  }
}