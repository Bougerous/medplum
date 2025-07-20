import { Injectable } from '@angular/core';
import {
  Claim,
  ClaimResponse,
  CodeableConcept,
  Coverage,
  Device,
  DiagnosticReport,
  Encounter,
  Money,
  Organization,
  Patient,
  Practitioner,
  Reference,
  ServiceRequest,
  Task
} from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { BillingRule, LIMSErrorType } from '../types/fhir-types';
import { CurrencyService } from './currency.service';
import { ErrorHandlingService } from './error-handling.service';

export interface ClaimItem {
  sequence: number;
  careTeamSequence?: number[];
  diagnosisSequence?: number[];
  procedureSequence?: number[];
  informationSequence?: number[];
  revenue?: CodeableConcept;
  category?: CodeableConcept;
  productOrService: CodeableConcept;
  modifier?: CodeableConcept[];
  programCode?: CodeableConcept[];
  servicedDate?: string;
  servicedPeriod?: {
    start?: string;
    end?: string;
  };
  locationCodeableConcept?: CodeableConcept;
  quantity?: {
    value: number;
    unit?: string;
  };
  unitPrice?: Money;
  factor?: number;
  net?: Money;
  udi?: Reference<Device>[];
  bodySite?: CodeableConcept;
  subSite?: CodeableConcept[];
  encounter?: Reference<Encounter>[];
  noteNumber?: number[];
  detail?: ClaimItemDetail[];
}

export interface ClaimItemDetail {
  sequence: number;
  revenue?: CodeableConcept;
  category?: CodeableConcept;
  productOrService: CodeableConcept;
  modifier?: CodeableConcept[];
  programCode?: CodeableConcept[];
  quantity?: {
    value: number;
    unit?: string;
  };
  unitPrice?: Money;
  factor?: number;
  net?: Money;
  udi?: Reference<Device>[];
  noteNumber?: number[];
  subDetail?: ClaimItemSubDetail[];
}

export interface ClaimItemSubDetail {
  sequence: number;
  revenue?: CodeableConcept;
  category?: CodeableConcept;
  productOrService: CodeableConcept;
  modifier?: CodeableConcept[];
  programCode?: CodeableConcept[];
  quantity?: {
    value: number;
    unit?: string;
  };
  unitPrice?: Money;
  factor?: number;
  net?: Money;
  udi?: Reference<Device>[];
  noteNumber?: number[];
}

