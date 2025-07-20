import { Injectable } from '@angular/core';
import {
  ChargeItem,
  ClaimResponse,
  Money,
} from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { LIMSErrorType } from '../types/fhir-types';
import { CandidHealthService } from './candid-health.service';
import { CurrencyService } from './currency.service';
import { ErrorHandlingService } from './error-handling.service';
import { StripePaymentService } from './stripe-payment.service';

export interface PaymentAllocation {
  id: string;
  claimId: string;
  invoiceId?: string;
  patientId: string;
  paymentSource: 'insurance' | 'patient' | 'other';
  paymentMethod: 'check' | 'eft' | 'credit_card' | 'cash' | 'other';
  totalAmount: Money;
  allocatedAmount: Money;
  remainingAmount: Money;
  paymentDate: Date;
  reconciliationDate?: Date;
  status: 'pending' | 'allocated' | 'reconciled' | 'disputed';
  adjustments: PaymentAdjustment[];
  notes?: string;
}

export interface PaymentAdjustment {
  id: string;
  type: 'contractual' | 'deductible' | 'copay' | 'coinsurance' | 'denial' | 'other';
  amount: Money;
  reason: string;
  reasonCode?: string;
  date: Date;
}

export interface AccountBalance {
  patientId: string;
  totalCharges: Money;
  totalPayments: Money;
  totalAdjustments: Money;
  currentBalance: Money;
  insuranceBalance: Money;
  patientBalance: Money;
  lastPaymentDate?: Date;
  lastStatementDate?: Date;
  agingBuckets: AgingBucket[];
}

export interface AgingBucket {
  label: string;
  daysRange: { min: number; max?: number };
  amount: Money;
  count: number;
}

export interface PaymentReport {
  reportDate: Date;
  totalCollections: Money;
  insuranceCollections: Money;
  patientCollections: Money;
  adjustments: Money;
  netCollections: Money;
  collectionsByPayer: PayerCollection[];
  collectionsByServiceType: ServiceTypeCollection[];
  agingSummary: AgingBucket[];
}

export interface PayerCollection {
  payerName: string;
  payerId?: string;
  amount: Money;
  claimCount: number;
  averagePayment: Money;
}

export interface ServiceTypeCollection {
  serviceType: string;
  serviceCode: string;
  amount: Money;
  count: number;
  averagePayment: Money;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentReconciliationService {
  private paymentAllocations$ = new BehaviorSubject<PaymentAllocation[]>([]);
  private accountBalances$ = new BehaviorSubject<AccountBalance[]>([]);
  private paymentReports$ = new BehaviorSubject<PaymentReport[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private candidHealthService: CandidHealthService,
    private stripePaymentService: StripePaymentService,
    private currencyService: CurrencyService
  ) {
    this.initializeReconciliation();
  }

  /**
   * Process insurance payment from claim response
   */
  async processInsurancePayment(claimResponse: ClaimResponse): Promise<any> {
    try {
      // Extract payment information from claim response
      const paymentInfo = this.extractPaymentInfo(claimResponse);

      if (!paymentInfo.amount || paymentInfo.amount.value <= 0) {
        throw new Error('No payment amount found in claim response');
      }

      // Create payment reconciliation resource
      const reconciliation: any = {
        resourceType: 'PaymentReconciliation',
        status: 'active',
        period: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        created: new Date().toISOString(),
        paymentIssuer: claimResponse.insurer,
        request: claimResponse.request,
        requestor: claimResponse.requestor,
        outcome: claimResponse.outcome,
        disposition: claimResponse.disposition,
        paymentDate: paymentInfo.paymentDate || new Date().toISOString(),
        paymentAmount: paymentInfo.amount,
        paymentIdentifier: paymentInfo.identifier,
        detail: this.createPaymentDetails(claimResponse),
        formCode: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/forms-codes',
            code: 'era',
            display: 'Electronic Remittance Advice'
          }]
        }
      };

      const createdReconciliation = await this.medplumService.createResource(reconciliation);

