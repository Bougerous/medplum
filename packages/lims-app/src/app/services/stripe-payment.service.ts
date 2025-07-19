import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  Invoice,
  Patient,
  DiagnosticReport,
  Claim,
  Money,
  Reference,
  PaymentNotice,
  PaymentReconciliation
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';
import { LIMSErrorType } from '../types/fhir-types';

// Stripe API interfaces
export interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  apiVersion: string;
  environment: 'test' | 'live';
}

export interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
  address?: StripeAddress;
  metadata?: { [key: string]: string };
  created: number;
  default_source?: string;
  invoice_prefix?: string;
  preferred_locales?: string[];
}

export interface StripeAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface StripeInvoice {
  id: string;
  customer: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  description?: string;
  due_date?: number;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  payment_intent?: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  lines: {
    data: StripeInvoiceLineItem[];
  };
  metadata?: { [key: string]: string };
  created: number;
  period_start: number;
  period_end: number;
}

export interface StripeInvoiceLineItem {
  id: string;
  amount: number;
  currency: string;
  description?: string;
  quantity: number;
  unit_amount?: number;
  metadata?: { [key: string]: string };
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  customer?: string;
  description?: string;
  invoice?: string;
  payment_method?: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  client_secret: string;
  metadata?: { [key: string]: string };
  created: number;
}

export interface StripePaymentLink {
  id: string;
  url: string;
  active: boolean;
  line_items: {
    data: StripePaymentLinkLineItem[];
  };
  metadata?: { [key: string]: string };
  created: number;
}

export interface StripePaymentLinkLineItem {
  id: string;
  price: {
    id: string;
    unit_amount: number;
    currency: string;
    product: string;
  };
  quantity: number;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
    previous_attributes?: any;
  };
  created: number;
  livemode: boolean;
  pending_webhooks: number;
  request?: {
    id: string;
    idempotency_key?: string;
  };
}

export interface PaymentLinkRequest {
  patientId: string;
  amount: number;
  currency: string;
  description: string;
  dueDate?: Date;
  metadata?: { [key: string]: string };
}

export interface PaymentConfirmation {
  paymentIntentId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  status: string;
  patientId: string;
  paidAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class StripePaymentService {
  private config: StripeConfig;
  private customers$ = new BehaviorSubject<StripeCustomer[]>([]);
  private invoices$ = new BehaviorSubject<StripeInvoice[]>([]);
  private paymentConfirmations$ = new BehaviorSubject<PaymentConfirmation[]>([]);

  constructor(
    private http: HttpClient,
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private retryService: RetryService
  ) {
    this.config = this.getDefaultConfig();
  }

  /**
   * Create FHIR Invoice resource for patient payment
   */
  async createInvoice(
    patient: Patient,
    diagnosticReport: DiagnosticReport,
    amount: number,
    description: string
  ): Promise<Invoice> {
    try {
      const invoice: Invoice = {
        resourceType: 'Invoice',
        status: 'issued',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/invoice-type',
            code: 'patient',
            display: 'Patient Invoice'
          }]
        },
        subject: {
          reference: `Patient/${patient.id}`
        },
        date: new Date().toISOString(),
        issuer: {
          display: 'Laboratory Services'
        },
        totalNet: {
          value: amount,
          currency: 'USD'
        },
        totalGross: {
          value: amount,
          currency: 'USD'
        },
        lineItem: [{
          sequence: 1,
          chargeItemCodeableConcept: {
            coding: [{
              system: 'http://lims.local/services',
              code: 'lab-service',
              display: description
            }]
          },
          priceComponent: [{
            type: 'base',
            amount: {
              value: amount,
              currency: 'USD'
            }
          }]
        }],
        note: [{
          text: `Invoice for diagnostic report: ${diagnosticReport.id}`
        }]
      };