export interface BillingContext {
  diagnosticReport: DiagnosticReport;
  patient: Patient;
  coverage?: Coverage;
  serviceRequests: ServiceRequest[];
  organization: Organization;
  provider: Practitioner;
}

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private billingRules$ = new BehaviorSubject<BillingRule[]>([]);
  private pendingClaims$ = new BehaviorSubject<Claim[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private currencyService: CurrencyService
  ) {
    this.loadBillingRules().catch(console.error);
  }

  /**
   * Create FHIR Claim resource from finalized DiagnosticReport
   * @param diagnosticReport - The finalized diagnostic report to create a claim for
   * @param context - Optional billing context information
   * @returns Promise resolving to the created Claim resource
   */
  async createClaimFromDiagnosticReport(
    diagnosticReport: DiagnosticReport,
    context: Partial<BillingContext> = {}
  ): Promise<Claim> {
    try {
      // Validate that the diagnostic report is finalized
      if (diagnosticReport.status !== 'final') {
        throw new Error('Cannot create claim for non-finalized diagnostic report');
      }

      // Gather required context
      const billingContext = await this.gatherBillingContext(diagnosticReport, context);

      // Apply billing rules to determine charges
      const claimItems = await this.generateClaimItems(billingContext);

      // Create the claim resource
      const claim: Claim = {
        resourceType: 'Claim',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional',
            display: 'Professional'
          }]
        },
        use: 'claim',
        patient: {
          reference: `Patient/${billingContext.patient.id}`
        },
        billablePeriod: {
          start: diagnosticReport.effectiveDateTime || new Date().toISOString(),
          end: diagnosticReport.issued || new Date().toISOString()
        },
        created: new Date().toISOString(),
        provider: {
          reference: `Practitioner/${billingContext.provider.id}`
        },
        priority: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/processpriority',
            code: 'normal',
            display: 'Normal'
          }]
        },
        supportingInfo: [{
          sequence: 1,
          category: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory',
              code: 'info',
              display: 'Information'
            }]
          },
          valueReference: {
            reference: `DiagnosticReport/${diagnosticReport.id}`
          }
        }],
        diagnosis: await this.extractDiagnoses(diagnosticReport),
        procedure: await this.extractProcedures(billingContext.serviceRequests),
        insurance: billingContext.coverage ? [{
          sequence: 1,
          focal: true,
          coverage: {
            reference: `Coverage/${billingContext.coverage.id}`
          }
        }] : [],
        item: claimItems,
        total: this.calculateClaimTotal(claimItems)
      };

      // Add insurance information if available
      if (billingContext.coverage) {
        claim.insurance = [{
          sequence: 1,
          focal: true,
          coverage: {
            reference: `Coverage/${billingContext.coverage.id}`
          }
        }];
      }

      // Create the claim in Medplum
      const createdClaim = await this.medplumService.createResource(claim);

      // Update pending claims list
      const currentClaims = this.pendingClaims$.value;
      this.pendingClaims$.next([...currentClaims, createdClaim]);

      // Create audit event for claim creation
      await this.createClaimAuditEvent(createdClaim, 'created');

      return createdClaim;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to create claim from diagnostic report',
        details: { diagnosticReportId: diagnosticReport.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Validate claim before submission
   * @param claim - The claim to validate
   * @returns Promise resolving to validation result with errors and warnings
   */
  async validateClaim(claim: Claim): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate required fields
      this.validateRequiredFields(claim, errors);

      // Validate claim items
      this.validateClaimItems(claim, errors, warnings);

      // Validate insurance information
      this.validateInsuranceInfo(claim, errors, warnings);

      // Business rule validation
      const ruleValidation = await this.validateBusinessRules(claim);
      errors.push(...ruleValidation.errors);
      warnings.push(...ruleValidation.warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Failed to validate claim',
        details: { claimId: claim.id, error },
        timestamp: new Date()
      });

      return {
        isValid: false,
        errors: ['Validation process failed'],
        warnings: []
      };
    }
  }

  /**
   * Submit claim for processing
   * @param claim - The claim to submit
   * @returns Promise resolving to submission result
   */
  async submitClaim(claim: Claim): Promise<{ success: boolean; claimResponse?: ClaimResponse; error?: string }> {
    try {
      // Validate claim before submission
      const validation = await this.validateClaim(claim);
      if (!validation.isValid) {
        throw new Error(`Claim validation failed: ${validation.errors.join(', ')}`);
      }

      // Update claim status to submitted
      const submittedClaim = await this.medplumService.updateResource({
        ...claim,
        status: 'active'
      });

      // Create submission task for external processing
      const submissionTask: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://lims.local/tasks',
            code: 'claim-submission',
            display: 'Claim Submission'
          }]
        },
        description: 'Submit claim to clearinghouse',
        for: claim.patient,
        owner: claim.provider,
        input: [{
          type: {
            coding: [{
              system: 'http://hl7.org/fhir/resource-types',
              code: 'Claim'
            }]
          },
          valueReference: {
            reference: `Claim/${submittedClaim.id}`
          }
        }],
        restriction: {
          period: {
            end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
          }
        }
      };

      await this.medplumService.createResource(submissionTask);

      // Create audit event for claim submission
      await this.createClaimAuditEvent(submittedClaim, 'submitted');

      return { success: true };
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to submit claim',
        details: { claimId: claim.id, error },
        timestamp: new Date()
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Process claim response from clearinghouse
   * @param claimResponse - The claim response to process
   */
  async processClaimResponse(claimResponse: ClaimResponse): Promise<void> {
    try {
      // Create the claim response resource
      const createdResponse = await this.medplumService.createResource(claimResponse);

      // Update original claim status based on response
      if (claimResponse.request?.reference) {
        const claimId = claimResponse.request.reference.split('/')[1];
        const originalClaim = await this.medplumService.readResource<Claim>('Claim', claimId);

        let newStatus: Claim['status'] = 'active';
        if (claimResponse.outcome === 'complete') {
          newStatus = 'active'; // Claim processed successfully
        } else if (claimResponse.outcome === 'error') {
          newStatus = 'cancelled'; // Claim rejected
        }

        await this.medplumService.updateResource({
          ...originalClaim,
          status: newStatus
        });
      }

      // Create audit event for claim response processing
      await this.createClaimResponseAuditEvent(createdResponse);

      // Trigger payment reconciliation if needed
      if (claimResponse.outcome === 'complete' && claimResponse.payment) {
        await this.triggerPaymentReconciliation(claimResponse);
      }
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to process claim response',
        details: { claimResponseId: claimResponse.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get billing rules
   * @returns Observable of billing rules
   */
  getBillingRules(): Observable<BillingRule[]> {
    return this.billingRules$.asObservable();
  }

  /**
   * Add or update billing rule
   * @param rule - The billing rule to save
   * @returns Promise resolving to the saved billing rule
   */
  async saveBillingRule(rule: BillingRule): Promise<BillingRule> {
    try {
      // In a real implementation, this would be stored as a FHIR resource
      // For now, we'll store it in memory
      const currentRules = this.billingRules$.value;
      const existingIndex = currentRules.findIndex(r => r.id === rule.id);

      if (existingIndex >= 0) {
        currentRules[existingIndex] = rule;
      } else {
        currentRules.push(rule);
      }

      this.billingRules$.next([...currentRules]);
      return rule;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.VALIDATION_ERROR,
        message: 'Failed to save billing rule',
        details: { rule, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get pending claims
   * @returns Observable of pending claims
   */
  getPendingClaims(): Observable<Claim[]> {
    return this.pendingClaims$.asObservable();
  }

  /**
   * Trigger automated billing bot
   * @param diagnosticReport - The diagnostic report to trigger billing for
   */
  async triggerBillingBot(diagnosticReport: DiagnosticReport): Promise<void> {
    try {
      const billingTask: Task = {
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
        description: 'Trigger automated billing process for finalized diagnostic report',
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

      await this.medplumService.createResource(billingTask);
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

  // Private helper methods

  private async gatherBillingContext(
    diagnosticReport: DiagnosticReport,
    partialContext: Partial<BillingContext>
  ): Promise<BillingContext> {
    const patientRef = diagnosticReport.subject?.reference;
    if (!patientRef) {
      throw new Error('DiagnosticReport must have a patient reference');
    }

    const patientId = patientRef.split('/')[1];
    const patient = partialContext.patient ||
      await this.medplumService.readResource<Patient>('Patient', patientId);

    // Get service requests related to this diagnostic report
    const serviceRequests = partialContext.serviceRequests ||
      await this.getServiceRequestsForDiagnosticReport(diagnosticReport);

    // Get coverage information
    const coverage = partialContext.coverage ||
      await this.getPrimaryCoverageForPatient(patient);

    // Get organization and provider information
    const organization = partialContext.organization ||
      await this.getDefaultOrganization();

    const provider = partialContext.provider ||
      await this.getProviderForDiagnosticReport(diagnosticReport);

    return {
      diagnosticReport,
      patient,
      coverage,
      serviceRequests,
      organization,
      provider
    };
  }

  private async generateClaimItems(context: BillingContext): Promise<ClaimItem[]> {
    const items: ClaimItem[] = [];
    const billingRules = this.billingRules$.value;

    for (const serviceRequest of context.serviceRequests) {
      if (serviceRequest.code?.coding) {
        for (const coding of serviceRequest.code.coding) {
          const rule = billingRules.find(r => r.testCode === coding.code);
          if (rule) {
            const item: ClaimItem = {
              sequence: items.length + 1,
              productOrService: {
                coding: [{
                  system: 'http://www.ama-assn.org/go/cpt',
                  code: rule.cptCode,
                  display: coding.display
                }]
              },
              servicedDate: context.diagnosticReport.effectiveDateTime || new Date().toISOString(),
              quantity: {
                value: 1,
                unit: 'each'
              },
              unitPrice: this.currencyService.createINRMoney(rule.price),
              net: this.currencyService.createINRMoney(rule.price * (rule.insuranceMultiplier || 1))
            };
            items.push(item);
          }
        }
      }
    }

    return items;
  }

  private calculateClaimTotal(items: ClaimItem[]): Money {
    const total = items.reduce((sum, item) => sum + (item.net?.value || 0), 0);
    return this.currencyService.createINRMoney(total);
  }

  private async extractDiagnoses(diagnosticReport: DiagnosticReport): Promise<{
    sequence: number;
    diagnosisCodeableConcept: CodeableConcept;
    type: { coding: { system: string; code: string; display: string }[] }[];
  }[]> {
    // Extract diagnosis information from diagnostic report
    const diagnoses: {
      sequence: number;
      diagnosisCodeableConcept: CodeableConcept;
      type: { coding: { system: string; code: string; display: string }[] }[];
    }[] = [];

    if (diagnosticReport.conclusionCode) {
      for (let i = 0; i < diagnosticReport.conclusionCode.length; i++) {
        const coding = diagnosticReport.conclusionCode[i];
        diagnoses.push({
          sequence: i + 1,
          diagnosisCodeableConcept: coding,
          type: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/ex-diagnosistype',
              code: 'principal',
              display: 'Principal Diagnosis'
            }]
          }]
        });
      }
    }

    return diagnoses;
  }

  private async extractProcedures(serviceRequests: ServiceRequest[]): Promise<{
    sequence: number;
    type: { coding: { system: string; code: string; display: string }[] }[];
    date?: string;
    procedureCodeableConcept: CodeableConcept;
  }[]> {
    const procedures: {
      sequence: number;
      type: { coding: { system: string; code: string; display: string }[] }[];
      date?: string;
      procedureCodeableConcept: CodeableConcept;
    }[] = [];

    for (let i = 0; i < serviceRequests.length; i++) {
      const serviceRequest = serviceRequests[i];
      if (serviceRequest.code?.coding) {
        procedures.push({
          sequence: i + 1,
          type: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/ex-procedure-type',
              code: 'primary',
              display: 'Primary procedure'
            }]
          }],
          date: serviceRequest.authoredOn,
          procedureCodeableConcept: serviceRequest.code
        });
      }
    }

    return procedures;
  }

  private async validateBusinessRules(_claim: Claim): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Add business rule validation logic here
    // For example: check for duplicate claims, validate CPT codes, etc.

    return { errors, warnings };
  }

  private async createClaimAuditEvent(claim: Claim, action: string): Promise<void> {
    // Implementation would create FHIR AuditEvent resource
    console.log(`Audit: Claim ${claim.id} ${action}`);
  }

  private async createClaimResponseAuditEvent(claimResponse: ClaimResponse): Promise<void> {
    // Implementation would create FHIR AuditEvent resource
    console.log(`Audit: ClaimResponse ${claimResponse.id} processed`);
  }

  private async triggerPaymentReconciliation(claimResponse: ClaimResponse): Promise<void> {
    // Implementation would trigger payment reconciliation process
    console.log(`Triggering payment reconciliation for claim response ${claimResponse.id}`);
  }

  private async getServiceRequestsForDiagnosticReport(diagnosticReport: DiagnosticReport): Promise<ServiceRequest[]> {
    if (diagnosticReport.basedOn) {
      const serviceRequests: ServiceRequest[] = [];
      for (const reference of diagnosticReport.basedOn) {
        if (reference.reference?.startsWith('ServiceRequest/')) {
          const id = reference.reference.split('/')[1];
          const serviceRequest = await this.medplumService.readResource<ServiceRequest>('ServiceRequest', id);
          serviceRequests.push(serviceRequest);
        }
      }
      return serviceRequests;
    }
    return [];
  }

  private async getPrimaryCoverageForPatient(patient: Patient): Promise<Coverage | undefined> {
    try {
      const coverageBundle = await this.medplumService.searchResources<Coverage>('Coverage', {
        patient: `Patient/${patient.id}`,
        status: 'active'
      });

      return coverageBundle.entry?.[0]?.resource;
    } catch (_error) {
      console.warn('No coverage found for patient', patient.id);
      return undefined;
    }
  }

  private async getDefaultOrganization(): Promise<Organization> {
    // In a real implementation, this would get the lab's organization
    return {
      resourceType: 'Organization',
      id: 'default-lab',
      name: 'Default Laboratory',
      type: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/organization-type',
          code: 'prov',
          display: 'Healthcare Provider'
        }]
      }]
    };
  }

  private async getProviderForDiagnosticReport(diagnosticReport: DiagnosticReport): Promise<Practitioner> {
    // Get the provider who performed or is responsible for the diagnostic report
    if (diagnosticReport.performer?.[0]?.reference?.startsWith('Practitioner/')) {
      const id = diagnosticReport.performer[0].reference.split('/')[1];
      const practitioner = await this.medplumService.readResource<Practitioner>('Practitioner', id);
      return practitioner;
    }

    // Return default provider if none specified
    return {
      resourceType: 'Practitioner',
      id: 'default-provider',
      name: [{
        given: ['Default'],
        family: 'Provider'
      }]
    };
  }

  private async loadBillingRules(): Promise<void> {
    // Load default billing rules
    const defaultRules: BillingRule[] = [
      {
        id: 'rule-1',
        testCode: '33747-0',
        cptCode: '88305',
        price: 150.00,
        insuranceMultiplier: 1.0,
        conditions: ['histopathology']
      },
      {
        id: 'rule-2',
        testCode: '33746-2',
        cptCode: '88304',
        price: 75.00,
        insuranceMultiplier: 1.0,
        conditions: ['histopathology', 'simple']
      },
      {
        id: 'rule-3',
        testCode: '87086-3',
        cptCode: '87086',
        price: 25.00,
        insuranceMultiplier: 1.0,
        conditions: ['microbiology', 'culture']
      }
    ];

    this.billingRules$.next(defaultRules);
  }

  private validateRequiredFields(claim: Claim, errors: string[]): void {
    if (!claim.patient?.reference) {
      errors.push('Patient reference is required');
    }

    if (!claim.provider?.reference) {
      errors.push('Provider reference is required');
    }

    if (!claim.item || claim.item.length === 0) {
      errors.push('At least one claim item is required');
    }

    if (!claim.total?.value || claim.total.value <= 0) {
      errors.push('Claim total must be greater than zero');
    }
  }

  private validateClaimItems(claim: Claim, errors: string[], warnings: string[]): void {
    if (claim.item) {
      for (const item of claim.item) {
        if (!item.productOrService?.coding?.[0]?.code) {
          errors.push(`Item ${item.sequence}: Product or service code is required`);
        }

        if (!item.unitPrice?.value || item.unitPrice.value <= 0) {
          warnings.push(`Item ${item.sequence}: Unit price should be specified`);
        }
      }
    }
  }

  private validateInsuranceInfo(claim: Claim, errors: string[], warnings: string[]): void {
    if (claim.insurance && claim.insurance.length > 0) {
      for (const insurance of claim.insurance) {
        if (!insurance.coverage?.reference) {
          errors.push(`Insurance ${insurance.sequence}: Coverage reference is required`);
        }
      }
    } else {
      warnings.push('No insurance information provided - claim may be patient responsibility');
    }
  }
}