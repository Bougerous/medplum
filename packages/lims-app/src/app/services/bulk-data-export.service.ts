import { Injectable, inject } from '@angular/core';
import { Resource } from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { SearchParams } from '../types/fhir-types';
import { ErrorHandlingService } from './error-handling.service';

export interface ExportRequest {
  id: string;
  resourceTypes: string[];
  filters?: SearchParams;
  since?: Date;
  until?: Date;
  format: 'json' | 'csv' | 'xlsx';
  deIdentify: boolean;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  error?: string;
  progress?: number;
  totalRecords?: number;
  processedRecords?: number;
}

export interface ExportJob {
  request: ExportRequest;
  data?: any[];
  metadata?: {
    totalSize: number;
    recordCount: number;
    exportedFields: string[];
    deIdentificationRules: string[];
  };
}

export interface DeIdentificationRule {
  field: string;
  action: 'remove' | 'hash' | 'generalize' | 'shift';
  parameters?: any;
}

export interface DataWarehouseConnection {
  type: 'postgresql' | 'mysql' | 'snowflake' | 'bigquery';
  host: string;
  database: string;
  credentials: any;
  schema?: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  description: string;
  schedule: string; // cron expression
  exportRequest: Omit<ExportRequest, 'id' | 'status' | 'createdAt'>;
  recipients: string[];
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class BulkDataExportService {
  private medplumService = inject(MedplumService);
  private errorHandlingService = inject(ErrorHandlingService);

  private exportJobs$ = new BehaviorSubject<ExportJob[]>([]);
  private scheduledReports$ = new BehaviorSubject<ScheduledReport[]>([]);
  private activeExports = new Map<string, ExportJob>();

  // De-identification rules for HIPAA compliance
  private deIdentificationRules: DeIdentificationRule[] = [
    { field: 'Patient.name', action: 'remove' },
    { field: 'Patient.telecom', action: 'remove' },
    { field: 'Patient.address', action: 'generalize', parameters: { level: 'state' } },
    { field: 'Patient.birthDate', action: 'generalize', parameters: { precision: 'year' } },
    { field: 'Patient.identifier', action: 'hash' },
    { field: 'Practitioner.name', action: 'remove' },
    { field: 'Practitioner.telecom', action: 'remove' },
    { field: 'Organization.name', action: 'generalize' },
    { field: 'DiagnosticReport.issued', action: 'shift', parameters: { maxDays: 30 } },
    { field: 'Specimen.receivedTime', action: 'shift', parameters: { maxDays: 30 } }
  ];

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.initializeScheduledReports();
  }

  /**
   * Create a new bulk data export request
   */
  async createExportRequest(
    resourceTypes: string[],
    options: {
      filters?: SearchParams;
      since?: Date;
      until?: Date;
      format?: 'json' | 'csv' | 'xlsx';
      deIdentify?: boolean;
    } = {}
  ): Promise<ExportRequest> {
    const request: ExportRequest = {
      id: this.generateExportId(),
      resourceTypes,
      filters: options.filters,
      since: options.since,
      until: options.until,
      format: options.format || 'json',
      deIdentify: options.deIdentify,
      status: 'pending',
      createdAt: new Date(),
      progress: 0
    };

    // Start the export process
    this.processExportRequest(request);

    return request;
  }

  /**
   * Get all export jobs
   */
  getExportJobs(): Observable<ExportJob[]> {
    return this.exportJobs$.asObservable();
  }

  /**
   * Get specific export job by ID
   */
  getExportJob(id: string): ExportJob | undefined {
    return this.activeExports.get(id);
  }

  /**
   * Cancel an export job
   */
  async cancelExportJob(id: string): Promise<void> {
    const job = this.activeExports.get(id);
    if (job && job.request.status === 'in-progress') {
      job.request.status = 'failed';
      job.request.error = 'Cancelled by user';
      this.updateExportJob(job);
    }
  }

