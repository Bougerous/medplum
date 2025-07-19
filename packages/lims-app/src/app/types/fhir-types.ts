// FHIR Resource Types and Extensions for LIMS
import {
  Patient,
  Specimen,
  ServiceRequest,
  DiagnosticReport,
  Observation,
  Procedure,
  Practitioner,
  Organization,
  Coverage,
  Consent,
  Subscription,
  Bundle,
  Resource,
  Reference,
  Identifier,
  CodeableConcept,
  Quantity,
  Extension,
  AuditEvent,
  Task,
  Claim,
  ClaimResponse,
  Invoice,
  PaymentReconciliation,
  ImagingStudy,
  Binary,
  QuestionnaireResponse,
  Questionnaire,
  AccessPolicy,
  ProjectMembership,
  Bot,
  Coding
} from '@medplum/fhirtypes';

// Re-export commonly used FHIR types
export type {
  Patient,
  Specimen,
  ServiceRequest,
  DiagnosticReport,
  Observation,
  Procedure,
  Practitioner,
  Organization,
  Coverage,
  Consent,
  Subscription,
  Bundle,
  Resource,
  Reference,
  Identifier,
  CodeableConcept,
  Quantity,
  Extension,
  AuditEvent,
  Task,
  Claim,
  ClaimResponse,
  Invoice,
  PaymentReconciliation,
  ImagingStudy,
  Binary,
  QuestionnaireResponse,
  Questionnaire,
  AccessPolicy,
  ProjectMembership,
  Bot,
  Coding
};

// LIMS-specific extended interfaces
export interface LaboratorySpecimen extends Omit<Specimen, 'note'> {
  accessionIdentifier: Identifier;
  note?: Array<{
    text: string;
    time?: string;
    authorReference?: Reference;
  }>;
}

export interface SpecimenProcessing {
  description?: string;
  procedure?: CodeableConcept;
  additive?: Reference[];
  timeDateTime?: string;
}

export interface SpecimenContainer {
  identifier?: Identifier[];
  description?: string;
  type?: CodeableConcept;
  capacity?: Quantity;
  specimenQuantity?: Quantity;
  additiveCodeableConcept?: CodeableConcept;
  additiveReference?: Reference;
}

export interface HistopathologyProcedure {
  resourceType: 'Procedure';
  id?: string;
  code: CodeableConcept;
  subject: Reference;
  basedOn?: Reference[];
  partOf?: Reference;
  status: 'preparation' | 'in-progress' | 'not-done' | 'on-hold' | 'stopped' | 'completed' | 'entered-in-error' | 'unknown';
  performedDateTime?: string;
  performer?: ProcedurePerformer[];
  bodySite?: CodeableConcept[];
  outcome?: CodeableConcept;
  report?: Reference[];
  usedReference?: Reference[];
}

export interface ProcedurePerformer {
  function?: CodeableConcept;
  actor: Reference;
  onBehalfOf?: Reference;
}

// Workflow and State Types
export interface LabWorkflowState {
  specimenId: string;
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  pendingSteps: WorkflowStep[];
  assignedTechnician?: Reference;
  priority: 'routine' | 'urgent' | 'stat';
  estimatedCompletion?: Date;
  actualCompletion?: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  requiredRole: string[];
  estimatedDuration: number; // minutes
  dependencies: string[]; // prerequisite step IDs
  procedures: Reference[];
  observations: Reference[];
}

// User and Authentication Types
export type UserRole = 
  | 'lab-technician'
  | 'pathologist'
  | 'lab-manager'
  | 'billing-staff'
  | 'patient'
  | 'provider'
  | 'admin';

export interface UserProfile {
  practitioner: Practitioner;
  projectMembership?: ProjectMembership;
  accessPolicies?: AccessPolicy[];
  roles: UserRole[];
}

// Dashboard and UI Types
export interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  config: any;
  roles: UserRole[];
  position: { x: number; y: number; width: number; height: number };
}

// Error Types
export enum LIMSErrorType {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  FHIR_ERROR = 'FHIR_ERROR',
  WORKFLOW_ERROR = 'WORKFLOW_ERROR',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR'
}

export interface LIMSError {
  type: LIMSErrorType;
  message: string;
  details?: any;
  timestamp: Date;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
}

// Search and Query Types
export interface SearchParams {
  [key: string]: string | string[] | number | boolean | undefined;
}

// QR Code Types
export interface QRCodeData {
  specimenId: string;
  accessionNumber: string;
  patientId: string;
  collectionDate: string;
  url: string;
}

// Billing Types
export interface BillingRule {
  id: string;
  testCode: string;
  cptCode: string;
  price: number;
  insuranceMultiplier?: number;
  conditions?: string[];
}

// Analytics Types
export interface AnalyticsMetric {
  name: string;
  value: number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  period: string;
}

export interface TurnaroundTimeMetric extends AnalyticsMetric {
  specialty: string;
  testType: string;
  target: number;
  actual: number;
}

// SNOMED CT Terminology Types
export interface SnomedConcept {
  code: string;
  display: string;
  system: string;
  definition?: string;
  synonyms?: string[];
  children?: SnomedConcept[];
  parents?: SnomedConcept[];
  relationships?: ConceptRelationship[];
}

export interface ConceptRelationship {
  type: string;
  target: SnomedConcept;
  description?: string;
}

export interface SpecimenConcept extends SnomedConcept {
  specimenType: 'tissue' | 'fluid' | 'cell' | 'microorganism' | 'other';
  anatomicalSite?: SnomedConcept;
  morphology?: SnomedConcept;
  procedure?: SnomedConcept;
}

export interface DiagnosisConcept extends SnomedConcept {
  category: 'morphology' | 'etiology' | 'topography' | 'function';
  severity?: GradingConcept;
  stage?: StagingConcept;
}

export interface GradingConcept extends SnomedConcept {
  gradingSystem: string;
  grade: string;
  numericValue?: number;
  description: string;
}

export interface StagingConcept extends SnomedConcept {
  stagingSystem: string;
  stage: string;
  tComponent?: string;
  nComponent?: string;
  mComponent?: string;
  description: string;
}

export interface TerminologySearchParams {
  query: string;
  system?: string;
  maxResults?: number;
  includeChildren?: boolean;
  includeParents?: boolean;
  filter?: {
    category?: string;
    domain?: string;
    active?: boolean;
  };
}

export interface ValidationResult {
  isValid: boolean;
  concept?: SnomedConcept;
  errors: string[];
  warnings: string[];
  suggestions?: SnomedConcept[];
}