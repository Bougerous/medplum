import { MedplumClient } from '@medplum/core';
import {
  CodeableConcept,
  ServiceRequest,
  Specimen,
  Task
} from '@medplum/fhirtypes';

/**
 * Order Splitting Automation Bot
 * 
 * Analyzes ServiceRequest resources and automatically splits them into multiple
 * specimens when different test requirements necessitate separate samples.
 * 
 * Features:
 * - Workflow routing based on test requirements
 * - Task assignment and prioritization
 * - Order validation and error handling
 * - Specimen type optimization
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

    console.log('Splitting required', {
      serviceRequestId: serviceRequest.id,
      splitCount: splitRequirements.length
    });

    // Create specimens for each requirement
    const createdSpecimens: Specimen[] = [];
    const createdTasks: Task[] = [];

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

    // Update original service request to reference created specimens
    await updateServiceRequestWithSpecimens(medplum, serviceRequest, createdSpecimens);

    // Create prioritization and routing
    await assignTaskPriorities(medplum, createdTasks, serviceRequest);

    const result = {
      success: true,
      serviceRequestId: serviceRequest.id,
      originalSpecimenCount: 1,
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

/**
 * Validate service request before processing
 */
async function validateServiceRequest(serviceRequest: ServiceRequest): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check required fields
  if (!serviceRequest.subject) {
    errors.push('ServiceRequest must have a subject (patient)');
  }

  if (!serviceRequest.code) {
    errors.push('ServiceRequest must have a code (test type)');
  }

  if (serviceRequest.status !== 'active' && serviceRequest.status !== 'draft') {
    errors.push('ServiceRequest must be in active or draft status for splitting');
  }

  // Check for required specimen information
  if (!(serviceRequest.specimen || serviceRequest.bodySite)) {
    errors.push('ServiceRequest must specify specimen type or body site');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Analyze service request to determine splitting requirements
 */
async function analyzeSplitRequirements(
  medplum: MedplumClient,
  serviceRequest: ServiceRequest
): Promise<SplitRequirement[]> {
  const requirements: SplitRequirement[] = [];

  // Get test codes from service request
  const testCodes = extractTestCodes(serviceRequest);

  // Group tests by specimen requirements
  const specimenGroups = await groupTestsBySpecimenType(medplum, testCodes);

  for (const group of specimenGroups) {
    const requirement: SplitRequirement = {
      specimenType: group.specimenType,
      collectionMethod: group.collectionMethod,
      containerType: group.containerType,
      volume: group.volume,
      preservative: group.preservative,
      testCodes: group.testCodes,
      priority: determinePriority(group.testCodes),
      processingInstructions: group.processingInstructions,
      storageRequirements: group.storageRequirements,
      transportRequirements: group.transportRequirements
    };

    requirements.push(requirement);
  }

  return requirements;
}

/**
 * Extract test codes from service request
 */
function extractTestCodes(serviceRequest: ServiceRequest): CodeableConcept[] {
  const codes: CodeableConcept[] = [];

  // Primary code
  if (serviceRequest.code) {
    codes.push(serviceRequest.code);
  }

  // Additional codes from orderDetail
  if (serviceRequest.orderDetail) {
    codes.push(...serviceRequest.orderDetail);
  }

  return codes;
}

/**
 * Group tests by specimen type requirements
 */
async function groupTestsBySpecimenType(
  medplum: MedplumClient,
  testCodes: CodeableConcept[]
): Promise<SpecimenGroup[]> {
  const groups: SpecimenGroup[] = [];

  for (const testCode of testCodes) {
    // Look up test requirements (this would typically come from a test catalog)
    const requirements = await getTestRequirements(medplum, testCode);

    // Find existing group with matching requirements
    const existingGroup = groups.find(g =>
      specimenRequirementsMatch(g, requirements)
    );

    if (existingGroup) {
      existingGroup.testCodes.push(testCode);
    } else {
      groups.push({
        specimenType: requirements.specimenType,
        collectionMethod: requirements.collectionMethod,
        containerType: requirements.containerType,
        volume: requirements.volume,
        preservative: requirements.preservative,
        processingInstructions: requirements.processingInstructions,
        storageRequirements: requirements.storageRequirements,
        transportRequirements: requirements.transportRequirements,
        testCodes: [testCode]
      });
    }
  }

  return groups;
}

/**
 * Get test requirements from catalog (mock implementation)
 */
async function getTestRequirements(
  _medplum: MedplumClient,
  testCode: CodeableConcept
): Promise<TestRequirements> {
  // In a real implementation, this would query a test catalog
  // For now, we'll use some basic rules based on common test types

  const code = testCode.coding?.[0]?.code || testCode.text || '';
  const display = testCode.coding?.[0]?.display || testCode.text || '';

  // Basic hematology tests
  if (code.includes('CBC') || display.toLowerCase().includes('complete blood count')) {
    return {
      specimenType: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119297000',
          display: 'Blood specimen'
        }]
      },
      collectionMethod: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '28520004',
          display: 'Venipuncture'
        }]
      },
      containerType: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '702120003',
          display: 'EDTA tube'
        }]
      },
      volume: { value: 3, unit: 'mL' },
      preservative: 'EDTA',
      processingInstructions: 'Mix gently, do not shake',
      storageRequirements: 'Room temperature, process within 4 hours',
      transportRequirements: 'Standard transport'
    };
  }

  // Chemistry tests
  if (code.includes('CHEM') || display.toLowerCase().includes('chemistry')) {
    return {
      specimenType: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119361006',
          display: 'Plasma specimen'
        }]
      },
      collectionMethod: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '28520004',
          display: 'Venipuncture'
        }]
      },
      containerType: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '702281005',
          display: 'Lithium heparin tube'
        }]
      },
      volume: { value: 5, unit: 'mL' },
      preservative: 'Lithium Heparin',
      processingInstructions: 'Centrifuge within 2 hours',
      storageRequirements: 'Refrigerated if delayed processing',
      transportRequirements: 'Standard transport'
    };
  }

  // Microbiology cultures
  if (code.includes('CULTURE') || display.toLowerCase().includes('culture')) {
    return {
      specimenType: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119376003',
          display: 'Tissue specimen'
        }]
      },
      collectionMethod: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '129316008',
          display: 'Aspiration'
        }]
      },
      containerType: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '702120003',
          display: 'Sterile container'
        }]
      },
      volume: { value: 1, unit: 'mL' },
      preservative: 'None',
      processingInstructions: 'Maintain sterility, process immediately',
      storageRequirements: 'Room temperature, process within 2 hours',
      transportRequirements: 'Sterile transport medium'
    };
  }

  // Default requirements
  return {
    specimenType: {
      coding: [{
        system: 'http://snomed.info/sct',
        code: '119297000',
        display: 'Blood specimen'
      }]
    },
    collectionMethod: {
      coding: [{
        system: 'http://snomed.info/sct',
        code: '28520004',
        display: 'Venipuncture'
      }]
    },
    containerType: {
      coding: [{
        system: 'http://snomed.info/sct',
        code: '702120003',
        display: 'Standard tube'
      }]
    },
    volume: { value: 5, unit: 'mL' },
    preservative: 'None',
    processingInstructions: 'Standard processing',
    storageRequirements: 'Room temperature',
    transportRequirements: 'Standard transport'
  };
}

