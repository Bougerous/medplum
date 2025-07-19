import { TestBed } from '@angular/core/testing';
import { BotService } from './bot.service';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import {
  Task,
  QuestionnaireResponse,
  ServiceRequest,
  DiagnosticReport,
  Patient,
  Specimen
} from '@medplum/fhirtypes';
import { LIMSErrorType } from '../types/fhir-types';

describe('BotService', () => {
  let service: BotService;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;

  const mockQuestionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    id: 'test-questionnaire-response',
    status: 'completed',
    questionnaire: 'Questionnaire/patient-registration',
    subject: { reference: 'Patient/test-patient' },
    authored: '2024-01-01T10:00:00Z',
    item: [
      {
        linkId: 'patient-name',
        text: 'Patient Name',
        answer: [{ valueString: 'John Doe' }]
      },
      {
        linkId: 'patient-dob',
        text: 'Date of Birth',
        answer: [{ valueDate: '1980-01-01' }]
      }
    ]
  };

  const mockServiceRequest: ServiceRequest = {
    resourceType: 'ServiceRequest',
    id: 'test-service-request',
    status: 'active',
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
    issued: '2024-01-01T15:00:00Z'
  };

  beforeEach(() => {
    const medplumSpy = jasmine.createSpyObj('MedplumService', ['createResource', 'updateResource']);
    const errorSpy = jasmine.createSpyObj('ErrorHandlingService', ['handleError']);

    TestBed.configureTestingModule({
      providers: [
        BotService,
        { provide: MedplumService, useValue: medplumSpy },
        { provide: ErrorHandlingService, useValue: errorSpy }
      ]
    });

    service = TestBed.inject(BotService);
    mockMedplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
    mockErrorHandlingService = TestBed.inject(ErrorHandlingService) as jasmine.SpyObj<ErrorHandlingService>;

    // Setup default mock responses
    mockMedplumService.createResource.and.callFake((resource: any) => {
      return Promise.resolve({ ...resource, id: `mock-${Date.now()}` });
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Patient Registration Bot', () => {
    it('should trigger patient registration bot', async () => {
      await service.triggerPatientRegistrationBot(mockQuestionnaireResponse);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          status: 'requested',
          intent: 'order',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({
                system: 'http://lims.local/bots',
                code: 'patient-registration'
              })
            ])
          }),
          input: jasmine.arrayContaining([
            jasmine.objectContaining({
              type: jasmine.objectContaining({ text: 'QuestionnaireResponse' }),
              valueReference: jasmine.objectContaining({
                reference: `QuestionnaireResponse/${mockQuestionnaireResponse.id}`
              })
            })
          ])
        })
      );
    });

    it('should handle patient registration bot errors', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Bot creation failed'));

      try {
        await service.triggerPatientRegistrationBot(mockQuestionnaireResponse);
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalledWith(
          jasmine.objectContaining({
            type: LIMSErrorType.WORKFLOW_ERROR,
            message: 'Failed to trigger patient registration bot'
          })
        );
      }
    });

    it('should include questionnaire response metadata', async () => {
      await service.triggerPatientRegistrationBot(mockQuestionnaireResponse);

      const taskCall = mockMedplumService.createResource.calls.mostRecent();
      const task = taskCall.args[0] as Task;

      expect(task.description).toContain('patient registration');
      expect(task.for?.reference).toBe(mockQuestionnaireResponse.subject?.reference);
    });
  });

  describe('Order Splitting Bot', () => {
    it('should trigger order splitting bot', async () => {
      await service.triggerOrderSplittingBot(mockServiceRequest);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          status: 'requested',
          intent: 'order',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({
                system: 'http://lims.local/bots',
                code: 'order-splitting'
              })
            ])
          }),
          input: jasmine.arrayContaining([
            jasmine.objectContaining({
              type: jasmine.objectContaining({ text: 'ServiceRequest' }),
              valueReference: jasmine.objectContaining({
                reference: `ServiceRequest/${mockServiceRequest.id}`
              })
            })
          ])
        })
      );
    });

    it('should handle order splitting bot errors', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Bot creation failed'));

      try {
        await service.triggerOrderSplittingBot(mockServiceRequest);
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalledWith(
          jasmine.objectContaining({
            type: LIMSErrorType.WORKFLOW_ERROR,
            message: 'Failed to trigger order splitting bot'
          })
        );
      }
    });

    it('should set appropriate task priority for urgent orders', async () => {
      const urgentServiceRequest = {
        ...mockServiceRequest,
        priority: 'urgent' as const
      };

      await service.triggerOrderSplittingBot(urgentServiceRequest);

      const taskCall = mockMedplumService.createResource.calls.mostRecent();
      const task = taskCall.args[0] as Task;

      expect(task.priority).toBe('urgent');
    });
  });

  describe('Billing Bot', () => {
    it('should trigger billing bot', async () => {
      await service.triggerBillingBot(mockDiagnosticReport);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          status: 'requested',
          intent: 'order',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({
                system: 'http://lims.local/bots',
                code: 'automated-billing'
              })
            ])
          }),
          input: jasmine.arrayContaining([
            jasmine.objectContaining({
              type: jasmine.objectContaining({ text: 'DiagnosticReport' }),
              valueReference: jasmine.objectContaining({
                reference: `DiagnosticReport/${mockDiagnosticReport.id}`
              })
            })
          ])
        })
      );
    });

    it('should only trigger billing bot for finalized reports', async () => {
      const preliminaryReport = { ...mockDiagnosticReport, status: 'preliminary' as const };

      try {
        await service.triggerBillingBot(preliminaryReport);
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toContain('finalized');
      }
    });

    it('should handle billing bot errors', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Bot creation failed'));

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

  describe('Report Validation Bot', () => {
    it('should trigger report validation bot', async () => {
      await service.triggerReportValidationBot(mockDiagnosticReport);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          status: 'requested',
          intent: 'order',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({
                system: 'http://lims.local/bots',
                code: 'report-validation'
              })
            ])
          }),
          input: jasmine.arrayContaining([
            jasmine.objectContaining({
              type: jasmine.objectContaining({ text: 'DiagnosticReport' }),
              valueReference: jasmine.objectContaining({
                reference: `DiagnosticReport/${mockDiagnosticReport.id}`
              })
            })
          ])
        })
      );
    });

    it('should handle report validation bot errors', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Bot creation failed'));

      try {
        await service.triggerReportValidationBot(mockDiagnosticReport);
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalledWith(
          jasmine.objectContaining({
            type: LIMSErrorType.WORKFLOW_ERROR,
            message: 'Failed to trigger report validation bot'
          })
        );
      }
    });
  });

  describe('Specimen Processing Bot', () => {
    const mockSpecimen: Specimen = {
      resourceType: 'Specimen',
      id: 'test-specimen',
      status: 'available',
      type: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119376003',
          display: 'Tissue specimen'
        }]
      },
      subject: { reference: 'Patient/test-patient' },
      accessionIdentifier: { value: 'SP20240101001' }
    };

    it('should trigger specimen processing bot', async () => {
      await service.triggerSpecimenProcessingBot(mockSpecimen, 'histopathology');

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'Task',
          status: 'requested',
          intent: 'order',
          code: jasmine.objectContaining({
            coding: jasmine.arrayContaining([
              jasmine.objectContaining({
                system: 'http://lims.local/bots',
                code: 'specimen-processing'
              })
            ])
          }),
          input: jasmine.arrayContaining([
            jasmine.objectContaining({
              type: jasmine.objectContaining({ text: 'Specimen' }),
              valueReference: jasmine.objectContaining({
                reference: `Specimen/${mockSpecimen.id}`
              })
            }),
            jasmine.objectContaining({
              type: jasmine.objectContaining({ text: 'WorkflowType' }),
              valueString: 'histopathology'
            })
          ])
        })
      );
    });

    it('should handle specimen processing bot errors', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Bot creation failed'));

      try {
        await service.triggerSpecimenProcessingBot(mockSpecimen, 'histopathology');
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalledWith(
          jasmine.objectContaining({
            type: LIMSErrorType.WORKFLOW_ERROR,
            message: 'Failed to trigger specimen processing bot'
          })
        );
      }
    });
  });

  describe('Task Management', () => {
    it('should get bot task status', async () => {
      const mockTask: Task = {
        resourceType: 'Task',
        id: 'test-task',
        status: 'in-progress',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/bots',
            code: 'patient-registration'
          }]
        }
      };

      mockMedplumService.readResource = jasmine.createSpy().and.returnValue(Promise.resolve(mockTask));

      const status = await service.getBotTaskStatus('test-task');

      expect(status).toBe('in-progress');
      expect(mockMedplumService.readResource).toHaveBeenCalledWith('Task', 'test-task');
    });

    it('should handle task status errors', async () => {
      mockMedplumService.readResource = jasmine.createSpy().and.rejectWith(new Error('Task not found'));

      try {
        await service.getBotTaskStatus('nonexistent-task');
        fail('Should have thrown an error');
      } catch (error) {
        expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
      }
    });

    it('should cancel bot task', async () => {
      const mockTask: Task = {
        resourceType: 'Task',
        id: 'test-task',
        status: 'requested',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/bots',
            code: 'patient-registration'
          }]
        }
      };

      mockMedplumService.readResource = jasmine.createSpy().and.returnValue(Promise.resolve(mockTask));
      mockMedplumService.updateResource.and.returnValue(Promise.resolve({
        ...mockTask,
        status: 'cancelled'
      }));

      await service.cancelBotTask('test-task');

      expect(mockMedplumService.updateResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: 'test-task',
          status: 'cancelled'
        })
      );
    });
  });

  describe('Bot Configuration', () => {
    it('should create task with proper timeout', async () => {
      await service.triggerPatientRegistrationBot(mockQuestionnaireResponse);

      const taskCall = mockMedplumService.createResource.calls.mostRecent();
      const task = taskCall.args[0] as Task;

      expect(task.restriction?.period?.end).toBeTruthy();
      
      const endTime = new Date(task.restriction!.period!.end!);
      const now = new Date();
      const timeDiff = endTime.getTime() - now.getTime();
      
      // Should be approximately 1 hour (allowing for test execution time)
      expect(timeDiff).toBeGreaterThan(55 * 60 * 1000); // 55 minutes
      expect(timeDiff).toBeLessThan(65 * 60 * 1000); // 65 minutes
    });

    it('should create task with proper owner assignment', async () => {
      await service.triggerPatientRegistrationBot(mockQuestionnaireResponse);

      const taskCall = mockMedplumService.createResource.calls.mostRecent();
      const task = taskCall.args[0] as Task;

      expect(task.owner?.reference).toBe('Organization/lims-system');
    });
  });
});