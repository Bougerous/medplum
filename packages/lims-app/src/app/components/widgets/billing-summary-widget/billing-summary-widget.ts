import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, interval } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { MedplumService } from '../../../medplum.service';

interface BillingSummaryData {
  totalRevenue: number;
  pendingClaims: number;
  paidClaims: number;
  deniedClaims: number;
  outstandingBalance: number;
  collectionRate: number;
  averageReimbursement: number;
  monthlyTrend: number;
  topPayors: PayorSummary[];
  recentActivity: BillingActivity[];
}

interface PayorSummary {
  name: string;
  amount: number;
  percentage: number;
  claimCount: number;
}

interface BillingActivity {
  id: string;
  type: 'claim_submitted' | 'payment_received' | 'claim_denied' | 'adjustment';
  description: string;
  amount: number;
  timestamp: Date;
  status: string;
}

@Component({
  selector: 'app-billing-summary-widget',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="billing-summary-widget">
      <div class="widget-header">
        <h4>{{ config.title || 'Billing Summary' }}</h4>
        <div class="period-selector">
          <select [(ngModel)]="selectedPeriod" (change)="onPeriodChange()">
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>
      
      <div class="billing-content">
        <div *ngIf="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading billing data...</p>
        </div>
        
        <div *ngIf="!isLoading" class="billing-data">
          <!-- Key Metrics -->
          <div class="metrics-grid">
            <div class="metric-card revenue">
              <div class="metric-icon">💰</div>
              <div class="metric-content">
                <div class="metric-value">\${{ billingData.totalRevenue | number:'1.0-0' }}</div>
                <div class="metric-label">Total Revenue</div>
                <div class="metric-trend" [ngClass]="getTrendClass(billingData.monthlyTrend)">
                  {{ billingData.monthlyTrend > 0 ? '+' : '' }}{{ billingData.monthlyTrend }}%
                </div>
              </div>
            </div>
            
            <div class="metric-card claims">
              <div class="metric-icon">📋</div>
              <div class="metric-content">
                <div class="metric-value">{{ billingData.pendingClaims }}</div>
                <div class="metric-label">Pending Claims</div>
                <div class="metric-sublabel">{{ billingData.paidClaims }} paid, {{ billingData.deniedClaims }} denied</div>
              </div>
            </div>
            
            <div class="metric-card collection">
              <div class="metric-icon">📊</div>
              <div class="metric-content">
                <div class="metric-value">{{ billingData.collectionRate }}%</div>
                <div class="metric-label">Collection Rate</div>
                <div class="metric-sublabel">\${{ billingData.averageReimbursement | number:'1.0-0' }} avg</div>
              </div>
            </div>
          </div>
          
          <!-- Outstanding Balance -->
          <div class="outstanding-section" *ngIf="billingData.outstandingBalance > 0">
            <div class="section-header">
              <h5>Outstanding Balance</h5>
              <span class="balance-amount">\${{ billingData.outstandingBalance | number:'1.0-0' }}</span>
            </div>
            <div class="balance-breakdown">
              <div class="balance-item">
                <span class="age-range">0-30 days</span>
                <span class="amount">\${{ (billingData.outstandingBalance * 0.6) | number:'1.0-0' }}</span>
              </div>
              <div class="balance-item">
                <span class="age-range">31-60 days</span>
                <span class="amount">\${{ (billingData.outstandingBalance * 0.25) | number:'1.0-0' }}</span>
              </div>
              <div class="balance-item">
                <span class="age-range">60+ days</span>
                <span class="amount warning">\${{ (billingData.outstandingBalance * 0.15) | number:'1.0-0' }}</span>
              </div>
            </div>
          </div>
          
          <!-- Top Payors -->
          <div class="payors-section" *ngIf="billingData.topPayors.length > 0">
            <h5>Top Payors</h5>
            <div class="payors-list">
              <div *ngFor="let payor of billingData.topPayors" class="payor-item">
                <div class="payor-info">
                  <span class="payor-name">{{ payor.name }}</span>
                  <span class="claim-count">{{ payor.claimCount }} claims</span>
                </div>
                <div class="payor-amount">
                  <span class="amount">\${{ payor.amount | number:'1.0-0' }}</span>
                  <span class="percentage">{{ payor.percentage }}%</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Recent Activity -->
          <div class="activity-section" *ngIf="billingData.recentActivity.length > 0">
            <h5>Recent Activity</h5>
            <div class="activity-list">
              <div *ngFor="let activity of billingData.recentActivity" class="activity-item">
                <div class="activity-icon" [ngClass]="activity.type">
                  {{ getActivityIcon(activity.type) }}
                </div>
                <div class="activity-content">
                  <div class="activity-description">{{ activity.description }}</div>
                  <div class="activity-time">{{ activity.timestamp | date:'short' }}</div>
                </div>
                <div class="activity-amount" [ngClass]="getAmountClass(activity.type)">
                  {{ activity.amount > 0 ? '+' : '' }}\${{ activity.amount | number:'1.0-0' }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="widget-actions">
          <button class="action-btn primary" routerLink="/billing">
            View Details
          </button>
          <button class="action-btn secondary" routerLink="/billing/claims">
            Manage Claims
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './billing-summary-widget.scss'
})
export class BillingSummaryWidget implements OnInit, OnDestroy {
  @Input() config: any = {};
  
  private destroy$ = new Subject<void>();
  
  billingData: BillingSummaryData = this.getEmptyBillingData();
  isLoading = true;
  selectedPeriod = 'month';

  constructor(private medplumService: MedplumService) {}

  ngOnInit(): void {
    this.selectedPeriod = this.config.period || 'month';
    this.loadBillingData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadBillingData(): Promise<void> {
    try {
      this.isLoading = true;
      
      // In a real implementation, this would make API calls to get billing data
      // For now, we'll use mock data
      await this.delay(1000); // Simulate API call
      this.billingData = this.getMockBillingData();
      
    } catch (error) {
      console.error('Failed to load billing data:', error);
      this.billingData = this.getMockBillingData();
    } finally {
      this.isLoading = false;
    }
  }

  private startAutoRefresh(): void {
    const refreshInterval = this.config.refreshInterval || 300000; // 5 minutes default
    
    interval(refreshInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.loadBillingData())
      )
      .subscribe();
  }

  onPeriodChange(): void {
    this.loadBillingData();
  }

  getTrendClass(trend: number): string {
    if (trend > 0) return 'trend-positive';
    if (trend < 0) return 'trend-negative';
    return 'trend-neutral';
  }

  getActivityIcon(type: string): string {
    const iconMap: { [key: string]: string } = {
      'claim_submitted': '📤',
      'payment_received': '💳',
      'claim_denied': '❌',
      'adjustment': '⚖️'
    };
    return iconMap[type] || '📄';
  }

  getAmountClass(type: string): string {
    if (type === 'payment_received') return 'amount-positive';
    if (type === 'claim_denied' || type === 'adjustment') return 'amount-negative';
    return 'amount-neutral';
  }

  private getEmptyBillingData(): BillingSummaryData {
    return {
      totalRevenue: 0,
      pendingClaims: 0,
      paidClaims: 0,
      deniedClaims: 0,
      outstandingBalance: 0,
      collectionRate: 0,
      averageReimbursement: 0,
      monthlyTrend: 0,
      topPayors: [],
      recentActivity: []
    };
  }

  private getMockBillingData(): BillingSummaryData {
    const now = new Date();
    return {
      totalRevenue: 125000,
      pendingClaims: 23,
      paidClaims: 187,
      deniedClaims: 8,
      outstandingBalance: 45000,
      collectionRate: 92.5,
      averageReimbursement: 650,
      monthlyTrend: 8.3,
      topPayors: [
        { name: 'Medicare', amount: 45000, percentage: 36, claimCount: 67 },
        { name: 'Blue Cross', amount: 32000, percentage: 26, claimCount: 49 },
        { name: 'Aetna', amount: 28000, percentage: 22, claimCount: 43 },
        { name: 'Cigna', amount: 20000, percentage: 16, claimCount: 31 }
      ],
      recentActivity: [
        {
          id: '1',
          type: 'payment_received',
          description: 'Payment received from Medicare',
          amount: 2500,
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          status: 'completed'
        },
        {
          id: '2',
          type: 'claim_submitted',
          description: 'Claim submitted to Blue Cross',
          amount: 850,
          timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000),
          status: 'pending'
        },
        {
          id: '3',
          type: 'claim_denied',
          description: 'Claim denied by Aetna - Missing documentation',
          amount: -1200,
          timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000),
          status: 'denied'
        },
        {
          id: '4',
          type: 'adjustment',
          description: 'Contractual adjustment applied',
          amount: -150,
          timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000),
          status: 'processed'
        }
      ]
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}