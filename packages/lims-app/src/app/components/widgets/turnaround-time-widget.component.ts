import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { interval, Subject } from 'rxjs';
import { startWith, switchMap, takeUntil } from 'rxjs/operators';
import { AnalyticsService } from '../../services/analytics.service';
import { TurnaroundTimeMetric } from '../../types/fhir-types';

@Component({
  selector: 'app-turnaround-time-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Turnaround Time Performance</h3>
        <div class="refresh-indicator" [class.refreshing]="isRefreshing">
          <span class="refresh-icon">⟳</span>
        </div>
      </div>
      
      <div class="widget-content">
        <div class="metrics-summary">
          <div class="summary-card overall">
            <div class="metric-value">{{ getOverallAverage() | number:'1.1-1' }}h</div>
            <div class="metric-label">Overall Average</div>
            <div class="metric-trend" [class]="getOverallTrend()">
              <span class="trend-icon">{{ getTrendIcon(getOverallTrend()) }}</span>
              <span class="trend-text">{{ getTrendText(getOverallTrend()) }}</span>
            </div>
          </div>
          
          <div class="summary-card target">
            <div class="metric-value">{{ getTargetCompliance() | number:'1.0-0' }}%</div>
            <div class="metric-label">Target Compliance</div>
            <div class="metric-trend" [class]="getComplianceTrend()">
              <span class="trend-icon">{{ getTrendIcon(getComplianceTrend()) }}</span>
            </div>
          </div>
        </div>

        <div class="specialty-metrics">
          <div class="section-header">
            <h4>By Specialty</h4>
            <div class="time-filter">
              <button 
                *ngFor="let period of timePeriods" 
                [class.active]="activePeriod === period.key"
                (click)="setTimePeriod(period.key)"
                class="filter-btn">
                {{ period.label }}
              </button>
            </div>
          </div>
          
          <div class="specialty-list">
            <div 
              *ngFor="let metric of turnaroundMetrics" 
              class="specialty-item"
              [class.over-target]="metric.actual > metric.target">
              
              <div class="specialty-info">
                <div class="specialty-name">{{ metric.specialty }}</div>
                <div class="specialty-details">
                  <span class="actual-time">{{ metric.actual | number:'1.1-1' }}h actual</span>
                  <span class="target-time">{{ metric.target }}h target</span>
                </div>
              </div>
              
              <div class="performance-bar">
                <div class="bar-background">
                  <div 
                    class="bar-fill" 
                    [style.width.%]="getPerformancePercentage(metric)"
                    [class.over-target]="metric.actual > metric.target">
                  </div>
                </div>
                <div class="performance-text">
                  {{ getPerformanceText(metric) }}
                </div>
              </div>
              
              <div class="metric-actions">
                <button (click)="viewDetails(metric)" class="action-btn details">
                  Details
                </button>
                <button (click)="viewTrend(metric)" class="action-btn trend">
                  Trend
                </button>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="turnaroundMetrics.length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No turnaround time data available</p>
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

    .metrics-summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      padding: 1rem;
      border-radius: 6px;
      text-align: center;
    }

    .summary-card.overall {
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
    }

    .summary-card.target {
      background: linear-gradient(135deg, #27ae60, #229954);
      color: white;
    }

    .metric-value {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .metric-label {
      font-size: 0.875rem;
      opacity: 0.9;
      margin-bottom: 0.5rem;
    }

    .metric-trend {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      font-size: 0.75rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .section-header h4 {
      margin: 0;
      color: #333;
    }

    .time-filter {
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
      background: #3498db;
      color: white;
      border-color: #3498db;
    }

    .specialty-list {
      flex: 1;
      overflow-y: auto;
    }

    .specialty-item {
      display: flex;
      align-items: center;
      padding: 1rem;
      margin-bottom: 0.75rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .specialty-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .specialty-item.over-target {
      border-left: 4px solid #e74c3c;
    }

    .specialty-info {
      flex: 0 0 200px;
    }

    .specialty-name {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }

    .specialty-details {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .specialty-details span {
      display: block;
    }

    .performance-bar {
      flex: 1;
      margin: 0 1rem;
    }

    .bar-background {
      height: 8px;
      background: #ecf0f1;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.25rem;
    }

    .bar-fill {
      height: 100%;
      background: #27ae60;
      transition: width 0.3s ease;
    }

    .bar-fill.over-target {
      background: #e74c3c;
    }

    .performance-text {
      font-size: 0.75rem;
      color: #7f8c8d;
      text-align: center;
    }

    .metric-actions {
      display: flex;
      gap: 0.5rem;
    }

    .action-btn {
      padding: 0.375rem 0.75rem;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: #f5f5f5;
    }

    .action-btn.details {
      border-color: #3498db;
      color: #3498db;
    }

    .action-btn.trend {
      border-color: #f39c12;
      color: #f39c12;
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
      background: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .refresh-btn:hover {
      background: #2980b9;
    }
  `]
})
export class TurnaroundTimeWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { refreshInterval: 300000 }; // 5 minutes

  turnaroundMetrics: TurnaroundTimeMetric[] = [];
  isRefreshing = false;
  activePeriod = '24h';

  timePeriods = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' }
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
      switchMap(() => this.loadTurnaroundMetrics())
    ).subscribe();
  }

  async refreshData(): Promise<void> {
    this.isRefreshing = true;
    await this.loadTurnaroundMetrics();
    this.isRefreshing = false;
  }

  private async loadTurnaroundMetrics(): Promise<void> {
    try {
      const dateRange = this.getDateRangeForPeriod(this.activePeriod);
      this.turnaroundMetrics = await this.analyticsService.getTurnaroundTimeMetrics(dateRange);
    } catch (error) {
      console.error('Failed to load turnaround metrics:', error);
      this.turnaroundMetrics = [];
    }
  }

  setTimePeriod(period: string): void {
    this.activePeriod = period;
    this.refreshData();
  }

  getOverallAverage(): number {
    if (this.turnaroundMetrics.length === 0) { return 0; }
    
    const total = this.turnaroundMetrics.reduce((sum, metric) => sum + metric.actual, 0);
    return total / this.turnaroundMetrics.length;
  }

  getTargetCompliance(): number {
    if (this.turnaroundMetrics.length === 0) { return 0; }
    
    const compliant = this.turnaroundMetrics.filter(metric => metric.actual <= metric.target).length;
    return (compliant / this.turnaroundMetrics.length) * 100;
  }

  getOverallTrend(): 'up' | 'down' | 'stable' {
    // This would typically compare with historical data
    const compliance = this.getTargetCompliance();
    if (compliance >= 90) { return 'stable'; }
    if (compliance >= 75) { return 'down'; }
    return 'up';
  }

  getComplianceTrend(): 'up' | 'down' | 'stable' {
    return this.getOverallTrend();
  }

  getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
    }
  }

  getTrendText(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return 'Improving';
      case 'down': return 'Declining';
      case 'stable': return 'Stable';
    }
  }

  getPerformancePercentage(metric: TurnaroundTimeMetric): number {
    const percentage = (metric.target / metric.actual) * 100;
    return Math.min(percentage, 100);
  }

  getPerformanceText(metric: TurnaroundTimeMetric): string {
    const diff = metric.actual - metric.target;
    if (diff <= 0) {
      return `${Math.abs(diff).toFixed(1)}h under target`;
    } else {
      return `${diff.toFixed(1)}h over target`;
    }
  }

  viewDetails(metric: TurnaroundTimeMetric): void {
    console.log('Viewing details for:', metric.specialty);
    // Navigate to detailed turnaround time analysis
  }

  viewTrend(metric: TurnaroundTimeMetric): void {
    console.log('Viewing trend for:', metric.specialty);
    // Navigate to trend analysis view
  }

  private getDateRangeForPeriod(period: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case '24h':
        start.setHours(end.getHours() - 24);
        break;
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
      case '30d':
        start.setDate(end.getDate() - 30);
        break;
    }

    return { start, end };
  }
}