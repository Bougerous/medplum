import { MedplumClient } from '@medplum/core';
import { 
  QuestionnaireResponse, 
  ServiceRequest, 
  DiagnosticReport,
  Patient,
  Coverage,
  Consent,
  Specimen,
  Claim,
  Task,
  OperationOutcome
} from '@medplum/fhirtypes';

import { 
  patientRegistrationBot,
  orderSplittingBot,
  billingAutomationBot,
  workflowValidationBot
} from './index';

// Mock MedplumClient for testing
class MockMedplumClient {
  private resources: Map<string, any> = new Map();
  private idCounter = 1;

  async createResource<T>(resource: T): Promise<T> {
    const id = `mock-${this.idCounter++}`;
    const resourceWithId = { ...resource, id };
    this.resources.set(id, resourceWithId);
    return resourceWithId;
  }

  async readResource<T>(resourceType: string, id: string): Promise<T> {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceType}/${id}`);
    }
    return resource;
  }

  async readReference<T>(reference: any): Promise<T> {
    const [resourceType, id] = reference.reference.split('/');
    return this.readResource(resourceType, id);
  }

  async updateResource<T>(resource: T): Promise<T> {
    const id = (resource as any).id;
    this.resources.set(id, resource);
    return resource;
  }

  async searchResources<T>(resourceType: string, params: any): Promise<T[]> {
    // Simple mock implementation
    return Array.from(this.resources.values())
      .filter(resource => resource.resourceType === resourceType);
  }

  async readHistory(resourceType: string, id: string): Promise<any> {
    return { entry: [] };
  }

  async executeBot(botId: string, input: any): Promise<any> {
    return { success: true };
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    this.resources.delete(id);
  }
}

describe('LIMS Workflow Automation Bots', () => {
  let mockMedplum: MockMedplumClient;

  beforeEach(() => {
    mockMedplum = new MockMedplumClient();
  });

  describe('Patient Registration Bot', () => {
    it('should create patient from completed questionnaire response', async () => {
      const questionnaireResponse: QuestionnaireResponse = {
        resourceType: 'QuestionnaireResponse',
        id: 'qr-1',
        status: 'completed',
        questionnaire: 'patient-registration',
        item: [
          {
            linkId: 'firstName',
            answer: [{ valueString: 'John' }]
          },
          {
            linkId: 'lastName',
            answer: [{ valueString: 'Doe' }]
          },
          {
            linkId: 'birthDate',
            answer: [{ valueDate: '1980-01-01' }]
          },
          {
            linkId: 'gender',
            answer: [{ valueString: 'male' }]
          },
          {
            linkId: 'phone',
            answer: [{ valueString: '555-1234' }]
          },
          {
            linkId: 'email',
            answer: [{ valueString: 'john.doe@example.com' }]
          }
        ]
      };

      const event = {
        type: 'create',
        input: questionnaireResponse,
        resource: questionnaireResponse
      };

      const result = await patientRegistrationBot(mockMedplum as any, event);

      expect(result.success).toBe(true);
      expect(result.patientId).toBeDefined();
      expect(result.consentId).toBeDefined();
      expect(result.isNewPatient).toBe(true);
    });

    it('should reject incomplete questionnaire response', async () => {
      const questionnaireResponse: QuestionnaireResponse = {
        resourceType: 'QuestionnaireResponse',
        id: 'qr-2',
        status: 'in-progress', // Not completed
        questionnaire: 'patient-registration',
        item: []
      };

      const event = {
        type: 'create',
        input: questionnaireResponse,
        resource: questionnaireResponse
      };

      const result = await patientRegistrationBot(mockMedplum as any, event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be completed');
    });

    it('should handle missing questionnaire response', async () => {
      const event = {
        type: 'create',
        input: null,
        resource: null
      };

      const result = await patientRegistrationBot(mockMedplum as any, event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No QuestionnaireResponse provided');
    });
  });

  describe('Order Splitting Bot', () => {
    it('should split service request with multiple test requirements', async () => {
      const serviceRequest: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'sr-1',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        },
        orderDetail: [{
          coding: [{
            system: 'http://loinc.org',
            code: 'CHEM',
            display: 'Chemistry Panel'
          }]
        }]
      };

      const event = {
        type: 'create',
        input: serviceRequest,
        resource: serviceRequest
      };

      const result = await orderSplittingBot(mockMedplum as any, event);

      expect(result.success).toBe(true);
      expect(result.splitSpecimenCount).toBeGreaterThan(1);
      expect(result.specimens).toBeDefined();
      expect(result.specimens.length).toBeGreaterThan(1);
    });

    it('should handle service request with single test requirement', async () => {
      const serviceRequest: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'sr-2',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/patient-1' },
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        }
      };

      const event = {
        type: 'create',
        input: serviceRequest,
        resource: serviceRequest
      };

      const result = await orderSplittingBot(mockMedplum as any, event);

      expect(result.success).toBe(true);
      expect(result.message).toContain('No splitting required');
      expect(result.specimenCount).toBe(1);
    });

    it('should reject invalid service request', async () => {
      const serviceRequest: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'sr-3',
        status: 'cancelled', // Invalid status
        intent: 'order'
        // Missing required fields
      };

      const event = {
        type: 'create',
        input: serviceRequest,
        resource: serviceRequest
      };

      const result = await orderSplittingBot(mockMedplum as any, event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
      expect(result.validationErrors).toBeDefined();
    });
  });

  describe('Billing Automation Bot', () => {
    beforeEach(async () => {
      // Set up mock patient and coverage
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'patient-1',
        name: [{ given: ['John'], family: 'Doe' }],
        identifier: [{
          system: 'http://lims.local/patient-id',
          value: 'PAT-001'
        }]
      };

      const coverage: Coverage = {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: { reference: 'Patient/patient-1' },
        payor: [{ display: 'Test Insurance' }]
      };

      await mockMedplum.createResource(patient);
      await mockMedplum.createResource(coverage);
    });

    it('should create claim for finalized diagnostic report', async () => {
      const diagnosticReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: 'dr-1',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        },
        subject: { reference: 'Patient/patient-1' },
        performer: [{ reference: 'Practitioner/practitioner-1' }],
        basedOn: [{ reference: 'ServiceRequest/sr-1' }],
        issued: new Date().toISOString(),
        conclusion: 'Normal results'
      };

      const event = {
        type: 'update',
        input: diagnosticReport,
        resource: diagnosticReport
      };

      const result = await billingAutomationBot(mockMedplum as any, event);

      expect(result.success).toBe(true);
      expect(result.claimId).toBeDefined();
      expect(result.claimTotal).toBeGreaterThan(0);
      expect(result.submissionStatus).toBe('submitted');
    });

    it('should reject non-final diagnostic report', async () => {
      const diagnosticReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: 'dr-2',
        status: 'preliminary', // Not final
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        },
        subject: { reference: 'Patient/patient-1' }
      };

      const event = {
        type: 'update',
        input: diagnosticReport,
        resource: diagnosticReport
      };

      const result = await billingAutomationBot(mockMedplum as any, event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('finalized diagnostic reports');
    });

    it('should handle missing coverage information', async () => {
      // Create patient without coverage
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'patient-no-coverage',
        name: [{ given: ['Jane'], family: 'Smith' }]
      };
      await mockMedplum.createResource(patient);

      const diagnosticReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: 'dr-3',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        },
        subject: { reference: 'Patient/patient-no-coverage' },
        performer: [{ reference: 'Practitioner/practitioner-1' }],
        basedOn: [{ reference: 'ServiceRequest/sr-1' }]
      };

      const event = {
        type: 'update',
        input: diagnosticReport,
        resource: diagnosticReport
      };

      const result = await billingAutomationBot(mockMedplum as any, event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });
  });

  describe('Workflow Validation Bot', () => {
    it('should validate complete diagnostic report', async () => {
      const diagnosticReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: 'dr-valid',
        status: 'preliminary',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        },
        subject: { reference: 'Patient/patient-1' },
        performer: [{ reference: 'Practitioner/practitioner-1' }],
        basedOn: [{ reference: 'ServiceRequest/sr-1' }],
        result: [{ reference: 'Observation/obs-1' }],
        conclusion: 'Normal results',
        issued: new Date().toISOString()
      };

      const event = {
        type: 'update',
        input: diagnosticReport,
        resource: diagnosticReport
      };

      const result = await workflowValidationBot(mockMedplum as any, event);

      expect(result.success).toBe(true);
      expect(result.validationStatus).toBeDefined();
      expect(result.canProceed).toBeDefined();
    });

    it('should identify validation errors in incomplete report', async () => {
      const diagnosticReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: 'dr-invalid',
        status: 'final',
        // Missing required fields for final report
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'CBC',
            display: 'Complete Blood Count'
          }]
        }
        // Missing subject, performer, issued date, etc.
      };

      const event = {
        type: 'update',
        input: diagnosticReport,
        resource: diagnosticReport
      };

      const result = await workflowValidationBot(mockMedplum as any, event);

      expect(result.success).toBe(true);
      expect(result.errorsCount).toBeGreaterThan(0);
      expect(result.canProceed).toBe(false);
      expect(result.validationStatus).toBe('failed');
    });

    it('should handle missing diagnostic report', async () => {
      const event = {
        type: 'update',
        input: null,
        resource: null
      };

      const result = await workflowValidationBot(mockMedplum as any, event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No DiagnosticReport provided');
    });
  });

  describe('Bot Integration Tests', () => {
    it('should handle complete patient workflow', async () => {
      // 1. Patient Registration
      const questionnaireResponse: QuestionnaireResponse = {
        resourceType: 'QuestionnaireResponse',
        id: 'qr-workflow',
        status: 'completed',
        questionnaire: 'patient-registration',
        item: [
          { linkId: 'firstName', answer: [{ valueString: 'Integration' }] },
          { linkId: 'lastName', answer: [{ valueString: 'Test' }] },
          { linkId: 'birthDate', answer: [{ valueDate: '1990-01-01' }] }
        ]
      };

      const registrationResult = await patientRegistrationBot(
        mockMedplum as any, 
        { type: 'create', input: questionnaireResponse, resource: questionnaireResponse }
      );

      expect(registrationResult.success).toBe(true);

      // 2. Order Splitting
      const serviceRequest: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'sr-workflow',
        status: 'active',
        intent: 'order',
        subject: { reference: `Patient/${registrationResult.patientId}` },
        code: {
          coding: [{ system: 'http://loinc.org', code: 'CBC', display: 'Complete Blood Count' }]
        }
      };

      const splittingResult = await orderSplittingBot(
        mockMedplum as any,
        { type: 'create', input: serviceRequest, resource: serviceRequest }
      );

      expect(splittingResult.success).toBe(true);

      // 3. Workflow Validation (would happen during report creation)
      const diagnosticReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: 'dr-workflow',
        status: 'preliminary',
        code: serviceRequest.code!,
        subject: serviceRequest.subject!,
        performer: [{ reference: 'Practitioner/practitioner-1' }],
        basedOn: [{ reference: `ServiceRequest/${serviceRequest.id}` }],
        result: [{ reference: 'Observation/obs-workflow' }]
      };

      const validationResult = await workflowValidationBot(
        mockMedplum as any,
        { type: 'update', input: diagnosticReport, resource: diagnosticReport }
      );

      expect(validationResult.success).toBe(true);

      // 4. Billing (would happen when report is finalized)
      const finalReport: DiagnosticReport = {
        ...diagnosticReport,
        status: 'final',
        issued: new Date().toISOString(),
        conclusion: 'Normal results'
      };

      // Create coverage for billing
      const coverage: Coverage = {
        resourceType: 'Coverage',
        id: 'coverage-workflow',
        status: 'active',
        beneficiary: { reference: `Patient/${registrationResult.patientId}` },
        payor: [{ display: 'Test Insurance' }]
      };
      await mockMedplum.createResource(coverage);

      const billingResult = await billingAutomationBot(
        mockMedplum as any,
        { type: 'update', input: finalReport, resource: finalReport }
      );

      expect(billingResult.success).toBe(true);
      expect(billingResult.claimId).toBeDefined();
    });
  });
});

// Test utilities
export function createMockQuestionnaireResponse(overrides: Partial<QuestionnaireResponse> = {}): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    id: 'mock-qr',
    status: 'completed',
    questionnaire: 'patient-registration',
    item: [
      { linkId: 'firstName', answer: [{ valueString: 'Test' }] },
      { linkId: 'lastName', answer: [{ valueString: 'Patient' }] },
      { linkId: 'birthDate', answer: [{ valueDate: '1980-01-01' }] }
    ],
    ...overrides
  };
}

export function createMockServiceRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    id: 'mock-sr',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/mock-patient' },
    code: {
      coding: [{ system: 'http://loinc.org', code: 'CBC', display: 'Complete Blood Count' }]
    },
    ...overrides
  };
}

export function createMockDiagnosticReport(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id: 'mock-dr',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: 'CBC', display: 'Complete Blood Count' }]
    },
    subject: { reference: 'Patient/mock-patient' },
    performer: [{ reference: 'Practitioner/mock-practitioner' }],
    basedOn: [{ reference: 'ServiceRequest/mock-sr' }],
    issued: new Date().toISOString(),
    ...overrides
  };
}