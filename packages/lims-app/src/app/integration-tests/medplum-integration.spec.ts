import { TestBed } from '@angular/core/testing';
import { Bundle, DiagnosticReport, Patient, ServiceRequest, Specimen } from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { RetryService } from '../services/retry.service';

// Integration test configuration
const INTEGRATION_TEST_CONFIG = {
  enabled: false, // Set to true when running against actual Medplum instance
  baseUrl: 'https://api.medplum.com/',
  testProjectId: 'test-project-id',
  testCredentials: {
    email: 'test@example.com',
    password: 'test-password'
  }
};

describe('Medplum Integration Tests', () => {
  let service: MedplumService;
  let testPatient: Patient;
  let testSpecimen: Specimen;
  let testServiceRequest: ServiceRequest;

  beforeEach(() => {
    if (!INTEGRATION_TEST_CONFIG.enabled) {
      pending('Integration tests are disabled. Set INTEGRATION_TEST_CONFIG.enabled = true to run.');
    }

    TestBed.configureTestingModule({
      providers: [
        MedplumService,
        ErrorHandlingService,
        RetryService
      ]
    });

    service = TestBed.inject(MedplumService);
  });

  afterEach(async () => {
    if (INTEGRATION_TEST_CONFIG.enabled) {
      // Clean up test resources
      try {
        if (testPatient?.id) {
          await service.deleteResource('Patient', testPatient.id);
        }
        if (testSpecimen?.id) {
          await service.deleteResource('Specimen', testSpecimen.id);
        }
        if (testServiceRequest?.id) {
          await service.deleteResource('ServiceRequest', testServiceRequest.id);
        }
      } catch (error) {
        console.warn('Cleanup failed:', error);
      }
    }
  });

  describe('Authentication Integration', () => {
    it('should authenticate with valid credentials', async () => {
      const result = await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );

      expect(result).toBeTruthy();
      expect(result.login).toBe(INTEGRATION_TEST_CONFIG.testCredentials.email);
    });

    it('should reject invalid credentials', async () => {
      try {
        await service.signIn('invalid@example.com', 'wrongpassword');
        fail('Should have thrown an authentication error');
      } catch (error) {
        expect(error).toBeTruthy();
      }
    });

    it('should maintain authentication state', async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );

      const currentUser = service.getCurrentUser();
      expect(currentUser).toBeTruthy();

      const authStatus = service.getAuthenticationStatus$();
      expect(authStatus.value).toBe(true);
    });
  });

  describe('Patient Resource Integration', () => {
    beforeEach(async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );
    });

    it('should create a patient resource', async () => {
      const patientData: Patient = {
        resourceType: 'Patient',
        name: [{ given: ['Integration'], family: 'Test' }],
        birthDate: '1990-01-01',
        gender: 'unknown',
        identifier: [{
          system: 'http://lims.local/patient-id',
          value: `INT-TEST-${Date.now()}`
        }]
      };

      testPatient = await service.createResource(patientData);

      expect(testPatient).toBeTruthy();
      expect(testPatient.id).toBeTruthy();
      expect(testPatient.resourceType).toBe('Patient');
      expect(testPatient.name?.[0]?.given?.[0]).toBe('Integration');
    });

    it('should read a patient resource', async () => {
      // First create a patient
      const patientData: Patient = {
        resourceType: 'Patient',
        name: [{ given: ['Read'], family: 'Test' }],
        birthDate: '1985-05-15'
      };

      testPatient = await service.createResource(patientData);

      // Then read it back
      const readPatient = await service.readResource<Patient>('Patient', testPatient.id!);

      expect(readPatient).toBeTruthy();
      expect(readPatient.id).toBe(testPatient.id);
      expect(readPatient.name?.[0]?.given?.[0]).toBe('Read');
    });

    it('should update a patient resource', async () => {
      // Create a patient
      const patientData: Patient = {
        resourceType: 'Patient',
        name: [{ given: ['Update'], family: 'Test' }],
        birthDate: '1975-12-25'
      };

      testPatient = await service.createResource(patientData);

      // Update the patient
      const updatedPatient = {
        ...testPatient,
        name: [{ given: ['Updated'], family: 'Test' }]
      };

      const result = await service.updateResource(updatedPatient);

      expect(result.name?.[0]?.given?.[0]).toBe('Updated');
    });

    it('should search for patients', async () => {
      // Create a patient with unique identifier
      const uniqueId = `SEARCH-TEST-${Date.now()}`;
      const patientData: Patient = {
        resourceType: 'Patient',
        name: [{ given: ['Search'], family: 'Test' }],
        identifier: [{
          system: 'http://lims.local/patient-id',
          value: uniqueId
        }]
      };

      testPatient = await service.createResource(patientData);

      // Search for the patient
      const searchResults = await service.searchPatients({
        identifier: uniqueId
      });

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.some(p => p.id === testPatient.id)).toBe(true);
    });
  });

  describe('Specimen Resource Integration', () => {
    beforeEach(async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );

      // Create a test patient for specimens
      testPatient = await service.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Specimen'], family: 'Test' }],
        birthDate: '1980-01-01'
      });
    });

    it('should create a specimen resource', async () => {
      const specimenData: Specimen = {
        resourceType: 'Specimen',
        status: 'available',
        type: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '119376003',
            display: 'Tissue specimen'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        accessionIdentifier: {
          system: 'http://lims.local/accession-id',
          value: `ACC-${Date.now()}`
        },
        collection: {
          collectedDateTime: new Date().toISOString(),
          method: {
            coding: [{
              system: 'http://snomed.info/sct',
              code: '129314006',
              display: 'Biopsy'
            }]
          }
        }
      };

      testSpecimen = await service.createResource(specimenData);

      expect(testSpecimen).toBeTruthy();
      expect(testSpecimen.id).toBeTruthy();
      expect(testSpecimen.resourceType).toBe('Specimen');
      expect(testSpecimen.subject?.reference).toBe(`Patient/${testPatient.id}`);
    });

    it('should search specimens by patient', async () => {
      // Create a specimen
      const specimenData: Specimen = {
        resourceType: 'Specimen',
        status: 'available',
        type: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '119376003',
            display: 'Tissue specimen'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        accessionIdentifier: {
          value: `SEARCH-SPEC-${Date.now()}`
        }
      };

      testSpecimen = await service.createResource(specimenData);

      // Search for specimens by patient
      const searchResults = await service.searchSpecimens({
        subject: `Patient/${testPatient.id}`
      });

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.some(s => s.id === testSpecimen.id)).toBe(true);
    });
  });

  describe('Workflow Integration', () => {
    beforeEach(async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );

      // Create test patient
      testPatient = await service.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Workflow'], family: 'Test' }],
        birthDate: '1985-06-15'
      });
    });

    it('should create complete workflow resources', async () => {
      // Create ServiceRequest
      const serviceRequestData: ServiceRequest = {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '33747-0',
            display: 'Histopathology study'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        authoredOn: new Date().toISOString()
      };

      testServiceRequest = await service.createResource(serviceRequestData);

      // Create Specimen
      const specimenData: Specimen = {
        resourceType: 'Specimen',
        status: 'available',
        type: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '119376003',
            display: 'Tissue specimen'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        request: [{ reference: `ServiceRequest/${testServiceRequest.id}` }],
        accessionIdentifier: {
          value: `WF-${Date.now()}`
        }
      };

      testSpecimen = await service.createResource(specimenData);

      // Create DiagnosticReport
      const diagnosticReportData: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        status: 'final',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'LAB',
            display: 'Laboratory'
          }]
        }],
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '33747-0',
            display: 'Histopathology study'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        basedOn: [{ reference: `ServiceRequest/${testServiceRequest.id}` }],
        specimen: [{ reference: `Specimen/${testSpecimen.id}` }],
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
        conclusion: 'Integration test diagnostic report'
      };

      const diagnosticReport = await service.createResource(diagnosticReportData);

      // Verify all resources are linked correctly
      expect(testServiceRequest.subject?.reference).toBe(`Patient/${testPatient.id}`);
      expect(testSpecimen.subject?.reference).toBe(`Patient/${testPatient.id}`);
      expect(testSpecimen.request?.[0]?.reference).toBe(`ServiceRequest/${testServiceRequest.id}`);
      expect(diagnosticReport.subject?.reference).toBe(`Patient/${testPatient.id}`);
      expect(diagnosticReport.basedOn?.[0]?.reference).toBe(`ServiceRequest/${testServiceRequest.id}`);
      expect(diagnosticReport.specimen?.[0]?.reference).toBe(`Specimen/${testSpecimen.id}`);

      // Clean up the diagnostic report
      await service.deleteResource('DiagnosticReport', diagnosticReport.id!);
    });
  });

  describe('Batch Operations Integration', () => {
    beforeEach(async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );
    });

    it('should execute batch operations', async () => {
      const batchBundle: Bundle = {
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
              name: [{ given: ['Batch'], family: 'Test1' }],
              birthDate: '1990-01-01'
            }
          },
          {
            request: {
              method: 'POST',
              url: 'Patient'
            },
            resource: {
              resourceType: 'Patient',
              name: [{ given: ['Batch'], family: 'Test2' }],
              birthDate: '1991-02-02'
            }
          }
        ]
      };

      const result = await service.executeBatch(batchBundle);

      expect(result).toBeTruthy();
      expect(result.resourceType).toBe('Bundle');
      expect(result.entry?.length).toBe(2);

      // Clean up created patients
      for (const entry of result.entry || []) {
        if (entry.response?.status?.startsWith('201') && entry.response.location) {
          const resourceId = entry.response.location.split('/').pop();
          if (resourceId) {
            await service.deleteResource('Patient', resourceId);
          }
        }
      }
    });
  });

  describe('Error Handling Integration', () => {
    beforeEach(async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );
    });

    it('should handle resource not found errors', async () => {
      try {
        await service.readResource('Patient', 'nonexistent-id');
        fail('Should have thrown a not found error');
      } catch (error) {
        expect(error).toBeTruthy();
        // Medplum typically returns 404 errors for not found resources
      }
    });

    it('should handle validation errors', async () => {
      const invalidPatient: Patient = {
        resourceType: 'Patient',
        // Missing required fields or invalid data
        birthDate: 'invalid-date'
      };

      try {
        await service.createResource(invalidPatient);
        fail('Should have thrown a validation error');
      } catch (error) {
        expect(error).toBeTruthy();
      }
    });
  });

  describe('Search Integration', () => {
    beforeEach(async () => {
      await service.signIn(
        INTEGRATION_TEST_CONFIG.testCredentials.email,
        INTEGRATION_TEST_CONFIG.testCredentials.password,
        INTEGRATION_TEST_CONFIG.testProjectId
      );
    });

    it('should perform complex searches', async () => {
      // Create test data
      const uniqueFamily = `SearchTest${Date.now()}`;
      
      testPatient = await service.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Complex'], family: uniqueFamily }],
        birthDate: '1980-01-01',
        gender: 'male'
      });

      // Perform complex search
      const searchResults = await service.searchResources<Patient>('Patient', {
        family: uniqueFamily,
        gender: 'male',
        birthdate: 'ge1979-01-01'
      });

      expect(searchResults.entry?.length).toBeGreaterThan(0);
      expect(searchResults.entry?.some(e => e.resource?.id === testPatient.id)).toBe(true);
    });

    it('should handle search with no results', async () => {
      const searchResults = await service.searchResources<Patient>('Patient', {
        family: 'NonexistentFamily12345'
      });

      expect(searchResults.entry?.length || 0).toBe(0);
    });
  });
});