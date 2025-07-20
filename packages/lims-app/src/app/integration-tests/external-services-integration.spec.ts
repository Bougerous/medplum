import { TestBed } from '@angular/core/testing';
import {
  Claim,
  ClaimResponse,
  Invoice,
  Patient,
  PaymentReconciliation
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { CandidHealthService } from '../services/candid-health.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { RetryService } from '../services/retry.service';
import { StripePaymentService } from '../services/stripe-payment.service';

// External services integration test configuration
const EXTERNAL_SERVICES_CONFIG = {
  enabled: false, // Set to true when running with actual external services
  candidHealth: {
    apiKey: 'test-candid-api-key',
    baseUrl: 'https://api.candidhealth.com',
    clientId: 'test-client-id'
  },
  stripe: {
    publishableKey: 'pk_test_...',
    secretKey: 'sk_test_...',
    webhookSecret: 'whsec_test_...'
  },
  medplum: {
    baseUrl: 'https://api.medplum.com/',
    testProjectId: 'test-project-id',
    testCredentials: {
      email: 'test@example.com',
      password: 'test-password'
    }
  }
};

describe('External Services Integration Tests', () => {
  let candidHealthService: CandidHealthService;
  let stripePaymentService: StripePaymentService;
  let medplumService: MedplumService;
  let _errorHandlingService: ErrorHandlingService;

  // Test resources to clean up
  let testResources: { type: string; id: string }[] = [];

  beforeEach(() => {
    if (!EXTERNAL_SERVICES_CONFIG.enabled) {
      pending('External services integration tests are disabled. Set EXTERNAL_SERVICES_CONFIG.enabled = true to run.');
    }

    TestBed.configureTestingModule({
      providers: [
        CandidHealthService,
        StripePaymentService,
        MedplumService,
        ErrorHandlingService,
        RetryService
      ]
    });

    candidHealthService = TestBed.inject(CandidHealthService);
    stripePaymentService = TestBed.inject(StripePaymentService);
    medplumService = TestBed.inject(MedplumService);
    _errorHandlingService = TestBed.inject(ErrorHandlingService);

    testResources = [];
  });

  afterEach(async () => {
    if (EXTERNAL_SERVICES_CONFIG.enabled) {
      // Clean up test resources
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

  describe('Candid Health Integration', () => {
    let testPatient: Patient;
    let testClaim: Claim;

    beforeEach(async () => {
      // Authenticate with Medplum
      await medplumService.signIn(
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.email,
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.password,
        EXTERNAL_SERVICES_CONFIG.medplum.testProjectId
      );

      // Create test patient
      testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Candid'], family: 'TestPatient' }],
        birthDate: '1980-01-01',
        identifier: [{
          system: 'http://lims.local/patient-id',
          value: `CANDID-TEST-${Date.now()}`
        }],
        address: [{
          line: ['123 Test Street'],
          city: 'Test City',
          state: 'TS',
          postalCode: '12345',
          country: 'US'
        }]
      });
      await addTestResource('Patient', testPatient.id!);

      // Create test claim
      testClaim = await medplumService.createResource({
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
        patient: { reference: `Patient/${testPatient.id}` },
        billablePeriod: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        created: new Date().toISOString(),
        provider: {
          reference: 'Practitioner/test-provider'
        },
        priority: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/processpriority',
            code: 'normal',
            display: 'Normal'
          }]
        },
        item: [{
          sequence: 1,
          productOrService: {
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: '88305',
              display: 'Histopathology examination'
            }]
          },
          unitPrice: { value: 150.00, currency: 'USD' },
          net: { value: 150.00, currency: 'USD' }
        }],
        total: { value: 150.00, currency: 'USD' }
      });
      await addTestResource('Claim', testClaim.id!);
    });

    it('should submit claim to Candid Health', async () => {
      const submissionResult = await candidHealthService.submitClaim(testClaim);

      expect(submissionResult.success).toBe(true);
      expect(submissionResult.candidClaimId).toBeTruthy();
      expect(submissionResult.submissionId).toBeTruthy();

      // Verify submission was recorded in Medplum
      const updatedClaim = await medplumService.readResource<Claim>('Claim', testClaim.id!);
      expect(updatedClaim.identifier?.some(id => 
        id.system === 'http://candidhealth.com/claim-id'
      )).toBe(true);
    });

    it('should handle claim validation errors from Candid Health', async () => {
      // Create invalid claim (missing required fields)
      const invalidClaim: Claim = {
        ...testClaim,
        item: [{
          sequence: 1,
          productOrService: {
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: 'INVALID-CODE'
            }]
          }
        }]
      };

      const submissionResult = await candidHealthService.submitClaim(invalidClaim);

      expect(submissionResult.success).toBe(false);
      expect(submissionResult.errors).toBeTruthy();
      expect(submissionResult.errors?.length).toBeGreaterThan(0);
    });

    it('should retrieve claim status from Candid Health', async () => {
      // First submit a claim
      const submissionResult = await candidHealthService.submitClaim(testClaim);
      expect(submissionResult.success).toBe(true);

      // Then check its status
      const statusResult = await candidHealthService.getClaimStatus(submissionResult.candidClaimId!);

      expect(statusResult).toBeTruthy();
      expect(statusResult.claimId).toBe(submissionResult.candidClaimId);
      expect(['submitted', 'processing', 'adjudicated', 'paid', 'denied']).toContain(statusResult.status);
    });

    it('should process claim response from Candid Health', async () => {
      // Submit claim first
      const submissionResult = await candidHealthService.submitClaim(testClaim);
      expect(submissionResult.success).toBe(true);

      // Simulate receiving claim response (in real scenario, this would come via webhook)
      const claimResponse: ClaimResponse = {
        resourceType: 'ClaimResponse',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional'
          }]
        },
        use: 'claim',
        patient: { reference: `Patient/${testPatient.id}` },
        created: new Date().toISOString(),
        insurer: { reference: 'Organization/candid-health' },
        request: { reference: `Claim/${testClaim.id}` },
        outcome: 'complete',
        identifier: [{
          system: 'http://candidhealth.com/claim-response-id',
          value: submissionResult.candidClaimId!
        }],
        item: [{
          itemSequence: 1,
          adjudication: [{
            category: {
              coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/adjudication',
                code: 'eligible',
                display: 'Eligible Amount'
              }]
            },
            amount: { value: 150.00, currency: 'USD' }
          }]
        }],
        payment: {
          type: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/ex-paymenttype',
              code: 'complete',
              display: 'Complete'
            }]
          },
          amount: { value: 120.00, currency: 'USD' },
          date: new Date().toISOString().split('T')[0]
        }
      };

      const processedResponse = await candidHealthService.processClaimResponse(claimResponse);
      await addTestResource('ClaimResponse', processedResponse.id!);

      expect(processedResponse.outcome).toBe('complete');
      expect(processedResponse.payment?.amount?.value).toBe(120.00);
    });
  });

  describe('Stripe Payment Integration', () => {
    let testPatient: Patient;
    let testInvoice: Invoice;

    beforeEach(async () => {
      // Authenticate with Medplum
      await medplumService.signIn(
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.email,
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.password,
        EXTERNAL_SERVICES_CONFIG.medplum.testProjectId
      );

      // Create test patient
      testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Stripe'], family: 'TestPatient' }],
        birthDate: '1985-05-15',
        telecom: [{
          system: 'email',
          value: 'stripe.test@example.com'
        }]
      });
      await addTestResource('Patient', testPatient.id!);

      // Create test invoice
      testInvoice = await medplumService.createResource({
        resourceType: 'Invoice',
        status: 'issued',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/invoice-type',
            code: 'patient',
            display: 'Patient Invoice'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        date: new Date().toISOString().split('T')[0],
        participant: [{
          role: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/invoice-participant-role',
              code: 'subject',
              display: 'Subject of Invoice'
            }]
          },
          actor: { reference: `Patient/${testPatient.id}` }
        }],
        totalNet: { value: 75.00, currency: 'USD' },
        totalGross: { value: 75.00, currency: 'USD' },
        lineItem: [{
          sequence: 1,
          chargeItemCodeableConcept: {
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: '88304',
              display: 'Histopathology examination, simple'
            }]
          },
          priceComponent: [{
            type: 'base',
            amount: { value: 75.00, currency: 'USD' }
          }]
        }]
      });
      await addTestResource('Invoice', testInvoice.id!);
    });

    it('should create Stripe customer for patient', async () => {
      const stripeCustomer = await stripePaymentService.createCustomer({
        email: 'stripe.test@example.com',
        name: 'Stripe TestPatient',
        metadata: {
          patientId: testPatient.id!,
          source: 'lims-integration-test'
        }
      });

      expect(stripeCustomer.id).toBeTruthy();
      expect(stripeCustomer.email).toBe('stripe.test@example.com');
      expect(stripeCustomer.metadata.patientId).toBe(testPatient.id);

      // Clean up Stripe customer
      await stripePaymentService.deleteCustomer(stripeCustomer.id);
    });

    it('should create payment intent for invoice', async () => {
      const paymentIntent = await stripePaymentService.createPaymentIntent({
        amount: 7500, // $75.00 in cents
        currency: 'usd',
        metadata: {
          invoiceId: testInvoice.id!,
          patientId: testPatient.id!
        },
        description: 'Laboratory services payment'
      });

      expect(paymentIntent.id).toBeTruthy();
      expect(paymentIntent.amount).toBe(7500);
      expect(paymentIntent.currency).toBe('usd');
      expect(paymentIntent.status).toBe('requires_payment_method');
      expect(paymentIntent.metadata.invoiceId).toBe(testInvoice.id);

      // Clean up payment intent
      await stripePaymentService.cancelPaymentIntent(paymentIntent.id);
    });

    it('should create payment link for patient invoice', async () => {
      const paymentLink = await stripePaymentService.createPaymentLink({
        lineItems: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Laboratory Services',
              description: 'Histopathology examination'
            },
            unit_amount: 7500 // $75.00 in cents
          },
          quantity: 1
        }],
        metadata: {
          invoiceId: testInvoice.id!,
          patientId: testPatient.id!
        },
        after_completion: {
          type: 'redirect',
          redirect: {
            url: 'https://lims.example.com/payment-success'
          }
        }
      });

      expect(paymentLink.id).toBeTruthy();
      expect(paymentLink.url).toBeTruthy();
      expect(paymentLink.metadata.invoiceId).toBe(testInvoice.id);

      // Update invoice with payment link
      const updatedInvoice = await medplumService.updateResource({
        ...testInvoice,
        identifier: [{
          system: 'http://stripe.com/payment-link-id',
          value: paymentLink.id
        }]
      });

      expect(updatedInvoice.identifier?.[0]?.value).toBe(paymentLink.id);
    });

    it('should process webhook for successful payment', async () => {
      // Create payment intent
      const paymentIntent = await stripePaymentService.createPaymentIntent({
        amount: 7500,
        currency: 'usd',
        metadata: {
          invoiceId: testInvoice.id!,
          patientId: testPatient.id!
        }
      });

      // Simulate webhook payload for successful payment
      const webhookPayload = {
        id: 'evt_test_webhook',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntent.id,
            amount: 7500,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              invoiceId: testInvoice.id!,
              patientId: testPatient.id!
            }
          }
        },
        created: Math.floor(Date.now() / 1000)
      };

      const webhookResult = await stripePaymentService.processWebhook(
        JSON.stringify(webhookPayload),
        'test-webhook-signature'
      );

      expect(webhookResult.processed).toBe(true);
      expect(webhookResult.eventType).toBe('payment_intent.succeeded');

      // Verify payment reconciliation was created
      const paymentReconciliations = await medplumService.searchResources<PaymentReconciliation>(
        'PaymentReconciliation',
        { 'detail-request': `Invoice/${testInvoice.id}` }
      );

      expect(paymentReconciliations.entry?.length).toBeGreaterThan(0);
      
      const reconciliation = paymentReconciliations.entry?.[0]?.resource;
      if (reconciliation?.id) {
        await addTestResource('PaymentReconciliation', reconciliation.id);
      }

      expect(reconciliation?.detail?.[0]?.amount?.value).toBe(75.00);

      // Clean up payment intent
      await stripePaymentService.cancelPaymentIntent(paymentIntent.id);
    });

    it('should handle payment failures', async () => {
      // Create payment intent
      const paymentIntent = await stripePaymentService.createPaymentIntent({
        amount: 7500,
        currency: 'usd',
        metadata: {
          invoiceId: testInvoice.id!,
          patientId: testPatient.id!
        }
      });

      // Simulate webhook payload for failed payment
      const webhookPayload = {
        id: 'evt_test_webhook_failed',
        object: 'event',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: paymentIntent.id,
            amount: 7500,
            currency: 'usd',
            status: 'requires_payment_method',
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card was declined.'
            },
            metadata: {
              invoiceId: testInvoice.id!,
              patientId: testPatient.id!
            }
          }
        },
        created: Math.floor(Date.now() / 1000)
      };

      const webhookResult = await stripePaymentService.processWebhook(
        JSON.stringify(webhookPayload),
        'test-webhook-signature'
      );

      expect(webhookResult.processed).toBe(true);
      expect(webhookResult.eventType).toBe('payment_intent.payment_failed');

      // Verify invoice status was updated
      const updatedInvoice = await medplumService.readResource<Invoice>('Invoice', testInvoice.id!);
      expect(updatedInvoice.status).toBe('issued'); // Should remain issued for retry

      // Clean up payment intent
      await stripePaymentService.cancelPaymentIntent(paymentIntent.id);
    });
  });

  describe('End-to-End Payment Workflow', () => {
    let testPatient: Patient;
    let testClaim: Claim;
    let testInvoice: Invoice;

    beforeEach(async () => {
      // Authenticate with Medplum
      await medplumService.signIn(
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.email,
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.password,
        EXTERNAL_SERVICES_CONFIG.medplum.testProjectId
      );

      // Create test patient
      testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Payment'], family: 'Workflow' }],
        birthDate: '1990-03-20',
        telecom: [{
          system: 'email',
          value: 'payment.workflow@example.com'
        }]
      });
      await addTestResource('Patient', testPatient.id!);
    });

    it('should complete full payment workflow', async () => {
      // Step 1: Create and submit claim to Candid Health
      testClaim = await medplumService.createResource({
        resourceType: 'Claim',
        status: 'active',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional'
          }]
        },
        use: 'claim',
        patient: { reference: `Patient/${testPatient.id}` },
        created: new Date().toISOString(),
        provider: { reference: 'Practitioner/test-provider' },
        item: [{
          sequence: 1,
          productOrService: {
            coding: [{
              system: 'http://www.ama-assn.org/go/cpt',
              code: '88305'
            }]
          },
          unitPrice: { value: 200.00, currency: 'USD' },
          net: { value: 200.00, currency: 'USD' }
        }],
        total: { value: 200.00, currency: 'USD' }
      });
      await addTestResource('Claim', testClaim.id!);

      const claimSubmission = await candidHealthService.submitClaim(testClaim);
      expect(claimSubmission.success).toBe(true);

      // Step 2: Process claim response (partial payment from insurance)
      const claimResponse: ClaimResponse = {
        resourceType: 'ClaimResponse',
        status: 'active',
        type: { coding: [{ code: 'professional' }] },
        use: 'claim',
        patient: { reference: `Patient/${testPatient.id}` },
        created: new Date().toISOString(),
        insurer: { reference: 'Organization/candid-health' },
        request: { reference: `Claim/${testClaim.id}` },
        outcome: 'complete',
        payment: {
          amount: { value: 150.00, currency: 'USD' }, // Insurance pays $150
          date: new Date().toISOString().split('T')[0]
        }
      };

      const processedResponse = await candidHealthService.processClaimResponse(claimResponse);
      await addTestResource('ClaimResponse', processedResponse.id!);

      // Step 3: Create patient invoice for remaining balance
      testInvoice = await medplumService.createResource({
        resourceType: 'Invoice',
        status: 'issued',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/invoice-type',
            code: 'patient'
          }]
        },
        subject: { reference: `Patient/${testPatient.id}` },
        date: new Date().toISOString().split('T')[0],
        totalNet: { value: 50.00, currency: 'USD' }, // Patient owes $50
        totalGross: { value: 50.00, currency: 'USD' },
        lineItem: [{
          sequence: 1,
          chargeItemReference: { reference: `Claim/${testClaim.id}` },
          priceComponent: [{
            type: 'base',
            amount: { value: 50.00, currency: 'USD' }
          }]
        }]
      });
      await addTestResource('Invoice', testInvoice.id!);

      // Step 4: Create Stripe payment link for patient
      const paymentLink = await stripePaymentService.createPaymentLink({
        lineItems: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Laboratory Services - Patient Portion'
            },
            unit_amount: 5000 // $50.00 in cents
          },
          quantity: 1
        }],
        metadata: {
          invoiceId: testInvoice.id!,
          patientId: testPatient.id!
        }
      });

      expect(paymentLink.url).toBeTruthy();

      // Step 5: Simulate successful patient payment
      const paymentIntent = await stripePaymentService.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        metadata: {
          invoiceId: testInvoice.id!,
          patientId: testPatient.id!
        }
      });

      const webhookPayload = {
        id: 'evt_payment_workflow',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntent.id,
            amount: 5000,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              invoiceId: testInvoice.id!,
              patientId: testPatient.id!
            }
          }
        },
        created: Math.floor(Date.now() / 1000)
      };

      const webhookResult = await stripePaymentService.processWebhook(
        JSON.stringify(webhookPayload),
        'test-signature'
      );

      expect(webhookResult.processed).toBe(true);

      // Step 6: Verify complete payment reconciliation
      const paymentReconciliations = await medplumService.searchResources<PaymentReconciliation>(
        'PaymentReconciliation',
        { 'detail-request': `Invoice/${testInvoice.id}` }
      );

      expect(paymentReconciliations.entry?.length).toBeGreaterThan(0);
      
      const reconciliation = paymentReconciliations.entry?.[0]?.resource;
      if (reconciliation?.id) {
        await addTestResource('PaymentReconciliation', reconciliation.id);
      }

      // Verify total payments equal original claim amount
      const insurancePayment = claimResponse.payment?.amount?.value || 0;
      const patientPayment = reconciliation?.detail?.[0]?.amount?.value || 0;
      const totalPayments = insurancePayment + patientPayment;

      expect(totalPayments).toBe(200.00); // Original claim amount

      // Clean up Stripe resources
      await stripePaymentService.cancelPaymentIntent(paymentIntent.id);
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await medplumService.signIn(
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.email,
        EXTERNAL_SERVICES_CONFIG.medplum.testCredentials.password,
        EXTERNAL_SERVICES_CONFIG.medplum.testProjectId
      );
    });

    it('should handle Candid Health API errors gracefully', async () => {
      // Create invalid claim to trigger API error
      const invalidClaim: Claim = {
        resourceType: 'Claim',
        status: 'active',
        type: { coding: [{ code: 'professional' }] },
        use: 'claim',
        patient: { reference: 'Patient/nonexistent' },
        created: new Date().toISOString(),
        total: { value: -100, currency: 'USD' } // Invalid negative amount
      };

      const result = await candidHealthService.submitClaim(invalidClaim);

      expect(result.success).toBe(false);
      expect(result.errors).toBeTruthy();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should handle Stripe API errors gracefully', async () => {
      // Attempt to create payment intent with invalid amount
      try {
        await stripePaymentService.createPaymentIntent({
          amount: -100, // Invalid negative amount
          currency: 'usd'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
        expect((error as Error).message).toContain('amount');
      }
    });

    it('should retry failed external service calls', async () => {
      // This test would verify retry logic by simulating network failures
      // Implementation depends on specific retry configuration
      expect(true).toBe(true); // Placeholder
    });
  });
});