  /**
   * Download export data
   */
  async downloadExport(id: string): Promise<Blob> {
    const job = this.activeExports.get(id);
    if (!job || job.request.status !== 'completed' || !job.data) {
      throw new Error('Export not ready for download');
    }

    const format = job.request.format;
    let blob: Blob;

    switch (format) {
      case 'json':
        blob = new Blob([JSON.stringify(job.data, null, 2)], {
          type: 'application/json'
        });
        break;
      case 'csv': {
        const csv = this.convertToCSV(job.data);
        blob = new Blob([csv], { type: 'text/csv' });
        break;
      }
      case 'xlsx': {
        // This would require a library like xlsx or exceljs
        const xlsx = await this.convertToXLSX(job.data);
        blob = new Blob([xlsx], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        break;
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return blob;
  }

  /**
   * Create scheduled report
   */
  async createScheduledReport(report: Omit<ScheduledReport, 'id'>): Promise<ScheduledReport> {
    const scheduledReport: ScheduledReport = {
      ...report,
      id: this.generateReportId()
    };

    const currentReports = this.scheduledReports$.value;
    this.scheduledReports$.next([...currentReports, scheduledReport]);

    // Schedule the report
    this.scheduleReport(scheduledReport);

    return scheduledReport;
  }

  /**
   * Get all scheduled reports
   */
  getScheduledReports(): Observable<ScheduledReport[]> {
    return this.scheduledReports$.asObservable();
  }

  /**
   * Update scheduled report
   */
  async updateScheduledReport(report: ScheduledReport): Promise<void> {
    const currentReports = this.scheduledReports$.value;
    const index = currentReports.findIndex(r => r.id === report.id);

    if (index >= 0) {
      currentReports[index] = report;
      this.scheduledReports$.next([...currentReports]);

      // Reschedule if enabled
      if (report.enabled) {
        this.scheduleReport(report);
      }
    }
  }

  /**
   * Delete scheduled report
   */
  async deleteScheduledReport(id: string): Promise<void> {
    const currentReports = this.scheduledReports$.value;
    const filteredReports = currentReports.filter(r => r.id !== id);
    this.scheduledReports$.next(filteredReports);
  }

  /**
   * Connect to data warehouse for advanced analytics
   */
  async connectToDataWarehouse(connection: DataWarehouseConnection): Promise<boolean> {
    try {
      // This would implement actual data warehouse connection
      // For now, we'll simulate the connection
      console.log('Connecting to data warehouse:', connection);

      // Validate connection parameters
      if (!(connection.host && connection.database)) {
        throw new Error('Invalid connection parameters');
      }

      // Test connection (mock)
      await this.delay(2000);

      return true;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'data-warehouse-connection');
      return false;
    }
  }

  /**
   * Export data to data warehouse
   */
  async exportToDataWarehouse(
    connection: DataWarehouseConnection,
    exportRequest: ExportRequest
  ): Promise<void> {
    try {
      // Process the export request
      const job = await this.processExportRequest(exportRequest);

      if (job.request.status !== 'completed' || !job.data) {
        throw new Error('Export failed or incomplete');
      }

      // Transform data for data warehouse
      const transformedData = this.transformForDataWarehouse(job.data, connection);

      // Upload to data warehouse (mock implementation)
      console.log('Uploading to data warehouse:', {
        connection: connection.type,
        records: transformedData.length
      });

      await this.delay(5000); // Simulate upload time

    } catch (error) {
      this.errorHandlingService.handleError(error, 'data-warehouse-export');
      throw error;
    }
  }

  // Private methods

  private async processExportRequest(request: ExportRequest): Promise<ExportJob> {
    const job: ExportJob = {
      request: { ...request, status: 'in-progress' }
    };

    this.activeExports.set(request.id, job);
    this.updateExportJob(job);

    try {
      // Collect data from all requested resource types
      const allData: Resource[] = [];
      let totalRecords = 0;

      for (const resourceType of request.resourceTypes) {
        const searchParams = this.buildSearchParams(request, resourceType);
        const bundle = await this.medplumService.searchResources(resourceType, searchParams);

        if (bundle.entry) {
          const resources = bundle.entry
            .map(entry => entry.resource)
            .filter(Boolean) as Resource[];

          allData.push(...resources);
          totalRecords += resources.length;
        }

        // Update progress
        const progress = (allData.length / (totalRecords || 1)) * 100;
        job.request.progress = Math.min(progress, 90); // Reserve 10% for processing
        this.updateExportJob(job);
      }

      // Apply de-identification if requested
      let processedData = allData;
      if (request.deIdentify) {
        processedData = this.applyDeIdentification(allData);
      }

      // Set final data and metadata
      job.data = processedData;
      job.metadata = {
        totalSize: JSON.stringify(processedData).length,
        recordCount: processedData.length,
        exportedFields: this.getExportedFields(processedData),
        deIdentificationRules: request.deIdentify ?
          this.deIdentificationRules.map(rule => rule.field) : []
      };

      job.request.status = 'completed';
      job.request.progress = 100;
      job.request.completedAt = new Date();
      job.request.totalRecords = totalRecords;
      job.request.processedRecords = processedData.length;

    } catch (error) {
      job.request.status = 'failed';
      job.request.error = error instanceof Error ? error.message : 'Unknown error';
      this.errorHandlingService.handleError(error, 'bulk-export');
    }

    this.updateExportJob(job);
    return job;
  }

  private buildSearchParams(request: ExportRequest, resourceType: string): SearchParams {
    const params: SearchParams = { ...request.filters };

    // Add date filters if specified
    if (request.since || request.until) {
      const dateField = this.getDateFieldForResourceType(resourceType);
      if (dateField) {
        if (request.since) {
          params[dateField] = `ge${request.since.toISOString()}`;
        }
        if (request.until) {
          const existingFilter = params[dateField];
          const untilFilter = `le${request.until.toISOString()}`;
          params[dateField] = existingFilter ?
            `${existingFilter}&${dateField}=${untilFilter}` : untilFilter;
        }
      }
    }

    // Set reasonable limits for bulk export
    params._count = '1000';

    return params;
  }

  private getDateFieldForResourceType(resourceType: string): string | null {
    const dateFields: Record<string, string> = {
      'Patient': 'birthDate',
      'Specimen': 'receivedTime',
      'DiagnosticReport': 'issued',
      'ServiceRequest': 'authoredOn',
      'Observation': 'effectiveDateTime',
      'Procedure': 'performedDateTime'
    };

    return dateFields[resourceType] || null;
  }

  private applyDeIdentification(data: Resource[]): Resource[] {
    return data.map(resource => {
      const deIdentified = JSON.parse(JSON.stringify(resource)); // Deep clone

      this.deIdentificationRules.forEach(rule => {
        if (this.fieldAppliesTo(rule.field, resource.resourceType)) {
          this.applyDeIdentificationRule(deIdentified, rule);
        }
      });

      return deIdentified;
    });
  }

  private fieldAppliesTo(field: string, resourceType: string): boolean {
    return field.startsWith(`${resourceType}.`);
  }

  private applyDeIdentificationRule(resource: any, rule: DeIdentificationRule): void {
    const fieldPath = rule.field.split('.').slice(1); // Remove resource type prefix
    const fieldValue = this.getNestedValue(resource, fieldPath);

    if (fieldValue !== undefined) {
      switch (rule.action) {
        case 'remove':
          this.setNestedValue(resource, fieldPath, undefined);
          break;
        case 'hash':
          this.setNestedValue(resource, fieldPath, this.hashValue(fieldValue));
          break;
        case 'generalize':
          this.setNestedValue(resource, fieldPath, this.generalizeValue(fieldValue, rule.parameters));
          break;
        case 'shift':
          this.setNestedValue(resource, fieldPath, this.shiftDate(fieldValue, rule.parameters));
          break;
      }
    }
  }

  private getNestedValue(obj: any, path: string[]): any {
    return path.reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string[], value: any): void {
    const lastKey = path.pop()!;
    const target = path.reduce((current, key) => current[key] = current[key] || {}, obj);
    if (value === undefined) {
      delete target[lastKey];
    } else {
      target[lastKey] = value;
    }
  }

  private hashValue(value: any): string {
    // Simple hash function - in production, use a proper cryptographic hash
    return btoa(String(value)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
  }

  private generalizeValue(value: any, parameters: any): any {
    if (parameters?.level === 'state' && typeof value === 'object' && value.state) {
      return { state: value.state };
    }
    if (parameters?.precision === 'year' && typeof value === 'string') {
      return `${value.substring(0, 4)}-01-01`;
    }
    return value;
  }

  private shiftDate(value: any, parameters: any): any {
    if (typeof value === 'string' && parameters?.maxDays) {
      const date = new Date(value);
      const shiftDays = Math.floor(Math.random() * parameters.maxDays * 2) - parameters.maxDays;
      date.setDate(date.getDate() + shiftDays);
      return date.toISOString();
    }
    return value;
  }

  private getExportedFields(data: Resource[]): string[] {
    const fields = new Set<string>();

    data.forEach(resource => {
      this.extractFields(resource, '', fields);
    });

    return Array.from(fields).sort();
  }

  private extractFields(obj: any, prefix: string, fields: Set<string>): void {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fields.add(fieldPath);

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.extractFields(obj[key], fieldPath, fields);
        }
      });
    }
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) { return ''; }

    // Flatten the data for CSV export
    const flatData = data.map(item => this.flattenObject(item));

    // Get all unique keys
    const allKeys = new Set<string>();
    flatData.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));

    const headers = Array.from(allKeys).sort();
    const csvRows = [headers.join(',')];

    flatData.forEach(item => {
      const row = headers.map(header => {
        const value = item[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  private async convertToXLSX(_data: any[]): Promise<ArrayBuffer> {
    // This would require a library like xlsx
    // For now, return a mock buffer
    const mockData = new ArrayBuffer(1024);
    return mockData;
  }

  private flattenObject(obj: any, prefix: string = ''): any {
    const flattened: any = {};

    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = Array.isArray(value) ? JSON.stringify(value) : value;
      }
    });

    return flattened;
  }

  private transformForDataWarehouse(data: any[], connection: DataWarehouseConnection): any[] {
    // Transform data based on data warehouse type
    switch (connection.type) {
      case 'postgresql':
      case 'mysql':
        return this.transformForSQL(data);
      case 'snowflake':
        return this.transformForSnowflake(data);
      case 'bigquery':
        return this.transformForBigQuery(data);
      default:
        return data;
    }
  }

  private transformForSQL(data: any[]): any[] {
    // Transform for SQL databases
    return data.map(item => ({
      ...this.flattenObject(item),
      exported_at: new Date().toISOString()
    }));
  }

  private transformForSnowflake(data: any[]): any[] {
    // Transform for Snowflake
    return this.transformForSQL(data);
  }

  private transformForBigQuery(data: any[]): any[] {
    // Transform for BigQuery
    return data.map(item => ({
      ...item,
      _exported_at: new Date().toISOString(),
      _partition_date: new Date().toISOString().split('T')[0]
    }));
  }

  private updateExportJob(job: ExportJob): void {
    const currentJobs = this.exportJobs$.value;
    const index = currentJobs.findIndex(j => j.request.id === job.request.id);

    if (index >= 0) {
      currentJobs[index] = job;
    } else {
      currentJobs.push(job);
    }

    this.exportJobs$.next([...currentJobs]);
  }

  private initializeScheduledReports(): void {
    // Initialize with some default scheduled reports
    const defaultReports: ScheduledReport[] = [
      {
        id: 'daily-volume-report',
        name: 'Daily Volume Report',
        description: 'Daily specimen volume and turnaround time metrics',
        schedule: '0 8 * * *', // Daily at 8 AM
        exportRequest: {
          resourceTypes: ['Specimen', 'DiagnosticReport'],
          format: 'xlsx',
          deIdentify: true
        },
        recipients: ['lab-manager@example.com'],
        enabled: true
      }
    ];

    this.scheduledReports$.next(defaultReports);
  }

  private scheduleReport(report: ScheduledReport): void {
    // This would integrate with a job scheduler like node-cron
    console.log('Scheduling report:', report.name, 'with schedule:', report.schedule);
  }

  private generateExportId(): string {
    return `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReportId(): string {
    return `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}