      const createdInvoice = await this.medplumService.createResource(invoice);
      return createdInvoice;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to create FHIR invoice',
        details: { patientId: patient.id, diagnosticReportId: diagnosticReport.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Generate payment link for patient
   */
  async generatePaymentLink(request: PaymentLinkRequest): Promise<{ paymentLink: StripePaymentLink; invoice: Invoice }> {
    try {
      // Get or create Stripe customer
      const patient = await this.medplumService.readResource<Patient>('Patient', request.patientId);
      const customer = await this.getOrCreateStripeCustomer(patient);

      // Create Stripe invoice
      const stripeInvoice = await this.createStripeInvoice(customer.id, request);

      // Create payment link
      const paymentLink = await this.createStripePaymentLink(stripeInvoice);

      // Create FHIR Invoice
      const fhirInvoice = await this.createFhirInvoiceFromStripe(patient, stripeInvoice, paymentLink);

      // Update local state
      const currentInvoices = this.invoices$.value;
      this.invoices$.next([...currentInvoices, stripeInvoice]);

      return { paymentLink, invoice: fhirInvoice };
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to generate payment link',
        details: { request, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Send payment link via email
   */
  async sendPaymentLinkEmail(
    patientId: string,
    paymentLink: StripePaymentLink,
    invoice: Invoice
  ): Promise<void> {
    try {
      const patient = await this.medplumService.readResource<Patient>('Patient', patientId);
      const email = this.getPatientEmail(patient);

      if (!email) {
        throw new Error('Patient email not found');
      }

      // In a real implementation, this would integrate with an email service
      // For now, we'll create a communication resource to track the email
      const communication = {
        resourceType: 'Communication',
        status: 'completed',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/communication-category',
            code: 'notification',
            display: 'Notification'
          }]
        }],
        subject: {
          reference: `Patient/${patient.id}`
        },
        sent: new Date().toISOString(),
        recipient: [{
          reference: `Patient/${patient.id}`
        }],
        payload: [{
          contentString: `Payment link for your laboratory services: ${paymentLink.url}`
        }],
        note: [{
          text: `Payment link sent for invoice ${invoice.id}`
        }]
      };

      await this.medplumService.createResource(communication);

      console.log(`Payment link email sent to ${email}: ${paymentLink.url}`);
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to send payment link email',
        details: { patientId, paymentLinkId: paymentLink.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Process Stripe webhook
   */
  async processWebhook(event: StripeWebhookEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;
        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to process Stripe webhook',
        details: { eventType: event.type, eventId: event.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get payment confirmations
   */
  getPaymentConfirmations(): Observable<PaymentConfirmation[]> {
    return this.paymentConfirmations$.asObservable();
  }

  /**
   * Get invoices
   */
  getInvoices(): Observable<StripeInvoice[]> {
    return this.invoices$.asObservable();
  }

  /**
   * Get customers
   */
  getCustomers(): Observable<StripeCustomer[]> {
    return this.customers$.asObservable();
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentIntentId: string, amount?: number): Promise<any> {
    try {
      const refundData: any = {
        payment_intent: paymentIntentId
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Convert to cents
      }

      const refund = await this.makeStripeApiCall('POST', '/refunds', refundData);

      // Create FHIR PaymentNotice for the refund
      await this.createRefundPaymentNotice(paymentIntentId, refund);

      return refund;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to process refund',
        details: { paymentIntentId, amount, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  // Private helper methods

  private getDefaultConfig(): StripeConfig {
    return {
      publishableKey: process.env['STRIPE_PUBLISHABLE_KEY'] || '',
      secretKey: process.env['STRIPE_SECRET_KEY'] || '',
      webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] || '',
      apiVersion: '2023-10-16',
      environment: 'test'
    };
  }

  private async getOrCreateStripeCustomer(patient: Patient): Promise<StripeCustomer> {
    try {
      // Check if customer already exists
      const existingCustomers = this.customers$.value;
      const existingCustomer = existingCustomers.find(c =>
        c.metadata?.patientId === patient.id
      );

      if (existingCustomer) {
        return existingCustomer;
      }

      // Create new Stripe customer
      const customerData = {
        name: this.getPatientName(patient),
        email: this.getPatientEmail(patient),
        phone: this.getPatientPhone(patient),
        address: this.getPatientAddress(patient),
        metadata: {
          patientId: patient.id || '',
          source: 'lims'
        }
      };

      const customer = await this.makeStripeApiCall<StripeCustomer>('POST', '/customers', customerData);

      // Update local state
      const currentCustomers = this.customers$.value;
      this.customers$.next([...currentCustomers, customer]);

      return customer;
    } catch (error) {
      console.error('Failed to get or create Stripe customer:', error);
      throw error;
    }
  }

  private async createStripeInvoice(customerId: string, request: PaymentLinkRequest): Promise<StripeInvoice> {
    const invoiceData = {
      customer: customerId,
      description: request.description,
      currency: request.currency.toLowerCase(),
      due_date: request.dueDate ? Math.floor(request.dueDate.getTime() / 1000) : undefined,
      metadata: {
        patientId: request.patientId,
        ...request.metadata
      }
    };

    const invoice = await this.makeStripeApiCall<StripeInvoice>('POST', '/invoices', invoiceData);

    // Add line item
    const lineItemData = {
      customer: customerId,
      amount: Math.round(request.amount * 100), // Convert to cents
      currency: request.currency.toLowerCase(),
      description: request.description,
      invoice: invoice.id
    };

    await this.makeStripeApiCall('POST', '/invoiceitems', lineItemData);

    // Finalize the invoice
    const finalizedInvoice = await this.makeStripeApiCall<StripeInvoice>('POST', `/invoices/${invoice.id}/finalize`);

    return finalizedInvoice;
  }

  private async createStripePaymentLink(invoice: StripeInvoice): Promise<StripePaymentLink> {
    const paymentLinkData = {
      line_items: [{
        price_data: {
          currency: invoice.currency,
          product_data: {
            name: invoice.description || 'Laboratory Services'
          },
          unit_amount: invoice.amount_due
        },
        quantity: 1
      }],
      metadata: {
        invoiceId: invoice.id,
        patientId: invoice.metadata?.patientId || ''
      }
    };

    return await this.makeStripeApiCall<StripePaymentLink>('POST', '/payment_links', paymentLinkData);
  }

  private async createFhirInvoiceFromStripe(
    patient: Patient,
    stripeInvoice: StripeInvoice,
    paymentLink: StripePaymentLink
  ): Promise<Invoice> {
    const invoice: Invoice = {
      resourceType: 'Invoice',
      status: 'issued',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/invoice-type',
          code: 'patient',
          display: 'Patient Invoice'
        }]
      },
      subject: {
        reference: `Patient/${patient.id}`
      },
      date: new Date(stripeInvoice.created * 1000).toISOString(),
      issuer: {
        display: 'Laboratory Services'
      },
      totalNet: {
        value: stripeInvoice.amount_due / 100,
        currency: stripeInvoice.currency.toUpperCase()
      },
      totalGross: {
        value: stripeInvoice.amount_due / 100,
        currency: stripeInvoice.currency.toUpperCase()
      },
      lineItem: stripeInvoice.lines.data.map((item, index) => ({
        sequence: index + 1,
        chargeItemCodeableConcept: {
          coding: [{
            system: 'http://lims.local/services',
            code: 'lab-service',
            display: item.description || 'Laboratory Service'
          }]
        },
        priceComponent: [{
          type: 'base',
          amount: {
            value: (item.amount || 0) / 100,
            currency: stripeInvoice.currency.toUpperCase()
          }
        }]
      })),
      note: [{
        text: `Stripe Invoice ID: ${stripeInvoice.id}, Payment Link: ${paymentLink.url}`
      }]
    };

    return await this.medplumService.createResource(invoice);
  }

  private async handleInvoicePaymentSucceeded(invoice: StripeInvoice): Promise<void> {
    const confirmation: PaymentConfirmation = {
      paymentIntentId: invoice.payment_intent || '',
      invoiceId: invoice.id,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      status: 'succeeded',
      patientId: invoice.metadata?.patientId || '',
      paidAt: new Date()
    };

    // Update local state
    const currentConfirmations = this.paymentConfirmations$.value;
    this.paymentConfirmations$.next([...currentConfirmations, confirmation]);

    // Create FHIR PaymentNotice
    await this.createPaymentNotice(confirmation);

    // Update FHIR Invoice status
    await this.updateFhirInvoiceStatus(invoice.id, 'balanced');
  }

  private async handleInvoicePaymentFailed(invoice: StripeInvoice): Promise<void> {
    console.log(`Payment failed for invoice ${invoice.id}`);

    // Update FHIR Invoice status
    await this.updateFhirInvoiceStatus(invoice.id, 'issued');
  }

  private async handlePaymentIntentSucceeded(paymentIntent: StripePaymentIntent): Promise<void> {
    console.log(`Payment intent succeeded: ${paymentIntent.id}`);
  }

  private async handlePaymentIntentFailed(paymentIntent: StripePaymentIntent): Promise<void> {
    console.log(`Payment intent failed: ${paymentIntent.id}`);
  }

  private async createPaymentNotice(confirmation: PaymentConfirmation): Promise<void> {
    const paymentNotice: PaymentNotice = {
      resourceType: 'PaymentNotice',
      status: 'active',
      request: {
        reference: `Invoice/${confirmation.invoiceId}`
      },
      response: {
        reference: `PaymentReconciliation/${confirmation.paymentIntentId}`
      },
      created: confirmation.paidAt.toISOString(),
      amount: {
        value: confirmation.amount,
        currency: confirmation.currency
      },
      paymentStatus: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/paymentstatus',
          code: 'paid',
          display: 'Paid'
        }]
      }
    };

    await this.medplumService.createResource(paymentNotice);
  }

  private async createRefundPaymentNotice(paymentIntentId: string, refund: any): Promise<void> {
    const paymentNotice: PaymentNotice = {
      resourceType: 'PaymentNotice',
      status: 'active',
      created: new Date().toISOString(),
      amount: {
        value: refund.amount / 100,
        currency: refund.currency.toUpperCase()
      },
      paymentStatus: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/paymentstatus',
          code: 'refunded',
          display: 'Refunded'
        }]
      }
    };

    await this.medplumService.createResource(paymentNotice);
  }

  private async updateFhirInvoiceStatus(stripeInvoiceId: string, status: Invoice['status']): Promise<void> {
    try {
      // Find FHIR invoice by Stripe invoice ID
      const invoices = await this.medplumService.searchResources<Invoice>('Invoice', {
        identifier: stripeInvoiceId
      });

      if (invoices.entry?.[0]?.resource) {
        const invoice = invoices.entry[0].resource;
        await this.medplumService.updateResource({
          ...invoice,
          status
        });
      }
    } catch (error) {
      console.error('Failed to update FHIR invoice status:', error);
    }
  }

  private async makeStripeApiCall<T>(method: string, endpoint: string, data?: any): Promise<T> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': this.config.apiVersion
    });

    const url = `https://api.stripe.com/v1${endpoint}`;

    // Convert data to form-encoded format for Stripe API
    const formData = data ? this.objectToFormData(data) : undefined;

    return this.retryService.executeWithRetry(async () => {
      let response;

      switch (method.toUpperCase()) {
        case 'GET':
          response = await this.http.get<T>(url, { headers }).toPromise();
          break;
        case 'POST':
          response = await this.http.post<T>(url, formData, { headers }).toPromise();
          break;
        case 'PUT':
          response = await this.http.put<T>(url, formData, { headers }).toPromise();
          break;
        case 'DELETE':
          response = await this.http.delete<T>(url, { headers }).toPromise();
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }

      if (!response) {
        throw new Error('No response received from Stripe API');
      }

      return response;
    }, { maxRetries: 3 });
  }

  private objectToFormData(obj: any, prefix?: string): string {
    const params = new URLSearchParams();

    for (const key in obj) {
      if (obj.hasOwnProperty(key) && obj[key] !== undefined && obj[key] !== null) {
        const paramKey = prefix ? `${prefix}[${key}]` : key;

        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          const nestedParams = this.objectToFormData(obj[key], paramKey);
          nestedParams.split('&').forEach(param => {
            const [k, v] = param.split('=');
            if (k && v) {
              params.append(decodeURIComponent(k), decodeURIComponent(v));
            }
          });
        } else if (Array.isArray(obj[key])) {
          obj[key].forEach((item: any, index: number) => {
            if (typeof item === 'object') {
              const nestedParams = this.objectToFormData(item, `${paramKey}[${index}]`);
              nestedParams.split('&').forEach(param => {
                const [k, v] = param.split('=');
                if (k && v) {
                  params.append(decodeURIComponent(k), decodeURIComponent(v));
                }
              });
            } else {
              params.append(`${paramKey}[${index}]`, item.toString());
            }
          });
        } else {
          params.append(paramKey, obj[key].toString());
        }
      }
    }

    return params.toString();
  }

  private getPatientName(patient: Patient): string {
    const name = patient.name?.[0];
    if (name) {
      const given = name.given?.join(' ') || '';
      const family = name.family || '';
      return `${given} ${family}`.trim();
    }
    return 'Unknown Patient';
  }

  private getPatientEmail(patient: Patient): string | undefined {
    return patient.telecom?.find(t => t.system === 'email')?.value;
  }

  private getPatientPhone(patient: Patient): string | undefined {
    return patient.telecom?.find(t => t.system === 'phone')?.value;
  }

  private getPatientAddress(patient: Patient): StripeAddress | undefined {
    const address = patient.address?.[0];
    if (address) {
      return {
        line1: address.line?.[0],
        line2: address.line?.[1],
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country || 'US'
      };
    }
    return undefined;
  }
}