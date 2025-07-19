import { TestBed } from '@angular/core/testing';
import { MedplumService } from './medplum.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { RetryService } from './services/retry.service';
import { Patient, Specimen, ServiceRequest, DiagnosticReport, Observation, Bundle } from '@medplum/fhirtypes';

describe('MedplumService', () => {
  let service: MedplumService;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;
  let mockRetryService: jasmine.SpyObj<RetryService>;

  beforeEach(() => {
    const errorSpy = jasmine.createSpyObj('ErrorHandlingService', ['handleError']);
    const retrySpy = jasmine.createSpyObj('RetryService', ['executeWithRetry']);

    // Configure retry service to execute operations directly for testing
    retrySpy.executeWithRetry.and.callFake((operation: () => Promise<any>) => operation());

    TestBed.configureTestingModule({
      providers: [
        MedplumService,
        { provide: ErrorHandlingService, useValue: errorSpy },
        { provide: RetryService, useValue: retrySpy }
      ]
    });

    service = TestBed.inject(MedplumService);
    mockErrorHandlingService = TestBed.inject(ErrorHandlingService) as jasmine.SpyObj<ErrorHandlingService>;
    mockRetryService = TestBed.inject(RetryService) as jasmine.SpyObj<RetryService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Authentication', () => {
    it('should sign in with valid credentials', async () => {
      const result = await service.signIn('test@example.com', 'password');
      
      expect(result).toBeTruthy();
      expect(result.login).toBe('test@example.com');
    });

    it('should handle sign in errors', async () => {
      spyOn(service['medplum'], 'signInWithPassword').and.rejectWith(new Error('Invalid credentials'));
      
      try {
        await service.signIn('invalid@example.com', 'wrongpassword');
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
      }
    });

    it('should sign out successfully', async () => {
      await service.signOut();
      
      expect(service.getCurrentUser()).toBeUndefined();
      expect(service.getAuthenticationStatus$().value).toBeFalse();
    });

    it('should get current user', () => {
      const user = service.getCurrentUser();
      expect(user).toBeUndefined(); // Mock client returns undefined
    });
  });

  describe('FHIR Resource Operations', () => {
    it('should create a resource', async () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'Doe' }],
        birthDate: '1980-01-01'
      };

      const result = await service.createResource(patient);
      
      expect(result).toBeTruthy();
      expect(result.resourceType).toBe('Patient');
      expect(result.id).toContain('mock-');
    });

    it('should read a resource', async () => {
      const result = await service.readResource<Patient>('Patient', 'test-id');
      
      expect(result).toBeTruthy();
      expect(result.resourceType).toBe('Patient');
      expect(result.id).toBe('test-id');
    });

    it('should update a resource', async () => {
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'test-id',
        name: [{ given: ['Jane'], family: 'Smith' }],
        birthDate: '1990-05-15'
      };

      const result = await service.updateResource(patient);
      
      expect(result).toBeTruthy();
      expect(result.id).toBe('test-id');
    });

    it('should delete a resource', async () => {
      await service.deleteResource('Patient', 'test-id');
      
      // Should complete without error
      expect(true).toBe(true);
    });

    it('should search resources', async () => {
      const result = await service.searchResources<Patient>('Patient', { name: 'John' });
      
      expect(result).toBeTruthy();
      expect(result.resourceType).toBe('Bundle');
      expect(result.type).toBe('searchset');
    });

    it('should handle resource operation errors', async () => {
      spyOn(service['medplum'], 'createResource').and.rejectWith(new Error('Network error'));
      
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ given: ['Test'], family: 'Patient' }]
      };

      try {
        await service.createResource(patient);
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
      }
    });
  });

  describe('Convenience Methods', () => {
    it('should search patients', async () => {
      const patients = await service.searchPatients({ name: 'John' });
      
      expect(patients).toBeTruthy();
      expect(Array.isArray(patients)).toBe(true);
    });

    it('should search specimens', async () => {
      const specimens = await service.searchSpecimens({ status: 'available' });
      
      expect(specimens).toBeTruthy();
      expect(Array.isArray(specimens)).toBe(true);
    });

    it('should search service requests', async () => {
      const serviceRequests = await service.searchServiceRequests({ status: 'active' });
      
      expect(serviceRequests).toBeTruthy();
      expect(Array.isArray(serviceRequests)).toBe(true);
    });

    it('should search diagnostic reports', async () => {
      const reports = await service.searchDiagnosticReports({ status: 'final' });
      
      expect(reports).toBeTruthy();
      expect(Array.isArray(reports)).toBe(true);
    });

    it('should search observations', async () => {
      const observations = await service.searchObservations({ status: 'final' });
      
      expect(observations).toBeTruthy();
      expect(Array.isArray(observations)).toBe(true);
    });
  });

  describe('Subscription Management', () => {
    it('should create a subscription', async () => {
      const subscription = await service.createSubscription(
        'DiagnosticReport?status=final',
        'https://example.com/webhook'
      );
      
      expect(subscription).toBeTruthy();
      expect(subscription.resourceType).toBe('Subscription');
      expect(subscription.criteria).toBe('DiagnosticReport?status=final');
      expect(subscription.channel?.endpoint).toBe('https://example.com/webhook');
    });

    it('should update a subscription', async () => {
      const subscription = {
        resourceType: 'Subscription' as const,
        id: 'test-subscription',
        status: 'active' as const,
        reason: 'Test subscription',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook' as const,
          endpoint: 'https://example.com/webhook'
        }
      };

      const result = await service.updateSubscription(subscription);
      
      expect(result).toBeTruthy();
      expect(result.id).toBe('test-subscription');
    });

    it('should delete a subscription', async () => {
      await service.deleteSubscription('test-subscription');
      
      // Should complete without error
      expect(true).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should execute batch operations', async () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: {
              method: 'POST',
              url: 'Patient'
            },
            resource: {
              resourceType: 'Patient',
              name: [{ given: ['Test'], family: 'Patient' }]
            }
          }
        ]
      };

      const result = await service.executeBatch(bundle);
      
      expect(result).toBeTruthy();
      expect(result.resourceType).toBe('Bundle');
    });
  });

  describe('GraphQL Support', () => {
    it('should execute GraphQL queries', async () => {
      const query = `
        query GetPatients {
          PatientList {
            id
            name {
              given
              family
            }
          }
        }
      `;

      const result = await service.graphql(query);
      
      expect(result).toBeTruthy();
    });

    it('should execute GraphQL queries with variables', async () => {
      const query = `
        query GetPatient($id: ID!) {
          Patient(id: $id) {
            id
            name {
              given
              family
            }
          }
        }
      `;

      const variables = { id: 'test-patient' };
      const result = await service.graphql(query, variables);
      
      expect(result).toBeTruthy();
    });
  });

  describe('Utility Methods', () => {
    it('should get Medplum client', () => {
      const client = service.getMedplumClient();
      
      expect(client).toBeTruthy();
    });

    it('should handle authentication status changes', () => {
      const authStatus$ = service.getAuthenticationStatus$();
      
      expect(authStatus$).toBeTruthy();
      expect(authStatus$.value).toBeFalse();
    });

    it('should handle current user changes', () => {
      const currentUser$ = service.getCurrentUser$();
      
      expect(currentUser$).toBeTruthy();
      expect(currentUser$.value).toBeNull();
    });
  });
});