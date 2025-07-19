import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import {
  DiagnosticReport,
  Observation,
  Specimen,
  Patient,
  ServiceRequest,
  Practitioner,
  Reference,
  CodeableConcept,
  Bundle,
  Binary,
  AuditEvent
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { SearchParams, LIMSErrorType } from '../types/fhir-types';

export interface ReportTemplate {
  id: string;
  name: string;
  specialty: 'histopathology' | 'microbiology' | 'chemistry' | 'hematology' | 'general';
  sections: ReportSection[];
  requiredObservations: string[];
  validationRules: ValidationRule[];
  isActive: boolean;
}

export interface ReportSection {
  id: string;
  title: string;
  order: number;
  required: boolean;
  observationTypes: string[];
  template: string;
  formatting: SectionFormatting;
}

export interface SectionFormatting {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
  spacing?: number;
  includeHeader?: boolean;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  condition: string; // FHIRPath expression
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ReportGenerationRequest {
  specimenId: string;
  templateId: string;
  observations: Reference[];
  priority?: 'routine' | 'urgent' | 'stat';
  requestedBy?: Reference;
  additionalNotes?: string;
}

export interface ReportValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  completeness: number; // percentage
  missingObservations: string[];
}

export interface ValidationError {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  observationId?: string;
}

export interface ReportMetrics {
  totalReports: number;
  pendingReports: number;
  completedReports: number;
  averageGenerationTime: number;
  validationErrors: number;
  reportsBySpecialty: { [specialty: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class DiagnosticReportService {
  private reportTemplates$ = new BehaviorSubject<ReportTemplate[]>([]);
  private pendingReports$ = new BehaviorSubject<DiagnosticReport[]>([]);
  private reportMetrics$ = new BehaviorSubject<ReportMetrics | null>(null);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private retryService: RetryService,
    private authService: AuthService,
    private auditService: AuditService
  ) {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      await this.loadReportTemplates();
      await this.loadPendingReports();
      await this.calculateMetrics();
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to initialize DiagnosticReportService',
        details: error,
        timestamp: new Date()
      });
    }
  }

  // Template Management
  async loadReportTemplates(): Promise<void> {
    try {
      // In a real implementation, templates would be stored as FHIR resources
      // For now, we'll use predefined templates
      const templates = this.getDefaultTemplates();
      this.reportTemplates$.next(templates);
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.FHIR_ERROR,
        message: 'Failed to load report templates',
        details: error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  getReportTemplates(): Observable<ReportTemplate[]> {
    return this.reportTemplates$.asObservable();
  }

  getTemplatesBySpecialty(specialty: string): Observable<ReportTemplate[]> {
    return this.reportTemplates$.pipe(
      map(templates => templates.filter(t => t.specialty === specialty && t.isActive))
    );
  }

  // Report Generation
  async generateDiagnosticReport(request: ReportGenerationRequest): Promise<DiagnosticReport> {
    try {
      const startTime = Date.now();

      // Get the specimen and related data
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', request.specimenId);
      const patient = await this.medplumService.readResource<Patient>('Patient', specimen.subject?.reference?.split('/')[1] || '');
      
      // Get the template
      const template = this.reportTemplates$.value.find(t => t.id === request.templateId);
      if (!template) {
        throw new Error(`Report template not found: ${request.templateId}`);
      }

      // Gather all observations
      const observations = await this.gatherObservations(request.observations);
      
      // Validate completeness
      const validationResult = await this.validateReportData(template, observations);
      
      // Create the diagnostic report
      const diagnosticReport = await this.assembleDiagnosticReport(
        specimen,
        patient,
        template,
        observations,
        request
      );

      // Create the report resource
      const createdReport = await this.medplumService.createResource(diagnosticReport);

      // Log generation time
      const generationTime = Date.now() - startTime;
      console.log(`Report generated in ${generationTime}ms`);

      // Create audit event
      await this.auditService.logEvent({
        action: 'create',
        resourceType: 'DiagnosticReport',
        resourceId: createdReport.id!,
        details: {
          specimenId: request.specimenId,
          templateId: request.templateId,
          generationTime
        }
      });

      // Update metrics
      await this.calculateMetrics();

      return createdReport;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to generate diagnostic report',
        details: error,
        timestamp: new Date(),
        resourceType: 'DiagnosticReport'
      });
      throw error;
    }
  }

  private async gatherObservations(observationRefs: Reference[]): Promise<Observation[]> {
    const observations: Observation[] = [];
    
    for (const ref of observationRefs) {
      try {
        const observationId = ref.reference?.split('/')[1];
        if (observationId) {
          const observation = await this.medplumService.readResource<Observation>('Observation', observationId);
          observations.push(observation);
        }
      } catch (error) {
        console.warn(`Failed to load observation: ${ref.reference}`, error);
      }
    }
    
    return observations;
  }

  private async assembleDiagnosticReport(
    specimen: Specimen,
    patient: Patient,
    template: ReportTemplate,
    observations: Observation[],
    request: ReportGenerationRequest
  ): Promise<DiagnosticReport> {
    const currentUser = this.authService.getCurrentUser();
    
    const diagnosticReport: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
          code: this.getCategoryCode(template.specialty),
          display: this.getCategoryDisplay(template.specialty)
        }]
      }],
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: this.getReportCode(template.specialty),
          display: template.name
        }]
      },
      subject: {
        reference: `Patient/${patient.id}`,
        display: this.getPatientDisplayName(patient)
      },
      effectiveDateTime: new Date().toISOString(),
      issued: new Date().toISOString(),
      performer: currentUser ? [{
        reference: `Practitioner/${currentUser.id}`,
        display: currentUser.name?.[0]?.text || 'Unknown'
      }] : [],
      specimen: [{
        reference: `Specimen/${specimen.id}`,
        display: specimen.accessionIdentifier?.value || specimen.id
      }],
      result: observations.map(obs => ({
        reference: `Observation/${obs.id}`,
        display: obs.code?.text || obs.code?.coding?.[0]?.display || 'Observation'
      })),
      conclusion: this.generateConclusion(template, observations),
      conclusionCode: this.generateConclusionCodes(observations),
      presentedForm: [], // Will be populated when PDF is generated
      extension: [{
        url: 'http://lims.local/fhir/StructureDefinition/report-template',
        valueString: template.id
      }, {
        url: 'http://lims.local/fhir/StructureDefinition/generation-timestamp',
        valueDateTime: new Date().toISOString()
      }]
    };

    // Add service request reference if available
    if (specimen.request && specimen.request.length > 0) {
      diagnosticReport.basedOn = specimen.request;
    }

    return diagnosticReport;
  }

  // Report Validation
  async validateReportData(template: ReportTemplate, observations: Observation[]): Promise<ReportValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    // Check required observations
    const missingObservations: string[] = [];
    for (const requiredObs of template.requiredObservations) {
      const found = observations.some(obs => 
        obs.code?.coding?.some(coding => coding.code === requiredObs)
      );
      if (!found) {
        missingObservations.push(requiredObs);
        errors.push({
          ruleId: 'required-observation',
          severity: 'error',
          message: `Required observation missing: ${requiredObs}`,
          field: 'observations'
        });
      }
    }

    // Apply validation rules
    for (const rule of template.validationRules) {
      try {
        const ruleResult = await this.evaluateValidationRule(rule, observations);
        if (!ruleResult.passed) {
          const validationError: ValidationError = {
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.message,
            field: ruleResult.field,
            observationId: ruleResult.observationId
          };

          if (rule.severity === 'error') {
            errors.push(validationError);
          } else {
            warnings.push(validationError);
          }
        }
      } catch (error) {
        console.warn(`Failed to evaluate validation rule ${rule.id}:`, error);
      }
    }

    // Calculate completeness
    const totalRequired = template.requiredObservations.length;
    const completed = totalRequired - missingObservations.length;
    const completeness = totalRequired > 0 ? (completed / totalRequired) * 100 : 100;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      completeness,
      missingObservations
    };
  }

  private async evaluateValidationRule(
    rule: ValidationRule, 
    observations: Observation[]
  ): Promise<{ passed: boolean; field?: string; observationId?: string }> {
    // Simplified validation rule evaluation
    // In a real implementation, this would use FHIRPath evaluation
    
    switch (rule.id) {
      case 'numeric-range':
        return this.validateNumericRange(observations);
      case 'required-fields':
        return this.validateRequiredFields(observations);
      case 'terminology-binding':
        return this.validateTerminologyBinding(observations);
      default:
        return { passed: true };
    }
  }

  private validateNumericRange(observations: Observation[]): { passed: boolean; field?: string; observationId?: string } {
    for (const obs of observations) {
      if (obs.valueQuantity && obs.referenceRange) {
        const value = obs.valueQuantity.value;
        const range = obs.referenceRange[0];
        
        if (range.low?.value && value! < range.low.value) {
          return { 
            passed: false, 
            field: 'valueQuantity', 
            observationId: obs.id 
          };
        }
        
        if (range.high?.value && value! > range.high.value) {
          return { 
            passed: false, 
            field: 'valueQuantity', 
            observationId: obs.id 
          };
        }
      }
    }
    return { passed: true };
  }

  private validateRequiredFields(observations: Observation[]): { passed: boolean; field?: string; observationId?: string } {
    for (const obs of observations) {
      if (!obs.code || !obs.code.coding || obs.code.coding.length === 0) {
        return { 
          passed: false, 
          field: 'code', 
          observationId: obs.id 
        };
      }
      
      if (!obs.valueQuantity && !obs.valueCodeableConcept && !obs.valueString) {
        return { 
          passed: false, 
          field: 'value', 
          observationId: obs.id 
        };
      }
    }
    return { passed: true };
  }

  private validateTerminologyBinding(observations: Observation[]): { passed: boolean; field?: string; observationId?: string } {
    // Simplified terminology validation
    for (const obs of observations) {
      if (obs.valueCodeableConcept?.coding) {
        for (const coding of obs.valueCodeableConcept.coding) {
          if (!coding.system || !coding.code) {
            return { 
              passed: false, 
              field: 'valueCodeableConcept', 
              observationId: obs.id 
            };
          }
        }
      }
    }
    return { passed: true };
  }

  // Report Status Management
  async updateReportStatus(reportId: string, status: DiagnosticReport['status'], notes?: string): Promise<DiagnosticReport> {
    try {
      const report = await this.medplumService.readResource<DiagnosticReport>('DiagnosticReport', reportId);
      
      // Validate status transition
      if (!this.isValidStatusTransition(report.status, status)) {
        throw new Error(`Invalid status transition from ${report.status} to ${status}`);
      }

      report.status = status;
      
      // Add status change note
      if (notes) {
        if (!report.extension) report.extension = [];
        report.extension.push({
          url: 'http://lims.local/fhir/StructureDefinition/status-change-note',
          valueString: notes
        });
      }

      const updatedReport = await this.medplumService.updateResource(report);

      // Create audit event for status change
      await this.auditService.logEvent({
        action: 'update',
        resourceType: 'DiagnosticReport',
        resourceId: reportId,
        details: {
          statusChange: `${report.status} -> ${status}`,
          notes
        }
      });

      // Update pending reports list
      await this.loadPendingReports();

      return updatedReport;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to update report status',
        details: error,
        timestamp: new Date(),
        resourceType: 'DiagnosticReport',
        resourceId: reportId
      });
      throw error;
    }
  }

  private isValidStatusTransition(currentStatus: DiagnosticReport['status'], newStatus: DiagnosticReport['status']): boolean {
    const validTransitions: { [key: string]: string[] } = {
      'registered': ['preliminary', 'cancelled'],
      'preliminary': ['final', 'amended', 'cancelled'],
      'final': ['amended', 'corrected'],
      'amended': ['final', 'corrected'],
      'corrected': ['final'],
      'cancelled': []
    };

    return validTransitions[currentStatus || '']?.includes(newStatus || '') || false;
  }

  // Report Queries
  async loadPendingReports(): Promise<void> {
    try {
      const searchParams: SearchParams = {
        status: 'preliminary,registered',
        _sort: '-_lastUpdated',
        _count: '50'
      };

      const bundle = await this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', searchParams);
      const reports = bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
      
      this.pendingReports$.next(reports);
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.FHIR_ERROR,
        message: 'Failed to load pending reports',
        details: error,
        timestamp: new Date()
      });
    }
  }

  getPendingReports(): Observable<DiagnosticReport[]> {
    return this.pendingReports$.asObservable();
  }

  async getReportsBySpecimen(specimenId: string): Promise<DiagnosticReport[]> {
    try {
      const searchParams: SearchParams = {
        specimen: `Specimen/${specimenId}`,
        _sort: '-_lastUpdated'
      };

      const bundle = await this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', searchParams);
      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.FHIR_ERROR,
        message: 'Failed to get reports by specimen',
        details: error,
        timestamp: new Date()
      });
      return [];
    }
  }

  async getReportsByPatient(patientId: string): Promise<DiagnosticReport[]> {
    try {
      const searchParams: SearchParams = {
        subject: `Patient/${patientId}`,
        _sort: '-_lastUpdated'
      };

      const bundle = await this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', searchParams);
      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.FHIR_ERROR,
        message: 'Failed to get reports by patient',
        details: error,
        timestamp: new Date()
      });
      return [];
    }
  }

  // Metrics and Analytics
  async calculateMetrics(): Promise<void> {
    try {
      const [totalBundle, pendingBundle, completedBundle] = await Promise.all([
        this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', { _summary: 'count' }),
        this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', { 
          status: 'preliminary,registered', 
          _summary: 'count' 
        }),
        this.medplumService.searchResources<DiagnosticReport>('DiagnosticReport', { 
          status: 'final', 
          _summary: 'count' 
        })
      ]);

      const metrics: ReportMetrics = {
        totalReports: totalBundle.total || 0,
        pendingReports: pendingBundle.total || 0,
        completedReports: completedBundle.total || 0,
        averageGenerationTime: 0, // Would be calculated from audit logs
        validationErrors: 0, // Would be calculated from validation results
        reportsBySpecialty: {} // Would be calculated from report categories
      };

      this.reportMetrics$.next(metrics);
    } catch (error) {
      console.warn('Failed to calculate report metrics:', error);
    }
  }

  getReportMetrics(): Observable<ReportMetrics | null> {
    return this.reportMetrics$.asObservable();
  }

  // Helper Methods
  private generateConclusion(template: ReportTemplate, observations: Observation[]): string {
    // Generate a basic conclusion based on observations
    const findings = observations
      .filter(obs => obs.valueString || obs.valueCodeableConcept)
      .map(obs => {
        if (obs.valueString) {
          return `${obs.code?.text || 'Finding'}: ${obs.valueString}`;
        }
        if (obs.valueCodeableConcept?.text) {
          return `${obs.code?.text || 'Finding'}: ${obs.valueCodeableConcept.text}`;
        }
        return null;
      })
      .filter(Boolean);

    return findings.length > 0 
      ? `Clinical findings: ${findings.join('; ')}`
      : 'No significant findings documented.';
  }

  private generateConclusionCodes(observations: Observation[]): CodeableConcept[] {
    // Extract coded conclusions from observations
    return observations
      .filter(obs => obs.valueCodeableConcept?.coding)
      .map(obs => obs.valueCodeableConcept!)
      .filter(Boolean);
  }

  private getCategoryCode(specialty: string): string {
    const categoryMap: { [key: string]: string } = {
      'histopathology': 'PAT',
      'microbiology': 'MB',
      'chemistry': 'CH',
      'hematology': 'HM',
      'general': 'LAB'
    };
    return categoryMap[specialty] || 'LAB';
  }

  private getCategoryDisplay(specialty: string): string {
    const displayMap: { [key: string]: string } = {
      'histopathology': 'Pathology',
      'microbiology': 'Microbiology',
      'chemistry': 'Chemistry',
      'hematology': 'Hematology',
      'general': 'Laboratory'
    };
    return displayMap[specialty] || 'Laboratory';
  }

  private getReportCode(specialty: string): string {
    const codeMap: { [key: string]: string } = {
      'histopathology': '60567-5',
      'microbiology': '18725-2',
      'chemistry': '33747-0',
      'hematology': '58410-2',
      'general': '11502-2'
    };
    return codeMap[specialty] || '11502-2';
  }

  private getPatientDisplayName(patient: Patient): string {
    if (patient.name && patient.name.length > 0) {
      const name = patient.name[0];
      const given = name.given?.join(' ') || '';
      const family = name.family || '';
      return `${given} ${family}`.trim();
    }
    return patient.id || 'Unknown Patient';
  }

  private getDefaultTemplates(): ReportTemplate[] {
    return [
      {
        id: 'histopathology-standard',
        name: 'Standard Histopathology Report',
        specialty: 'histopathology',
        sections: [
          {
            id: 'clinical-history',
            title: 'Clinical History',
            order: 1,
            required: true,
            observationTypes: ['clinical-history'],
            template: 'Clinical History: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          },
          {
            id: 'gross-description',
            title: 'Gross Description',
            order: 2,
            required: true,
            observationTypes: ['gross-description'],
            template: 'Gross Description: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          },
          {
            id: 'microscopic-description',
            title: 'Microscopic Description',
            order: 3,
            required: true,
            observationTypes: ['microscopic-description'],
            template: 'Microscopic Description: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          },
          {
            id: 'diagnosis',
            title: 'Diagnosis',
            order: 4,
            required: true,
            observationTypes: ['diagnosis'],
            template: 'Diagnosis: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'bold' }
          }
        ],
        requiredObservations: ['clinical-history', 'gross-description', 'microscopic-description', 'diagnosis'],
        validationRules: [
          {
            id: 'required-fields',
            name: 'Required Fields Validation',
            description: 'Ensures all required fields are present',
            condition: 'exists()',
            severity: 'error',
            message: 'Required field is missing'
          }
        ],
        isActive: true
      },
      {
        id: 'microbiology-culture',
        name: 'Microbiology Culture Report',
        specialty: 'microbiology',
        sections: [
          {
            id: 'specimen-source',
            title: 'Specimen Source',
            order: 1,
            required: true,
            observationTypes: ['specimen-source'],
            template: 'Specimen Source: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          },
          {
            id: 'culture-results',
            title: 'Culture Results',
            order: 2,
            required: true,
            observationTypes: ['culture-results'],
            template: 'Culture Results: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          },
          {
            id: 'organism-identification',
            title: 'Organism Identification',
            order: 3,
            required: false,
            observationTypes: ['organism-id'],
            template: 'Organism: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          },
          {
            id: 'susceptibility-testing',
            title: 'Antimicrobial Susceptibility',
            order: 4,
            required: false,
            observationTypes: ['susceptibility'],
            template: 'Susceptibility: {{value}}',
            formatting: { fontSize: 12, fontWeight: 'normal' }
          }
        ],
        requiredObservations: ['specimen-source', 'culture-results'],
        validationRules: [
          {
            id: 'terminology-binding',
            name: 'Terminology Binding Validation',
            description: 'Ensures coded values use appropriate terminologies',
            condition: 'coding.exists()',
            severity: 'warning',
            message: 'Coded value should use standard terminology'
          }
        ],
        isActive: true
      }
    ];
  }
}