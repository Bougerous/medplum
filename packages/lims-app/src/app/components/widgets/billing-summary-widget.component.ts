import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MedplumService } from '../../medplum.service';

interface BillingSummary {
  totalRevenue: number;
  pendingClaims: number;
  paidClaims: number;
  deniedClaims: number;
  outstandingBalance: number;
  collectionRate: number;
  averageReimbursement: number;
  monthlyGrowth: number;
}

interface RecentClaim {
  id: string;
  patientName: string;
  serviceDate: Date;
  amount: number;
  status: 'submitted' | 'paid' | 'denied' | 'pending';
  insurancePayer: string;
}

@Component({
  selector: 'app-billing-summary-widget',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Billing Summary</h3>
        <select [(ngModel)]="selectedPeriod" (change)="onPeriodChange()" class="period-selector">
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
        </select>
      </div>
      
      <div class="widget-content">
        <div class="summary-metrics">
          <div class="metric-card revenue">
            <div class="metric-value">{{ summary.totalRevenue | currency }}</div>
            <div class="metric-label">Total Revenue</div>
            <div class="metric-change" [class.positive]="summary.monthlyGrowth > 0">
              {{ summary.monthlyGrowth > 0 ? '+' : '' }}{{ summary.monthlyGrowth | number:'1.1-1' }}%
            </div>
          </div>
          
          <div class="metric-card claims">
            <div class="metric-value">{{ summary.pendingClaims }}</div>
            <div class="metric-label">Pending Claims</div>
            <div class="metric-sublabel">{{ summary.paidClaims }} paid, {{ summary.deniedClaims }} denied</div>
          </div>
          
          <div class="metric-card collection">
            <div class="metric-value">{{ summary.collectionRate | number:'1.1-1' }}%</div>
            <div class="metric-label">Collection Rate</div>
            <div class="metric-sublabel">{{ summary.outstandingBalance | currency }} outstanding</div>
          </div>
          
          <div class="metric-card reimbursement">
            <div class="metric-value">{{ summary.averageReimbursement | currency }}</div>
            <div class="metric-label">Avg Reimbursement</div>
          </div>
        </div>
        
        <div class="recent-claims">
          <h4>Recent Claims</h4>
          <div class="claims-list">
            <div *ngFor="let claim of recentClaims" class="claim-item">
              <div class="claim-info">
                <div class="patient-name">{{ claim.patientName }}</div>
                <div class="claim-details">
                  <span class="service-date">{{ claim.serviceDate | date:'short' }}</span>
                  <span class="insurance">{{ claim.insurancePayer }}</span>
                </div>
              </div>
              
              <div class="claim-amount">
                {{ claim.amount | currency }}
              </div>
              
              <div class="claim-status">
                <span class="status-badge" [class]="'status-' + claim.status">
                  {{ claim.status | titlecase }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .widget-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .widget-header {
      padding: 1rem;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .widget-header h3 {
      margin: 0;
      color: #333;
    }

    .period-selector {
      padding: 0.25rem 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .widget-content {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
    }

    .summary-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .metric-card {
      padding: 1rem;
      border-radius: 6px;
      text-align: center;
    }

    .metric-card.revenue {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: white;
    }

    .metric-card.claims {
      background: linear-gradient(135deg, #3498db, #5dade2);
      color: white;
    }

    .metric-card.collection {
      background: linear-gradient(135deg, #e67e22, #f39c12);
      color: white;
    }

    .metric-card.reimbursement {
      background: linear-gradient(135deg, #9b59b6, #bb8fce);
      color: white;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .metric-label {
      font-size: 0.875rem;
      opacity: 0.9;
      margin-bottom: 0.25rem;
    }

    .metric-sublabel {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .metric-change {
      font-size: 0.75rem;
      margin-top: 0.25rem;
    }

    .metric-change.positive {
      color: #2ecc71;
    }

    .recent-claims h4 {
      margin: 0 0 1rem 0;
      color: #333;
    }

    .claims-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .claim-item {
      display: flex;
      align-items: center;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .claim-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .claim-info {
      flex: 1;
    }

    .patient-name {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }

    .claim-details {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .claim-details span {
      margin-right: 1rem;
    }

    .claim-amount {
      font-weight: 600;
      color: #27ae60;
      margin: 0 1rem;
    }

    .status-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-badge.status-submitted {
      background: #3498db;
      color: white;
    }

    .status-badge.status-paid {
      background: #27ae60;
      color: white;
    }

    .status-badge.status-denied {
      background: #e74c3c;
      color: white;
    }

    .status-badge.status-pending {
      background: #f39c12;
      color: white;
    }
  `]
})
export class BillingSummaryWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { period: 'month' };

  selectedPeriod = 'month';
  summary: BillingSummary = {
    totalRevenue: 0,
    pendingClaims: 0,
    paidClaims: 0,
    deniedClaims: 0,
    outstandingBalance: 0,
    collectionRate: 0,
    averageReimbursement: 0,
    monthlyGrowth: 0
  };

  recentClaims: RecentClaim[] = [];

  constructor(private medplumService: MedplumService) {}

  ngOnInit(): void {
    this.selectedPeriod = this.config.period || 'month';
    this.loadBillingData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPeriodChange(): void {
    this.loadBillingData();
  }

  private async loadBillingData(): Promise<void> {
    try {
      // In a real implementation, this would fetch actual billing data
      // For now, we'll use mock data
      this.summary = {
        totalRevenue: 125430,
        pendingClaims: 23,
        paidClaims: 156,
        deniedClaims: 8,
        outstandingBalance: 34250,
        collectionRate: 87.5,
        averageReimbursement: 245.80,
        monthlyGrowth: 12.3
      };

      this.recentClaims = [
        {
          id: '1',
          patientName: 'John Smith',
          serviceDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          amount: 450.00,
          status: 'paid',
          insurancePayer: 'Blue Cross'
        },
        {
          id: '2',
          patientName: 'Jane Doe',
          serviceDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          amount: 320.00,
          status: 'pending',
          insurancePayer: 'Aetna'
        },
        {
          id: '3',
          patientName: 'Bob Johnson',
          serviceDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          amount: 180.00,
          status: 'submitted',
          insurancePayer: 'Medicare'
        },
        {
          id: '4',
          patientName: 'Alice Wilson',
          serviceDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
          amount: 275.00,
          status: 'denied',
          insurancePayer: 'Cigna'
        }
      ];
    } catch (error) {
      console.error('Failed to load billing data:', error);
    }
  }
}