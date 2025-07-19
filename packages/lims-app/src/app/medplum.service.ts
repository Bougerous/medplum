import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { 
  Resource, 
  Bundle, 
  Subscription, 
  Patient,
  Specimen,
  ServiceRequest,
  DiagnosticReport,
  Observation,
  Practitioner
} from '@medplum/fhirtypes';

// Temporary mock environment for development
const environment = {
  production: false,
  medplumBaseUrl: 'https://api.medplum.com/',
  medplumClientId: '',
  medplumProjectId: '',
  enableDebugLogging: true,
  apiTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

import { SearchParams } from './types/fhir-types';
import { ErrorHandlingService } from './services/error-handling.service';
import { RetryService } from './services/retry.service';

// Mock interfaces for development - will be replaced with actual Medplum imports
interface MockMedplumClient {
  createResource<T extends Resource>(resource: T): Promise<T>;
  readResource<T extends Resource>(resourceType: string, id: string): Promise<T>;
  updateResource<T extends Resource>(resource: T): Promise<T>;
  deleteResource(resourceType: string, id: string): Promise<void>;
  search<T extends Resource>(resourceType: string, params?: SearchParams): Promise<Bundle<T>>;
  searchResources<T extends Resource>(resourceType: string, params?: SearchParams): Promise<T[]>;
  signInWithPassword(email: string, password: string, options?: any): Promise<any>;
  signOut(): Promise<void>;
  getProfile(): Practitioner | undefined;
  executeBatch(bundle: Bundle): Promise<Bundle>;
  graphql(query: string, variables?: any): Promise<any>;
}

interface LoginAuthenticationResponse {
  login: string;
  code?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MedplumService {
  private medplum: MockMedplumClient;
  private currentUser$ = new BehaviorSubject<Practitioner | null>(null);
  private isAuthenticated$ = new BehaviorSubject<boolean>(false);

  constructor(
    private errorHandlingService: ErrorHandlingService,
    private retryService: RetryService
  ) {
    // Initialize with mock client for now
    this.medplum = this.createMockClient();

    // Check if user is already authenticated
    this.checkAuthenticationStatus();
  }

  private createMockClient(): MockMedplumClient {
    return {
      async createResource<T extends Resource>(resource: T): Promise<T> {
        console.log('Mock createResource called with:', resource);
        return { ...resource, id: `mock-${Date.now()}` } as T;
      },

      async readResource<T extends Resource>(resourceType: string, id: string): Promise<T> {
        console.log('Mock readResource called with:', resourceType, id);
        return { resourceType, id } as unknown as T;
      },

      async updateResource<T extends Resource>(resource: T): Promise<T> {
        console.log('Mock updateResource called with:', resource);
        return resource;
      },

      async deleteResource(resourceType: string, id: string): Promise<void> {
        console.log('Mock deleteResource called with:', resourceType, id);
      },

      async search<T extends Resource>(resourceType: string, params?: SearchParams): Promise<Bundle<T>> {
        console.log('Mock search called with:', resourceType, params);
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: []
        } as Bundle<T>;
      },

      async searchResources<T extends Resource>(resourceType: string, params?: SearchParams): Promise<T[]> {
        console.log('Mock searchResources called with:', resourceType, params);
        if (resourceType === 'Patient') {
          return [
            {
              resourceType: 'Patient',
              id: 'patient-1',
              name: [{ given: ['John'], family: 'Doe' }],
              birthDate: '1980-01-01'
            },
            {
              resourceType: 'Patient',
              id: 'patient-2',
              name: [{ given: ['Jane'], family: 'Smith' }],
              birthDate: '1990-05-15'
            }
          ] as T[];
        }
        return [];
      },

      async signInWithPassword(email: string, password: string, options?: any): Promise<any> {
        console.log('Mock signInWithPassword called with:', email, options);
        return { login: email };
      },

      async signOut(): Promise<void> {
        console.log('Mock signOut called');
      },

      getProfile: (): Practitioner | undefined => {
        return undefined;
      },

      async executeBatch(bundle: Bundle): Promise<Bundle> {
        console.log('Mock executeBatch called with:', bundle);
        return bundle;
      },

      async graphql(query: string, variables?: any): Promise<any> {
        console.log('Mock graphql called with:', query, variables);
        return {};
      }
    };
  }

  // Authentication Methods
  async signIn(email: string, password: string, projectId?: string): Promise<LoginAuthenticationResponse> {
    try {
      const response = await this.medplum.signInWithPassword(email, password, {
        projectId: projectId || environment.medplumProjectId
      });
      
      const profile = this.medplum.getProfile();
      this.currentUser$.next(profile || null);
      this.isAuthenticated$.next(true);
      
      if (environment.enableDebugLogging) {
        console.log('Successfully signed in:', profile);
      }
      
      return response;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'authentication');
      this.handleUnauthenticated();
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.medplum.signOut();
      this.currentUser$.next(null);
      this.isAuthenticated$.next(false);
      
      if (environment.enableDebugLogging) {
        console.log('Successfully signed out');
      }
    } catch (error) {
      this.errorHandlingService.handleError(error, 'authentication');
      throw error;
    }
  }

  getCurrentUser(): Practitioner | undefined {
    return this.medplum.getProfile();
  }

  getCurrentUser$(): Observable<Practitioner | null> {
    return this.currentUser$.asObservable();
  }

  getAuthenticationStatus$(): Observable<boolean> {
    return this.isAuthenticated$.asObservable();
  }

  // FHIR Resource CRUD Operations
  async createResource<T extends Resource>(resource: T): Promise<T> {
    try {
      const result = await this.retryService.executeWithRetry(
        () => this.medplum.createResource(resource),
        RetryService.createConfig('api')
      );
      
      if (environment.enableDebugLogging) {
        console.log('Created resource:', result);
      }
      
      return result as T;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'createResource');
      throw error;
    }
  }

  async readResource<T extends Resource>(resourceType: string, id: string): Promise<T> {
    try {
      const result = await this.retryService.executeWithRetry(
        () => this.medplum.readResource(resourceType, id),
        RetryService.createConfig('api')
      );
      
      if (environment.enableDebugLogging) {
        console.log('Read resource:', result);
      }
      
      return result as T;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'readResource');
      throw error;
    }
  }

  async updateResource<T extends Resource>(resource: T): Promise<T> {
    try {
      const result = await this.retryService.executeWithRetry(
        () => this.medplum.updateResource(resource),
        RetryService.createConfig('api')
      );
      
      if (environment.enableDebugLogging) {
        console.log('Updated resource:', result);
      }
      
      return result;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'updateResource');
      throw error;
    }
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    try {
      await this.retryService.executeWithRetry(
        () => this.medplum.deleteResource(resourceType, id),
        RetryService.createConfig('api')
      );
      
      if (environment.enableDebugLogging) {
        console.log('Deleted resource:', resourceType, id);
      }
    } catch (error) {
      this.errorHandlingService.handleError(error, 'deleteResource');
      throw error;
    }
  }

  async searchResources<T extends Resource>(
    resourceType: string, 
    params?: SearchParams
  ): Promise<Bundle<T>> {
    try {
      const result = await this.retryService.executeWithRetry(
        () => this.medplum.search(resourceType, params),
        RetryService.createConfig('api')
      );
      
      if (environment.enableDebugLogging) {
        console.log('Search results:', result);
      }
      
      return result as Bundle<T>;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'searchResources');
      throw error;
    }
  }

  // Convenience methods for common resources
  async searchPatients(params?: SearchParams): Promise<Patient[]> {
    const bundle = await this.searchResources<Patient>('Patient', params);
    return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
  }

  async searchSpecimens(params?: SearchParams): Promise<Specimen[]> {
    const bundle = await this.searchResources<Specimen>('Specimen', params);
    return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
  }

  async searchServiceRequests(params?: SearchParams): Promise<ServiceRequest[]> {
    const bundle = await this.searchResources<ServiceRequest>('ServiceRequest', params);
    return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
  }

  async searchDiagnosticReports(params?: SearchParams): Promise<DiagnosticReport[]> {
    const bundle = await this.searchResources<DiagnosticReport>('DiagnosticReport', params);
    return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
  }

  async searchObservations(params?: SearchParams): Promise<Observation[]> {
    const bundle = await this.searchResources<Observation>('Observation', params);
    return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
  }

  // Subscription Management
  async createSubscription(criteria: string, endpoint: string): Promise<Subscription> {
    try {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'requested',
        reason: 'LIMS workflow automation',
        criteria,
        channel: {
          type: 'rest-hook',
          endpoint,
          payload: 'application/fhir+json'
        }
      };

      const result = await this.createResource(subscription);
      
      if (environment.enableDebugLogging) {
        console.log('Created subscription:', result);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to create subscription:', error);
      throw error;
    }
  }

  async updateSubscription(subscription: Subscription): Promise<Subscription> {
    try {
      const result = await this.updateResource(subscription);
      
      if (environment.enableDebugLogging) {
        console.log('Updated subscription:', result);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to update subscription:', error);
      throw error;
    }
  }

  async deleteSubscription(id: string): Promise<void> {
    try {
      await this.deleteResource('Subscription', id);
      
      if (environment.enableDebugLogging) {
        console.log('Deleted subscription:', id);
      }
    } catch (error) {
      console.error('Failed to delete subscription:', error);
      throw error;
    }
  }

  // Batch Operations
  async executeBatch(bundle: Bundle): Promise<Bundle> {
    try {
      const result = await this.medplum.executeBatch(bundle);
      
      if (environment.enableDebugLogging) {
        console.log('Executed batch:', result);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to execute batch:', error);
      throw error;
    }
  }

  // GraphQL Support
  async graphql(query: string, variables?: any): Promise<any> {
    try {
      const result = await this.medplum.graphql(query, variables);
      
      if (environment.enableDebugLogging) {
        console.log('GraphQL result:', result);
      }
      
      return result;
    } catch (error) {
      console.error('GraphQL query failed:', error);
      throw error;
    }
  }

  // Utility Methods
  getMedplumClient(): MockMedplumClient {
    return this.medplum;
  }

  private async checkAuthenticationStatus(): Promise<void> {
    try {
      const profile = await this.medplum.getProfile();
      if (profile) {
        this.currentUser$.next(profile);
        this.isAuthenticated$.next(true);
      }
    } catch (error) {
      // User is not authenticated, which is fine
      this.handleUnauthenticated();
    }
  }

  private handleUnauthenticated(): void {
    this.currentUser$.next(null);
    this.isAuthenticated$.next(false);
    
    if (environment.enableDebugLogging) {
      console.log('User is not authenticated');
    }
  }
}
