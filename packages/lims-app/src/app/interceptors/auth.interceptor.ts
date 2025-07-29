import {
  HttpErrorResponse, 
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { LIMSErrorType } from '../types/fhir-types';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private authService = inject(AuthService);
  private router = inject(Router);
  private errorHandlingService = inject(ErrorHandlingService);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);


  constructor() {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    
    // Skip authentication for login requests and public endpoints
    if (this.shouldSkipAuth(request)) {
      return next.handle(request);
    }

    return this.authService.getAuthenticationStatus().pipe(
      take(1),
      switchMap(isAuthenticated => {
        if (isAuthenticated) {
          // Add authentication headers
          const authRequest = this.addAuthHeaders(request);
          
          // Refresh session on API activity
          this.authService.refreshSession();
          
          return next.handle(authRequest).pipe(
            catchError(error => this.handleAuthError(error, request, next))
          );
        } else {
          // Redirect to login if not authenticated
          this.router.navigate(['/login']);
          return throwError(() => new Error('User not authenticated'));
        }
      })
    );
  }

  private shouldSkipAuth(request: HttpRequest<any>): boolean {
    const skipAuthUrls = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/public'
    ];

    return skipAuthUrls.some(url => request.url.includes(url));
  }

  private addAuthHeaders(request: HttpRequest<any>): HttpRequest<any> {
    const currentUser = this.authService.getCurrentUserSync();
    
    if (!currentUser) {
      return request;
    }

    // Add standard authentication headers
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/fhir+json',
      'Accept': 'application/fhir+json'
    };

    // Add authorization header if available
    // In a real Medplum implementation, this would include the access token
    const accessToken = this.getAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    // Add user context headers
    if (currentUser.practitioner.id) {
      headers['X-User-ID'] = currentUser.practitioner.id;
    }

    // Add project context if available
    if (currentUser.projectMembership?.project?.reference) {
      const projectId = currentUser.projectMembership.project.reference.split('/')[1];
      headers['X-Project-ID'] = projectId;
    }

    // Add request tracking header
    headers['X-Request-ID'] = this.generateRequestId();

    return request.clone({
      setHeaders: headers
    });
  }

  private getAccessToken(): string | null {
    // In a real implementation, this would retrieve the access token
    // from the Medplum client or local storage
    return localStorage.getItem('medplum_access_token');
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleAuthError(
    error: HttpErrorResponse,
    originalRequest: HttpRequest<any>,
    _next: HttpHandler
  ): Observable<HttpEvent<any>> {
    
    if (error.status === 401) {
      // Handle unauthorized access
      this.handleUnauthorized(error);
      return throwError(() => error);
    }

    if (error.status === 403) {
      // Handle forbidden access
      this.handleForbidden(error, originalRequest);
      return throwError(() => error);
    }

    if (error.status >= 500) {
      // Handle server errors
      this.handleServerError(error);
    }

    // Log the error for monitoring
    this.logApiError(error, originalRequest);

    return throwError(() => error);
  }

  private handleUnauthorized(error: HttpErrorResponse): void {
    console.warn('Unauthorized access detected, redirecting to login');
    
    // Log security event
    this.errorHandlingService.handleError({
      type: LIMSErrorType.AUTHENTICATION_ERROR,
      message: 'Unauthorized API access',
      details: error,
      timestamp: new Date()
    });

    // Sign out user and redirect to login
    this.authService.logout().then(() => {
      this.router.navigate(['/login'], {
        queryParams: { reason: 'session_expired' }
      });
    });
  }

  private handleForbidden(error: HttpErrorResponse, request: HttpRequest<any>): void {
    console.warn('Forbidden access detected:', request.url);
    
    // Log security event
    this.errorHandlingService.handleError({
      type: LIMSErrorType.AUTHORIZATION_ERROR,
      message: 'Forbidden API access',
      details: { error, url: request.url },
      timestamp: new Date()
    });

    // Redirect to access denied page
    this.router.navigate(['/access-denied'], {
      queryParams: { resource: request.url }
    });
  }

  private handleServerError(error: HttpErrorResponse): void {
    this.errorHandlingService.handleError({
      type: LIMSErrorType.NETWORK_ERROR,
      message: 'Server error occurred',
      details: error,
      timestamp: new Date()
    });
  }

  private logApiError(error: HttpErrorResponse, request: HttpRequest<any>): void {
    const errorDetails = {
      url: request.url,
      method: request.method,
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      timestamp: new Date().toISOString()
    };

    console.error('API Error:', errorDetails);

    // In a production environment, you would send this to a logging service
    // this.loggingService.logError(errorDetails);
  }
}