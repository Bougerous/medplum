import { TestBed } from '@angular/core/testing';
import { ErrorHandlingService, LIMSError } from './error-handling.service';
import { NotificationService } from './notification.service';
import { LIMSErrorType } from '../types/fhir-types';

describe('ErrorHandlingService', () => {
  let service: ErrorHandlingService;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;

  beforeEach(() => {
    const notificationSpy = jasmine.createSpyObj('NotificationService', [
      'showError', 'showWarning', 'showInfo'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ErrorHandlingService,
        { provide: NotificationService, useValue: notificationSpy }
      ]
    });

    service = TestBed.inject(ErrorHandlingService);
    mockNotificationService = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;

    // Spy on console methods
    spyOn(console, 'error');
    spyOn(console, 'warn');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.AUTHENTICATION_ERROR,
        message: 'Invalid credentials',
        timestamp: new Date(),
        userId: 'test@example.com'
      };

      service.handleError(error);

      expect(console.error).toHaveBeenCalledWith('LIMS Error:', error);
      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'Authentication failed. Please check your credentials and try again.'
      );
    });

    it('should handle authorization errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.AUTHORIZATION_ERROR,
        message: 'Access denied',
        timestamp: new Date(),
        userId: 'test@example.com',
        resourceType: 'Patient'
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'You do not have permission to access this resource.'
      );
    });

    it('should handle validation errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Required field missing',
        timestamp: new Date(),
        details: { field: 'patient.name' }
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'Please check your input and correct any validation errors.'
      );
    });

    it('should handle network errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.NETWORK_ERROR,
        message: 'Connection timeout',
        timestamp: new Date()
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'Network connection error. Please check your internet connection and try again.'
      );
    });

    it('should handle FHIR errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.FHIR_ERROR,
        message: 'Invalid resource format',
        timestamp: new Date(),
        resourceType: 'Patient',
        resourceId: 'test-patient'
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'Data format error. Please contact support if this problem persists.'
      );
    });

    it('should handle workflow errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Workflow step failed',
        timestamp: new Date()
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'Workflow error occurred. Please try again or contact support.'
      );
    });

    it('should handle integration errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'External service unavailable',
        timestamp: new Date()
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'External service error. Please try again later.'
      );
    });

    it('should handle unknown error types', () => {
      const error: LIMSError = {
        type: 'UNKNOWN_ERROR' as LIMSErrorType,
        message: 'Something went wrong',
        timestamp: new Date()
      };

      service.handleError(error);

      expect(mockNotificationService.showError).toHaveBeenCalledWith(
        'An unexpected error occurred. Please try again or contact support.'
      );
    });
  });

  describe('Error Logging', () => {
    it('should log errors to error log', () => {
      const error: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Test error',
        timestamp: new Date()
      };

      service.handleError(error);

      service.getErrorLog().subscribe(errorLog => {
        expect(errorLog).toContain(error);
      });
    });

    it('should maintain error log history', () => {
      const error1: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'First error',
        timestamp: new Date()
      };

      const error2: LIMSError = {
        type: LIMSErrorType.NETWORK_ERROR,
        message: 'Second error',
        timestamp: new Date()
      };

      service.handleError(error1);
      service.handleError(error2);

      service.getErrorLog().subscribe(errorLog => {
        expect(errorLog.length).toBe(2);
        expect(errorLog).toContain(error1);
        expect(errorLog).toContain(error2);
      });
    });

    it('should limit error log size', () => {
      // Generate more errors than the limit
      for (let i = 0; i < 150; i++) {
        const error: LIMSError = {
          type: LIMSErrorType.VALIDATION_ERROR,
          message: `Error ${i}`,
          timestamp: new Date()
        };
        service.handleError(error);
      }

      service.getErrorLog().subscribe(errorLog => {
        expect(errorLog.length).toBeLessThanOrEqual(100); // Assuming max log size is 100
      });
    });
  });

  describe('Critical Error Detection', () => {
    it('should identify critical authentication errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.AUTHENTICATION_ERROR,
        message: 'Authentication failed',
        timestamp: new Date()
      };

      const isCritical = service['isCriticalError'](error);
      expect(isCritical).toBe(true);
    });

    it('should identify critical FHIR errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.FHIR_ERROR,
        message: 'Data corruption detected',
        timestamp: new Date()
      };

      const isCritical = service['isCriticalError'](error);
      expect(isCritical).toBe(true);
    });

    it('should not identify validation errors as critical', () => {
      const error: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Required field missing',
        timestamp: new Date()
      };

      const isCritical = service['isCriticalError'](error);
      expect(isCritical).toBe(false);
    });
  });

  describe('Error Recovery', () => {
    it('should provide recovery suggestions for network errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.NETWORK_ERROR,
        message: 'Connection timeout',
        timestamp: new Date()
      };

      const suggestions = service.getRecoverySuggestions(error);

      expect(suggestions).toContain('Check your internet connection');
      expect(suggestions).toContain('Try refreshing the page');
    });

    it('should provide recovery suggestions for validation errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Required field missing',
        timestamp: new Date(),
        details: { field: 'patient.name' }
      };

      const suggestions = service.getRecoverySuggestions(error);

      expect(suggestions).toContain('Check required fields');
      expect(suggestions).toContain('Verify data format');
    });

    it('should provide generic recovery suggestions for unknown errors', () => {
      const error: LIMSError = {
        type: 'UNKNOWN_ERROR' as LIMSErrorType,
        message: 'Something went wrong',
        timestamp: new Date()
      };

      const suggestions = service.getRecoverySuggestions(error);

      expect(suggestions).toContain('Try again');
      expect(suggestions).toContain('Contact support');
    });
  });

  describe('Error Statistics', () => {
    it('should track error counts by type', () => {
      const validationError: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Validation failed',
        timestamp: new Date()
      };

      const networkError: LIMSError = {
        type: LIMSErrorType.NETWORK_ERROR,
        message: 'Network failed',
        timestamp: new Date()
      };

      service.handleError(validationError);
      service.handleError(validationError);
      service.handleError(networkError);

      const stats = service.getErrorStatistics();

      expect(stats[LIMSErrorType.VALIDATION_ERROR]).toBe(2);
      expect(stats[LIMSErrorType.NETWORK_ERROR]).toBe(1);
    });

    it('should provide error statistics observable', (done) => {
      const error: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Test error',
        timestamp: new Date()
      };

      service.getErrorStatistics$().subscribe(stats => {
        if (stats[LIMSErrorType.VALIDATION_ERROR] > 0) {
          expect(stats[LIMSErrorType.VALIDATION_ERROR]).toBe(1);
          done();
        }
      });

      service.handleError(error);
    });
  });

  describe('Error Context', () => {
    it('should capture error context information', () => {
      const error: LIMSError = {
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Workflow failed',
        timestamp: new Date(),
        userId: 'test@example.com',
        resourceType: 'Specimen',
        resourceId: 'test-specimen'
      };

      service.handleError(error);

      service.getErrorLog().subscribe(errorLog => {
        const loggedError = errorLog[errorLog.length - 1];
        expect(loggedError.userId).toBe('test@example.com');
        expect(loggedError.resourceType).toBe('Specimen');
        expect(loggedError.resourceId).toBe('test-specimen');
      });
    });

    it('should add browser context to errors', () => {
      const error: LIMSError = {
        type: LIMSErrorType.NETWORK_ERROR,
        message: 'Network failed',
        timestamp: new Date()
      };

      service.handleError(error);

      service.getErrorLog().subscribe(errorLog => {
        const loggedError = errorLog[errorLog.length - 1];
        expect(loggedError.context).toBeTruthy();
        expect(loggedError.context?.userAgent).toBeTruthy();
        expect(loggedError.context?.url).toBeTruthy();
      });
    });
  });

  describe('Error Clearing', () => {
    it('should clear error log', () => {
      const error: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Test error',
        timestamp: new Date()
      };

      service.handleError(error);
      service.clearErrorLog();

      service.getErrorLog().subscribe(errorLog => {
        expect(errorLog.length).toBe(0);
      });
    });

    it('should clear errors by type', () => {
      const validationError: LIMSError = {
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Validation error',
        timestamp: new Date()
      };

      const networkError: LIMSError = {
        type: LIMSErrorType.NETWORK_ERROR,
        message: 'Network error',
        timestamp: new Date()
      };

      service.handleError(validationError);
      service.handleError(networkError);

      service.clearErrorsByType(LIMSErrorType.VALIDATION_ERROR);

      service.getErrorLog().subscribe(errorLog => {
        expect(errorLog.length).toBe(1);
        expect(errorLog[0].type).toBe(LIMSErrorType.NETWORK_ERROR);
      });
    });
  });
});