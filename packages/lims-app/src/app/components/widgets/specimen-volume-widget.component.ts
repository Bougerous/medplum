import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { interval, Subject } from 'rxjs';
import { startWith, switchMap, takeUntil } from 'rxjs/operators';
import { AnalyticsService } from '../../services/analytics.service';
import { AnalyticsMetric } from '../../types/fhir-types';

interface VolumeData {
  period: string;
  current: number;
  previous: number;
  target: number;
  change: number;
  changePercent: number;
}

@Component({
  selector: 'app-specimen-volume-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Specimen Volume</h3>
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
        <div class="volume-summary">
          <div class="summary-grid">
            <div class="summary-card today">
              <div class="card-header">
                <span class="card-title">Today</span>
                <span class="card-icon">📊</span>
              </div>
              <div class="card-content">
                <div class="metric-value">{{ getTodayVolume() }}</div>
                <div class="metric-change" [class]="getTodayTrend()">
                  <span class="change-icon">{{ getChangeIcon(getTodayTrend()) }}</span>
                  <span class="change-text">{{ getTodayChangeText() }}</span>
                </div>
              </div>
            </div>
            
            <div class="summary-card week">
              <div class="card-header">
                <span class="card-title">This Week</span>
                <span class="card-icon">📈</span>
              </div>
              <div class="card-content">
                <div class="metric-value">{{ getWeekVolume() }}</div>
                <div class="metric-change" [class]="getWeekTrend()">
                  <span class="change-icon">{{ getChangeIcon(getWeekTrend()) }}</span>
                  <span class="change-text">{{ getWeekChangeText() }}</span>
                </div>
              </div>
            </div>
            
            <div class="summary-card month">
              <div class="card-header">
                <span class="card-title">This Month</span>
                <span class="card-icon">📅</span>
              </div>
              <div class="card-content">
                <div class="metric-value">{{ getMonthVolume() }}</div>
                <div class="metric-change" [class]="getMonthTrend()">
                  <span class="change-icon">{{ getChangeIcon(getMonthTrend()) }}</span>
                  <span class="change-text">{{ getMonthChangeText() }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="volume-details" *ngIf="activeView === 'detailed'">
          <div class="section-header">
            <h4>Volume Breakdown</h4>
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
          
          <div class="volume-chart">
            <div class="chart-container">
              <div class="chart-bars">
                <div 
                  *ngFor="let data of getVolumeChartData()" 
                  class="chart-bar"
                  [style.height.%]="getBarHeight(data.current)">
                  <div class="bar-fill" [class.over-target]="data.current > data.target"></div>
                  <div class="bar-label">{{ data.period }}</div>
                  <div class="bar-value">{{ data.current }}</div>
                </div>
              </div>
              <div class="chart-legend">
                <div class="legend-item">
                  <span class="legend-color current"></span>
                  <span class="legend-text">Current</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color target"></span>
                  <span class="legend-text">Target</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="capacity-planning" *ngIf="activeView === 'capacity'">
          <div class="section-header">
            <h4>Capacity Planning</h4>
          </div>
          
          <div class="capacity-metrics">
            <div class="capacity-item">
              <div class="capacity-label">Current Utilization</div>
              <div class="capacity-bar">
                <div class="capacity-fill" [style.width.%]="getCurrentUtilization()"></div>
              </div>
              <div class="capacity-text">{{ getCurrentUtilization() | number:'1.0-0' }}%</div>
            </div>
            
            <div class="capacity-item">
              <div class="capacity-label">Peak Hour Load</div>
              <div class="capacity-bar">
                <div class="capacity-fill peak" [style.width.%]="getPeakUtilization()"></div>
              </div>
              <div class="capacity-text">{{ getPeakUtilization() | number:'1.0-0' }}%</div>
            </div>
            
            <div class="capacity-item">
              <div class="capacity-label">Projected Next Week</div>
              <div class="capacity-bar">
                <div class="capacity-fill projected" [style.width.%]="getProjectedUtilization()"></div>
              </div>
              <div class="capacity-text">{{ getProjectedUtilization() | number:'1.0-0' }}%</div>
            </div>
          </div>
          
          <div class="capacity-alerts" *ngIf="getCapacityAlerts().length > 0">
            <h5>Capacity Alerts</h5>
            <div class="alert-list">
              <div *ngFor="let alert of getCapacityAlerts()" class="alert-item" [class]="alert.severity">
                <span class="alert-icon">{{ getAlertIcon(alert.severity) }}</span>
                <span class="alert-text">{{ alert.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="volumeMetrics.length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No volume data available</p>
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

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      padding: 1rem;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
      transition: all 0.2s;
    }

    .summary-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .summary-card.today {
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
      border: none;
    }

    .summary-card.week {
      background: linear-gradient(135deg, #27ae60, #229954);
      color: white;
      border: none;
    }

    .summary-card.month {
      background: linear-gradient(135deg, #f39c12, #e67e22);
      color: white;
      border: none;
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

    .section-header h4 {
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
      background: #3498db;
      color: white;
      border-color: #3498db;
    }

    .chart-container {
      background: #f8f9fa;
      border-radius: 6px;
      padding: 1rem;
    }

    .chart-bars {
      display: flex;
      align-items: end;
      gap: 1rem;
      height: 200px;
      margin-bottom: 1rem;
    }

    .chart-bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .bar-fill {
      width: 100%;
      background: #3498db;
      border-radius: 4px 4px 0 0;
      transition: height 0.3s ease;
    }

    .bar-fill.over-target {
      background: #e74c3c;
    }

    .bar-label {
      font-size: 0.75rem;
      color: #7f8c8d;
      margin-top: 0.5rem;
    }

    .bar-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: #2c3e50;
      margin-top: 0.25rem;
    }

    .chart-legend {
      display: flex;
      justify-content: center;
      gap: 1rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    .legend-color.current {
      background: #3498db;
    }

    .legend-color.target {
      background: #95a5a6;
    }

    .legend-text {
      font-size: 0.75rem;
      color: #7f8c8d;
    }

    .capacity-metrics {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .capacity-item {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .capacity-label {
      flex: 0 0 150px;
      font-size: 0.875rem;
      color: #2c3e50;
    }

    .capacity-bar {
      flex: 1;
      height: 20px;
      background: #ecf0f1;
      border-radius: 10px;
      overflow: hidden;
    }

    .capacity-fill {
      height: 100%;
      background: #27ae60;
      transition: width 0.3s ease;
    }

    .capacity-fill.peak {
      background: #f39c12;
    }

    .capacity-fill.projected {
      background: #9b59b6;
    }

    .capacity-text {
      flex: 0 0 50px;
      text-align: right;
      font-size: 0.875rem;
      font-weight: 600;
      color: #2c3e50;
    }

    .capacity-alerts h5 {
      margin: 0 0 0.5rem 0;
      color: #333;
    }

    .alert-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .alert-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .alert-item.warning {
      background: #fff3cd;
      color: #856404;
    }

    .alert-item.critical {
      background: #f8d7da;
      color: #721c24;
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
export class SpecimenVolumeWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { refreshInterval: 300000 }; // 5 minutes

  volumeMetrics: AnalyticsMetric[] = [];
  isRefreshing = false;
  activeView = 'summary';
  activePeriod = '7d';

  viewTypes = [
    { key: 'summary', label: 'Summary' },
    { key: 'detailed', label: 'Detailed' },
    { key: 'capacity', label: 'Capacity' }
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
      switchMap(() => this.loadVolumeMetrics())
    ).subscribe();
  }

  async refreshData(): Promise<void> {
    this.isRefreshing = true;
    await this.loadVolumeMetrics();
    this.isRefreshing = false;
  }

  private async loadVolumeMetrics(): Promise<void> {
    try {
      const dateRange = this.getDateRangeForPeriod(this.activePeriod);
      this.volumeMetrics = await this.analyticsService.getSpecimenVolumeMetrics(dateRange);
    } catch (error) {
      console.error('Failed to load volume metrics:', error);
      this.volumeMetrics = [];
    }
  }

  setView(view: string): void {
    this.activeView = view;
  }

  setTimePeriod(period: string): void {
    this.activePeriod = period;
    this.refreshData();
  }

  getTodayVolume(): number {
    const todayMetric = this.volumeMetrics.find(m => m.period === 'today');
    return todayMetric?.value || 0;
  }

  getWeekVolume(): number {
    const weekMetric = this.volumeMetrics.find(m => m.period === 'this week');
    return weekMetric?.value || 0;
  }

  getMonthVolume(): number {
    const monthMetric = this.volumeMetrics.find(m => m.period === 'this month');
    return monthMetric?.value || 0;
  }

  getTodayTrend(): 'up' | 'down' | 'stable' {
    const todayMetric = this.volumeMetrics.find(m => m.period === 'today');
    return todayMetric?.trend || 'stable';
  }

  getWeekTrend(): 'up' | 'down' | 'stable' {
    const weekMetric = this.volumeMetrics.find(m => m.period === 'this week');
    return weekMetric?.trend || 'stable';
  }

  getMonthTrend(): 'up' | 'down' | 'stable' {
    const monthMetric = this.volumeMetrics.find(m => m.period === 'this month');
    return monthMetric?.trend || 'stable';
  }

  getChangeIcon(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
    }
  }

  getTodayChangeText(): string {
    return 'vs yesterday';
  }

  getWeekChangeText(): string {
    return 'vs last week';
  }

  getMonthChangeText(): string {
    return 'vs last month';
  }

  getVolumeChartData(): VolumeData[] {
    // Mock data for chart - in real implementation would come from analytics service
    return [
      { period: 'Mon', current: 45, previous: 42, target: 50, change: 3, changePercent: 7.1 },
      { period: 'Tue', current: 52, previous: 48, target: 50, change: 4, changePercent: 8.3 },
      { period: 'Wed', current: 38, previous: 41, target: 50, change: -3, changePercent: -7.3 },
      { period: 'Thu', current: 61, previous: 55, target: 50, change: 6, changePercent: 10.9 },
      { period: 'Fri', current: 47, previous: 44, target: 50, change: 3, changePercent: 6.8 },
      { period: 'Sat', current: 23, previous: 25, target: 30, change: -2, changePercent: -8.0 },
      { period: 'Sun', current: 18, previous: 20, target: 25, change: -2, changePercent: -10.0 }
    ];
  }

  getBarHeight(value: number): number {
    const maxValue = Math.max(...this.getVolumeChartData().map(d => Math.max(d.current, d.target)));
    return (value / maxValue) * 100;
  }

  getCurrentUtilization(): number {
    return 75; // Mock data - would be calculated from actual capacity
  }

  getPeakUtilization(): number {
    return 92; // Mock data
  }

  getProjectedUtilization(): number {
    return 83; // Mock data
  }

  getCapacityAlerts(): Array<{severity: 'warning' | 'critical', message: string}> {
    const alerts = [];
    
    if (this.getPeakUtilization() > 90) {
      alerts.push({
        severity: 'critical' as const,
        message: 'Peak hour utilization exceeds 90% - consider additional staffing'
      });
    }
    
    if (this.getProjectedUtilization() > 85) {
      alerts.push({
        severity: 'warning' as const,
        message: 'Projected utilization for next week is high - monitor capacity'
      });
    }
    
    return alerts;
  }

  getAlertIcon(severity: 'warning' | 'critical'): string {
    return severity === 'critical' ? '🚨' : '⚠️';
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