import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval } from 'rxjs';
import { takeUntil, startWith, switchMap } from 'rxjs/operators';
import { AnalyticsService } from '../../services/analytics.service';
import { AnalyticsMetric } from '../../types/fhir-types';

interface QualityIndicator {
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  description: string;
}

interface ComplianceMetric {
  category: string;
  score: number;
  maxScore: number;
  items: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warning';
    description: string;
  }>;
}

@Component({
  selector: 'app-quality-metrics-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Quality Metrics</h3>
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
        <!-- Quality Overview -->
        <div class="quality-overview" *ngIf="activeView === 'overview'">
          <div class="quality-score">
            <div class="score-circle" [class]="getOverallQualityStatus()">
              <div class="score-value">{{ getOverallQualityScore() | number:'1.0-0' }}</div>
              <div class="score-label">Quality Score</div>
            </div>
            <div class="score-details">
              <div class="score-trend" [class]="getQualityTrend()">
                <span class="trend-icon">{{ getTrendIcon(getQualityTrend()) }}</span>
                <span class="trend-text">{{ getTrendText(getQualityTrend()) }}</span>
              </div>
              <div class="score-description">
                {{ getQualityDescription() }}
              </div>
            </div>
          </div>

          <div class="quality-indicators">
            <div 
              *ngFor="let indicator of getQualityIndicators()" 
              class="indicator-card"
              [class]="indicator.status">
              
              <div class="indicator-header">
                <span class="indicator-name">{{ indicator.name }}</span>
                <span class="indicator-status-icon">{{ getStatusIcon(indicator.status) }}</span>
              </div>
              
              <div class="indicator-content">
                <div class="indicator-value">
                  {{ indicator.value | number:'1.1-1' }}{{ indicator.unit }}
                </div>
                <div class="indicator-target">
                  Target: {{ indicator.target }}{{ indicator.unit }}
                </div>
                <div class="indicator-trend" [class]="indicator.trend">
                  <span class="trend-icon">{{ getTrendIcon(indicator.trend) }}</span>
                </div>
              </div>
              
              <div class="indicator-description">
                {{ indicator.description }}
              </div>
            </div>
          </div>
        </div>

        <!-- Compliance Details -->
        <div class="compliance-details" *ngIf="activeView === 'compliance'">
          <div class="section-header">
            <h4>Compliance Monitoring</h4>
            <div class="compliance-summary">
              <span class="compliance-score">{{ getComplianceScore() | number:'1.0-0' }}% Compliant</span>
            </div>
          </div>
          
          <div class="compliance-categories">
            <div 
              *ngFor="let metric of getComplianceMetrics()" 
              class="compliance-category">
              
              <div class="category-header">
                <h5>{{ metric.category }}</h5>
                <div class="category-score">
                  <span class="score">{{ metric.score }}/{{ metric.maxScore }}</span>
                  <div class="score-bar">
                    <div 
                      class="score-fill" 
                      [style.width.%]="(metric.score / metric.maxScore) * 100"
                      [class.warning]="(metric.score / metric.maxScore) < 0.8"
                      [class.critical]="(metric.score / metric.maxScore) < 0.6">
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="category-items">
                <div 
                  *ngFor="let item of metric.items" 
                  class="compliance-item"
                  [class]="item.status">
                  
                  <span class="item-status">{{ getComplianceIcon(item.status) }}</span>
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-description">{{ item.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Trends Analysis -->
        <div class="trends-analysis" *ngIf="activeView === 'trends'">
          <div class="section-header">
            <h4>Quality Trends</h4>
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
          
          <div class="trends-chart">
            <div class="chart-container">
              <div class="chart-title">Quality Score Over Time</div>
              <div class="chart-area">
                <div class="chart-line">
                  <div 
                    *ngFor="let point of getTrendData(); let i = index" 
                    class="chart-point"
                    [style.left.%]="(i / (getTrendData().length - 1)) * 100"
                    [style.bottom.%]="point.value"
                    [title]="point.period + ': ' + point.value + '%'">
                  </div>
                </div>
                <div class="chart-labels">
                  <div *ngFor="let point of getTrendData()" class="chart-label">
                    {{ point.period }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="trend-insights">
            <h5>Key Insights</h5>
            <div class="insights-list">
              <div *ngFor="let insight of getTrendInsights()" class="insight-item" [class]="insight.type">
                <span class="insight-icon">{{ getInsightIcon(insight.type) }}</span>
                <span class="insight-text">{{ insight.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="qualityMetrics.length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No quality metrics available</p>
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
      background: #3498db;
      color: white;
      border-color: #3498db;
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

    .quality-overview {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .quality-score {
      display: flex;
      align-items: center;
      gap: 2rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .score-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 8px solid;
      transition: all 0.3s ease;
    }

    .score-circle.good {
      border-color: #27ae60;
      background: rgba(39, 174, 96, 0.1);
    }

    .score-circle.warning {
      border-color: #f39c12;
      background: rgba(243, 156, 18, 0.1);
    }

    .score-circle.critical {
      border-color: #e74c3c;
      background: rgba(231, 76, 60, 0.1);
    }

    .score-value {
      font-size: 2rem;
      font-weight: 700;
      color: #2c3e50;
    }

    .score-label {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .score-details {
      flex: 1;
    }

    .score-trend {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .score-description {
      color: #7f8c8d;
      line-height: 1.5;
    }

    .quality-indicators {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
    }

    .indicator-card {
      padding: 1rem;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
      transition: all 0.2s;
    }

    .indicator-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .indicator-card.good {
      border-left: 4px solid #27ae60;
    }

    .indicator-card.warning {
      border-left: 4px solid #f39c12;
    }

    .indicator-card.critical {
      border-left: 4px solid #e74c3c;
    }

    .indicator-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .indicator-name {
      font-weight: 600;
      color: #2c3e50;
    }

    .indicator-status-icon {
      font-size: 1.25rem;
    }

    .indicator-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }

    .indicator-target {
      font-size: 0.875rem;
      color: #7f8c8d;
      margin-bottom: 0.5rem;
    }

    .indicator-trend {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .indicator-description {
      font-size: 0.875rem;
      color: #7f8c8d;
      line-height: 1.4;
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

    .compliance-summary {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .compliance-score {
      font-weight: 600;
      color: #27ae60;
    }

    .compliance-categories {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .compliance-category {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      overflow: hidden;
    }

    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }

    .category-header h5 {
      margin: 0;
      color: #2c3e50;
    }

    .category-score {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .score {
      font-weight: 600;
      color: #2c3e50;
    }

    .score-bar {
      width: 100px;
      height: 8px;
      background: #ecf0f1;
      border-radius: 4px;
      overflow: hidden;
    }

    .score-fill {
      height: 100%;
      background: #27ae60;
      transition: width 0.3s ease;
    }

    .score-fill.warning {
      background: #f39c12;
    }

    .score-fill.critical {
      background: #e74c3c;
    }

    .category-items {
      padding: 1rem;
    }

    .compliance-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .compliance-item:last-child {
      border-bottom: none;
    }

    .item-status {
      font-size: 1.25rem;
    }

    .item-name {
      font-weight: 500;
      color: #2c3e50;
      flex: 0 0 200px;
    }

    .item-description {
      color: #7f8c8d;
      font-size: 0.875rem;
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
      background: #3498db;
      color: white;
      border-color: #3498db;
    }

    .chart-container {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }

    .chart-title {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 1rem;
      text-align: center;
    }

    .chart-area {
      position: relative;
      height: 200px;
      margin-bottom: 1rem;
    }

    .chart-line {
      position: relative;
      height: 100%;
      border-bottom: 1px solid #ddd;
    }

    .chart-point {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #3498db;
      border-radius: 50%;
      transform: translate(-50%, 50%);
      cursor: pointer;
    }

    .chart-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
    }

    .chart-label {
      font-size: 0.75rem;
      color: #7f8c8d;
    }

    .trend-insights h5 {
      margin: 0 0 1rem 0;
      color: #333;
    }

    .insights-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .insight-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 4px;
    }

    .insight-item.positive {
      background: rgba(39, 174, 96, 0.1);
      color: #27ae60;
    }

    .insight-item.negative {
      background: rgba(231, 76, 60, 0.1);
      color: #e74c3c;
    }

    .insight-item.neutral {
      background: rgba(52, 152, 219, 0.1);
      color: #3498db;
    }

    .insight-icon {
      font-size: 1.25rem;
    }

    .insight-text {
      font-size: 0.875rem;
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
export class QualityMetricsWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { refreshInterval: 300000 }; // 5 minutes

  qualityMetrics: AnalyticsMetric[] = [];
  isRefreshing = false;
  activeView = 'overview';
  activePeriod = '30d';

  viewTypes = [
    { key: 'overview', label: 'Overview' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'trends', label: 'Trends' }
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
      switchMap(() => this.loadQualityMetrics())
    ).subscribe();
  }

  async refreshData(): Promise<void> {
    this.isRefreshing = true;
    await this.loadQualityMetrics();
    this.isRefreshing = false;
  }

  private async loadQualityMetrics(): Promise<void> {
    try {
      const dateRange = this.getDateRangeForPeriod(this.activePeriod);
      this.qualityMetrics = await this.analyticsService.getQualityMetrics(dateRange);
    } catch (error) {
      console.error('Failed to load quality metrics:', error);
      this.qualityMetrics = [];
    }
  }

  setView(view: string): void {
    this.activeView = view;
  }

  setTimePeriod(period: string): void {
    this.activePeriod = period;
    this.refreshData();
  }

  getOverallQualityScore(): number {
    // Calculate overall quality score from metrics
    if (this.qualityMetrics.length === 0) return 0;
    
    const rejectionRate = this.qualityMetrics.find(m => m.name.includes('Rejection'))?.value || 0;
    const amendmentRate = this.qualityMetrics.find(m => m.name.includes('Amendment'))?.value || 0;
    
    // Quality score calculation (simplified)
    const score = 100 - (rejectionRate * 10) - (amendmentRate * 15);
    return Math.max(0, Math.min(100, score));
  }

  getOverallQualityStatus(): 'good' | 'warning' | 'critical' {
    const score = this.getOverallQualityScore();
    if (score >= 85) return 'good';
    if (score >= 70) return 'warning';
    return 'critical';
  }

  getQualityTrend(): 'up' | 'down' | 'stable' {
    // This would compare with historical data
    const score = this.getOverallQualityScore();
    if (score >= 85) return 'stable';
    if (score >= 70) return 'down';
    return 'up';
  }

  getQualityDescription(): string {
    const status = this.getOverallQualityStatus();
    switch (status) {
      case 'good':
        return 'Quality metrics are within acceptable ranges. Continue monitoring.';
      case 'warning':
        return 'Some quality indicators need attention. Review processes.';
      case 'critical':
        return 'Quality metrics require immediate attention and corrective action.';
    }
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

  getStatusIcon(status: 'good' | 'warning' | 'critical'): string {
    switch (status) {
      case 'good': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
    }
  }

  getQualityIndicators(): QualityIndicator[] {
    const rejectionRate = this.qualityMetrics.find(m => m.name.includes('Rejection'))?.value || 0;
    const amendmentRate = this.qualityMetrics.find(m => m.name.includes('Amendment'))?.value || 0;

    return [
      {
        name: 'Specimen Rejection Rate',
        value: rejectionRate,
        target: 2.0,
        unit: '%',
        trend: rejectionRate <= 2 ? 'stable' : 'up',
        status: rejectionRate <= 2 ? 'good' : rejectionRate <= 5 ? 'warning' : 'critical',
        description: 'Percentage of specimens rejected due to quality issues'
      },
      {
        name: 'Report Amendment Rate',
        value: amendmentRate,
        target: 1.0,
        unit: '%',
        trend: amendmentRate <= 1 ? 'stable' : 'up',
        status: amendmentRate <= 1 ? 'good' : amendmentRate <= 3 ? 'warning' : 'critical',
        description: 'Percentage of reports requiring amendments after release'
      },
      {
        name: 'Critical Value Notification',
        value: 98.5,
        target: 95.0,
        unit: '%',
        trend: 'stable',
        status: 'good',
        description: 'Percentage of critical values reported within target timeframe'
      },
      {
        name: 'Proficiency Testing',
        value: 96.2,
        target: 95.0,
        unit: '%',
        trend: 'stable',
        status: 'good',
        description: 'Success rate in external proficiency testing programs'
      }
    ];
  }

  getComplianceScore(): number {
    const metrics = this.getComplianceMetrics();
    const totalScore = metrics.reduce((sum, metric) => sum + metric.score, 0);
    const maxScore = metrics.reduce((sum, metric) => sum + metric.maxScore, 0);
    return maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  }

  getComplianceMetrics(): ComplianceMetric[] {
    return [
      {
        category: 'Pre-Analytical',
        score: 8,
        maxScore: 10,
        items: [
          { name: 'Specimen Collection', status: 'pass', description: 'Proper collection procedures followed' },
          { name: 'Chain of Custody', status: 'pass', description: 'Complete documentation maintained' },
          { name: 'Storage Conditions', status: 'pass', description: 'Temperature monitoring compliant' },
          { name: 'Labeling Accuracy', status: 'warning', description: 'Minor labeling inconsistencies detected' },
          { name: 'Transport Time', status: 'pass', description: 'Within acceptable timeframes' }
        ]
      },
      {
        category: 'Analytical',
        score: 9,
        maxScore: 10,
        items: [
          { name: 'Quality Control', status: 'pass', description: 'QC results within acceptable limits' },
          { name: 'Calibration', status: 'pass', description: 'Equipment properly calibrated' },
          { name: 'Method Validation', status: 'pass', description: 'All methods validated per requirements' },
          { name: 'Maintenance Records', status: 'pass', description: 'Complete maintenance documentation' },
          { name: 'Staff Competency', status: 'warning', description: 'One technician needs recertification' }
        ]
      },
      {
        category: 'Post-Analytical',
        score: 7,
        maxScore: 10,
        items: [
          { name: 'Result Review', status: 'pass', description: 'All results reviewed by qualified personnel' },
          { name: 'Critical Values', status: 'pass', description: 'Timely notification of critical results' },
          { name: 'Report Accuracy', status: 'warning', description: 'Amendment rate slightly elevated' },
          { name: 'Turnaround Time', status: 'pass', description: 'Meeting target timeframes' },
          { name: 'Result Delivery', status: 'fail', description: 'Some delays in result transmission' }
        ]
      }
    ];
  }

  getComplianceIcon(status: 'pass' | 'fail' | 'warning'): string {
    switch (status) {
      case 'pass': return '✅';
      case 'fail': return '❌';
      case 'warning': return '⚠️';
    }
  }

  getTrendData(): Array<{period: string, value: number}> {
    // Mock trend data - in real implementation would come from analytics service
    return [
      { period: 'Week 1', value: 82 },
      { period: 'Week 2', value: 85 },
      { period: 'Week 3', value: 88 },
      { period: 'Week 4', value: 86 },
      { period: 'Week 5', value: 90 },
      { period: 'Week 6', value: 87 },
      { period: 'Week 7', value: 89 }
    ];
  }

  getTrendInsights(): Array<{type: 'positive' | 'negative' | 'neutral', message: string}> {
    return [
      {
        type: 'positive',
        message: 'Quality score has improved by 7% over the past month'
      },
      {
        type: 'negative',
        message: 'Specimen rejection rate increased slightly in the last week'
      },
      {
        type: 'neutral',
        message: 'Proficiency testing results remain consistently above target'
      }
    ];
  }

  getInsightIcon(type: 'positive' | 'negative' | 'neutral'): string {
    switch (type) {
      case 'positive': return '📈';
      case 'negative': return '📉';
      case 'neutral': return 'ℹ️';
    }
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