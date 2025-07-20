import { Injectable } from '@angular/core';
import {
  Bundle,
  DiagnosticReport,
  Resource, 
  Specimen
} from '@medplum/fhirtypes';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { MedplumService } from '../medplum.service';
import { AnalyticsMetric, SearchParams, TurnaroundTimeMetric } from '../types/fhir-types';
import { ErrorHandlingService } from './error-handling.service';

export interface AnalyticsQuery {
  resourceType: string;
  searchParams: SearchParams;
  aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  groupBy?: string;
  dateRange?: {
    start: Date;
    end: Date;
    field: string;
  };
}

export interface AnalyticsResult {
  query: AnalyticsQuery;
  data: unknown[];
  total: number;
  timestamp: Date;
  executionTime: number;
}

export interface PerformanceMetrics {
  turnaroundTime: TurnaroundTimeMetric[];
  specimenVolume: AnalyticsMetric[];
  qualityMetrics: AnalyticsMetric[];
  revenueMetrics: AnalyticsMetric[];
}

export interface TrendData {
  period: string;
  value: number;
  change?: number;
  changePercent?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private metricsCache$ = new BehaviorSubject<PerformanceMetrics | null>(null);
  private refreshInterval = 5 * 60 * 1000; // 5 minutes
  private isRefreshing$ = new BehaviorSubject<boolean>(false);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.initializeRealTimeUpdates();
  }

  /**
   * Execute FHIR search-based analytics query
   */
  async executeQuery(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const startTime = Date.now();

    try {
      const searchParams = this.buildSearchParams(query);
      const bundle = await this.medplumService.searchResources(
        query.resourceType,
        searchParams
      );

      const data = this.processQueryResults(bundle, query);
      const executionTime = Date.now() - startTime;

      return {
        query,
        data,
        total: bundle.total || 0,
        timestamp: new Date(),
        executionTime
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'analytics-query');
      throw error;
    }
  }

  /**
   * Get real-time performance metrics
   */
  getPerformanceMetrics(): Observable<PerformanceMetrics> {
    return this.metricsCache$.asObservable().pipe(
      map(metrics => metrics || this.getEmptyMetrics())
    );
  }

  /**
   * Get turnaround time analytics
   */
  async getTurnaroundTimeMetrics(
    dateRange?: { start: Date; end: Date }
  ): Promise<TurnaroundTimeMetric[]> {
    try {
      const searchParams: SearchParams = {
        status: 'final',
        _sort: '-issued',
        _count: '1000'
      };

      if (dateRange) {
        searchParams.issued = `ge${dateRange.start.toISOString()}&issued=le${dateRange.end.toISOString()}`;
      }

      const reports = await this.medplumService.searchDiagnosticReports(searchParams);
      return this.calculateTurnaroundTimes(reports);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'turnaround-time-metrics');
      return [];
    }
  }

  /**
   * Get specimen volume analytics
   */
  async getSpecimenVolumeMetrics(
    dateRange?: { start: Date; end: Date }
  ): Promise<AnalyticsMetric[]> {
    try {
      const searchParams: SearchParams = {
        status: 'available',
        _sort: '-receivedTime',
        _count: '1000'
      };

      if (dateRange) {
        searchParams.receivedTime = `ge${dateRange.start.toISOString()}&receivedTime=le${dateRange.end.toISOString()}`;
      }

      const specimens = await this.medplumService.searchSpecimens(searchParams);
      return this.calculateVolumeMetrics(specimens);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-volume-metrics');
      return [];
    }
  }

  /**
   * Get quality metrics
   */
  async getQualityMetrics(
    _dateRange?: { start: Date; end: Date }
  ): Promise<AnalyticsMetric[]> {
    try {
      // Get rejected specimens
      const rejectedSpecimens = await this.medplumService.searchSpecimens({
        status: 'unsatisfactory',
        _count: '1000'
      });

      // Get amended reports
      const amendedReports = await this.medplumService.searchDiagnosticReports({
        status: 'amended',
        _count: '1000'
      });

      return this.calculateQualityMetrics(rejectedSpecimens, amendedReports);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'quality-metrics');
      return [];
    }
  }

  /**
   * Get revenue analytics
   */
  async getRevenueMetrics(
    dateRange?: { start: Date; end: Date }
  ): Promise<AnalyticsMetric[]> {
    try {
      // This would typically query Claims and PaymentReconciliation resources
      // For now, we'll calculate based on finalized reports
      const searchParams: SearchParams = {
        status: 'final',
        _sort: '-issued',
        _count: '1000'
      };

      if (dateRange) {
        searchParams.issued = `ge${dateRange.start.toISOString()}&issued=le${dateRange.end.toISOString()}`;
      }

      const reports = await this.medplumService.searchDiagnosticReports(searchParams);
      return this.calculateRevenueMetrics(reports);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'revenue-metrics');
      return [];
    }
  }

  /**
   * Get trend analysis for a specific metric
   */
  async getTrendAnalysis(
    metricType: 'turnaround' | 'volume' | 'quality' | 'revenue',
    period: 'daily' | 'weekly' | 'monthly',
    duration: number = 30
  ): Promise<TrendData[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case 'daily':
          startDate.setDate(endDate.getDate() - duration);
          break;
        case 'weekly':
          startDate.setDate(endDate.getDate() - (duration * 7));
          break;
        case 'monthly':
          startDate.setMonth(endDate.getMonth() - duration);
          break;
      }

      const dateRange = { start: startDate, end: endDate };
      let metrics: AnalyticsMetric[] = [];

      switch (metricType) {
        case 'turnaround':
          metrics = await this.getTurnaroundTimeMetrics(dateRange);
          break;
        case 'volume':
          metrics = await this.getSpecimenVolumeMetrics(dateRange);
          break;
        case 'quality':
          metrics = await this.getQualityMetrics(dateRange);
          break;
        case 'revenue':
          metrics = await this.getRevenueMetrics(dateRange);
          break;
      }

      return this.calculateTrends(metrics, period);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'trend-analysis');
      return [];
    }
  }

  /**
   * Refresh all metrics
   */
  async refreshMetrics(): Promise<void> {
    if (this.isRefreshing$.value) {
      return;
    }

    this.isRefreshing$.next(true);

    try {
      const [turnaroundTime, specimenVolume, qualityMetrics, revenueMetrics] = await Promise.all([
        this.getTurnaroundTimeMetrics(),
        this.getSpecimenVolumeMetrics(),
        this.getQualityMetrics(),
        this.getRevenueMetrics()
      ]);

      const metrics: PerformanceMetrics = {
        turnaroundTime,
        specimenVolume,
        qualityMetrics,
        revenueMetrics
      };

      this.metricsCache$.next(metrics);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'refresh-metrics');
    } finally {
      this.isRefreshing$.next(false);
    }
  }

  /**
   * Get refresh status
   */
  getRefreshStatus(): Observable<boolean> {
    return this.isRefreshing$.asObservable();
  }

  // Private helper methods

  private initializeRealTimeUpdates(): void {
    // Set up periodic refresh
    interval(this.refreshInterval).pipe(
      startWith(0),
      switchMap(() => this.refreshMetrics()),
      catchError(error => {
        console.error('Error in real-time updates:', error);
        return [];
      })
    ).subscribe();
  }

  private buildSearchParams(query: AnalyticsQuery): SearchParams {
    const params = { ...query.searchParams };

    if (query.dateRange) {
      const { start, end, field } = query.dateRange;
      params[field] = `ge${start.toISOString()}&${field}=le${end.toISOString()}`;
    }

    return params;
  }

  private processQueryResults(bundle: Bundle, query: AnalyticsQuery): unknown[] {
    const resources = bundle.entry?.map(entry => entry.resource).filter((resource): resource is Resource => Boolean(resource)) || [];

    if (!(query.aggregation || query.groupBy)) {
      return resources;
    }

    if (query.groupBy) {
      return this.groupResults(resources, query.groupBy, query.aggregation);
    }

    if (query.aggregation) {
      return this.aggregateResults(resources, query.aggregation);
    }

    return resources;
  }

  private groupResults(resources: Resource[], groupBy: string, aggregation?: string): unknown[] {
    const groups = new Map<string, Resource[]>();

    resources.forEach(resource => {
      const groupValue = this.getNestedProperty(resource as unknown as Record<string, unknown>, groupBy) || 'unknown';
      const key = typeof groupValue === 'object' ? JSON.stringify(groupValue) : String(groupValue);

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      const group = groups.get(key);
      if (group) {
        group.push(resource);
      }
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      group: key,
      count: items.length,
      items: aggregation ? this.aggregateResults(items, aggregation) : items
    }));
  }

  private aggregateResults(resources: Resource[], aggregation: string): unknown[] {
    switch (aggregation) {
      case 'count':
        return [{ value: resources.length }];
      case 'sum':
      case 'avg':
      case 'min':
      case 'max':
        // These would need specific field extraction logic
        return [{ value: resources.length }];
      default:
        return resources;
    }
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj as unknown);
  }

  private calculateTurnaroundTimes(reports: DiagnosticReport[]): TurnaroundTimeMetric[] {
    const metrics: TurnaroundTimeMetric[] = [];
    const specialtyGroups = new Map<string, DiagnosticReport[]>();

    // Group by specialty/category
    reports.forEach(report => {
      const category = report.category?.[0]?.coding?.[0]?.display || 'General';
      if (!specialtyGroups.has(category)) {
        specialtyGroups.set(category, []);
      }
      const group = specialtyGroups.get(category);
      if (group) {
        group.push(report);
      }
    });

    specialtyGroups.forEach((reports, specialty) => {
      const turnaroundTimes = reports
        .map(report => this.calculateReportTurnaroundTime(report))
        .filter(time => time > 0);

      if (turnaroundTimes.length > 0) {
        const avgTurnaround = turnaroundTimes.reduce((sum, time) => sum + time, 0) / turnaroundTimes.length;
        const target = this.getTargetTurnaroundTime(specialty);

        metrics.push({
          name: `${specialty} Turnaround Time`,
          value: avgTurnaround,
          unit: 'hours',
          trend: avgTurnaround <= target ? 'stable' : 'up',
          period: 'current',
          specialty,
          testType: specialty,
          target,
          actual: avgTurnaround
        });
      }
    });

    return metrics;
  }

  private calculateReportTurnaroundTime(report: DiagnosticReport): number {
    if (!(report.effectiveDateTime && report.issued)) {
      return 0;
    }

    const start = new Date(report.effectiveDateTime);
    const end = new Date(report.issued);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60); // hours
  }

  private getTargetTurnaroundTime(specialty: string): number {
    // Default target turnaround times by specialty (in hours)
    const targets: Record<string, number> = {
      'Histopathology': 48,
      'Microbiology': 72,
      'Chemistry': 4,
      'Hematology': 2,
      'General': 24
    };

    return targets[specialty] || 24;
  }

  private calculateVolumeMetrics(specimens: Specimen[]): AnalyticsMetric[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const todayCount = specimens.filter(s =>
      s.receivedTime && new Date(s.receivedTime) >= today
    ).length;

    const weekCount = specimens.filter(s =>
      s.receivedTime && new Date(s.receivedTime) >= thisWeek
    ).length;

    const monthCount = specimens.filter(s =>
      s.receivedTime && new Date(s.receivedTime) >= thisMonth
    ).length;

    return [
      {
        name: 'Daily Specimen Volume',
        value: todayCount,
        unit: 'specimens',
        trend: 'stable',
        period: 'today'
      },
      {
        name: 'Weekly Specimen Volume',
        value: weekCount,
        unit: 'specimens',
        trend: 'stable',
        period: 'this week'
      },
      {
        name: 'Monthly Specimen Volume',
        value: monthCount,
        unit: 'specimens',
        trend: 'stable',
        period: 'this month'
      }
    ];
  }

  private calculateQualityMetrics(
    rejectedSpecimens: Specimen[],
    amendedReports: DiagnosticReport[]
  ): AnalyticsMetric[] {
    const totalSpecimens = 1000; // This would come from a total count query
    const totalReports = 800; // This would come from a total count query

    const rejectionRate = (rejectedSpecimens.length / totalSpecimens) * 100;
    const amendmentRate = (amendedReports.length / totalReports) * 100;

    return [
      {
        name: 'Specimen Rejection Rate',
        value: rejectionRate,
        unit: '%',
        trend: rejectionRate < 2 ? 'stable' : 'up',
        period: 'current'
      },
      {
        name: 'Report Amendment Rate',
        value: amendmentRate,
        unit: '%',
        trend: amendmentRate < 1 ? 'stable' : 'up',
        period: 'current'
      }
    ];
  }

  private calculateRevenueMetrics(reports: DiagnosticReport[]): AnalyticsMetric[] {
    // This is a simplified calculation - in reality would use Claims and Payment resources
    const estimatedRevenuePerReport = 150; // Average revenue per report
    const totalRevenue = reports.length * estimatedRevenuePerReport;

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyReports = reports.filter(r =>
      r.issued && new Date(r.issued) >= thisMonth
    );

    return [
      {
        name: 'Total Revenue',
        value: totalRevenue,
        unit: 'INR',
        trend: 'up',
        period: 'current'
      },
      {
        name: 'Monthly Revenue',
        value: monthlyReports.length * estimatedRevenuePerReport,
        unit: 'INR',
        trend: 'up',
        period: 'this month'
      }
    ];
  }

  private calculateTrends(metrics: AnalyticsMetric[], period: string): TrendData[] {
    // This is a simplified trend calculation
    // In a real implementation, you would compare with historical data
    return metrics.map((metric, index) => ({
      period: `${period}-${index + 1}`,
      value: metric.value,
      change: Math.random() * 10 - 5, // Random change for demo
      changePercent: (Math.random() * 20 - 10)
    }));
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      turnaroundTime: [],
      specimenVolume: [],
      qualityMetrics: [],
      revenueMetrics: []
    };
  }
}