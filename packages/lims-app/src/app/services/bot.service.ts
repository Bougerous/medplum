import { Injectable } from '@angular/core';
import {
  Bot,
  DiagnosticReport,
  QuestionnaireResponse,
  ServiceRequest,
  Subscription,
  Task
} from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { LIMSErrorType } from '../types/fhir-types';
import { BillingService } from './billing.service';
import { ErrorHandlingService } from './error-handling.service';

export interface BotConfiguration {
  id: string;
  name: string;
  description: string;
  sourceCode: string;
  triggers: BotTrigger[];
  enabled: boolean;
  version: string;
  lastUpdated: string;
}

export interface BotTrigger {
  resourceType: string;
  criteria: string;
  event: 'create' | 'update' | 'delete';
  conditions?: string[];
}

export interface BotExecution {
  id: string;
  botId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  input: any;
  output?: any;
  error?: string;
  logs: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BotService {
  private bots$ = new BehaviorSubject<BotConfiguration[]>([]);
  private executions$ = new BehaviorSubject<BotExecution[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private billingService: BillingService
  ) {
    this.initializeBots();
  }

  /**
   * Trigger patient registration automation bot
   */
  async triggerPatientRegistrationBot(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    try {
      const task: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/bots',
            code: 'patient-registration',
            display: 'Patient Registration Bot'
          }]
        },
        description: 'Process patient registration from questionnaire response',
        for: questionnaireResponse.subject,
        input: [{
          type: {
            coding: [{
              system: 'http://hl7.org/fhir/resource-types',
              code: 'QuestionnaireResponse'
            }]
          },
          valueReference: {
            reference: `QuestionnaireResponse/${questionnaireResponse.id}`
          }
        }],
        restriction: {
          period: {
            end: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
          }
        }
      };

      await this.medplumService.createResource(task);
      
      // Log bot execution
      await this.logBotExecution('patient-registration-bot', 'triggered', {
        questionnaireResponseId: questionnaireResponse.id
      });

    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to trigger patient registration bot',
        details: { questionnaireResponseId: questionnaireResponse.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Trigger order splitting automation bot
   */
  async triggerOrderSplittingBot(serviceRequest: ServiceRequest): Promise<void> {
    try {
      const task: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/bots',
            code: 'order-splitting',
            display: 'Order Splitting Bot'
          }]
        },
        description: 'Split service request into multiple specimens if needed',
        for: serviceRequest.subject,
        input: [{
          type: {
            coding: [{
              system: 'http://hl7.org/fhir/resource-types',
              code: 'ServiceRequest'
            }]
          },
          valueReference: {
            reference: `ServiceRequest/${serviceRequest.id}`
          }
        }],
        restriction: {
          period: {
            end: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
          }
        }
      };

      await this.medplumService.createResource(task);
      
      // Log bot execution
      await this.logBotExecution('order-splitting-bot', 'triggered', {
        serviceRequestId: serviceRequest.id
      });

    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to trigger order splitting bot',
        details: { serviceRequestId: serviceRequest.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Trigger billing automation bot
   */
  async triggerBillingBot(diagnosticReport: DiagnosticReport): Promise<void> {
    try {
      // Validate that the diagnostic report is finalized
      if (diagnosticReport.status !== 'final') {
        throw new Error('Billing bot can only be triggered for finalized diagnostic reports');
      }

      const task: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/bots',
            code: 'automated-billing',
            display: 'Automated Billing Bot'
          }]
        },
        description: 'Create and submit claim for finalized diagnostic report',
        for: diagnosticReport.subject,
        input: [{
          type: {
            coding: [{
              system: 'http://hl7.org/fhir/resource-types',
              code: 'DiagnosticReport'
            }]
          },
          valueReference: {
            reference: `DiagnosticReport/${diagnosticReport.id}`
          }
        }],
        restriction: {
          period: {
            end: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
          }
        }
      };

      await this.medplumService.createResource(task);
      
      // Also trigger the billing service directly for immediate processing
      await this.billingService.triggerBillingBot(diagnosticReport);
      
      // Log bot execution
      await this.logBotExecution('billing-bot', 'triggered', {
        diagnosticReportId: diagnosticReport.id
      });

    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to trigger billing bot',
        details: { diagnosticReportId: diagnosticReport.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Trigger workflow validation bots
   */
  async triggerWorkflowValidationBots(diagnosticReport: DiagnosticReport): Promise<void> {
    try {
      const task: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/bots',
            code: 'workflow-validation',
            display: 'Workflow Validation Bot'
          }]
        },
        description: 'Validate diagnostic report completeness and quality',
        for: diagnosticReport.subject,
        input: [{
          type: {
            coding: [{
              system: 'http://hl7.org/fhir/resource-types',
              code: 'DiagnosticReport'
            }]
          },
          valueReference: {
            reference: `DiagnosticReport/${diagnosticReport.id}`
          }
        }],
        restriction: {
          period: {
            end: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
          }
        }
      };

      await this.medplumService.createResource(task);
      
      // Log bot execution
      await this.logBotExecution('workflow-validation-bot', 'triggered', {
        diagnosticReportId: diagnosticReport.id
      });

    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to trigger workflow validation bot',
        details: { diagnosticReportId: diagnosticReport.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Create and deploy a new bot
   */
  async createBot(config: Omit<BotConfiguration, 'id' | 'lastUpdated'>): Promise<BotConfiguration> {
    try {
      const bot: Bot = {
        resourceType: 'Bot',
        name: config.name,
        description: config.description,
        sourceCode: {
          contentType: 'application/typescript',
          data: btoa(config.sourceCode) // Base64 encode the source code
        }
      };

      const createdBot = await this.medplumService.createResource(bot);
      
      const botConfig: BotConfiguration = {
        id: createdBot.id!,
        name: config.name,
        description: config.description,
        sourceCode: config.sourceCode,
        triggers: config.triggers,
        enabled: config.enabled,
        version: config.version,
        lastUpdated: new Date().toISOString()
      };

      // Update local bot list
      const currentBots = this.bots$.value;
      this.bots$.next([...currentBots, botConfig]);

      // Create subscriptions for bot triggers
      await this.createBotSubscriptions(botConfig);

      return botConfig;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to create bot',
        details: { config, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Update an existing bot
   */
  async updateBot(config: BotConfiguration): Promise<BotConfiguration> {
    try {
      const bot = await this.medplumService.readResource<Bot>('Bot', config.id);
      
      const updatedBot: Bot = {
        ...bot,
        name: config.name,
        description: config.description,
        sourceCode: {
          contentType: 'application/typescript',
          data: btoa(config.sourceCode)
        }
      };

      await this.medplumService.updateResource(updatedBot);
      
      const updatedConfig: BotConfiguration = {
        ...config,
        lastUpdated: new Date().toISOString()
      };

      // Update local bot list
      const currentBots = this.bots$.value;
      const index = currentBots.findIndex(b => b.id === config.id);
      if (index >= 0) {
        currentBots[index] = updatedConfig;
        this.bots$.next([...currentBots]);
      }

      return updatedConfig;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to update bot',
        details: { config, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Enable or disable a bot
   */
  async toggleBot(botId: string, enabled: boolean): Promise<void> {
    try {
      const currentBots = this.bots$.value;
      const botIndex = currentBots.findIndex(b => b.id === botId);
      
      if (botIndex >= 0) {
        currentBots[botIndex].enabled = enabled;
        currentBots[botIndex].lastUpdated = new Date().toISOString();
        this.bots$.next([...currentBots]);
      }

      // Update subscriptions based on enabled status
      if (enabled) {
        const bot = currentBots[botIndex];
        await this.createBotSubscriptions(bot);
      } else {
        await this.disableBotSubscriptions(botId);
      }
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to toggle bot',
        details: { botId, enabled, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get all bots
   */
  getBots(): Observable<BotConfiguration[]> {
    return this.bots$.asObservable();
  }

  /**
   * Get bot executions
   */
  getBotExecutions(): Observable<BotExecution[]> {
    return this.executions$.asObservable();
  }

  /**
   * Get bot execution history for a specific bot
   */
  getBotExecutionHistory(botId: string): Observable<BotExecution[]> {
    return new Observable(observer => {
      this.executions$.subscribe(executions => {
        observer.next(executions.filter(e => e.botId === botId));
      });
    });
  }

  // Private helper methods

  private async initializeBots(): Promise<void> {
    try {
      // Initialize default bots
      const defaultBots: BotConfiguration[] = [
        {
          id: 'patient-registration-bot',
          name: 'Patient Registration Bot',
          description: 'Automatically process patient registration from questionnaire responses',
          sourceCode: this.getPatientRegistrationBotCode(),
          triggers: [{
            resourceType: 'QuestionnaireResponse',
            criteria: 'QuestionnaireResponse?questionnaire=patient-registration',
            event: 'create'
          }],
          enabled: true,
          version: '1.0.0',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'order-splitting-bot',
          name: 'Order Splitting Bot',
          description: 'Automatically split service requests into multiple specimens',
          sourceCode: this.getOrderSplittingBotCode(),
          triggers: [{
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=active',
            event: 'create'
          }],
          enabled: true,
          version: '1.0.0',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'billing-bot',
          name: 'Automated Billing Bot',
          description: 'Automatically create claims for finalized diagnostic reports',
          sourceCode: this.getBillingBotCode(),
          triggers: [{
            resourceType: 'DiagnosticReport',
            criteria: 'DiagnosticReport?status=final',
            event: 'update'
          }],
          enabled: true,
          version: '1.0.0',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'workflow-validation-bot',
          name: 'Workflow Validation Bot',
          description: 'Validate diagnostic reports for completeness and quality',
          sourceCode: this.getWorkflowValidationBotCode(),
          triggers: [{
            resourceType: 'DiagnosticReport',
            criteria: 'DiagnosticReport?status=preliminary',
            event: 'update'
          }],
          enabled: true,
          version: '1.0.0',
          lastUpdated: new Date().toISOString()
        }
      ];

      this.bots$.next(defaultBots);
    } catch (error) {
      console.error('Failed to initialize bots:', error);
    }
  }

  private async createBotSubscriptions(bot: BotConfiguration): Promise<void> {
    try {
      for (const trigger of bot.triggers) {
        const subscription: Subscription = {
          resourceType: 'Subscription',
          status: 'active',
          reason: `Bot trigger for ${bot.name}`,
          criteria: trigger.criteria,
          channel: {
            type: 'rest-hook',
            endpoint: `https://api.medplum.com/fhir/R4/Bot/${bot.id}/$execute`,
            payload: 'application/fhir+json'
          }
        };

        await this.medplumService.createResource(subscription);
      }
    } catch (error) {
      console.error('Failed to create bot subscriptions:', error);
    }
  }

  private async disableBotSubscriptions(botId: string): Promise<void> {
    try {
      // Find and disable subscriptions for this bot
      const subscriptions = await this.medplumService.searchResources<Subscription>('Subscription', {
        url: `https://api.medplum.com/fhir/R4/Bot/${botId}/$execute`
      });

      for (const entry of subscriptions.entry || []) {
        if (entry.resource) {
          await this.medplumService.updateResource({
            ...entry.resource,
            status: 'off'
          });
        }
      }
    } catch (error) {
      console.error('Failed to disable bot subscriptions:', error);
    }
  }

  private async logBotExecution(botId: string, status: string, input: any): Promise<void> {
    const execution: BotExecution = {
      id: `exec-${Date.now()}`,
      botId,
      status: status as any,
      startTime: new Date().toISOString(),
      input,
      logs: [`Bot ${botId} ${status} at ${new Date().toISOString()}`]
    };

    const currentExecutions = this.executions$.value;
    this.executions$.next([execution, ...currentExecutions.slice(0, 99)]); // Keep last 100 executions
  }

  // Bot source code templates

  private getPatientRegistrationBotCode(): string {
    // Import the actual bot implementation
    return `
import { MedplumClient } from '@medplum/core';
import { 
  QuestionnaireResponse, 
  Patient, 
  Coverage, 
  Consent,
  Bundle,
  Identifier,
  HumanName,
  ContactPoint,
  Address,
  CodeableConcept,
  Reference
} from '@medplum/fhirtypes';

/**
 * Patient Registration Automation Bot
 * 
 * Processes QuestionnaireResponse resources to automatically create:
 * - Patient resources with conditional create logic
 * - Coverage resources for insurance information
 * - Consent resources for treatment authorization
 * 
 * Includes duplicate patient prevention and merging capabilities.
 */
export async function handler(medplum: MedplumClient, event: any): Promise<any> {
  console.log('Patient Registration Bot triggered', { eventType: event.type, resourceId: event.resource?.id });
  
  try {
    const questionnaireResponse = event.input as QuestionnaireResponse;
    
    if (!questionnaireResponse) {
      throw new Error('No QuestionnaireResponse provided in event input');
    }

    // Validate questionnaire response
    if (questionnaireResponse.status !== 'completed') {
      return { 
        success: false, 
        error: 'QuestionnaireResponse must be completed',
        resourceId: questionnaireResponse.id 
      };
    }

    // Extract patient information from questionnaire response
    const patientData = extractPatientData(questionnaireResponse);
    
    // Check for existing patients to prevent duplicates
    const existingPatient = await findExistingPatient(medplum, patientData);
    
    let patient: Patient;
    if (existingPatient) {
      console.log('Found existing patient, updating', { patientId: existingPatient.id });
      // Update existing patient with new information
      patient = await updateExistingPatient(medplum, existingPatient, patientData);
    } else {
      console.log('Creating new patient');
      // Create new patient with conditional create
      patient = await createNewPatient(medplum, patientData);
    }

    // Create coverage if insurance information is provided
    let coverage: Coverage | null = null;
    const coverageData = extractCoverageData(questionnaireResponse, patient);
    if (coverageData) {
      console.log('Creating coverage resource');
      coverage = await medplum.createResource(coverageData);
    }

    // Create consent for treatment
    console.log('Creating consent resource');
    const consent = await createTreatmentConsent(medplum, patient);

    // Update the questionnaire response to link to created resources
    await linkQuestionnaireResponseToPatient(medplum, questionnaireResponse, patient);

    const result = {
      success: true,
      patientId: patient.id,
      coverageId: coverage?.id,
      consentId: consent.id,
      isNewPatient: !existingPatient,
      timestamp: new Date().toISOString()
    };

    console.log('Patient registration completed successfully', result);
    return result;

  } catch (error) {
    console.error('Patient registration bot failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// Helper functions would be included here...
    `;
  }

  private getOrderSplittingBotCode(): string {
    return `
import { MedplumClient } from '@medplum/core';
import { 
  ServiceRequest, 
  Specimen, 
  Task,
  CodeableConcept,
  Reference,
  Identifier,
  Bundle,
  Observation
} from '@medplum/fhirtypes';

/**
 * Order Splitting Automation Bot
 * 
 * Analyzes ServiceRequest resources and automatically splits them into multiple
 * specimens when different test requirements necessitate separate samples.
 */
export async function handler(medplum: MedplumClient, event: any): Promise<any> {
  console.log('Order Splitting Bot triggered', { eventType: event.type, resourceId: event.resource?.id });
  
  try {
    const serviceRequest = event.input as ServiceRequest;
    
    if (!serviceRequest) {
      throw new Error('No ServiceRequest provided in event input');
    }

    // Validate service request
    const validationResult = await validateServiceRequest(serviceRequest);
    if (!validationResult.isValid) {
      return {
        success: false,
        error: 'Service request validation failed',
        validationErrors: validationResult.errors,
        resourceId: serviceRequest.id
      };
    }

    // Analyze splitting requirements
    const splitRequirements = await analyzeSplitRequirements(medplum, serviceRequest);
    
    if (splitRequirements.length <= 1) {
      console.log('No splitting required for service request', { serviceRequestId: serviceRequest.id });
      return {
        success: true,
        message: 'No splitting required',
        specimenCount: 1,
        serviceRequestId: serviceRequest.id
      };
    }

    // Create specimens and tasks for each requirement
    const createdSpecimens = [];
    const createdTasks = [];

    for (let i = 0; i < splitRequirements.length; i++) {
      const requirement = splitRequirements[i];
      
      // Create specimen
      const specimen = await createSpecimenForRequirement(
        medplum, 
        serviceRequest, 
        requirement, 
        i + 1
      );
      createdSpecimens.push(specimen);

      // Create workflow tasks for the specimen
      const tasks = await createWorkflowTasks(medplum, specimen, requirement);
      createdTasks.push(...tasks);
    }

    const result = {
      success: true,
      serviceRequestId: serviceRequest.id,
      splitSpecimenCount: createdSpecimens.length,
      specimens: createdSpecimens.map(s => ({
        id: s.id,
        type: s.type?.text || s.type?.coding?.[0]?.display,
        accessionNumber: s.accessionIdentifier?.value
      })),
      tasksCreated: createdTasks.length,
      timestamp: new Date().toISOString()
    };

    console.log('Order splitting completed successfully', result);
    return result;

  } catch (error) {
    console.error('Order splitting bot failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// Helper functions would be included here...
    `;
  }

  private getBillingBotCode(): string {
    return `
import { MedplumClient } from '@medplum/core';
import { 
  DiagnosticReport, 
  Claim,
  ClaimResponse,
  Patient,
  Coverage,
  ServiceRequest,
  Practitioner,
  Organization,
  Money,
  CodeableConcept,
  Reference,
  Identifier,
  Bundle,
  Task
} from '@medplum/fhirtypes';

/**
 * Billing Automation Bot
 * 
 * Automatically creates and submits claims when DiagnosticReport resources
 * are finalized. Includes billing rule validation and claim submission tracking.
 */
export async function handler(medplum: MedplumClient, event: any): Promise<any> {
  console.log('Billing Automation Bot triggered', { eventType: event.type, resourceId: event.resource?.id });
  
  try {
    const diagnosticReport = event.input as DiagnosticReport;
    
    if (!diagnosticReport) {
      throw new Error('No DiagnosticReport provided in event input');
    }

    // Validate that the diagnostic report is finalized
    if (diagnosticReport.status !== 'final') {
      return {
        success: false,
        error: 'Billing can only be triggered for finalized diagnostic reports',
        reportStatus: diagnosticReport.status,
        resourceId: diagnosticReport.id
      };
    }

    // Validate billing prerequisites
    const validationResult = await validateBillingPrerequisites(medplum, diagnosticReport);
    if (!validationResult.isValid) {
      return {
        success: false,
        error: 'Billing validation failed',
        validationErrors: validationResult.errors,
        resourceId: diagnosticReport.id
      };
    }

    // Get billing context and apply rules
    const billingContext = await getBillingContext(medplum, diagnosticReport);
    const billingRules = await applyBillingRules(medplum, diagnosticReport, billingContext);
    
    if (!billingRules.shouldBill) {
      return {
        success: true,
        message: 'No billing required',
        reason: billingRules.reason,
        resourceId: diagnosticReport.id
      };
    }

    // Create and submit claim
    const claim = await createClaimFromReport(medplum, diagnosticReport, billingContext, billingRules);
    const submissionResult = await submitClaimForProcessing(medplum, claim);
    
    // Create tracking task
    await createClaimTrackingTask(medplum, claim, diagnosticReport);

    const result = {
      success: true,
      diagnosticReportId: diagnosticReport.id,
      claimId: claim.id,
      claimTotal: claim.total?.value,
      currency: claim.total?.currency,
      submissionStatus: submissionResult.status,
      submissionId: submissionResult.submissionId,
      timestamp: new Date().toISOString()
    };

    console.log('Billing automation completed successfully', result);
    return result;

  } catch (error) {
    console.error('Billing automation bot failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// Helper functions would be included here...
    `;
  }

  private getWorkflowValidationBotCode(): string {
    return `
import { MedplumClient } from '@medplum/core';
import { 
  DiagnosticReport, 
  OperationOutcome,
  Task,
  Observation,
  Patient,
  ServiceRequest,
  Specimen,
  Practitioner,
  AuditEvent,
  Communication,
  Reference,
  CodeableConcept,
  Bundle
} from '@medplum/fhirtypes';

/**
 * Workflow Validation Bot
 * 
 * Validates DiagnosticReport resources for completeness, quality, and compliance
 * before they can be finalized. Enforces business rules and quality standards.
 */
export async function handler(medplum: MedplumClient, event: any): Promise<any> {
  console.log('Workflow Validation Bot triggered', { eventType: event.type, resourceId: event.resource?.id });
  
  try {
    const diagnosticReport = event.input as DiagnosticReport;
    
    if (!diagnosticReport) {
      throw new Error('No DiagnosticReport provided in event input');
    }

    console.log('Validating diagnostic report', { 
      reportId: diagnosticReport.id,
      status: diagnosticReport.status 
    });

    // Get validation context and run checks
    const validationContext = await getValidationContext(medplum, diagnosticReport);
    const validationResults = await runValidationChecks(medplum, diagnosticReport, validationContext);
    
    // Process results and generate notifications
    const processedResults = await processValidationResults(medplum, diagnosticReport, validationResults);
    await generateNotifications(medplum, diagnosticReport, processedResults);
    await createValidationAuditEvent(medplum, diagnosticReport, processedResults);

    const result = {
      success: true,
      diagnosticReportId: diagnosticReport.id,
      validationStatus: processedResults.overallStatus,
      errorsCount: processedResults.errors.length,
      warningsCount: processedResults.warnings.length,
      criticalIssuesCount: processedResults.criticalIssues.length,
      canProceed: processedResults.canProceed,
      nextAction: processedResults.nextAction,
      timestamp: new Date().toISOString()
    };

    console.log('Workflow validation completed', result);
    return result;

  } catch (error) {
    console.error('Workflow validation bot failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// Helper functions would be included here...
    `;
  }
}