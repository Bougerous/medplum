import { Injectable, inject } from '@angular/core';
import { 
  ActivatedRouteSnapshot, 
  CanActivate, 
  CanActivateChild, 
  Router, 
  RouterStateSnapshot 
} from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate, CanActivateChild {
  private authService = inject(AuthService);
  private router = inject(Router);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() {}

  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.checkAuthentication(state);
  }

  canActivateChild(
    _childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.checkAuthentication(state);
  }

  private checkAuthentication(state: RouterStateSnapshot): Observable<boolean> {
    return this.authService.getAuthenticationStatus().pipe(
      take(1),
      map(isAuthenticated => {
        if (isAuthenticated) {
          // Refresh session on route navigation
          this.authService.refreshSession();
          return true;
        } else {
          // Redirect to login with return URL
          this.router.navigate(['/login'], { 
            queryParams: { returnUrl: state.url } 
          });
          return false;
        }
      })
    );
  }
}