/**
 * Check if specimen requirements match
 */
function specimenRequirementsMatch(group: SpecimenGroup, requirements: TestRequirements): boolean {
  return (
    group.specimenType.coding?.[0]?.code === requirements.specimenType.coding?.[0]?.code &&
    group.containerType.coding?.[0]?.code === requirements.containerType.coding?.[0]?.code &&
    group.preservative === requirements.preservative
  );
}

/**
 * Create specimen for a specific requirement
 */
async function createSpecimenForRequirement(
  medplum: MedplumClient,
  serviceRequest: ServiceRequest,
  requirement: SplitRequirement,
  sequenceNumber: number
): Promise<Specimen> {
  // Generate unique accession identifier
  const accessionId = generateAccessionId(serviceRequest, sequenceNumber);

  const specimen: Specimen = {
    resourceType: 'Specimen',
    identifier: [{
      use: 'usual',
      system: 'http://lims.local/specimen-id',
      value: accessionId
    }],
    accessionIdentifier: {
      use: 'official',
      system: 'http://lims.local/accession-id',
      value: accessionId
    },
    status: 'available',
    type: requirement.specimenType,
    subject: serviceRequest.subject!,
    request: [{
      reference: `ServiceRequest/${serviceRequest.id}`
    }],
    collection: {
      collectedDateTime: new Date().toISOString(),
      method: requirement.collectionMethod,
      bodySite: serviceRequest.bodySite?.[0],
      quantity: requirement.volume
    },
    container: [{
      type: requirement.containerType,
      capacity: requirement.volume,
      additiveCodeableConcept: requirement.preservative ? {
        text: requirement.preservative
      } : undefined
    }],
    note: [
      {
        text: `Processing: ${requirement.processingInstructions}`
      },
      {
        text: `Storage: ${requirement.storageRequirements}`
      },
      {
        text: `Transport: ${requirement.transportRequirements}`
      }
    ].filter(note => note.text !== 'undefined')
  };

  return await medplum.createResource(specimen);
}

/**
 * Create workflow tasks for specimen processing
 */
