import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LIMSError, LIMSErrorType } from '../types/fhir-types';
// import { environment } from '../../environments/environment';

// Temporary mock environment for development
const environment = {
  enableDebugLogging: true
};
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlingService {
  private errorLog$ = new BehaviorSubject<LIMSError[]>([]);
  private currentError$ = new BehaviorSubject<LIMSError | null>(null);

  constructor(private notificationService: NotificationService) {}

  /**
   * Handle and process errors throughout the application
   */
  handleError(error: any, context?: string): void {
    const limsError = this.createLIMSError(error, context);
    
    // Log error to console
    if (environment.enableDebugLogging) {
      console.error('LIMS Error:', limsError);
    }
    
    // Store in error log
    this.addToErrorLog(limsError);
    
    // Set as current error for UI display
    this.currentError$.next(limsError);
    
    // Send to monitoring service if critical
    if (this.isCriticalError(limsError)) {
      this.sendToMonitoring(limsError);
    }
    
    // Show user-friendly message
    this.showUserMessage(limsError);
  }

  /**
   * Create a standardized LIMS error from various error types
   */
  private createLIMSError(error: any, context?: string): LIMSError {
    let errorType: LIMSErrorType;
    let message: string;
    let details: any = error;

    // Determine error type based on error characteristics
    if (error?.status === 401 || error?.message?.includes('unauthorized')) {
      errorType = LIMSErrorType.AUTHENTICATION_ERROR;
      message = 'Authentication failed. Please sign in again.';
    } else if (error?.status === 403 || error?.message?.includes('forbidden')) {
      errorType = LIMSErrorType.AUTHORIZATION_ERROR;
      message = 'You do not have permission to perform this action.';
    } else if (error?.status >= 400 && error?.status < 500) {
      errorType = LIMSErrorType.VALIDATION_ERROR;
      message = error?.message || 'Invalid data provided.';
    } else if (error?.status >= 500 || error?.name === 'NetworkError') {
      errorType = LIMSErrorType.NETWORK_ERROR;
      message = 'Network error occurred. Please check your connection.';
    } else if (error?.resourceType || error?.issue) {
      errorType = LIMSErrorType.FHIR_ERROR;
      message = this.extractFHIRErrorMessage(error);
    } else if (context?.includes('workflow')) {
      errorType = LIMSErrorType.WORKFLOW_ERROR;
      message = 'Workflow error occurred. Please contact support.';
    } else if (context?.includes('integration')) {
      errorType = LIMSErrorType.INTEGRATION_ERROR;
      message = 'External service integration error.';
    } else {
      errorType = LIMSErrorType.NETWORK_ERROR;
      message = error?.message || 'An unexpected error occurred.';
    }

    return {
      type: errorType,
      message,
      details,
      timestamp: new Date(),
      userId: this.getCurrentUserId(),
      resourceType: error?.resourceType,
      resourceId: error?.id
    };
  }

  /**
   * Extract meaningful error message from FHIR OperationOutcome
   */
  private extractFHIRErrorMessage(error: any): string {
    if (error?.issue && Array.isArray(error.issue)) {
      const firstIssue = error.issue[0];
      return firstIssue?.diagnostics || firstIssue?.details?.text || 'FHIR operation failed.';
    }
    return error?.message || 'FHIR resource error occurred.';
  }

  /**
   * Add error to the error log
   */
  private addToErrorLog(error: LIMSError): void {
    const currentErrors = this.errorLog$.value;
    const updatedErrors = [error, ...currentErrors].slice(0, 100); // Keep last 100 errors
    this.errorLog$.next(updatedErrors);
  }

  /**
   * Determine if error is critical and requires immediate attention
   */
  private isCriticalError(error: LIMSError): boolean {
    return [
      LIMSErrorType.AUTHENTICATION_ERROR,
      LIMSErrorType.FHIR_ERROR,
      LIMSErrorType.WORKFLOW_ERROR
    ].includes(error.type);
  }

  /**
   * Send critical errors to monitoring service
   */
  private sendToMonitoring(error: LIMSError): void {
    // In a real implementation, this would send to a monitoring service
    // like Sentry, DataDog, or custom logging endpoint
    if (environment.enableDebugLogging) {
      console.warn('Critical error detected:', error);
    }
    
    // TODO: Implement actual monitoring service integration
    // Example: this.monitoringService.reportError(error);
  }

  /**
   * Show user-friendly error message
   */
  private showUserMessage(error: LIMSError): void {
    // Show notification to user
    this.notificationService.showLIMSError(error);
    
    if (environment.enableDebugLogging) {
      console.log('Displaying error to user:', error.message);
    }
  }

  /**
   * Get current user ID for error tracking
   */
  private getCurrentUserId(): string | undefined {
    // This would typically get the current user from an auth service
    // For now, return undefined
    return undefined;
  }

  /**
   * Clear the current error
   */
  clearCurrentError(): void {
    this.currentError$.next(null);
  }

  /**
   * Get observable of current error for UI display
   */
  getCurrentError$(): Observable<LIMSError | null> {
    return this.currentError$.asObservable();
  }

  /**
   * Get observable of error log
   */
  getErrorLog$(): Observable<LIMSError[]> {
    return this.errorLog$.asObservable();
  }

  /**
   * Get error statistics
   */
  getErrorStats(): { total: number; byType: Record<LIMSErrorType, number> } {
    const errors = this.errorLog$.value;
    const stats = {
      total: errors.length,
      byType: {} as Record<LIMSErrorType, number>
    };

    // Initialize all error types with 0
    Object.values(LIMSErrorType).forEach(type => {
      stats.byType[type] = 0;
    });

    // Count errors by type
    errors.forEach(error => {
      stats.byType[error.type]++;
    });

    return stats;
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog$.next([]);
  }
}