      // Create payment allocation
      await this.createPaymentAllocation(claimResponse, paymentInfo, 'insurance');

      // Update account balance
      await this.updateAccountBalance(claimResponse.patient?.reference?.split('/')[1] || '');

      return createdReconciliation;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to process insurance payment',
        details: { claimResponseId: claimResponse.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Process patient payment from Stripe
   */
  async processPatientPayment(paymentConfirmation: any): Promise<any> {
    try {
      // Find related invoice
      const invoice = await this.findInvoiceByStripeId(paymentConfirmation.invoiceId || '');

      if (!invoice) {
        throw new Error('Related invoice not found for patient payment');
      }

      // Create payment reconciliation resource
      const reconciliation: any = {
        resourceType: 'PaymentReconciliation',
        status: 'active',
        period: {
          start: paymentConfirmation.paidAt.toISOString(),
          end: paymentConfirmation.paidAt.toISOString()
        },
        created: new Date().toISOString(),
        paymentIssuer: {
          display: 'Patient Payment'
        },
        paymentDate: paymentConfirmation.paidAt.toISOString(),
        paymentAmount: {
          value: paymentConfirmation.amount,
          currency: paymentConfirmation.currency
        },
        paymentIdentifier: {
          value: paymentConfirmation.paymentIntentId
        },
        detail: [{
          type: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/payment-type',
              code: 'payment',
              display: 'Payment'
            }]
          },
          request: {
            reference: `Invoice/${invoice.id}`
          },
          date: paymentConfirmation.paidAt.toISOString(),
          amount: {
            value: paymentConfirmation.amount,
            currency: paymentConfirmation.currency
          }
        }],
        formCode: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/forms-codes',
            code: 'patient-payment',
            display: 'Patient Payment'
          }]
        }
      };

      const createdReconciliation = await this.medplumService.createResource(reconciliation);

      // Create payment allocation
      await this.createPatientPaymentAllocation(paymentConfirmation, invoice);

      // Update account balance
      await this.updateAccountBalance(paymentConfirmation.patientId);

      return createdReconciliation;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to process patient payment',
        details: { paymentConfirmation, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get account balance for patient
   */
  async getAccountBalance(patientId: string): Promise<AccountBalance> {
    try {
      // Get all charges for patient
      const charges = await this.getPatientCharges(patientId);
      const payments = await this.getPatientPayments(patientId);
      const adjustments = await this.getPatientAdjustments(patientId);

      // Calculate totals
      const totalCharges = this.sumAmounts(charges.map(c => c.totalNet || this.currencyService.createINRMoney(0)));
      const totalPayments = this.sumAmounts(payments.map(p => p.paymentAmount || this.currencyService.createINRMoney(0)));
      const totalAdjustments = this.sumAmounts(adjustments.map(a => a.amount || this.currencyService.createINRMoney(0)));

      const currentBalance: Money = this.currencyService.createINRMoney(
        (totalCharges.value || 0) - (totalPayments.value || 0) - (totalAdjustments.value || 0)
      );

      // Calculate insurance vs patient balance
      const insuranceBalance = await this.calculateInsuranceBalance(patientId);
      const patientBalance: Money = this.currencyService.createINRMoney(
        (currentBalance.value || 0) - (insuranceBalance.value || 0)
      );

      // Calculate aging buckets
      const agingBuckets = await this.calculateAgingBuckets(patientId, charges);

      const accountBalance: AccountBalance = {
        patientId,
        totalCharges,
        totalPayments,
        totalAdjustments,
        currentBalance,
        insuranceBalance,
        patientBalance,
        lastPaymentDate: this.getLastPaymentDate(payments),
        agingBuckets
      };

      // Update local state
      const currentBalances = this.accountBalances$.value;
      const existingIndex = currentBalances.findIndex(b => b.patientId === patientId);
      if (existingIndex >= 0) {
        currentBalances[existingIndex] = accountBalance;
      } else {
        currentBalances.push(accountBalance);
      }
      this.accountBalances$.next([...currentBalances]);

      return accountBalance;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to get account balance',
        details: { patientId, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Generate payment report
   */
  async generatePaymentReport(startDate: Date, endDate: Date): Promise<PaymentReport> {
    try {
      // Get all payments in date range
      const payments = await this.getPaymentsInDateRange(startDate, endDate);
      const adjustments = await this.getAdjustmentsInDateRange(startDate, endDate);

      // Calculate totals
      const totalCollections = this.sumAmounts(payments.map(p => p.paymentAmount || this.currencyService.createINRMoney(0)));
      const totalAdjustments = this.sumAmounts(adjustments.map(a => a.amount || this.currencyService.createINRMoney(0)));

      const insurancePayments = payments.filter(p => this.isInsurancePayment(p));
      const patientPayments = payments.filter(p => !this.isInsurancePayment(p));

      const insuranceCollections = this.sumAmounts(insurancePayments.map(p => p.paymentAmount || this.currencyService.createINRMoney(0)));
      const patientCollections = this.sumAmounts(patientPayments.map(p => p.paymentAmount || this.currencyService.createINRMoney(0)));

      const netCollections: Money = this.currencyService.createINRMoney(
        (totalCollections.value || 0) - (totalAdjustments.value || 0)
      );

      // Group by payer
      const collectionsByPayer = await this.groupPaymentsByPayer(insurancePayments);

      // Group by service type
      const collectionsByServiceType = await this.groupPaymentsByServiceType(payments);

      // Get aging summary
      const agingSummary = await this.getAgingSummary();

      const report: PaymentReport = {
        reportDate: new Date(),
        totalCollections,
        insuranceCollections,
        patientCollections,
        adjustments: totalAdjustments,
        netCollections,
        collectionsByPayer,
        collectionsByServiceType,
        agingSummary
      };

      // Store report
      const currentReports = this.paymentReports$.value;
      this.paymentReports$.next([report, ...currentReports.slice(0, 9)]); // Keep last 10 reports

      return report;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to generate payment report',
        details: { startDate, endDate, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get payment allocations
   */
  getPaymentAllocations(): Observable<PaymentAllocation[]> {
    return this.paymentAllocations$.asObservable();
  }

  /**
   * Get account balances
   */
  getAccountBalances(): Observable<AccountBalance[]> {
    return this.accountBalances$.asObservable();
  }

  /**
   * Get payment reports
   */
  getPaymentReports(): Observable<PaymentReport[]> {
    return this.paymentReports$.asObservable();
  }

  /**
   * Create payment adjustment
   */
  async createPaymentAdjustment(
    patientId: string,
    claimId: string,
    adjustment: Omit<PaymentAdjustment, 'id' | 'date'>
  ): Promise<PaymentAdjustment> {
    try {
      const paymentAdjustment: PaymentAdjustment = {
        ...adjustment,
        id: `adj-${Date.now()}`,
        date: new Date()
      };

      // Create FHIR resource for the adjustment
      const chargeItem: ChargeItem = {
        resourceType: 'ChargeItem',
        status: 'billable',
        code: {
          coding: [{
            system: 'http://lims.local/adjustments',
            code: adjustment.type,
            display: adjustment.reason
          }]
        },
        subject: {
          reference: `Patient/${patientId}`
        },
        context: {
          reference: `Claim/${claimId}`
        },
        occurrenceDateTime: new Date().toISOString(),
        quantity: {
          value: 1
        },
        priceOverride: {
          value: -Math.abs(adjustment.amount.value), // Negative for adjustment
          currency: adjustment.amount.currency
        },
        reason: [{
          text: adjustment.reason
        }]
      };

      await this.medplumService.createResource(chargeItem);

      // Update account balance
      await this.updateAccountBalance(patientId);

      return paymentAdjustment;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to create payment adjustment',
        details: { patientId, claimId, adjustment, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  // Private helper methods

  private async initializeReconciliation(): Promise<void> {
    try {
      // Subscribe to payment confirmations from Stripe
      this.stripePaymentService.getPaymentConfirmations().subscribe(
        confirmations => {
          confirmations.forEach(confirmation => {
            this.processPatientPayment(confirmation).catch(error => {
              console.error('Failed to process patient payment:', error);
            });
          });
        }
      );

      // Subscribe to claim responses from Candid Health
      this.candidHealthService.getSubmittedClaims().subscribe(
        claims => {
          claims.filter(claim => claim.status === 'paid').forEach(claim => {
            this.processInsurancePaymentFromCandid(claim).catch(error => {
              console.error('Failed to process insurance payment:', error);
            });
          });
        }
      );
    } catch (error) {
      console.error('Failed to initialize payment reconciliation:', error);
    }
  }

  private async processInsurancePaymentFromCandid(candidClaim: any): Promise<void> {
    // Convert Candid Health claim response to FHIR ClaimResponse
    const claimResponse = await this.convertCandidToClaimResponse(candidClaim);
    await this.processInsurancePayment(claimResponse);
  }

  private async convertCandidToClaimResponse(candidClaim: any): Promise<any> {
    // Implementation to convert Candid Health response to FHIR ClaimResponse
    return {
      resourceType: 'ClaimResponse',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      patient: { reference: `Patient/${candidClaim.patient_external_id}` },
      created: candidClaim.created_at,
      insurer: { display: 'Insurance Payer' },
      outcome: candidClaim.status === 'paid' ? 'complete' : 'error',
      payment: candidClaim.payment_info ? {
        type: { coding: [{ code: 'complete' }] },
        amount: {
          value: candidClaim.payment_info.amount_cents / 100,
          currency: 'USD'
        },
        date: candidClaim.payment_info.payment_date
      } : undefined
    };
  }

  private extractPaymentInfo(claimResponse: any): any {
    return {
      amount: claimResponse.payment?.amount,
      paymentDate: claimResponse.payment?.date,
      identifier: { value: claimResponse.id || '' }
    };
  }

  private createPaymentDetails(claimResponse: any): any[] {
    return [{
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/payment-type',
          code: 'payment',
          display: 'Payment'
        }]
      },
      request: claimResponse.request,
      date: claimResponse.payment?.date || new Date().toISOString(),
      amount: claimResponse.payment?.amount
    }];
  }

  private async createPaymentAllocation(
    claimResponse: any,
    paymentInfo: any,
    paymentSource: 'insurance' | 'patient' | 'other'
  ): Promise<void> {
    const allocation: PaymentAllocation = {
      id: `alloc-${Date.now()}`,
      claimId: claimResponse.request?.reference?.split('/')[1] || '',
      patientId: claimResponse.patient?.reference?.split('/')[1] || '',
      paymentSource,
      paymentMethod: 'eft',
      totalAmount: paymentInfo.amount,
      allocatedAmount: paymentInfo.amount,
      remainingAmount: this.currencyService.createMoney(0, paymentInfo.amount.currency),
      paymentDate: new Date(paymentInfo.paymentDate || new Date()),
      status: 'allocated',
      adjustments: []
    };

    const currentAllocations = this.paymentAllocations$.value;
    this.paymentAllocations$.next([...currentAllocations, allocation]);
  }

  private async createPatientPaymentAllocation(
    paymentConfirmation: any,
    invoice: any
  ): Promise<void> {
    const allocation: PaymentAllocation = {
      id: `alloc-${Date.now()}`,
      claimId: '',
      invoiceId: invoice.id,
      patientId: paymentConfirmation.patientId,
      paymentSource: 'patient',
      paymentMethod: 'credit_card',
      totalAmount: {
        value: paymentConfirmation.amount,
        currency: paymentConfirmation.currency
      },
      allocatedAmount: {
        value: paymentConfirmation.amount,
        currency: paymentConfirmation.currency
      },
      remainingAmount: { value: 0, currency: paymentConfirmation.currency },
      paymentDate: paymentConfirmation.paidAt,
      status: 'allocated',
      adjustments: []
    };

    const currentAllocations = this.paymentAllocations$.value;
    this.paymentAllocations$.next([...currentAllocations, allocation]);
  }

  private async findInvoiceByStripeId(stripeInvoiceId: string): Promise<any | null> {
    try {
      const invoices = await this.medplumService.searchResources<any>('Invoice', {
        identifier: stripeInvoiceId
      });
      return invoices.entry?.[0]?.resource || null;
    } catch (_error) {
      return null;
    }
  }

  private async updateAccountBalance(patientId: string): Promise<void> {
    try {
      await this.getAccountBalance(patientId);
    } catch (error) {
      console.error('Failed to update account balance:', error);
    }
  }

  private async getPatientCharges(patientId: string): Promise<any[]> {
    const invoices = await this.medplumService.searchResources<any>('Invoice', {
      subject: `Patient/${patientId}`
    });
    return invoices.entry?.map(e => e.resource!).filter(Boolean) || [];
  }

  private async getPatientPayments(_patientId: string): Promise<any[]> {
    const payments = await this.medplumService.searchResources<any>('PaymentReconciliation', {
      // This would need a proper search parameter for patient
    });
    return payments.entry?.map(e => e.resource!).filter(Boolean) || [];
  }

  private async getPatientAdjustments(_patientId: string): Promise<PaymentAdjustment[]> {
    // Implementation to get patient adjustments
    return [];
  }

  private sumAmounts(amounts: Money[]): Money {
    const total = amounts.reduce((sum, amount) => sum + (amount.value || 0), 0);
    return {
      value: total,
      currency: amounts[0]?.currency || 'USD'
    };
  }

  private async calculateInsuranceBalance(_patientId: string): Promise<Money> {
    // Implementation to calculate insurance balance
    return this.currencyService.createINRMoney(0);
  }

  private async calculateAgingBuckets(_patientId: string, charges: any[]): Promise<AgingBucket[]> {
    const now = new Date();
    const buckets: AgingBucket[] = [
      { label: 'Current', daysRange: { min: 0, max: 30 }, amount: this.currencyService.createINRMoney(0), count: 0 },
      { label: '31-60 days', daysRange: { min: 31, max: 60 }, amount: this.currencyService.createINRMoney(0), count: 0 },
      { label: '61-90 days', daysRange: { min: 61, max: 90 }, amount: this.currencyService.createINRMoney(0), count: 0 },
      { label: '90+ days', daysRange: { min: 91 }, amount: this.currencyService.createINRMoney(0), count: 0 }
    ];

    charges.forEach(charge => {
      const chargeDate = new Date(charge.date || '');
      const daysDiff = Math.floor((now.getTime() - chargeDate.getTime()) / (1000 * 60 * 60 * 24));

      const bucket = buckets.find(b =>
        daysDiff >= b.daysRange.min && (b.daysRange.max === undefined || daysDiff <= b.daysRange.max)
      );

      if (bucket && charge.totalNet) {
        bucket.amount.value += charge.totalNet.value || 0;
        bucket.count++;
      }
    });

    return buckets;
  }

  private getLastPaymentDate(payments: any[]): Date | undefined {
    if (payments.length === 0) { return undefined; }

    const dates = payments
      .map(p => new Date(p.paymentDate || ''))
      .filter(d => !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    return dates[0];
  }

  private async getPaymentsInDateRange(_startDate: Date, _endDate: Date): Promise<any[]> {
    // Implementation to get payments in date range
    return [];
  }

  private async getAdjustmentsInDateRange(_startDate: Date, _endDate: Date): Promise<PaymentAdjustment[]> {
    // Implementation to get adjustments in date range
    return [];
  }

  private isInsurancePayment(payment: any): boolean {
    return payment.paymentIssuer?.display !== 'Patient Payment';
  }

  private async groupPaymentsByPayer(_payments: any[]): Promise<PayerCollection[]> {
    // Implementation to group payments by payer
    return [];
  }

  private async groupPaymentsByServiceType(_payments: any[]): Promise<ServiceTypeCollection[]> {
    // Implementation to group payments by service type
    return [];
  }

  private async getAgingSummary(): Promise<AgingBucket[]> {
    // Implementation to get aging summary across all patients
    return [];
  }
}