import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { interval, Subject } from 'rxjs';
import { startWith, switchMap, takeUntil } from 'rxjs/operators';
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

interface WidgetConfig {
  refreshInterval: number;
}

@Component({
  selector: 'app-revenue-analytics-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './revenue-analytics-widget.component.html',
  styleUrls: ['./revenue-analytics-widget.component.scss']
})
export class RevenueAnalyticsWidgetComponent implements OnInit, OnDestroy {
  private analyticsService = inject(AnalyticsService);

  private destroy$ = new Subject<void>();

  @Input() config: WidgetConfig = { refreshInterval: 300000 }; // 5 minutes

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

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() { }

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
      default: return '→';
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

  getPaymentTrendData(): Array<{ period: string, billed: number, collected: number }> {
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
    if (performance >= 100) {
      return 'good';
    }
    if (performance >= 90) {
      return 'warning';
    }
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