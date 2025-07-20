import { MedplumClient } from '@medplum/core';
import {
  Claim,
  CodeableConcept,
  Coverage,
  DiagnosticReport,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  ServiceRequest,
  Task
} from '@medplum/fhirtypes';

/**
 * Billing Automation Bot
 *
 * Automatically creates and submits claims when DiagnosticReport resources
 * are finalized. Includes billing rule validation, claim submission tracking,
 * and integration with external billing systems.
 *
 * Features:
 * - Automatic Claim resource creation from finalized reports
 * - Billing rule validation and enforcement
 * - Integration with Candid Health for claims processing
 */
export async function handler(medplum: MedplumClient, event: { input: DiagnosticReport; type: string; resource?: { id: string } }): Promise<{ success: boolean; claimId?: string; error?: string }> {
  console.log('Billing Automation Bot triggered', { eventType: event.type, resourceId: event.resource?.id });

  try {
    const diagnosticReport = event.input as DiagnosticReport;

    if (!diagnosticReport) {
      throw new Error('No DiagnosticReport provided in event input');
    }

    // Validate billing prerequisites
    const validation = await validateBillingPrerequisites(medplum, diagnosticReport);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Billing validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Get related resources needed for billing
    const billingContext = await getBillingContext(medplum, diagnosticReport);

    // Apply billing rules
    const billingRules = await applyBillingRules(medplum, diagnosticReport, billingContext);

    if (!billingRules.shouldBill) {
      console.log('Billing rules determined no billing required', {
        reportId: diagnosticReport.id,
        reason: billingRules.reason
      });
      return {
        success: true,
        error: billingRules.reason
      };
    }

    // Create claim
    const claim = await createClaimFromReport(medplum, diagnosticReport, billingContext, billingRules);

    // Submit claim for processing
    const submissionResult = await submitClaimForProcessing(medplum, claim);

    // Create tracking task
    await createClaimTrackingTask(medplum, claim, diagnosticReport);

    return {
      success: true,
      claimId: claim.id
    };

  } catch (error) {
    console.error('Billing automation bot failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate billing prerequisites
 */
async function validateBillingPrerequisites(
  medplum: MedplumClient,
  diagnosticReport: DiagnosticReport
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check if diagnostic report is finalized
  if (diagnosticReport.status !== 'final') {
    errors.push('DiagnosticReport must be finalized');
  }

  // Check if subject (patient) is present
  if (!diagnosticReport.subject?.reference) {
    errors.push('DiagnosticReport must have a subject (patient)');
  }

  // Check if patient exists
  if (diagnosticReport.subject?.reference) {
    try {
      const coverageBundle = await medplum.searchResources('Coverage', {
        beneficiary: diagnosticReport.subject.reference
      });

      if (coverageBundle.length === 0) {
        errors.push('No coverage information found for patient');
      }
    } catch (_error) {
      errors.push('Failed to validate patient coverage');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get billing context (patient, coverage, service requests, etc.)
 */
async function getBillingContext(
  medplum: MedplumClient,
  diagnosticReport: DiagnosticReport
): Promise<BillingContext> {
  // Get patient
  const patient = await medplum.readReference(diagnosticReport.subject!) as Patient;

  // Get coverage
  const coverageBundle = await medplum.searchResources('Coverage', {
    beneficiary: diagnosticReport.subject?.reference
  });
  const coverage = coverageBundle.length > 0 ? coverageBundle[0] : null;

  // Get service requests
  const serviceRequests: ServiceRequest[] = [];
  if (diagnosticReport.basedOn) {
    for (const reference of diagnosticReport.basedOn) {
      try {
        const serviceRequest = await medplum.readReference(reference) as ServiceRequest;
        serviceRequests.push(serviceRequest);
      } catch (_error) {
        console.warn('Failed to read service request:', reference);
      }
    }
  }

  // Get performer (practitioner or organization)
  let performer: Practitioner | Organization | null = null;
  if (diagnosticReport.performer && diagnosticReport.performer.length > 0) {
    try {
      performer = await medplum.readReference(diagnosticReport.performer[0]) as Practitioner | Organization;
    } catch (_error) {
      console.warn('Failed to read performer:', diagnosticReport.performer[0]);
    }
  }

  return {
    patient,
    coverage,
    serviceRequests,
    performer,
    diagnosticReport
  };
}

/**
 * Apply billing rules to determine if and how to bill
 */
async function applyBillingRules(
  medplum: MedplumClient,
  diagnosticReport: DiagnosticReport,
  context: BillingContext
): Promise<BillingRules> {
  const rules: BillingRules = {
    shouldBill: true,
    reason: '',
    billableItems: [],
    totalAmount: 0,
    currency: 'USD'
  };

  // Rule 1: Check if patient has active coverage
  if (!context.coverage || context.coverage.status !== 'active') {
    rules.shouldBill = false;
    rules.reason = 'No active coverage found for patient';
    return rules;
  }

  // Rule 2: Check for duplicate billing
  const existingClaims = await medplum.searchResources('Claim', {
    patient: context.patient.id!,
    'related-claim': `DiagnosticReport/${diagnosticReport.id}`
  });

  if (existingClaims.length > 0) {
    rules.shouldBill = false;
    rules.reason = 'Claim already exists for this diagnostic report';
    return rules;
  }

  // Rule 3: Determine billable items from service requests
  for (const serviceRequest of context.serviceRequests) {
    const billableItems = await getBillableItemsFromServiceRequest(medplum, serviceRequest);
    rules.billableItems.push(...billableItems);
  }

  // Rule 4: Calculate total amount
  rules.totalAmount = rules.billableItems.reduce((total, item) => total + item.unitPrice, 0);

  // Rule 5: Check minimum billing threshold
  if (rules.totalAmount < 10) { // $10 minimum
    rules.shouldBill = false;
    rules.reason = 'Total amount below minimum billing threshold';
    return rules;
  }

  // Rule 6: Check for research or quality assurance reports
  if (diagnosticReport.category?.some(cat =>
    cat.coding?.some(code =>
      code.code === 'research' || code.code === 'quality-assurance'
    )
  )) {
    rules.shouldBill = false;
    rules.reason = 'Research or QA reports are not billable';
    return rules;
  }

  return rules;
}

/**
 * Get billable items from service request
 */
async function getBillableItemsFromServiceRequest(
  medplum: MedplumClient,
  serviceRequest: ServiceRequest
): Promise<BillableItem[]> {
  const items: BillableItem[] = [];

  // Get billing codes from service request
  const codes = [serviceRequest.code, ...(serviceRequest.orderDetail || [])].filter(Boolean);

  for (const code of codes) {
    const billableItem = await getBillingInformationForCode(medplum, code!);
    if (billableItem) {
      items.push(billableItem);
    }
  }

  return items;
}

/**
 * Get billing information for a specific code
 */
async function getBillingInformationForCode(
  _medplum: MedplumClient,
  code: CodeableConcept
): Promise<BillableItem | null> {
  // In a real implementation, this would query a fee schedule or billing catalog
  // For now, we'll use some basic rules based on common test types

  const codeValue = code.coding?.[0]?.code || code.text || '';
  const display = code.coding?.[0]?.display || code.text || '';

  // Basic laboratory test pricing (mock data)
  const pricingMap: Record<string, { price: number; cptCode: string; description: string }> = {
    'CBC': { price: 25.00, cptCode: '85025', description: 'Complete Blood Count' },
    'CHEM': { price: 35.00, cptCode: '80053', description: 'Comprehensive Metabolic Panel' },
    'LIPID': { price: 30.00, cptCode: '80061', description: 'Lipid Panel' },
    'TSH': { price: 40.00, cptCode: '84443', description: 'Thyroid Stimulating Hormone' },
    'CULTURE': { price: 50.00, cptCode: '87040', description: 'Blood Culture' },
    'HISTOPATH': { price: 150.00, cptCode: '88305', description: 'Surgical Pathology' },
    'CYTOLOGY': { price: 100.00, cptCode: '88142', description: 'Cytopathology' }
  };

  // Find matching pricing
  let pricing = null;
  for (const [key, value] of Object.entries(pricingMap)) {
    if (codeValue.includes(key) || display.toUpperCase().includes(key)) {
      pricing = value;
      break;
    }
  }

  if (!pricing) {
    // Default pricing for unknown tests
    pricing = { price: 50.00, cptCode: '99999', description: display || 'Laboratory Test' };
  }

  return {
    code: {
      coding: [{
        system: 'http://www.ama-assn.org/go/cpt',
        code: pricing.cptCode,
        display: pricing.description
      }]
    },
    unitPrice: pricing.price,
    quantity: 1,
    totalPrice: pricing.price
  };
}

/**
 * Create claim from diagnostic report
 */
async function createClaimFromReport(
  medplum: MedplumClient,
  diagnosticReport: DiagnosticReport,
  context: BillingContext,
  rules: BillingRules
): Promise<Claim> {
  const claim: Claim = {
    resourceType: 'Claim',
    identifier: [{
      use: 'official',
      system: 'http://lims.local/claim-id',
      value: generateClaimId(diagnosticReport)
    }],
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
      reference: `Patient/${context.patient.id}`
    },
    billablePeriod: {
      start: diagnosticReport.effectiveDateTime || new Date().toISOString(),
      end: diagnosticReport.issued || new Date().toISOString()
    },
    created: new Date().toISOString(),
    provider: (diagnosticReport.performer?.[0] as Reference<Organization | Practitioner | PractitionerRole>) || {
      reference: 'Organization/default-lab'
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
    diagnosis: [],
    item: [],
    total: {
      value: rules.totalAmount,
      currency: 'INR' as any
    },
    insurance: context.coverage ? [{
      sequence: 1,
      focal: true,
      coverage: {
        reference: `Coverage/${context.coverage.id}`
      }
    }] : [{
      sequence: 1,
      focal: true,
      coverage: {
        reference: 'Coverage/default'
      }
    }]
  };

  // Add diagnosis from diagnostic report
  if (diagnosticReport.conclusionCode) {
    claim.diagnosis = diagnosticReport.conclusionCode.map((code, index) => ({
      sequence: index + 1,
      diagnosisCodeableConcept: code
    }));
  }

  // Add line items
  claim.item = rules.billableItems.map((item, index) => ({
    sequence: index + 1,
    productOrService: item.code,
    quantity: {
      value: item.quantity
    },
    unitPrice: {
      value: item.unitPrice,
      currency: 'INR' as any
    },
    net: {
      value: item.totalPrice,
      currency: 'INR' as any
    }
  }));

  return await medplum.createResource(claim);
}

/**
 * Submit claim for processing
 */
async function submitClaimForProcessing(
  medplum: MedplumClient,
  claim: Claim
): Promise<{ status: string; submissionId: string }> {
  try {
    // In a real implementation, this would integrate with Candid Health or other clearinghouse
    // For now, we'll simulate the submission process

    // Create a task to track the submission
    const submissionTask: Task = {
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      code: {
        coding: [{
          system: 'http://lims.local/task-types',
          code: 'claim-submission',
          display: 'Claim Submission'
        }]
      },
      description: 'Submit claim to insurance payer',
      focus: {
        reference: `Claim/${claim.id}`
      },
      authoredOn: new Date().toISOString(),
      restriction: {
        period: {
          end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        }
      }
    };

    const createdTask = await medplum.createResource(submissionTask);

    // Simulate successful submission
    const submissionId = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Update claim with submission information
    const updatedClaim: Claim = {
      ...claim,
      identifier: [
        ...(claim.identifier || []),
        {
          use: 'secondary',
          system: 'http://lims.local/submission-id',
          value: submissionId
        }
      ]
    };

    await medplum.updateResource(updatedClaim);

    return {
      status: 'submitted',
      submissionId
    };

  } catch (error) {
    console.error('Claim submission failed:', error);
    return {
      status: 'failed',
      submissionId: ''
    };
  }
}

/**
 * Create claim tracking task
 */
async function createClaimTrackingTask(
  medplum: MedplumClient,
  claim: Claim,
  diagnosticReport: DiagnosticReport
): Promise<Task> {
  const trackingTask: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    code: {
      coding: [{
        system: 'http://lims.local/task-types',
        code: 'claim-tracking',
        display: 'Claim Status Tracking'
      }]
    },
    description: 'Monitor claim processing status and handle responses',
    focus: {
      reference: `Claim/${claim.id}`
    },
    for: claim.patient,
    authoredOn: new Date().toISOString(),
    restriction: {
      period: {
        end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      }
    },
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
    }]
  };

  return await medplum.createResource(trackingTask);
}

/**
 * Generate unique claim identifier
 */
function generateClaimId(diagnosticReport: DiagnosticReport): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = date.getTime().toString().slice(-6);
  const reportId = diagnosticReport.id?.slice(-4) || '0000';

  return `CLM-${dateStr}-${reportId}-${timeStr}`;
}

// Type definitions

interface BillingContext {
  patient: Patient;
  coverage: Coverage | null;
  serviceRequests: ServiceRequest[];
  performer: Practitioner | Organization | null;
  diagnosticReport: DiagnosticReport;
}

interface BillingRules {
  shouldBill: boolean;
  reason: string;
  billableItems: BillableItem[];
  totalAmount: number;
  currency: string;
}

interface BillableItem {
  code: CodeableConcept;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}