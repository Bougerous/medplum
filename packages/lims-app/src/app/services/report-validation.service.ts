import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import {
  DiagnosticReport,
  AuditEvent,
  Task,
  Practitioner,
  Reference,
  CodeableConcept,
  Bundle
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { SearchParams, LIMSErrorType } from '../types/fhir-types';

export interface ValidationWorkflow {
  id: string;
  reportId: string;
  currentStep: ValidationStep;
  steps: ValidationStep[];
  assignedValidator?: Reference;
  priority: 'routine' | 'urgent' | 'stat';
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'rejected' | 'cancelled';
}

export interface ValidationStep {
  id: string;
  name: string;
  description: string;
  order: number;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped' | 'failed';
  requiredRole: string[];
  validationType: 'automatic' | 'manual' | 'peer-review';
  validationRules: string[];
  assignedTo?: Reference;
  completedBy?: Reference;
  completedAt?: Date;
  notes?: string;
  digitalSignature?: DigitalSignature;
}

export interface DigitalSignature {
  signerId: string;
  signerName: string;
  timestamp: Date;
  method: 'password' | 'biometric' | 'token' | 'certificate';
  ipAddress?: string;
  userAgent?: string;
  signatureHash?: string;
}

export interface ValidationBot {
  id: string;
  name: string;
  description: string;
  triggerConditions: string[];
  validationRules: BotValidationRule[];
  isActive: boolean;
  priority: number;
}

export interface BotValidationRule {
  id: string;
  name: string;
  description: string;
  fhirPath: string;
  expectedValue?: any;
  severity: 'error' | 'warning' | 'info';
  message: string;
  autoFix?: boolean;
  fixAction?: string;
}

export interface ValidationResult {
  ruleId: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: any;
  autoFixed?: boolean;
}

export interface PathologistReview {
  reviewerId: string;
  reviewerName: string;
  reviewDate: Date;
  status: 'approved' | 'rejected' | 'needs-revision';
  comments?: string;
  amendments?: Amendment[];
  digitalSignature: DigitalSignature;
}

export interface Amendment {
  id: string;
  section: string;
  originalValue: string;
  newValue: string;
  reason: string;
  amendedBy: string;
  amendedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ReportValidationService {
  private validationWorkflows$ = new BehaviorSubject<ValidationWorkflow[]>([]);
  private validationBots$ = new BehaviorSubject<ValidationBot[]>([]);
  private pendingReviews$ = new BehaviorSubject<DiagnosticReport[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private authService: AuthService,
    private auditService: AuditService
  ) {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      await this.loadValidationBots();
      await this.loadPendingReviews();
      await this.loadActiveWorkflows();
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to initialize ReportValidationService',
        details: error,
        timestamp: new Date()
      });
    }
  }

  // Validation Workflow Management
  async createValidationWorkflow(reportId: string, priority: 'routine' | 'urgent' | 'stat' = 'routine'): Promise<ValidationWorkflow> {
    try {
      const report = await this.medplumService.readResource<DiagnosticReport>('DiagnosticReport', reportId);
      
      // Determine validation steps based on report type and status
      const steps = await this.determineValidationSteps(report);
      
      const workflow: ValidationWorkflow = {
        id: `validation-${Date.now()}`,
        reportId,
        currentStep: steps[0],
        steps,
        priority,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'pending'
      };

      // Create FHIR Task resource for workflow tracking
      const task = await this.createValidationTask(workflow);
      
      // Update workflows list
      const currentWorkflows = this.validationWorkflows$.value;
      this.validationWorkflows$.next([...currentWorkflows, workflow]);

      // Create audit event
      await this.auditService.logEvent({
        action: 'create',
        resourceType: 'Task',
        resourceId: task.id!,
        details: {
          workflowId: workflow.id,
          reportId,
          priority
        }
      });

      return workflow;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to create validation workflow',
        details: error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  private async determineValidationSteps(report: DiagnosticReport): Promise<ValidationStep[]> {
    const steps: ValidationStep[] = [];
    
    // Step 1: Automatic validation
    steps.push({
      id: 'auto-validation',
      name: 'Automatic Validation',
      description: 'Automated validation using bots and rules',
      order: 1,
      status: 'pending',
      requiredRole: ['system'],
      validationType: 'automatic',
      validationRules: ['completeness', 'terminology', 'format']
    });

    // Step 2: Technical review (for complex cases)
    if (this.requiresTechnicalReview(report)) {
      steps.push({
        id: 'technical-review',
        name: 'Technical Review',
        description: 'Technical validation by lab technician',
        order: 2,
        status: 'pending',
        requiredRole: ['lab-technician', 'lab-manager'],
        validationType: 'manual',
        validationRules: ['technical-accuracy', 'data-integrity']
      });
    }

    // Step 3: Pathologist review (always required for final approval)
    steps.push({
      id: 'pathologist-review',
      name: 'Pathologist Review',
      description: 'Final review and approval by pathologist',
      order: steps.length + 1,
      status: 'pending',
      requiredRole: ['pathologist'],
      validationType: 'manual',
      validationRules: ['clinical-accuracy', 'diagnostic-consistency']
    });

    // Step 4: Digital sign-off
    steps.push({
      id: 'digital-signoff',
      name: 'Digital Sign-off',
      description: 'Digital signature and final approval',
      order: steps.length + 1,
      status: 'pending',
      requiredRole: ['pathologist'],
      validationType: 'manual',
      validationRules: ['signature-validation']
    });

    return steps;
  }

  private requiresTechnicalReview(report: DiagnosticReport): boolean {
    // Determine if technical review is needed based on report complexity
    const complexityIndicators = [
      report.result && report.result.length > 10, // Many observations
      report.category?.some(cat => cat.coding?.some(c => c.code === 'PAT')), // Pathology reports
      report.conclusionCode && report.conclusionCode.length > 3 // Multiple diagnoses
    ];

    return complexityIndicators.some(indicator => indicator);
  }

  private async createValidationTask(workflow: ValidationWorkflow): Promise<Task> {
    const currentUser = this.authService.getCurrentUser();
    
    const task: Task = {
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority: workflow.priority === 'stat' ? 'stat' : workflow.priority === 'urgent' ? 'urgent' : 'routine',
      code: {
        coding: [{
          system: 'http://lims.local/fhir/CodeSystem/task-type',
          code: 'report-validation',
          display: 'Report Validation'
        }]
      },
      description: `Validation workflow for diagnostic report`,
      focus: {
        reference: `DiagnosticReport/${workflow.reportId}`
      },
      authoredOn: new Date().toISOString(),
      requester: currentUser ? {
        reference: `Practitioner/${currentUser.id}`
      } : undefined,
      input: [{
        type: {
          coding: [{
            system: 'http://lims.local/fhir/CodeSystem/task-input',
            code: 'workflow-config'
          }]
        },
        valueString: JSON.stringify({
          workflowId: workflow.id,
          steps: workflow.steps.map(s => ({ id: s.id, name: s.name, order: s.order }))
        })
      }]
    };

    return await this.medplumService.createResource(task);
  }

  // Bot-based Validation
  async executeAutomaticValidation(reportId: string): Promise<ValidationResult[]> {
    try {
      const report = await this.medplumService.readResource<DiagnosticReport>('DiagnosticReport', reportId);
      const bots = this.validationBots$.value.filter(bot => bot.isActive);
      const results: ValidationResult[] = [];

      for (const bot of bots) {
        if (this.shouldTriggerBot(bot, report)) {
          const botResults = await this.executeBotValidation(bot, report);
          results.push(...botResults);
        }
      }

      // Create audit event for automatic validation
      await this.auditService.logEvent({
        action: 'validate',
        resourceType: 'DiagnosticReport',
        resourceId: reportId,
        details: {
          validationType: 'automatic',
          botsExecuted: bots.length,
          resultsCount: results.length,
          errors: results.filter(r => r.severity === 'error').length,
          warnings: results.filter(r => r.severity === 'warning').length
        }
      });

      return results;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to execute automatic validation',
        details: error,
        timestamp: new Date(),
        resourceType: 'DiagnosticReport',
        resourceId: reportId
      });
      throw error;
    }
  }

  private shouldTriggerBot(bot: ValidationBot, report: DiagnosticReport): boolean {
    // Simplified trigger logic - in real implementation would use FHIRPath
    for (const condition of bot.triggerConditions) {
      switch (condition) {
        case 'status:preliminary':
          if (report.status === 'preliminary') return true;
          break;
        case 'category:pathology':
          if (report.category?.some(cat => cat.coding?.some(c => c.code === 'PAT'))) return true;
          break;
        case 'has-observations':
          if (report.result && report.result.length > 0) return true;
          break;
      }
    }
    return false;
  }

  private async executeBotValidation(bot: ValidationBot, report: DiagnosticReport): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of bot.validationRules) {
      try {
        const result = await this.evaluateBotRule(rule, report);
        results.push(result);

        // Auto-fix if possible and enabled
        if (!result.passed && rule.autoFix && rule.fixAction) {
          const fixResult = await this.applyAutoFix(rule, report);
          if (fixResult) {
            result.autoFixed = true;
            result.passed = true;
          }
        }
      } catch (error) {
        console.warn(`Failed to evaluate bot rule ${rule.id}:`, error);
        results.push({
          ruleId: rule.id,
          passed: false,
          severity: 'error',
          message: `Rule evaluation failed: ${error.message}`,
          details: error
        });
      }
    }

    return results;
  }

  private async evaluateBotRule(rule: BotValidationRule, report: DiagnosticReport): Promise<ValidationResult> {
    // Simplified rule evaluation - in real implementation would use FHIRPath engine
    switch (rule.id) {
      case 'completeness-check':
        return this.validateCompleteness(rule, report);
      case 'terminology-validation':
        return this.validateTerminology(rule, report);
      case 'format-validation':
        return this.validateFormat(rule, report);
      default:
        return {
          ruleId: rule.id,
          passed: true,
          severity: rule.severity,
          message: 'Rule not implemented'
        };
    }
  }

  private validateCompleteness(rule: BotValidationRule, report: DiagnosticReport): ValidationResult {
    const requiredFields = ['status', 'code', 'subject', 'effectiveDateTime'];
    const missingFields = requiredFields.filter(field => !report[field as keyof DiagnosticReport]);

    return {
      ruleId: rule.id,
      passed: missingFields.length === 0,
      severity: rule.severity,
      message: missingFields.length > 0 
        ? `Missing required fields: ${missingFields.join(', ')}`
        : 'All required fields present',
      details: { missingFields }
    };
  }

  private validateTerminology(rule: BotValidationRule, report: DiagnosticReport): ValidationResult {
    // Check if coded values use appropriate terminologies
    const issues: string[] = [];

    if (report.code?.coding) {
      for (const coding of report.code.coding) {
        if (!coding.system || !coding.code) {
          issues.push('Report code missing system or code');
        }
      }
    }

    if (report.conclusionCode) {
      for (const conclusion of report.conclusionCode) {
        if (conclusion.coding) {
          for (const coding of conclusion.coding) {
            if (!coding.system || !coding.code) {
              issues.push('Conclusion code missing system or code');
            }
          }
        }
      }
    }

    return {
      ruleId: rule.id,
      passed: issues.length === 0,
      severity: rule.severity,
      message: issues.length > 0 
        ? `Terminology issues: ${issues.join('; ')}`
        : 'Terminology validation passed',
      details: { issues }
    };
  }

  private validateFormat(rule: BotValidationRule, report: DiagnosticReport): ValidationResult {
    const issues: string[] = [];

    // Check date formats
    if (report.effectiveDateTime && !this.isValidDateTime(report.effectiveDateTime)) {
      issues.push('Invalid effectiveDateTime format');
    }

    if (report.issued && !this.isValidDateTime(report.issued)) {
      issues.push('Invalid issued date format');
    }

    // Check reference formats
    if (report.subject?.reference && !this.isValidReference(report.subject.reference)) {
      issues.push('Invalid subject reference format');
    }

    return {
      ruleId: rule.id,
      passed: issues.length === 0,
      severity: rule.severity,
      message: issues.length > 0 
        ? `Format issues: ${issues.join('; ')}`
        : 'Format validation passed',
      details: { issues }
    };
  }

  private isValidDateTime(dateTime: string): boolean {
    return !isNaN(Date.parse(dateTime));
  }

  private isValidReference(reference: string): boolean {
    return /^[A-Za-z]+\/[A-Za-z0-9\-\.]{1,64}$/.test(reference);
  }

  private async applyAutoFix(rule: BotValidationRule, report: DiagnosticReport): Promise<boolean> {
    // Simplified auto-fix implementation
    try {
      switch (rule.fixAction) {
        case 'add-missing-issued-date':
          if (!report.issued) {
            report.issued = new Date().toISOString();
            await this.medplumService.updateResource(report);
            return true;
          }
          break;
        case 'normalize-references':
          // Normalize reference formats
          if (report.subject?.reference && !this.isValidReference(report.subject.reference)) {
            // Apply normalization logic
            return true;
          }
          break;
      }
      return false;
    } catch (error) {
      console.warn(`Auto-fix failed for rule ${rule.id}:`, error);
      return false;
    }
  }

  // Manual Validation and Review
  async assignReviewTask(reportId: string, reviewerId: string, stepId: string): Promise<void> {
    try {
      // Find the validation workflow
      const workflows = this.validationWorkflows$.value;
      const workflow = workflows.find(w => w.reportId === reportId);
      
      if (!workflow) {
        throw new Error(`Validation workflow not found for report ${reportId}`);
      }

      // Find the step
      const step = workflow.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error(`Validation step ${stepId} not found`);
      }

      // Assign the step
      step.assignedTo = { reference: `Practitioner/${reviewerId}` };
      step.status = 'in-progress';
      workflow.updatedAt = new Date();

      // Update the workflow
      const updatedWorkflows = workflows.map(w => w.id === workflow.id ? workflow : w);
      this.validationWorkflows$.next(updatedWorkflows);

      // Create audit event
      await this.auditService.logEvent({
        action: 'assign',
        resourceType: 'Task',
        resourceId: workflow.id,
        details: {
          stepId,
          assignedTo: reviewerId,
          reportId
        }
      });
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to assign review task',
        details: error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  async completeValidationStep(
    reportId: string, 
    stepId: string, 
    status: 'completed' | 'failed', 
    notes?: string,
    digitalSignature?: DigitalSignature
  ): Promise<void> {
    try {
      const workflows = this.validationWorkflows$.value;
      const workflow = workflows.find(w => w.reportId === reportId);
      
      if (!workflow) {
        throw new Error(`Validation workflow not found for report ${reportId}`);
      }

      const step = workflow.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error(`Validation step ${stepId} not found`);
      }

      // Update step
      step.status = status;
      step.completedAt = new Date();
      step.notes = notes;
      step.digitalSignature = digitalSignature;
      step.completedBy = { reference: `Practitioner/${this.authService.getCurrentUser()?.id}` };

      // Move to next step if completed successfully
      if (status === 'completed') {
        const nextStep = workflow.steps.find(s => s.order === step.order + 1);
        if (nextStep) {
          workflow.currentStep = nextStep;
          nextStep.status = 'pending';
        } else {
          // All steps completed
          workflow.status = 'completed';
          await this.finalizeReport(reportId);
        }
      } else {
        workflow.status = 'rejected';
      }

      workflow.updatedAt = new Date();

      // Update workflows
      const updatedWorkflows = workflows.map(w => w.id === workflow.id ? workflow : w);
      this.validationWorkflows$.next(updatedWorkflows);

      // Create audit event
      await this.auditService.logEvent({
        action: 'complete-step',
        resourceType: 'Task',
        resourceId: workflow.id,
        details: {
          stepId,
          status,
          notes,
          hasDigitalSignature: !!digitalSignature
        }
      });
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to complete validation step',
        details: error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  // Digital Sign-off
  async createDigitalSignature(
    reportId: string, 
    method: 'password' | 'biometric' | 'token' | 'certificate',
    credentials?: any
  ): Promise<DigitalSignature> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Validate credentials based on method
      await this.validateSignatureCredentials(method, credentials);

      const signature: DigitalSignature = {
        signerId: currentUser.id!,
        signerName: currentUser.name?.[0]?.text || 'Unknown',
        timestamp: new Date(),
        method,
        ipAddress: await this.getClientIpAddress(),
        userAgent: navigator.userAgent,
        signatureHash: await this.generateSignatureHash(reportId, currentUser.id!, method)
      };

      // Create audit event for digital signature
      await this.auditService.logEvent({
        action: 'digital-signature',
        resourceType: 'DiagnosticReport',
        resourceId: reportId,
        details: {
          signatureMethod: method,
          signerId: currentUser.id,
          timestamp: signature.timestamp
        }
      });

      return signature;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to create digital signature',
        details: error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  private async validateSignatureCredentials(method: string, credentials: any): Promise<void> {
    switch (method) {
      case 'password':
        if (!credentials?.password) {
          throw new Error('Password required for signature');
        }
        // Validate password against user account
        break;
      case 'biometric':
        // Validate biometric data
        break;
      case 'token':
        if (!credentials?.token) {
          throw new Error('Token required for signature');
        }
        // Validate token
        break;
      case 'certificate':
        if (!credentials?.certificate) {
          throw new Error('Certificate required for signature');
        }
        // Validate certificate
        break;
    }
  }

  private async getClientIpAddress(): Promise<string> {
    // In a real implementation, this would get the actual client IP
    return '127.0.0.1';
  }

  private async generateSignatureHash(reportId: string, signerId: string, method: string): Promise<string> {
    // Generate a hash for the signature
    const data = `${reportId}-${signerId}-${method}-${Date.now()}`;
    // In a real implementation, use proper cryptographic hashing
    return btoa(data);
  }

  private async finalizeReport(reportId: string): Promise<void> {
    try {
      const report = await this.medplumService.readResource<DiagnosticReport>('DiagnosticReport', reportId);
      report.status = 'final';
      await this.medplumService.updateResource(report);

      // Create final audit event
      await this.auditService.logEvent({
        action: 'finalize',
        resourceType: 'DiagnosticReport',
        resourceId: reportId,
        details: {
          finalizedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to finalize report:', error);
    }
  }

  // Query Methods
  async loadActiveWorkflows(): Promise<void> {
    try {
      // In a real implementation, load from FHIR Task resources
      // For now, use empty array
      this.validationWorkflows$.next([]);
    } catch (error) {
      console.warn('Failed to load active workflows:', error);
    }
  }

  async loadPendingReviews(): Promise<void> {
    try {
      const searchParams: SearchParams = {
        status: 'preliminary',
        _sort: '-_lastUpdated',
        _count: '20'
      };

      const bundle = await this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', searchParams);
      const reports = bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
      
      this.pendingReviews$.next(reports);
    } catch (error) {
      console.warn('Failed to load pending reviews:', error);
    }
  }

  private async loadValidationBots(): Promise<void> {
    // Load default validation bots
    const defaultBots = this.getDefaultValidationBots();
    this.validationBots$.next(defaultBots);
  }

  private getDefaultValidationBots(): ValidationBot[] {
    return [
      {
        id: 'completeness-bot',
        name: 'Completeness Validation Bot',
        description: 'Validates that all required fields are present',
        triggerConditions: ['status:preliminary'],
        validationRules: [
          {
            id: 'completeness-check',
            name: 'Required Fields Check',
            description: 'Ensures all required fields are present',
            fhirPath: 'status.exists() and code.exists() and subject.exists()',
            severity: 'error',
            message: 'Required fields are missing',
            autoFix: true,
            fixAction: 'add-missing-issued-date'
          }
        ],
        isActive: true,
        priority: 1
      },
      {
        id: 'terminology-bot',
        name: 'Terminology Validation Bot',
        description: 'Validates terminology usage and coding',
        triggerConditions: ['has-observations'],
        validationRules: [
          {
            id: 'terminology-validation',
            name: 'Terminology Binding Check',
            description: 'Validates that coded values use appropriate terminologies',
            fhirPath: 'code.coding.system.exists() and code.coding.code.exists()',
            severity: 'warning',
            message: 'Coded values should use standard terminologies',
            autoFix: false
          }
        ],
        isActive: true,
        priority: 2
      }
    ];
  }

  // Observable getters
  getValidationWorkflows(): Observable<ValidationWorkflow[]> {
    return this.validationWorkflows$.asObservable();
  }

  getPendingReviews(): Observable<DiagnosticReport[]> {
    return this.pendingReviews$.asObservable();
  }

  getValidationBots(): Observable<ValidationBot[]> {
    return this.validationBots$.asObservable();
  }
}