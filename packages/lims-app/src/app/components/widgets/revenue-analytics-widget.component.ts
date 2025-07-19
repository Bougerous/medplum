import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval } from 'rxjs';
import { takeUntil, startWith, switchMap } from 'rxjs/operators';
import { AnalyticsService } from '../../services/analytics.service';
import { AnalyticsMetric } from '../../types/fhir-types';

interface RevenueBreakdown {
  category: string;
  amount: number;
  percentage: number;
  change: number;
  changePercent: number;
}

interface PaymentMetrics {
  totalBilled: number;
  totalCollected: number;
  collectionRate: number;
  averageReimbursement: number;
  daysInAR: number;
}

interface RevenueTarget {
  period: string;
  target: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

@Component({
  selector: 'app-revenue-analytics-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Revenue Analytics</h3>
        <div class="header-controls">
          <div class="view-toggle">
            <button 
              *ngFor="let view of viewTypes" 
              [class.active]="activeView === view.key"
              (click)="setView(view.key)"
              class="toggle-btn">
              {{ view.label }}
            </button>
          </div>
          <div class="refresh-indicator" [class.refreshing]="isRefreshing">
            <span class="refresh-icon">⟳</span>
          </div>
        </div>
      </div>
      
      <div class="widget-content">
        <!-- Revenue Overview -->
        <div class="revenue-overview" *ngIf="activeView === 'overview'">
          <div class="revenue-summary">
            <div class="summary-cards">
              <div class="summary-card total-revenue">
                <div class="card-header">
                  <span class="card-title">Total Revenue</span>
                  <span class="card-icon">💰</span>
                </div>
                <div class="card-content">
                  <div class="metric-value">${{ getTotalRevenue() | number:'1.0-0' }}</div>
                  <div class="metric-change" [class]="getRevenueTrend()">
                    <span class="change-icon">{{ getChangeIcon(getRevenueTrend()) }}</span>
                    <span class="change-text">{{ getRevenueChangeText() }}</span>
                  </div>
                </div>
              </div>
              
              <div class="summary-card monthly-revenue">
                <div class="card-header">
                  <span class="card-title">This Month</span>
                  <span class="card-icon">📅</span>
                </div>
                <div class="card-content">
                  <div class="metric-value">${{ getMonthlyRevenue() | number:'1.0-0' }}</div>
                  <div class="metric-change" [class]="getMonthlyTrend()">
                    <span class="change-icon">{{ getChangeIcon(getMonthlyTrend()) }}</span>
                    <span class="change-text">{{ getMonthlyChangeText() }}</span>
                  </div>
                </div>
              </div>
              
              <div class="summary-card collection-rate">
                <div class="card-header">
                  <span class="card-title">Collection Rate</span>
                  <span class="card-icon">📊</span>
                </div>
                <div class="card-content">
                  <div class="metric-value">{{ getCollectionRate() | number:'1.1-1' }}%</div>
                  <div class="metric-change" [class]="getCollectionTrend()">
                    <span class="change-icon">{{ getChangeIcon(getCollectionTrend()) }}</span>
                    <span class="change-text">{{ getCollectionChangeText() }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="revenue-breakdown">
            <div class="section-header">
              <h4>Revenue by Category</h4>
              <div class="period-filter">
                <button 
                  *ngFor="let period of timePeriods" 
                  [class.active]="activePeriod === period.key"
                  (click)="setTimePeriod(period.key)"
                  class="filter-btn">
                  {{ period.label }}
                </button>
              </div>
            </div>
            
            <div class="breakdown-chart">
              <div class="chart-container">
                <div class="pie-chart">
                  <div class="chart-center">
                    <div class="center-value">${{ getTotalRevenue() | number:'1.0-0' }}</div>
                    <div class="center-label">Total</div>
                  </div>
                </div>
                <div class="chart-legend">
                  <div 
                    *ngFor="let item of getRevenueBreakdown(); let i = index" 
                    class="legend-item">
                    <span class="legend-color" [style.background-color]="getChartColor(i)"></span>
                    <span class="legend-label">{{ item.category }}</span>
                    <span class="legend-value">${{ item.amount | number:'1.0-0' }}</span>
                    <span class="legend-percent">({{ item.percentage | number:'1.0-0' }}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Analysis -->
        <div class="payment-analysis" *ngIf="activeView === 'payments'">
          <div class="section-header">
            <h4>Payment Analysis</h4>
          </div>
          
          <div class="payment-metrics">
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="metric-label">Total Billed</div>
                <div class="metric-value">${{ getPaymentMetrics().totalBilled | number:'1.0-0' }}</div>
                <div class="metric-description">Amount billed to payers</div>
              </div>
              
              <div class="metric-card">
                <div class="metric-label">Total Collected</div>
                <div class="metric-value">${{ getPaymentMetrics().totalCollected | number:'1.0-0' }}</div>
                <div class="metric-description">Amount actually received</div>
              </div>
              
              <div class="metric-card">
                <div class="metric-label">Avg Reimbursement</div>
                <div class="metric-value">${{ getPaymentMetrics().averageReimbursement | number:'1.0-0' }}</div>
                <div class="metric-description">Per test reimbursement</div>
              </div>
              
              <div class="metric-card">
                <div class="metric-label">Days in A/R</div>
                <div class="metric-value">{{ getPaymentMetrics().daysInAR | number:'1.0-0' }}</div>
                <div class="metric-description">Average collection time</div>
              </div>
            </div>
          </div>
          
          <div class="payment-trends">
            <div class="section-header">
              <h5>Payment Trends</h5>
            </div>
            
            <div class="trends-chart">
              <div class="chart-container">
                <div class="chart-area">
                  <div class="chart-bars">
                    <div 
                      *ngFor="let data of getPaymentTrendData()" 
                      class="trend-bar">
                      <div class="bar-group">
                        <div 
                          class="bar billed" 
                          [style.height.%]="(data.billed / getMaxPaymentValue()) * 100">
                        </div>
                        <div 
                          class="bar collected" 
                          [style.height.%]="(data.collected / getMaxPaymentValue()) * 100">
                        </div>
                      </div>
                      <div class="bar-label">{{ data.period }}</div>
                    </div>
                  </div>
                </div>
                <div class="chart-legend">
                  <div class="legend-item">
                    <span class="legend-color billed"></span>
                    <span class="legend-text">Billed</span>
                  </div>
                  <div class="legend-item">
                    <span class="legend-color collected"></span>
                    <span class="legend-text">Collected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Targets -->
        <div class="performance-targets" *ngIf="activeView === 'targets'">
          <div class="section-header">
            <h4>Performance vs Targets</h4>
          </div>
          
          <div class="targets-list">
            <div 
              *ngFor="let target of getRevenueTargets()" 
              class="target-item"
              [class.over-target]="target.actual > target.target"
              [class.under-target]="target.actual < target.target">
              
              <div class="target-info">
                <div class="target-period">{{ target.period }}</div>
                <div class="target-details">
                  <span class="actual-value">${{ target.actual | number:'1.0-0' }} actual</span>
                  <span class="target-value">${{ target.target | number:'1.0-0' }} target</span>
                </div>
              </div>
              
              <div class="target-progress">
                <div class="progress-bar">
                  <div 
                    class="progress-fill" 
                    [style.width.%]="getTargetProgressPercentage(target)"
                    [class.over-target]="target.actual > target.target">
                  </div>
                </div>
                <div class="progress-text">
                  {{ getTargetProgressText(target) }}
                </div>
              </div>
              
              <div class="target-variance">
                <div class="variance-amount" [class]="target.variance >= 0 ? 'positive' : 'negative'">
                  {{ target.variance >= 0 ? '+' : '' }}${{ target.variance | number:'1.0-0' }}
                </div>
                <div class="variance-percent" [class]="target.variancePercent >= 0 ? 'positive' : 'negative'">
                  {{ target.variancePercent >= 0 ? '+' : '' }}{{ target.variancePercent | number:'1.1-1' }}%
                </div>
              </div>
            </div>
          </div>
          
          <div class="targets-summary">
            <div class="summary-item">
              <span class="summary-label">Targets Met:</span>
              <span class="summary-value">{{ getTargetsMet() }}/{{ getRevenueTargets().length }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Overall Performance:</span>
              <span class="summary-value" [class]="getOverallPerformanceClass()">
                {{ getOverallPerformance() | number:'1.1-1' }}%
              </span>
            </div>
          </div>
        </div>

        <div *ngIf="revenueMetrics.length === 0" class="empty-state">
          <div class="empty-icon">💰</div>
          <p>No revenue data available</p>
          <button (click)="refreshData()" class="refresh-btn">Refresh Data</button>
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

    .header-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .view-toggle {
      display: flex;
      gap: 0.25rem;
    }

    .toggle-btn {
      padding: 0.25rem 0.75rem;
      border: 1px solid #ddd;
      background: white;
      border-radius: 16px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .toggle-btn:hover {
      background: #f5f5f5;
    }

    .toggle-btn.active {
      background: #27ae60;
      color: white;
      border-color: #27ae60;
    }

    .refresh-indicator {
      display: flex;
      align-items: center;
      color: #7f8c8d;
    }

    .refresh-indicator.refreshing .refresh-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .widget-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 1rem;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      padding: 1rem;
      border-radius: 6px;
      border: none;
      color: white;
      transition: all 0.2s;
    }

    .summary-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .summary-card.total-revenue {
      background: linear-gradient(135deg, #27ae60, #229954);
    }

    .summary-card.monthly-revenue {
      background: linear-gradient(135deg, #3498db, #2980b9);
    }

    .summary-card.collection-rate {
      background: linear-gradient(135deg, #f39c12, #e67e22);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .card-title {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .card-icon {
      font-size: 1.25rem;
    }

    .metric-value {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .metric-change {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .section-header h4, .section-header h5 {
      margin: 0;
      color: #333;
    }

    .period-filter {
      display: flex;
      gap: 0.25rem;
    }

    .filter-btn {
      padding: 0.25rem 0.75rem;
      border: 1px solid #ddd;
      background: white;
      border-radius: 16px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      background: #f5f5f5;
    }

    .filter-btn.active {
      background: #27ae60;
      color: white;
      border-color: #27ae60;
    }

    .chart-container {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 1rem;
    }

    .pie-chart {
      position: relative;
      width: 200px;
      height: 200px;
      margin: 0 auto 1rem;
      border-radius: 50%;
      background: conic-gradient(
        #27ae60 0deg 120deg,
        #3498db 120deg 240deg,
        #f39c12 240deg 300deg,
        #e74c3c 300deg 360deg
      );
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chart-center {
      width: 120px;
      height: 120px;
      background: white;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .center-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #2c3e50;
    }

    .center-label {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .chart-legend {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    .legend-label {
      flex: 1;
      font-size: 0.875rem;
      color: #2c3e50;
    }

    .legend-value {
      font-weight: 600;
      color: #2c3e50;
    }

    .legend-percent {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .metric-card {
      padding: 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      text-align: center;
    }

    .metric-label {
      font-size: 0.875rem;
      color: #7f8c8d;
      margin-bottom: 0.5rem;
    }

    .metric-card .metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #27ae60;
      margin-bottom: 0.25rem;
    }

    .metric-description {
      font-size: 0.75rem;
      color: #7f8c8d;
    }

    .chart-area {
      height: 200px;
      margin-bottom: 1rem;
    }

    .chart-bars {
      display: flex;
      align-items: end;
      gap: 1rem;
      height: 100%;
    }

    .trend-bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .bar-group {
      display: flex;
      gap: 2px;
      align-items: end;
      height: 100%;
    }

    .bar {
      width: 20px;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s ease;
    }

    .bar.billed {
      background: #3498db;
    }

    .bar.collected {
      background: #27ae60;
    }

    .bar-label {
      font-size: 0.75rem;
      color: #7f8c8d;
      margin-top: 0.5rem;
    }

    .legend-color.billed {
      background: #3498db;
    }

    .legend-color.collected {
      background: #27ae60;
    }

    .legend-text {
      font-size: 0.75rem;
      color: #7f8c8d;
    }

    .targets-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .target-item {
      display: flex;
      align-items: center;
      padding: 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .target-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .target-item.over-target {
      border-left: 4px solid #27ae60;
    }

    .target-item.under-target {
      border-left: 4px solid #e74c3c;
    }

    .target-info {
      flex: 0 0 200px;
    }

    .target-period {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }

    .target-details {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .target-details span {
      display: block;
    }

    .target-progress {
      flex: 1;
      margin: 0 1rem;
    }

    .progress-bar {
      height: 8px;
      background: #ecf0f1;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.25rem;
    }

    .progress-fill {
      height: 100%;
      background: #27ae60;
      transition: width 0.3s ease;
    }

    .progress-fill.over-target {
      background: #27ae60;
    }

    .progress-text {
      font-size: 0.75rem;
      color: #7f8c8d;
      text-align: center;
    }

    .target-variance {
      text-align: right;
    }

    .variance-amount {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .variance-amount.positive {
      color: #27ae60;
    }

    .variance-amount.negative {
      color: #e74c3c;
    }

    .variance-percent {
      font-size: 0.875rem;
    }

    .variance-percent.positive {
      color: #27ae60;
    }

    .variance-percent.negative {
      color: #e74c3c;
    }

    .targets-summary {
      display: flex;
      justify-content: space-between;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .summary-label {
      font-size: 0.875rem;
      color: #7f8c8d;
      margin-bottom: 0.25rem;
    }

    .summary-value {
      font-weight: 600;
      color: #2c3e50;
    }

    .summary-value.good {
      color: #27ae60;
    }

    .summary-value.warning {
      color: #f39c12;
    }

    .summary-value.critical {
      color: #e74c3c;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #7f8c8d;
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .refresh-btn {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      background: #27ae60;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .refresh-btn:hover {
      background: #229954;
    }
  `]
})
export class RevenueAnalyticsWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { refreshInterval: 300000 }; // 5 minutes

  revenueMetrics: AnalyticsMetric[] = [];
  isRefreshing = false;
  activeView = 'overview';
  activePeriod = '30d';

  viewTypes = [
    { key: 'overview', label: 'Overview' },
    { key: 'payments', label: 'Payments' },
    { key: 'targets', label: 'Targets' }
  ];

  timePeriods = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' }
  ];

  constructor(private analyticsService: AnalyticsService) {}

  ngOnInit(): void {
    this.initializeData();
    this.setupAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeData(): void {
    this.refreshData();
  }

  private setupAutoRefresh(): void {
    const refreshInterval = this.config.refreshInterval || 300000;
    
    interval(refreshInterval).pipe(
      takeUntil(this.destroy$),
      startWith(0),
      switchMap(() => this.loadRevenueMetrics())
    ).subscribe();
  }

  async refreshData(): Promise<void> {
    this.isRefreshing = true;
    await this.loadRevenueMetrics();
    this.isRefreshing = false;
  }

  private async loadRevenueMetrics(): Promise<void> {
    try {
      const dateRange = this.getDateRangeForPeriod(this.activePeriod);
      this.revenueMetrics = await this.analyticsService.getRevenueMetrics(dateRange);
    } catch (error) {
      console.error('Failed to load revenue metrics:', error);
      this.revenueMetrics = [];
    }
  }

  setView(view: string): void {
    this.activeView = view;
  }

  setTimePeriod(period: string): void {
    this.activePeriod = period;
    this.refreshData();
  }

  getTotalRevenue(): number {
    const totalMetric = this.revenueMetrics.find(m => m.name === 'Total Revenue');
    return totalMetric?.value || 0;
  }

  getMonthlyRevenue(): number {
    const monthlyMetric = this.revenueMetrics.find(m => m.name === 'Monthly Revenue');
    return monthlyMetric?.value || 0;
  }

  getCollectionRate(): number {
    // Mock calculation - would be based on actual payment data
    return 87.5;
  }

  getRevenueTrend(): 'up' | 'down' | 'stable' {
    const totalMetric = this.revenueMetrics.find(m => m.name === 'Total Revenue');
    return totalMetric?.trend || 'stable';
  }

  getMonthlyTrend(): 'up' | 'down' | 'stable' {
    const monthlyMetric = this.revenueMetrics.find(m => m.name === 'Monthly Revenue');
    return monthlyMetric?.trend || 'stable';
  }

  getCollectionTrend(): 'up' | 'down' | 'stable' {
    return 'stable'; // Mock data
  }

  getChangeIcon(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
    }
  }

  getRevenueChangeText(): string {
    return '+12.5% vs last period';
  }

  getMonthlyChangeText(): string {
    return '+8.3% vs last month';
  }

  getCollectionChangeText(): string {
    return '+2.1% vs last period';
  }

  getRevenueBreakdown(): RevenueBreakdown[] {
    const total = this.getTotalRevenue();
    
    return [
      {
        category: 'Histopathology',
        amount: total * 0.45,
        percentage: 45,
        change: 5200,
        changePercent: 8.2
      },
      {
        category: 'Microbiology',
        amount: total * 0.30,
        percentage: 30,
        change: 2800,
        changePercent: 6.1
      },
      {
        category: 'Chemistry',
        amount: total * 0.15,
        percentage: 15,
        change: 1200,
        changePercent: 4.5
      },
      {
        category: 'Other',
        amount: total * 0.10,
        percentage: 10,
        change: 800,
        changePercent: 3.2
      }
    ];
  }

  getChartColor(index: number): string {
    const colors = ['#27ae60', '#3498db', '#f39c12', '#e74c3c'];
    return colors[index % colors.length];
  }

  getPaymentMetrics(): PaymentMetrics {
    const totalRevenue = this.getTotalRevenue();
    
    return {
      totalBilled: totalRevenue * 1.15, // Assuming some write-offs
      totalCollected: totalRevenue,
      collectionRate: 87.5,
      averageReimbursement: 125,
      daysInAR: 42
    };
  }

  getPaymentTrendData(): Array<{period: string, billed: number, collected: number}> {
    return [
      { period: 'Jan', billed: 45000, collected: 39000 },
      { period: 'Feb', billed: 52000, collected: 45000 },
      { period: 'Mar', billed: 48000, collected: 42000 },
      { period: 'Apr', billed: 55000, collected: 48000 },
      { period: 'May', billed: 51000, collected: 44000 },
      { period: 'Jun', billed: 58000, collected: 51000 }
    ];
  }

  getMaxPaymentValue(): number {
    const data = this.getPaymentTrendData();
    return Math.max(...data.map(d => Math.max(d.billed, d.collected)));
  }

  getRevenueTargets(): RevenueTarget[] {
    return [
      {
        period: 'Q1 2025',
        target: 150000,
        actual: 165000,
        variance: 15000,
        variancePercent: 10.0
      },
      {
        period: 'Q2 2025',
        target: 160000,
        actual: 145000,
        variance: -15000,
        variancePercent: -9.4
      },
      {
        period: 'Q3 2025',
        target: 170000,
        actual: 180000,
        variance: 10000,
        variancePercent: 5.9
      },
      {
        period: 'Q4 2025',
        target: 175000,
        actual: 172000,
        variance: -3000,
        variancePercent: -1.7
      }
    ];
  }

  getTargetProgressPercentage(target: RevenueTarget): number {
    return Math.min((target.actual / target.target) * 100, 100);
  }

  getTargetProgressText(target: RevenueTarget): string {
    const percentage = (target.actual / target.target) * 100;
    if (percentage >= 100) {
      return `${(percentage - 100).toFixed(1)}% over target`;
    } else {
      return `${(100 - percentage).toFixed(1)}% below target`;
    }
  }

  getTargetsMet(): number {
    return this.getRevenueTargets().filter(target => target.actual >= target.target).length;
  }

  getOverallPerformance(): number {
    const targets = this.getRevenueTargets();
    const totalActual = targets.reduce((sum, target) => sum + target.actual, 0);
    const totalTarget = targets.reduce((sum, target) => sum + target.target, 0);
    return (totalActual / totalTarget) * 100;
  }

  getOverallPerformanceClass(): string {
    const performance = this.getOverallPerformance();
    if (performance >= 100) return 'good';
    if (performance >= 90) return 'warning';
    return 'critical';
  }

  private getDateRangeForPeriod(period: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
      case '30d':
        start.setDate(end.getDate() - 30);
        break;
      case '90d':
        start.setDate(end.getDate() - 90);
        break;
    }

    return { start, end };
  }
}