import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';

interface ChartDataPoint {
  label: string;
  value: number;
  date?: Date;
  category?: string;
}

interface AnalyticsData {
  metric: string;
  period: string;
  currentValue: number;
  previousValue: number;
  trend: number;
  chartData: ChartDataPoint[];
  summary: {
    total: number;
    average: number;
    peak: number;
    low: number;
  };
}

@Component({
  selector: 'app-analytics-chart-widget',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="analytics-chart-widget">
      <div class="widget-header">
        <h4>{{ getMetricTitle() }}</h4>
        <div class="chart-controls">
          <select [(ngModel)]="selectedPeriod" (change)="onPeriodChange()">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
          </select>
        </div>
      </div>
      
      <div class="chart-content">
        <div *ngIf="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading analytics...</p>
        </div>
        
        <div *ngIf="!isLoading" class="analytics-data">
          <!-- Key Metrics Summary -->
          <div class="metrics-summary">
            <div class="primary-metric">
              <div class="metric-value">{{ formatValue(analyticsData.currentValue) }}</div>
              <div class="metric-label">{{ getMetricLabel() }}</div>
              <div class="metric-trend" [ngClass]="getTrendClass(analyticsData.trend)">
                <span class="trend-icon">{{ getTrendIcon(analyticsData.trend) }}</span>
                {{ Math.abs(analyticsData.trend) }}% vs previous {{ selectedPeriod }}
              </div>
            </div>
            
            <div class="secondary-metrics">
              <div class="metric-item">
                <span class="metric-label">Average</span>
                <span class="metric-value">{{ formatValue(analyticsData.summary.average) }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Peak</span>
                <span class="metric-value">{{ formatValue(analyticsData.summary.peak) }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Low</span>
                <span class="metric-value">{{ formatValue(analyticsData.summary.low) }}</span>
              </div>
            </div>
          </div>
          
          <!-- Chart Visualization -->
          <div class="chart-visualization">
            <div class="chart-container">
              <div class="chart-bars">
                <div *ngFor="let dataPoint of analyticsData.chartData; let i = index" 
                     class="chart-bar"
                     [style.height.%]="getBarHeight(dataPoint.value)"
                     [title]="dataPoint.label + ': ' + formatValue(dataPoint.value)">
                  <div class="bar-fill" [style.height.%]="getBarHeight(dataPoint.value)"></div>
                </div>
              </div>
              <div class="chart-labels">
                <span *ngFor="let dataPoint of analyticsData.chartData" class="chart-label">
                  {{ formatLabel(dataPoint.label) }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Data Table -->
          <div class="data-table" *ngIf="config.showTable">
            <div class="table-header">
              <span class="col-period">Period</span>
              <span class="col-value">{{ getMetricLabel() }}</span>
              <span class="col-change">Change</span>
            </div>
            <div class="table-body">
              <div *ngFor="let dataPoint of analyticsData.chartData; let i = index" class="table-row">
                <span class="col-period">{{ dataPoint.label }}</span>
                <span class="col-value">{{ formatValue(dataPoint.value) }}</span>
                <span class="col-change" [ngClass]="getChangeClass(dataPoint, i)">
                  {{ getChangeValue(dataPoint, i) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="widget-actions">
          <button class="action-btn primary" routerLink="/analytics">
            View Details
          </button>
          <button class="action-btn secondary" (click)="exportData()">
            Export Data
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './analytics-chart-widget.scss'
})
export class AnalyticsChartWidget implements OnInit, OnDestroy {
  @Input() config: any = {};

  private destroy$ = new Subject<void>();

  // Math property for template access
  protected readonly Math = Math;

  analyticsData: AnalyticsData = this.getEmptyAnalyticsData();
  isLoading = true;
  selectedPeriod = 'week';

  ngOnInit(): void {
    this.selectedPeriod = this.config.period || 'week';
    this.loadAnalyticsData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadAnalyticsData(): Promise<void> {
    try {
      this.isLoading = true;

      // In a real implementation, this would make API calls based on the metric type
      await this.delay(1000); // Simulate API call
      this.analyticsData = this.getMockAnalyticsData();

    } catch (error) {
      console.error('Failed to load analytics data:', error);
      this.analyticsData = this.getMockAnalyticsData();
    } finally {
      this.isLoading = false;
    }
  }

  private startAutoRefresh(): void {
    const refreshInterval = this.config.refreshInterval || 300000; // 5 minutes default

    interval(refreshInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.loadAnalyticsData())
      )
      .subscribe();
  }

  onPeriodChange(): void {
    this.loadAnalyticsData();
  }

  getMetricTitle(): string {
    const titles: { [key: string]: string } = {
      'turnaround-time': 'Turnaround Time Analytics',
      'specimen-volume': 'Specimen Volume Trends',
      'quality': 'Quality Metrics',
      'revenue': 'Revenue Analytics',
      'productivity': 'Staff Productivity',
      'cases': 'Case Analytics'
    };

    return titles[this.config.metric] || this.config.title || 'Analytics';
  }

  getMetricLabel(): string {
    const labels: { [key: string]: string } = {
      'turnaround-time': 'Hours',
      'specimen-volume': 'Specimens',
      'quality': 'Score',
      'revenue': 'Revenue',
      'productivity': 'Cases/Hour',
      'cases': 'Cases'
    };

    return labels[this.config.metric] || 'Value';
  }

  formatValue(value: number): string {
    const metric = this.config.metric;

    if (metric === 'revenue') {
      return `$${value.toLocaleString()}`;
    } else if (metric === 'turnaround-time') {
      return `${value.toFixed(1)}h`;
    } else if (metric === 'quality') {
      return `${value.toFixed(1)}%`;
    } else if (metric === 'productivity') {
      return value.toFixed(1);
    }

    return value.toLocaleString();
  }

  formatLabel(label: string): string {
    // Format labels based on period
    if (this.selectedPeriod === 'day') {
      return label.substring(0, 3); // Mon, Tue, etc.
    } else if (this.selectedPeriod === 'week') {
      return `W${label.split(' ')[1]}`; // W1, W2, etc.
    } else if (this.selectedPeriod === 'month') {
      return label.substring(0, 3); // Jan, Feb, etc.
    }

    return label;
  }

  getTrendClass(trend: number): string {
    if (trend > 0) { return 'trend-positive'; }
    if (trend < 0) { return 'trend-negative'; }
    return 'trend-neutral';
  }

  getTrendIcon(trend: number): string {
    if (trend > 0) { return '↗'; }
    if (trend < 0) { return '↘'; }
    return '→';
  }

  getBarHeight(value: number): number {
    const maxValue = Math.max(...this.analyticsData.chartData.map(d => d.value));
    return maxValue > 0 ? (value / maxValue) * 100 : 0;
  }

  getChangeClass(dataPoint: ChartDataPoint, index: number): string {
    if (index === 0) { return 'change-neutral'; }

    const previousValue = this.analyticsData.chartData[index - 1].value;
    const change = dataPoint.value - previousValue;

    if (change > 0) { return 'change-positive'; }
    if (change < 0) { return 'change-negative'; }
    return 'change-neutral';
  }

  getChangeValue(dataPoint: ChartDataPoint, index: number): string {
    if (index === 0) { return '-'; }

    const previousValue = this.analyticsData.chartData[index - 1].value;
    const change = dataPoint.value - previousValue;
    const percentChange = previousValue > 0 ? (change / previousValue) * 100 : 0;

    return `${(change > 0 ? '+' : '') + percentChange.toFixed(1)}%`;
  }

  exportData(): void {
    // Export analytics data as CSV
    const csvData = this.analyticsData.chartData.map(d =>
      `${d.label},${d.value}`
    ).join('\n');

    const blob = new Blob([`Period,${this.getMetricLabel()}\n${csvData}`],
      { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.config.metric}-analytics.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private getEmptyAnalyticsData(): AnalyticsData {
    return {
      metric: this.config.metric || 'unknown',
      period: this.selectedPeriod,
      currentValue: 0,
      previousValue: 0,
      trend: 0,
      chartData: [],
      summary: {
        total: 0,
        average: 0,
        peak: 0,
        low: 0
      }
    };
  }

  private getMockAnalyticsData(): AnalyticsData {
    const metric = this.config.metric || 'specimen-volume';

    // Generate mock data based on metric type
    const chartData = this.generateMockChartData(metric);
    const values = chartData.map(d => d.value);
    const currentValue = values[values.length - 1] || 0;
    const previousValue = values[values.length - 2] || 0;
    const trend = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

    return {
      metric,
      period: this.selectedPeriod,
      currentValue,
      previousValue,
      trend,
      chartData,
      summary: {
        total: values.reduce((sum, val) => sum + val, 0),
        average: values.reduce((sum, val) => sum + val, 0) / values.length,
        peak: Math.max(...values),
        low: Math.min(...values)
      }
    };
  }

  private generateMockChartData(metric: string): ChartDataPoint[] {
    const periods = this.getPeriodLabels();
    const baseValue = this.getBaseValue(metric);

    return periods.map((period, index) => ({
      label: period,
      value: baseValue + (Math.random() - 0.5) * baseValue * 0.4, // ±20% variation
      date: new Date(Date.now() - (periods.length - index - 1) * this.getPeriodDuration())
    }));
  }

  private getPeriodLabels(): string[] {
    const now = new Date();
    const labels: string[] = [];

    if (this.selectedPeriod === 'day') {
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      }
    } else if (this.selectedPeriod === 'week') {
      for (let i = 7; i >= 0; i--) {
        labels.push(`Week ${8 - i}`);
      }
    } else if (this.selectedPeriod === 'month') {
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(date.toLocaleDateString('en-US', { month: 'short' }));
      }
    } else if (this.selectedPeriod === 'quarter') {
      for (let i = 3; i >= 0; i--) {
        labels.push(`Q${4 - i}`);
      }
    }

    return labels;
  }

  private getBaseValue(metric: string): number {
    const baseValues: { [key: string]: number } = {
      'turnaround-time': 24,
      'specimen-volume': 150,
      'quality': 95,
      'revenue': 25000,
      'productivity': 8.5,
      'cases': 45
    };

    return baseValues[metric] || 100;
  }

  private getPeriodDuration(): number {
    const durations: { [key: string]: number } = {
      'day': 24 * 60 * 60 * 1000,
      'week': 7 * 24 * 60 * 60 * 1000,
      'month': 30 * 24 * 60 * 60 * 1000,
      'quarter': 90 * 24 * 60 * 60 * 1000
    };

    return durations[this.selectedPeriod] || durations.week;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}