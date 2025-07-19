import { TestBed } from '@angular/core/testing';
import { BillingService, BillingContext, ClaimItem } from './billing.service';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';
import {
  Claim,
  ClaimResponse,
  DiagnosticReport,
  Patient,
  Coverage,
  ServiceRequest,
  Organization,
  Practitioner,
  Task,
  AuditEvent
} from '@medplum/fhirtypes';
import { BillingRule, LIMSErrorType } from '../types/fhir-types';

describe('BillingService', () => {
  let service: BillingService;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;
  let mockRetryService: jasmine.SpyObj<RetryService>;

  const mockPatient: Patient = {
    resourceType: 'Patient',
    id: 'test-patient',
    name: [{ given: ['John'], family: 'Doe' }],
    birthDate: '1980-01-01'
  };

  const mockPractitioner: Practitioner = {
    resourceType: 'Practitioner',
    id: 'test-practitioner',
    name: [{ given: ['Dr. Jane'], family: 'Smith' }]
  };

  const mockOrganization: Organization = {
    resourceType: 'Organization',
    id: 'test-lab',
    name: 'Test Laboratory'
  };

  const mockCoverage: Coverage = {
    resourceType: 'Coverage',
    id: 'test-coverage',
    status: 'active',
    beneficiary: { reference: 'Patient/test-patient' },
    payor: [{ reference: 'Organization/test-insurance' }]
  };

  const mockServiceRequest: ServiceRequest = {
    resourceType: 'ServiceRequest',
    id: 'test-service-request',
    status: 'completed',
    intent: 'order',
    code: {
      coding: [{
        system: 'http://loinc.org',
        code: '33747-0',
        display: 'Histopathology study'
      }]
    },
    subject: { reference: 'Patient/test-patient' },
    authoredOn: '2024-01-01T10:00:00Z'
  };

  const mockDiagnosticReport: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    id: 'test-diagnostic-report',
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
    subject: { reference: 'Patient/test-patient' },
    effectiveDateTime: '2024-01-01T10:00:00Z',
    issued: '2024-01-01T15:00:00Z',
    performer: [{ reference: 'Practitioner/test-practitioner' }],
    basedOn: [{ reference: 'ServiceRequest/test-service-request' }]
  };

  beforeEach(() => {
    const medplumSpy = jasmine.createSpyObj('MedplumService', [
      'createResource', 'readResource', 'updateResource', 'searchResources'
    ]);
    const errorSpy = jasmine.createSpyObj('ErrorHandlingService', ['handleError']);
    const retrySpy = jasmine.createSpyObj('RetryService', ['executeWithRetry']);

    TestBed.configureTestingModule({
      providers: [
        BillingService,
        { provide: MedplumService, useValue: medplumSpy },
        { provide: ErrorHandlingService, useValue: errorSpy },
        { provide: RetryService, useValue: retrySpy }
      ]
    });

    service = TestBed.inject(BillingService);
    mockMedplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
    mockErrorHandlingService = TestBed.inject(ErrorHandlingService) as jasmine.SpyObj<ErrorHandlingService>;
    mockRetryService = TestBed.inject(RetryService) as jasmine.SpyObj<RetryService>;

    // Setup default mock responses
    mockMedplumService.readResource.and.callFake((resourceType: string, id: string) => {
      if (resourceType === 'Patient') return Promise.resolve(mockPatient);
      if (resourceType === 'Practitioner') return Promise.resolve(mockPractitioner);
      if (resourceType === 'ServiceRequest') return Promise.resolve(mockServiceRequest);
      return Promise.resolve({} as any);
    });

    mockMedplumService.searchResources.and.callFake((resourceType: string) => {
      if (resourceType === 'Coverage') {
        return Promise.resolve({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: mockCoverage }]
        });
      }
      return Promise.resolve({ resourceType: 'Bundle', type: 'searchset', entry: [] });
    });

    mockMedplumService.createResource.and.callFake((resource: any) => {
      return Promise.resolve({ ...resource, id: `mock-${Date.now()}` });
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Claim Creation', () => {
    it('should create claim from finalized diagnostic report', async () => {
      const claim = await service.createClaimFromDiagnosticReport(mockDiagnosticReport);

      expect(claim).toBeTruthy();
      expect(claim.resourceType).toBe('Claim');
      expect(claim.status).toBe('active');
      expect(claim.patient?.reference).toBe('Patient/test-patient');
      expect(mockMedplumService.createResource).toHaveBeenCalled();
    });

    it('should reject non-finalized diagnostic reports', async () => {
      const draftReport = { ...mockDiagnosticReport, status: 'preliminary' as const };

      try {
        await service.createClaimFromDiagnosticReport(draftReport);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('non-finalized');
      }
    });

    it('should handle missing patient reference', async () => {
      const reportWithoutPatient = { ...mockDiagnosticReport, subject: undefined };

      try {
        await service.createClaimFromDiagnosticReport(reportWithoutPatient);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('patient reference');
      }
    });

    it('should include insurance information when available', async () => {
      const context: Partial<BillingContext> = {
        coverage: mockCoverage
      };

      const claim = await service.createClaimFromDiagnosticReport(mockDiagnosticReport, context);

      expect(claim.insurance).toBeTruthy();
      expect(claim.insurance!.length).toBe(1);
      expect(claim.insurance![0].coverage?.reference).toBe('Coverage/test-coverage');
    });

    it('should generate claim items from service requests', async () => {
      // Add a billing rule for the test
      const billingRule: BillingRule = {
        id: 'rule-1',
        testCode: '33747-0',
        cptCode: '88305',
        price: 150.00,
        insuranceMultiplier: 1.0,
        conditions: ['histopathology']
      };

      await service.saveBillingRule(billingRule);

      const claim = await service.createClaimFromDiagnosticReport(mockDiagnosticReport);

      expect(claim.item).toBeTruthy();
      expect(claim.item!.length).toBeGreaterThan(0);
      expect(claim.total?.value).toBeGreaterThan(0);
    });
  });

  describe('Claim Validation', () => {
    let validClaim: Claim;

    beforeEach(() => {
      validClaim = {
        resourceType: 'Claim',
        id: 'test-claim',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional'
          }]
        },
        use: 'claim',
        patient: { reference: 'Patient/test-patient' },
        provider: { reference: 'Practitioner/test-practitioner' },
        created: '2024-01-01T10:00:00Z',
        item: [{
          sequence: 1,
          productOrService: {
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: '88305'
            }]
          },
          unitPrice: { value: 150.00, currency: 'USD' },
          net: { value: 150.00, currency: 'USD' }
        }],
        total: { value: 150.00, currency: 'USD' }
      };
    });

    it('should validate a valid claim', async () => {
      const validation = await service.validateClaim(validClaim);

      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect missing required fields', async () => {
      const invalidClaim = { ...validClaim, patient: undefined };

      const validation = await service.validateClaim(invalidClaim);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Patient reference is required');
    });

    it('should detect missing provider', async () => {
      const invalidClaim = { ...validClaim, provider: undefined };

      const validation = await service.validateClaim(invalidClaim);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Provider reference is required');
    });

    it('should detect missing claim items', async () => {
      const invalidClaim = { ...validClaim, item: [] };

      const validation = await service.validateClaim(invalidClaim);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('At least one claim item is required');
    });

    it('should detect invalid claim total', async () => {
      const invalidClaim = { ...validClaim, total: { value: 0, currency: 'USD' } };

      const validation = await service.validateClaim(invalidClaim);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Claim total must be greater than zero');
    });

    it('should generate warnings for missing insurance', async () => {
      const validation = await service.validateClaim(validClaim);

      expect(validation.warnings).toContain('No insurance information provided - claim may be patient responsibility');
    });
  });

  describe('Claim Submission', () => {
    let validClaim: Claim;

    beforeEach(() => {
      validClaim = {
        resourceType: 'Claim',
        id: 'test-claim',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional'
          }]
        },
        use: 'claim',
        patient: { reference: 'Patient/test-patient' },
        provider: { reference: 'Practitioner/test-practitioner' },
        created: '2024-01-01T10:00:00Z',
        item: [{
          sequence: 1,
          productOrService: {
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: '88305'
            }]
          },
          unitPrice: { value: 150.00, currency: 'USD' },
          net: { value: 150.00, currency: 'USD' }
        }],
        total: { value: 150.00, currency: 'USD' }
      };

      spyOn(service, 'validateClaim').and.returnValue(Promise.resolve({
        isValid: true,
        errors: [],
        warnings: []
      }));
    });

    it('should submit valid claim successfully', async () => {
      mockMedplumService.updateResource.and.returnValue(Promise.resolve(validClaim));

      const result = await service.submitClaim(validClaim);

      expect(result.success).toBe(true);
      expect(mockMedplumService.updateResource).toHaveBeenCalled();
      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({ code: 'claim-submission' })
            ])
          })
        })
      );
    });

    it('should reject invalid claims', async () => {
      (service.validateClaim as jasmine.Spy).and.returnValue(Promise.resolve({
        isValid: false,
        errors: ['Patient reference is required'],
        warnings: []
      }));

      const result = await service.submitClaim(validClaim);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should handle submission errors', async () => {
      mockMedplumService.updateResource.and.rejectWith(new Error('Network error'));

      const result = await service.submitClaim(validClaim);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
    });
  });

  describe('Claim Response Processing', () => {
    it('should process successful claim response', async () => {
      const claimResponse: ClaimResponse = {
        resourceType: 'ClaimResponse',
        id: 'test-response',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional'
          }]
        },
        use: 'claim',
        patient: { reference: 'Patient/test-patient' },
        created: '2024-01-01T10:00:00Z',
        insurer: { reference: 'Organization/test-insurance' },
        request: { reference: 'Claim/test-claim' },
        outcome: 'complete',
        payment: {
          type: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/ex-paymenttype',
              code: 'complete'
            }]
          },
          amount: { value: 150.00, currency: 'USD' }
        }
      };

      const originalClaim: Claim = {
        resourceType: 'Claim',
        id: 'test-claim',
        status: 'active',
        type: { coding: [{ code: 'professional' }] },
        use: 'claim',
        patient: { reference: 'Patient/test-patient' },
        provider: { reference: 'Practitioner/test-practitioner' },
        created: '2024-01-01T10:00:00Z',
        total: { value: 150.00, currency: 'USD' }
      };

      mockMedplumService.readResource.and.returnValue(Promise.resolve(originalClaim));
      spyOn(service as any, 'triggerPaymentReconciliation').and.returnValue(Promise.resolve());

      await service.processClaimResponse(claimResponse);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(claimResponse);
      expect(mockMedplumService.readResource).toHaveBeenCalledWith('Claim', 'test-claim');
      expect(mockMedplumService.updateResource).toHaveBeenCalled();
      expect(service['triggerPaymentReconciliation']).toHaveBeenCalledWith(claimResponse);
    });

    it('should handle rejected claim response', async () => {
      const claimResponse: ClaimResponse = {
        resourceType: 'ClaimResponse',
        id: 'test-response',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional'
          }]
        },
        use: 'claim',
        patient: { reference: 'Patient/test-patient' },
        created: '2024-01-01T10:00:00Z',
        insurer: { reference: 'Organization/test-insurance' },
        request: { reference: 'Claim/test-claim' },
        outcome: 'error'
      };

      const originalClaim: Claim = {
        resourceType: 'Claim',
        id: 'test-claim',
        status: 'active',
        type: { coding: [{ code: 'professional' }] },
        use: 'claim',
        patient: { reference: 'Patient/test-patient' },
        provider: { reference: 'Practitioner/test-practitioner' },
        created: '2024-01-01T10:00:00Z',
        total: { value: 150.00, currency: 'USD' }
      };

      mockMedplumService.readResource.and.returnValue(Promise.resolve(originalClaim));

      await service.processClaimResponse(claimResponse);

      expect(mockMedplumService.updateResource).toHaveBeenCalledWith(
        jasmine.objectContaining({ status: 'cancelled' })
      );
    });
  });

  describe('Billing Rules Management', () => {
    it('should save billing rule', async () => {
      const rule: BillingRule = {
        id: 'test-rule',
        testCode: '88305',
        cptCode: '88305',
        price: 200.00,
        insuranceMultiplier: 1.2,
        conditions: ['histopathology']
      };

      const savedRule = await service.saveBillingRule(rule);

      expect(savedRule).toEqual(rule);
    });

    it('should update existing billing rule', async () => {
      const rule: BillingRule = {
        id: 'test-rule',
        testCode: '88305',
        cptCode: '88305',
        price: 200.00,
        insuranceMultiplier: 1.0,
        conditions: ['histopathology']
      };

      await service.saveBillingRule(rule);

      const updatedRule = { ...rule, price: 250.00 };
      const result = await service.saveBillingRule(updatedRule);

      expect(result.price).toBe(250.00);
    });

    it('should provide billing rules observable', (done) => {
      service.getBillingRules().subscribe(rules => {
        expect(Array.isArray(rules)).toBe(true);
        done();
      });
    });
  });

  describe('Bot Integration', () => {
    it('should trigger billing bot for finalized diagnostic report', async () => {
      await service.triggerBillingBot(mockDiagnosticReport);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({ code: 'automated-billing' })
            ])
          }),
          input: jasmine.arrayContaining([
            jasmine.objectContaining({
              valueReference: jasmine.objectContaining({
                reference: `DiagnosticReport/${mockDiagnosticReport.id}`
              })
            })
          ])
        })
      );
    });

    it('should handle bot trigger errors', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Bot trigger failed'));

      try {
        await service.triggerBillingBot(mockDiagnosticReport);
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalledWith(
          jasmine.objectContaining({
            type: LIMSErrorType.WORKFLOW_ERROR,
            message: 'Failed to trigger billing bot'
          })
        );
      }
    });
  });

  describe('Observables', () => {
    it('should provide pending claims observable', (done) => {
      service.getPendingClaims().subscribe(claims => {
        expect(Array.isArray(claims)).toBe(true);
        done();
      });
    });
  });
});