async function createWorkflowTasks(
  medplum: MedplumClient,
  specimen: Specimen,
  requirement: SplitRequirement
): Promise<Task[]> {
  const tasks: Task[] = [];

  // Collection task
  const collectionTask: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: requirement.priority,
    code: {
      coding: [{
        system: 'http://lims.local/task-types',
        code: 'specimen-collection',
        display: 'Specimen Collection'
      }]
    },
    description: `Collect ${requirement.specimenType.coding?.[0]?.display} specimen`,
    for: specimen.subject,
    focus: {
      reference: `Specimen/${specimen.id}`
    },
    authoredOn: new Date().toISOString(),
    restriction: {
      period: {
        end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours
      }
    }
  };

  const createdCollectionTask = await medplum.createResource(collectionTask);
  tasks.push(createdCollectionTask);

  // Processing task
  const processingTask: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: requirement.priority,
    code: {
      coding: [{
        system: 'http://lims.local/task-types',
        code: 'specimen-processing',
        display: 'Specimen Processing'
      }]
    },
    description: `Process specimen: ${requirement.processingInstructions}`,
    for: specimen.subject,
    focus: {
      reference: `Specimen/${specimen.id}`
    },
    authoredOn: new Date().toISOString(),
    partOf: [{
      reference: `Task/${createdCollectionTask.id}`
    }]
  };

  const createdProcessingTask = await medplum.createResource(processingTask);
  tasks.push(createdProcessingTask);

  return tasks;
}

/**
 * Update service request with created specimens
 */
async function updateServiceRequestWithSpecimens(
  medplum: MedplumClient,
  serviceRequest: ServiceRequest,
  specimens: Specimen[]
): Promise<void> {
  const updatedServiceRequest: ServiceRequest = {
    ...serviceRequest,
    specimen: specimens.map(s => ({
      reference: `Specimen/${s.id}`
    })),
    note: [
      ...(serviceRequest.note || []),
      {
        text: `Order split into ${specimens.length} specimens: ${specimens.map(s => s.accessionIdentifier?.value).join(', ')}`
      }
    ]
  };

  await medplum.updateResource(updatedServiceRequest);
}

/**
 * Assign task priorities based on test urgency
 */
async function assignTaskPriorities(
  medplum: MedplumClient,
  tasks: Task[],
  serviceRequest: ServiceRequest
): Promise<void> {
  // Determine overall priority from service request
  const basePriority = serviceRequest.priority || 'routine';

  // Update tasks with appropriate priorities
  for (const task of tasks) {
    if (task.code?.coding?.[0]?.code === 'specimen-collection') {
      // Collection tasks get higher priority
      const updatedTask: Task = {
        ...task,
        priority: basePriority === 'stat' ? 'stat' : 'urgent'
      };
      await medplum.updateResource(updatedTask);
    }
  }
}

/**
 * Generate unique accession identifier
 */
function generateAccessionId(serviceRequest: ServiceRequest, sequenceNumber: number): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = date.getTime().toString().slice(-6);
  const serviceRequestId = serviceRequest.id?.slice(-4) || '0000';

  return `${dateStr}-${serviceRequestId}-${sequenceNumber.toString().padStart(2, '0')}-${timeStr}`;
}

/**
 * Determine priority based on test codes
 */
function determinePriority(testCodes: CodeableConcept[]): 'routine' | 'urgent' | 'asap' | 'stat' {
  // Check for stat tests
  const hasStatTest = testCodes.some(code =>
    code.text?.toLowerCase().includes('stat') ||
    code.coding?.some(c => c.display?.toLowerCase().includes('stat'))
  );

  if (hasStatTest) {
    return 'stat';
  }

  // Check for urgent tests
  const hasUrgentTest = testCodes.some(code =>
    code.text?.toLowerCase().includes('urgent') ||
    code.coding?.some(c => c.display?.toLowerCase().includes('urgent'))
  );

  if (hasUrgentTest) {
    return 'urgent';
  }

  return 'routine';
}

// Type definitions

interface SplitRequirement {
  specimenType: CodeableConcept;
  collectionMethod: CodeableConcept;
  containerType: CodeableConcept;
  volume: { value: number; unit: string };
  preservative: string;
  testCodes: CodeableConcept[];
  priority: 'routine' | 'urgent' | 'asap' | 'stat';
  processingInstructions: string;
  storageRequirements: string;
  transportRequirements: string;
}

interface SpecimenGroup {
  specimenType: CodeableConcept;
  collectionMethod: CodeableConcept;
  containerType: CodeableConcept;
  volume: { value: number; unit: string };
  preservative: string;
  processingInstructions: string;
  storageRequirements: string;
  transportRequirements: string;
  testCodes: CodeableConcept[];
}

interface TestRequirements {
  specimenType: CodeableConcept;
  collectionMethod: CodeableConcept;
  containerType: CodeableConcept;
  volume: { value: number; unit: string };
  preservative: string;
  processingInstructions: string;
  storageRequirements: string;
  transportRequirements: string;
}