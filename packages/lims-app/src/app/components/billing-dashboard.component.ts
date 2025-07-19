import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { Claim, DiagnosticReport, Invoice, Patient } from '@medplum/fhirtypes';
import { BillingService } from '../services/billing.service';
import {
  CandidHealthService,
  CandidHealthClaimResponse,
} from '../services/candid-health.service';
import {
  StripePaymentService,
  PaymentConfirmation,
} from '../services/stripe-payment.service';
import {
  PaymentReconciliationService,
  AccountBalance,
  PaymentReport,
} from '../services/payment-reconciliation.service';
import { MedplumService } from '../medplum.service';

interface BillingDashboardData {
  pendingClaims: Claim[];
  submittedClaims: CandidHealthClaimResponse[];
  recentPayments: PaymentConfirmation[];
  accountBalances: AccountBalance[];
  totalOutstanding: number;
  totalCollected: number;
  collectionRate: number;
}

@Component({
  selector: 'app-billing-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="billing-dashboard">
      <div class="dashboard-header">
        <h2>Revenue Cycle Management Dashboard</h2>
        <div class="dashboard-actions">
          <button (click)="generateReport()" class="btn btn-primary">
            Generate Report
          </button>
          <button (click)="refreshData()" class="btn btn-secondary">
            Refresh
          </button>
        </div>
      </div>

      <div class="dashboard-metrics" *ngIf="dashboardData$ | async as data">
        <div class="metric-card">
          <h3>Total Outstanding</h3>
          <div class="metric-value">
            \${{ data.totalOutstanding | number: '1.2-2' }}
          </div>
        </div>
        <div class="metric-card">
          <h3>Total Collected</h3>
          <div class="metric-value">
            \${{ data.totalCollected | number: '1.2-2' }}
          </div>
        </div>
        <div class="metric-card">
          <h3>Collection Rate</h3>
          <div class="metric-value">
            {{ data.collectionRate | number: '1.1-1' }}%
          </div>
        </div>
        <div class="metric-card">
          <h3>Pending Claims</h3>
          <div class="metric-value">{{ data.pendingClaims.length }}</div>
        </div>
      </div>

      <div class="dashboard-content">
        <div class="dashboard-section">
          <h3>Pending Claims</h3>
          <div class="claims-list" *ngIf="dashboardData$ | async as data">
            <div *ngFor="let claim of data.pendingClaims" class="claim-item">
              <div class="claim-info">
                <span class="claim-id">{{ claim.id }}</span>
                <span class="patient-name">{{ getPatientName(claim) }}</span>
                <span class="claim-amount"
                  >\${{ getClaimAmount(claim) | number: '1.2-2' }}</span
                >
              </div>
              <div class="claim-actions">
                <button
                  (click)="submitClaim(claim)"
                  class="btn btn-sm btn-primary"
                >
                  Submit
                </button>
                <button
                  (click)="viewClaim(claim)"
                  class="btn btn-sm btn-outline"
                >
                  View
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="dashboard-section">
          <h3>Recent Payments</h3>
          <div class="payments-list" *ngIf="dashboardData$ | async as data">
            <div
              *ngFor="let payment of data.recentPayments"
              class="payment-item"
            >
              <div class="payment-info">
                <span class="payment-amount"
                  >\${{ payment.amount | number: '1.2-2' }}</span
                >
                <span class="payment-date">{{
                  payment.paidAt | date: 'short'
                }}</span>
                <span
                  class="payment-status"
                  [class]="'status-' + payment.status"
                  >{{ payment.status }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <div class="dashboard-section">
          <h3>Account Balances</h3>
          <div class="balances-list" *ngIf="dashboardData$ | async as data">
            <div
              *ngFor="let balance of data.accountBalances"
              class="balance-item"
            >
              <div class="balance-info">
                <span class="patient-id">{{ balance.patientId }}</span>
                <span class="current-balance"
                  >\${{ balance.currentBalance.value | number: '1.2-2' }}</span
                >
                <span class="patient-balance"
                  >\${{ balance.patientBalance.value | number: '1.2-2' }}</span
                >
              </div>
              <div class="balance-actions">
                <button
                  (click)="sendStatement(balance)"
                  class="btn btn-sm btn-outline"
                >
                  Send Statement
                </button>
                <button
                  (click)="createPaymentLink(balance)"
                  class="btn btn-sm btn-primary"
                >
                  Payment Link
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="loading-overlay" *ngIf="isLoading">
        <div class="spinner"></div>
        <div>Loading...</div>
      </div>
    </div>
  `,
  styles: [
    `
      .billing-dashboard {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 1px solid #e0e0e0;
      }

      .dashboard-header h2 {
        margin: 0;
        color: #333;
      }

      .dashboard-actions {
        display: flex;
        gap: 10px;
      }

      .dashboard-metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }

      .metric-card {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        text-align: center;
      }

      .metric-card h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #666;
        text-transform: uppercase;
      }

      .metric-value {
        font-size: 24px;
        font-weight: bold;
        color: #333;
      }

      .dashboard-content {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 30px;
      }

      .dashboard-section {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .dashboard-section h3 {
        margin: 0 0 20px 0;
        color: #333;
        border-bottom: 2px solid #007bff;
        padding-bottom: 10px;
      }

      .claim-item,
      .payment-item,
      .balance-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 0;
        border-bottom: 1px solid #f0f0f0;
      }

      .claim-item:last-child,
      .payment-item:last-child,
      .balance-item:last-child {
        border-bottom: none;
      }

      .claim-info,
      .payment-info,
      .balance-info {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .claim-actions,
      .balance-actions {
        display: flex;
        gap: 10px;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        text-decoration: none;
        display: inline-block;
        text-align: center;
      }

      .btn-primary {
        background-color: #007bff;
        color: white;
      }

      .btn-secondary {
        background-color: #6c757d;
        color: white;
      }

      .btn-outline {
        background-color: transparent;
        color: #007bff;
        border: 1px solid #007bff;
      }

      .btn-sm {
        padding: 4px 8px;
        font-size: 12px;
      }

      .btn:hover {
        opacity: 0.8;
      }

      .status-succeeded {
        color: #28a745;
        font-weight: bold;
      }

      .status-failed {
        color: #dc3545;
        font-weight: bold;
      }

      .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #007bff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 10px;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class BillingDashboardComponent implements OnInit, OnDestroy {
  dashboardData$: Observable<BillingDashboardData>;
  isLoading = false;
  private destroy$ = new Subject<void>();

  constructor(
    private billingService: BillingService,
    private candidHealthService: CandidHealthService,
    private stripePaymentService: StripePaymentService,
    private paymentReconciliationService: PaymentReconciliationService,
    private medplumService: MedplumService,
  ) {
    this.dashboardData$ = this.createDashboardData();
  }

  ngOnInit(): void {
    this.refreshData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createDashboardData(): Observable<BillingDashboardData> {
    return combineLatest([
      this.billingService.getPendingClaims(),
      this.candidHealthService.getSubmittedClaims(),
      this.stripePaymentService.getPaymentConfirmations(),
      this.paymentReconciliationService.getAccountBalances(),
    ]).pipe(
      takeUntil(this.destroy$),
      map(
        ([pendingClaims, submittedClaims, recentPayments, accountBalances]) => {
          const totalOutstanding = accountBalances.reduce(
            (sum, balance) => sum + balance.currentBalance.value,
            0,
          );

          const totalCollected = recentPayments.reduce(
            (sum, payment) => sum + payment.amount,
            0,
          );

          const collectionRate =
            totalOutstanding > 0
              ? (totalCollected / (totalOutstanding + totalCollected)) * 100
              : 0;

          return {
            pendingClaims,
            submittedClaims,
            recentPayments: recentPayments.slice(0, 10), // Show last 10
            accountBalances: accountBalances.slice(0, 10), // Show first 10
            totalOutstanding,
            totalCollected,
            collectionRate,
          };
        },
      ),
    );
  }

  async refreshData(): Promise<void> {
    this.isLoading = true;
    try {
      // Trigger data refresh - in a real implementation, this would refresh the underlying data
      console.log('Refreshing billing dashboard data...');
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate loading
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async generateReport(): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1); // Last month

      const report =
        await this.paymentReconciliationService.generatePaymentReport(
          startDate,
          endDate,
        );
      console.log('Generated payment report:', report);

      // In a real implementation, this would download or display the report
      alert('Payment report generated successfully!');
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    }
  }

  async submitClaim(claim: Claim): Promise<void> {
    try {
      this.isLoading = true;
      const result = await this.billingService.submitClaim(claim);

      if (result.success) {
        alert('Claim submitted successfully!');
      } else {
        alert(`Failed to submit claim: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to submit claim:', error);
      alert('Failed to submit claim. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  viewClaim(claim: Claim): void {
    console.log('Viewing claim:', claim);
    // In a real implementation, this would navigate to a claim detail view
  }

  async sendStatement(balance: AccountBalance): Promise<void> {
    try {
      console.log('Sending statement for patient:', balance.patientId);
      // In a real implementation, this would generate and send a patient statement
      alert('Statement sent successfully!');
    } catch (error) {
      console.error('Failed to send statement:', error);
      alert('Failed to send statement. Please try again.');
    }
  }

  async createPaymentLink(balance: AccountBalance): Promise<void> {
    try {
      this.isLoading = true;

      const paymentRequest = {
        patientId: balance.patientId,
        amount: balance.patientBalance.value,
        currency: balance.patientBalance.currency,
        description: 'Laboratory Services Payment',
        metadata: {
          source: 'billing-dashboard',
        },
      };

      const result =
        await this.stripePaymentService.generatePaymentLink(paymentRequest);

      // Send payment link via email
      await this.stripePaymentService.sendPaymentLinkEmail(
        balance.patientId,
        result.paymentLink,
        result.invoice,
      );

      alert('Payment link created and sent to patient!');
    } catch (error) {
      console.error('Failed to create payment link:', error);
      alert('Failed to create payment link. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  getPatientName(claim: Claim): string {
    // In a real implementation, this would fetch patient name from the claim
    return 'Patient Name';
  }

  getClaimAmount(claim: Claim): number {
    return claim.total?.value || 0;
  }
}
