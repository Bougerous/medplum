import { TestBed } from '@angular/core/testing';
import {
  DiagnosticReport,
  Patient,
  QuestionnaireResponse,
  ServiceRequest,
  Specimen,
  Task
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { BotService } from '../services/bot.service';
import { DiagnosticReportService } from '../services/diagnostic-report.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { RetryService } from '../services/retry.service';

// Integration test configuration
const WORKFLOW_INTEGRATION_CONFIG = {
  enabled: false, // Set to true when running against actual Medplum instance
  baseUrl: 'https://api.medplum.com/',
  testProjectId: 'test-project-id',
  testCredentials: {
    email: 'test@example.com',
    password: 'test-password'
  }
};

describe('Workflow Integration Tests', () => {
  let medplumService: MedplumService;
  let authService: AuthService;
  let billingService: BillingService;
  let botService: BotService;
  let diagnosticReportService: DiagnosticReportService;

  // Test resources to clean up
  let testResources: { type: string; id: string }[] = [];

  beforeEach(() => {
    if (!WORKFLOW_INTEGRATION_CONFIG.enabled) {
      pending('Workflow integration tests are disabled. Set WORKFLOW_INTEGRATION_CONFIG.enabled = true to run.');
    }

    TestBed.configureTestingModule({
      providers: [
        MedplumService,
        AuthService,
        BillingService,
        BotService,
        DiagnosticReportService,
        ErrorHandlingService,
        RetryService
      ]
    });

    medplumService = TestBed.inject(MedplumService);
    authService = TestBed.inject(AuthService);
    billingService = TestBed.inject(BillingService);
    botService = TestBed.inject(BotService);
    diagnosticReportService = TestBed.inject(DiagnosticReportService);

    testResources = [];
  });

  afterEach(async () => {
    if (WORKFLOW_INTEGRATION_CONFIG.enabled) {
      // Clean up test resources in reverse order
      for (const resource of testResources.reverse()) {
        try {
          await medplumService.deleteResource(resource.type, resource.id);
        } catch (error) {
          console.warn(`Failed to clean up ${resource.type}/${resource.id}:`, error);
        }
      }
    }
  });

  async function addTestResource(type: string, id: string): Promise<void> {
    testResources.push({ type, id });
  }

  describe('End-to-End Patient Registration Workflow', () => {
    it('should complete patient registration workflow', async () => {
      // Authenticate
      await authService.login({
        email: WORKFLOW_INTEGRATION_CONFIG.testCredentials.email,
        password: WORKFLOW_INTEGRATION_CONFIG.testCredentials.password,
        projectId: WORKFLOW_INTEGRATION_CONFIG.testProjectId
      });

      // Create questionnaire response (simulating patient registration form)
      const questionnaireResponse: QuestionnaireResponse = {
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        questionnaire: 'Questionnaire/patient-registration',
        authored: new Date().toISOString(),
        item: [
          {
            linkId: 'patient-name-given',
            text: 'First Name',
            answer: [{ valueString: 'Integration' }]
          },
          {
            linkId: 'patient-name-family',
            text: 'Last Name',
            answer: [{ valueString: 'TestPatient' }]
          },
          {
            linkId: 'patient-birthdate',
            text: 'Date of Birth',
            answer: [{ valueDate: '1990-01-01' }]
          },
          {
            linkId: 'patient-gender',
            text: 'Gender',
            answer: [{ valueString: 'unknown' }]
          },
          {
            linkId: 'patient-phone',
            text: 'Phone Number',
            answer: [{ valueString: '555-0123' }]
          },
          {
            linkId: 'patient-email',
            text: 'Email',
            answer: [{ valueString: 'integration.test@example.com' }]
          }
        ]
      };

      const createdResponse = await medplumService.createResource(questionnaireResponse);
      await addTestResource('QuestionnaireResponse', createdResponse.id!);

      // Trigger patient registration bot
      await botService.triggerPatientRegistrationBot(createdResponse);

      // Wait for bot processing (in real scenario, this would be event-driven)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify patient was created
      const patients = await medplumService.searchPatients({
        name: 'Integration TestPatient'
      });

      expect(patients.length).toBeGreaterThan(0);
      const patient = patients[0];
      await addTestResource('Patient', patient.id!);

      expect(patient.name?.[0]?.given?.[0]).toBe('Integration');
      expect(patient.name?.[0]?.family).toBe('TestPatient');
      expect(patient.birthDate).toBe('1990-01-01');
    });
  });

  describe('End-to-End Laboratory Workflow', () => {
    let testPatient: Patient;
    let testServiceRequest: ServiceRequest;
    let testSpecimen: Specimen;

    beforeEach(async () => {
      await authService.login({
        email: WORKFLOW_INTEGRATION_CONFIG.testCredentials.email,
        password: WORKFLOW_INTEGRATION_CONFIG.testCredentials.password,
        projectId: WORKFLOW_INTEGRATION_CONFIG.testProjectId
      });

      // Create test patient
      testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Lab'], family: 'Workflow' }],
        birthDate: '1985-05-15',
        identifier: [{
          system: 'http://lims.local/patient-id',
          value: `LAB-WF-${Date.now()}`
        }]
      });
      await addTestResource('Patient', testPatient.id!);
    });

    it('should complete histopathology workflow', async () => {
      // Step 1: Create service request
      testServiceRequest = await medplumService.createResource({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '33747-0',
            display: 'Histopathology study'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        authoredOn: new Date().toISOString(),
        priority: 'routine'
      });
      await addTestResource('ServiceRequest', testServiceRequest.id!);

      // Step 2: Create specimen
      testSpecimen = await medplumService.createResource({
        resourceType: 'Specimen',
        status: 'available',
        type: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '119376003',
            display: 'Tissue specimen'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        request: [{ reference: `ServiceRequest/${testServiceRequest.id}` }],
        accessionIdentifier: {
          system: 'http://lims.local/accession-id',
          value: `HISTO-${Date.now()}`
        },
        collection: {
          collectedDateTime: new Date().toISOString(),
          method: {
            coding: [{
              system: 'http://snomed.info/sct',
              code: '129314006',
              display: 'Biopsy'
            }]
          },
          bodySite: {
            coding: [{
              system: 'http://snomed.info/sct',
              code: '78961009',
              display: 'Splenic structure'
            }]
          }
        }
      });
      await addTestResource('Specimen', testSpecimen.id!);

      // Step 3: Create observations for histopathology steps
      const grossExamObservation = await medplumService.createResource({
        resourceType: 'Observation',
        status: 'final',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'procedure',
            display: 'Procedure'
          }]
        }],
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '33746-2',
            display: 'Gross examination'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        specimen: { reference: `Specimen/${testSpecimen.id}` },
        effectiveDateTime: new Date().toISOString(),
        valueString: 'Tissue sample measuring 2.5 x 1.8 x 0.5 cm, tan-brown in color'
      });
      await addTestResource('Observation', grossExamObservation.id!);

      const microscopicObservation = await medplumService.createResource({
        resourceType: 'Observation',
        status: 'final',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'procedure',
            display: 'Procedure'
          }]
        }],
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '33748-8',
            display: 'Microscopic examination'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        specimen: { reference: `Specimen/${testSpecimen.id}` },
        effectiveDateTime: new Date().toISOString(),
        valueString: 'Normal tissue architecture with no evidence of malignancy'
      });
      await addTestResource('Observation', microscopicObservation.id!);

      // Step 4: Create diagnostic report
      const diagnosticReport = await diagnosticReportService.createDiagnosticReport({
        patient: testPatient,
        serviceRequest: testServiceRequest,
        specimen: testSpecimen,
        observations: [grossExamObservation, microscopicObservation],
        conclusion: 'Benign tissue with normal histological features',
        conclusionCode: [{
          coding: [{
            system: 'http://snomed.info/sct',
            code: '30807003',
            display: 'Benign neoplasm'
          }]
        }]
      });
      await addTestResource('DiagnosticReport', diagnosticReport.id!);

      // Verify workflow completion
      expect(diagnosticReport.status).toBe('final');
      expect(diagnosticReport.subject?.reference).toBe(`Patient/${testPatient.id}`);
      expect(diagnosticReport.basedOn?.[0]?.reference).toBe(`ServiceRequest/${testServiceRequest.id}`);
      expect(diagnosticReport.specimen?.[0]?.reference).toBe(`Specimen/${testSpecimen.id}`);
      expect(diagnosticReport.result?.length).toBe(2);
    });

    it('should trigger billing workflow after report finalization', async () => {
      // Create completed diagnostic report
      const diagnosticReport = await medplumService.createResource({
        resourceType: 'DiagnosticReport',
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
        subject: { reference: `Patient/${testPatient.id}` },
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
        conclusion: 'Integration test report for billing'
      });
      await addTestResource('DiagnosticReport', diagnosticReport.id!);

      // Trigger billing bot
      await billingService.triggerBillingBot(diagnosticReport);

      // Wait for bot processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify billing task was created
      const billingTasks = await medplumService.searchResources<Task>('Task', {
        code: 'automated-billing',
        status: 'requested'
      });

      expect(billingTasks.entry?.length).toBeGreaterThan(0);
      
      const billingTask = billingTasks.entry?.[0]?.resource;
      if (billingTask?.id) {
        await addTestResource('Task', billingTask.id);
      }

      expect(billingTask?.input?.some(input => 
        input.valueReference?.reference === `DiagnosticReport/${diagnosticReport.id}`
      )).toBe(true);
    });
  });

  describe('End-to-End Billing Workflow', () => {
    let testPatient: Patient;
    let testDiagnosticReport: DiagnosticReport;

    beforeEach(async () => {
      await authService.login({
        email: WORKFLOW_INTEGRATION_CONFIG.testCredentials.email,
        password: WORKFLOW_INTEGRATION_CONFIG.testCredentials.password,
        projectId: WORKFLOW_INTEGRATION_CONFIG.testProjectId
      });

      // Create test patient
      testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Billing'], family: 'Test' }],
        birthDate: '1975-08-20'
      });
      await addTestResource('Patient', testPatient.id!);

      // Create finalized diagnostic report
      testDiagnosticReport = await medplumService.createResource({
        resourceType: 'DiagnosticReport',
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
        subject: { reference: `Patient/${testPatient.id}` },
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
        conclusion: 'Billing integration test report'
      });
      await addTestResource('DiagnosticReport', testDiagnosticReport.id!);
    });

    it('should create and validate claim from diagnostic report', async () => {
      // Create claim from diagnostic report
      const claim = await billingService.createClaimFromDiagnosticReport(testDiagnosticReport);
      await addTestResource('Claim', claim.id!);

      // Validate the claim
      const validation = await billingService.validateClaim(claim);

      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(claim.patient?.reference).toBe(`Patient/${testPatient.id}`);
      expect(claim.status).toBe('active');
      expect(claim.total?.value).toBeGreaterThan(0);
    });

    it('should handle claim submission workflow', async () => {
      // Create and submit claim
      const claim = await billingService.createClaimFromDiagnosticReport(testDiagnosticReport);
      await addTestResource('Claim', claim.id!);

      const submissionResult = await billingService.submitClaim(claim);

      expect(submissionResult.success).toBe(true);

      // Verify submission task was created
      const submissionTasks = await medplumService.searchResources<Task>('Task', {
        code: 'claim-submission',
        status: 'requested'
      });

      expect(submissionTasks.entry?.length).toBeGreaterThan(0);
      
      const submissionTask = submissionTasks.entry?.[0]?.resource;
      if (submissionTask?.id) {
        await addTestResource('Task', submissionTask.id);
      }

      expect(submissionTask?.input?.some(input => 
        input.valueReference?.reference === `Claim/${claim.id}`
      )).toBe(true);
    });
  });

  describe('Portal Integration Workflows', () => {
    let testPatient: Patient;
    let testDiagnosticReport: DiagnosticReport;

    beforeEach(async () => {
      await authService.login({
        email: WORKFLOW_INTEGRATION_CONFIG.testCredentials.email,
        password: WORKFLOW_INTEGRATION_CONFIG.testCredentials.password,
        projectId: WORKFLOW_INTEGRATION_CONFIG.testProjectId
      });

      // Create test patient
      testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Portal'], family: 'Test' }],
        birthDate: '1988-03-10',
        telecom: [{
          system: 'email',
          value: 'portal.test@example.com'
        }]
      });
      await addTestResource('Patient', testPatient.id!);

      // Create diagnostic report for portal access
      testDiagnosticReport = await medplumService.createResource({
        resourceType: 'DiagnosticReport',
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
        subject: { reference: `Patient/${testPatient.id}` },
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
        conclusion: 'Portal access test report'
      });
      await addTestResource('DiagnosticReport', testDiagnosticReport.id!);
    });

    it('should provide patient portal access to results', async () => {
      // Search for patient's diagnostic reports (simulating portal access)
      const patientReports = await medplumService.searchDiagnosticReports({
        subject: `Patient/${testPatient.id}`,
        status: 'final'
      });

      expect(patientReports.length).toBeGreaterThan(0);
      expect(patientReports.some(report => report.id === testDiagnosticReport.id)).toBe(true);

      // Verify report contains expected data for patient portal
      const report = patientReports.find(r => r.id === testDiagnosticReport.id);
      expect(report?.conclusion).toBeTruthy();
      expect(report?.issued).toBeTruthy();
      expect(report?.status).toBe('final');
    });

    it('should enforce patient data access restrictions', async () => {
      // Create another patient's report
      const otherPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Other'], family: 'Patient' }],
        birthDate: '1990-01-01'
      });
      await addTestResource('Patient', otherPatient.id!);

      const otherPatientReport = await medplumService.createResource({
        resourceType: 'DiagnosticReport',
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
        subject: { reference: `Patient/${otherPatient.id}` },
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
        conclusion: 'Other patient report'
      });
      await addTestResource('DiagnosticReport', otherPatientReport.id!);

      // Search for original patient's reports should not include other patient's data
      const patientReports = await medplumService.searchDiagnosticReports({
        subject: `Patient/${testPatient.id}`
      });

      expect(patientReports.every(report => 
        report.subject?.reference === `Patient/${testPatient.id}`
      )).toBe(true);
      
      expect(patientReports.some(report => 
        report.id === otherPatientReport.id
      )).toBe(false);
    });
  });

  describe('Error Recovery Workflows', () => {
    beforeEach(async () => {
      await authService.login({
        email: WORKFLOW_INTEGRATION_CONFIG.testCredentials.email,
        password: WORKFLOW_INTEGRATION_CONFIG.testCredentials.password,
        projectId: WORKFLOW_INTEGRATION_CONFIG.testProjectId
      });
    });

    it('should handle and recover from network errors', async () => {
      // Simulate network error by using invalid resource ID
      let errorOccurred = false;
      
      try {
        await medplumService.readResource('Patient', 'invalid-id-that-causes-error');
      } catch (error) {
        errorOccurred = true;
        expect(error).toBeTruthy();
      }

      expect(errorOccurred).toBe(true);

      // Verify system can still perform valid operations after error
      const validPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Recovery'], family: 'Test' }],
        birthDate: '1985-01-01'
      });
      await addTestResource('Patient', validPatient.id!);

      expect(validPatient.id).toBeTruthy();
    });

    it('should handle validation errors gracefully', async () => {
      // Attempt to create invalid resource
      let validationErrorOccurred = false;
      
      try {
        await medplumService.createResource({
          resourceType: 'Patient',
          birthDate: 'invalid-date-format'
        } as Patient);
      } catch (error) {
        validationErrorOccurred = true;
        expect(error).toBeTruthy();
      }

      expect(validationErrorOccurred).toBe(true);

      // Verify system can create valid resource after validation error
      const validPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Valid'], family: 'Patient' }],
        birthDate: '1990-01-01'
      });
      await addTestResource('Patient', validPatient.id!);

      expect(validPatient.id).toBeTruthy();
    });
  });
});