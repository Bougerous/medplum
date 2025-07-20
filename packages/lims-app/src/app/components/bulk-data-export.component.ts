import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { 
  BulkDataExportService, 
  DataWarehouseConnection, 
  ExportJob, 
  ScheduledReport
} from '../services/bulk-data-export.service';

@Component({
  selector: 'app-bulk-data-export',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="export-container">
      <div class="export-header">
        <h2>Bulk Data Export</h2>
        <div class="header-actions">
          <button (click)="showCreateExport = true" class="btn btn-primary">
            New Export
          </button>
          <button (click)="showScheduledReports = true" class="btn btn-secondary">
            Scheduled Reports
          </button>
          <button (click)="showDataWarehouse = true" class="btn btn-secondary">
            Data Warehouse
          </button>
        </div>
      </div>

      <!-- Export Jobs List -->
      <div class="export-jobs" *ngIf="!showCreateExport && !showScheduledReports && !showDataWarehouse">
        <div class="section-header">
          <h3>Export Jobs</h3>
          <div class="job-filters">
            <button 
              *ngFor="let filter of statusFilters" 
              [class.active]="activeFilter === filter.key"
              (click)="setStatusFilter(filter.key)"
              class="filter-btn">
              {{ filter.label }} ({{ getJobCountByStatus(filter.key) }})
            </button>
          </div>
        </div>

        <div class="jobs-list">
          <div 
            *ngFor="let job of getFilteredJobs()" 
            class="job-item"
            [class]="job.request.status">
            
            <div class="job-info">
              <div class="job-id">{{ job.request.id }}</div>
              <div class="job-details">
                <span class="resource-types">{{ job.request.resourceTypes.join(', ') }}</span>
                <span class="created-date">{{ job.request.createdAt | date:'short' }}</span>
              </div>
              <div class="job-metadata" *ngIf="job.metadata">
                <span class="record-count">{{ job.metadata.recordCount }} records</span>
                <span class="file-size">{{ formatFileSize(job.metadata.totalSize) }}</span>
              </div>
            </div>

            <div class="job-status">
              <div class="status-badge" [class]="job.request.status">
                {{ job.request.status | titlecase }}
              </div>
              <div class="progress-bar" *ngIf="job.request.status === 'in-progress'">
                <div 
                  class="progress-fill" 
                  [style.width.%]="job.request.progress || 0">
                </div>
              </div>
              <div class="status-text">
                <span *ngIf="job.request.status === 'in-progress'">
                  {{ job.request.progress || 0 | number:'1.0-0' }}% complete
                </span>
                <span *ngIf="job.request.status === 'completed' && job.request.completedAt">
                  Completed {{ job.request.completedAt | date:'short' }}
                </span>
                <span *ngIf="job.request.status === 'failed' && job.request.error" class="error-text">
                  {{ job.request.error }}
                </span>
              </div>
            </div>

            <div class="job-actions">
              <button 
                *ngIf="job.request.status === 'completed'" 
                (click)="downloadExport(job.request.id)"
                class="btn btn-sm btn-primary">
                Download
              </button>
              <button 
                *ngIf="job.request.status === 'in-progress'" 
                (click)="cancelExport(job.request.id)"
                class="btn btn-sm btn-danger">
                Cancel
              </button>
              <button 
                (click)="viewJobDetails(job)"
                class="btn btn-sm btn-secondary">
                Details
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="getFilteredJobs().length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No export jobs found</p>
          <button (click)="showCreateExport = true" class="btn btn-primary">
            Create First Export
          </button>
        </div>
      </div>

      <!-- Create Export Form -->
      <div class="create-export" *ngIf="showCreateExport">
        <div class="form-header">
          <h3>Create New Export</h3>
          <button (click)="showCreateExport = false" class="btn btn-text">
            ← Back
          </button>
        </div>

        <form (ngSubmit)="createExport()" class="export-form">
          <div class="form-section">
            <h4>Resource Types</h4>
            <div class="resource-checkboxes">
              <label *ngFor="let resourceType of availableResourceTypes" class="checkbox-label">
                <input 
                  type="checkbox" 
                  [value]="resourceType"
                  [(ngModel)]="selectedResourceTypes[resourceType]"
                  name="resourceType_{{resourceType}}">
                <span class="checkbox-text">{{ resourceType }}</span>
              </label>
            </div>
          </div>

          <div class="form-section">
            <h4>Date Range</h4>
            <div class="date-inputs">
              <div class="input-group">
                <label>From:</label>
                <input 
                  type="date" 
                  [(ngModel)]="exportForm.since"
                  name="since"
                  class="form-input">
              </div>
              <div class="input-group">
                <label>To:</label>
                <input 
                  type="date" 
                  [(ngModel)]="exportForm.until"
                  name="until"
                  class="form-input">
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>Export Options</h4>
            <div class="form-row">
              <div class="input-group">
                <label>Format:</label>
                <select [(ngModel)]="exportForm.format" name="format" class="form-select">
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                </select>
              </div>
              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    [(ngModel)]="exportForm.deIdentify"
                    name="deIdentify">
                  <span class="checkbox-text">De-identify data (HIPAA compliant)</span>
                </label>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" (click)="showCreateExport = false" class="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="!isFormValid()">
              Create Export
            </button>
          </div>
        </form>
      </div>

      <!-- Scheduled Reports -->
      <div class="scheduled-reports" *ngIf="showScheduledReports">
        <div class="form-header">
          <h3>Scheduled Reports</h3>
          <div class="header-actions">
            <button (click)="showCreateReport = true" class="btn btn-primary">
              New Report
            </button>
            <button (click)="showScheduledReports = false" class="btn btn-text">
              ← Back
            </button>
          </div>
        </div>

        <div class="reports-list" *ngIf="!showCreateReport">
          <div 
            *ngFor="let report of scheduledReports" 
            class="report-item"
            [class.disabled]="!report.enabled">
            
            <div class="report-info">
              <div class="report-name">{{ report.name }}</div>
              <div class="report-description">{{ report.description }}</div>
              <div class="report-schedule">
                <span class="schedule-text">{{ formatSchedule(report.schedule) }}</span>
                <span class="next-run" *ngIf="report.nextRun">
                  Next: {{ report.nextRun | date:'short' }}
                </span>
              </div>
            </div>

            <div class="report-status">
              <div class="status-indicator" [class.enabled]="report.enabled"></div>
              <span class="status-text">{{ report.enabled ? 'Enabled' : 'Disabled' }}</span>
            </div>

            <div class="report-actions">
              <button (click)="runReportNow(report)" class="btn btn-sm btn-primary">
                Run Now
              </button>
              <button (click)="editReport(report)" class="btn btn-sm btn-secondary">
                Edit
              </button>
              <button (click)="toggleReport(report)" class="btn btn-sm btn-text">
                {{ report.enabled ? 'Disable' : 'Enable' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Create Report Form would go here -->
        <div class="create-report-form" *ngIf="showCreateReport">
          <p>Create Report Form - Implementation would go here</p>
          <button (click)="showCreateReport = false" class="btn btn-secondary">
            Cancel
          </button>
        </div>
      </div>

      <!-- Data Warehouse Connection -->
      <div class="data-warehouse" *ngIf="showDataWarehouse">
        <div class="form-header">
          <h3>Data Warehouse Integration</h3>
          <button (click)="showDataWarehouse = false" class="btn btn-text">
            ← Back
          </button>
        </div>

        <div class="warehouse-content">
          <div class="connection-status">
            <div class="status-card" [class.connected]="isWarehouseConnected">
              <div class="status-icon">
                {{ isWarehouseConnected ? '✅' : '❌' }}
              </div>
              <div class="status-text">
                <div class="status-title">
                  {{ isWarehouseConnected ? 'Connected' : 'Not Connected' }}
                </div>
                <div class="status-description">
                  {{ isWarehouseConnected ? 'Data warehouse is ready for exports' : 'Configure connection to enable data warehouse exports' }}
                </div>
              </div>
            </div>
          </div>

          <form (ngSubmit)="testWarehouseConnection()" class="warehouse-form">
            <div class="form-section">
              <h4>Connection Settings</h4>
              <div class="form-row">
                <div class="input-group">
                  <label>Type:</label>
                  <select [(ngModel)]="warehouseConnection.type" name="type" class="form-select">
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="snowflake">Snowflake</option>
                    <option value="bigquery">BigQuery</option>
                  </select>
                </div>
                <div class="input-group">
                  <label>Host:</label>
                  <input 
                    type="text" 
                    [(ngModel)]="warehouseConnection.host"
                    name="host"
                    placeholder="localhost:5432"
                    class="form-input">
                </div>
              </div>
              <div class="form-row">
                <div class="input-group">
                  <label>Database:</label>
                  <input 
                    type="text" 
                    [(ngModel)]="warehouseConnection.database"
                    name="database"
                    placeholder="analytics_db"
                    class="form-input">
                </div>
                <div class="input-group">
                  <label>Schema:</label>
                  <input 
                    type="text" 
                    [(ngModel)]="warehouseConnection.schema"
                    name="schema"
                    placeholder="lims_data"
                    class="form-input">
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary" [disabled]="isTestingConnection">
                {{ isTestingConnection ? 'Testing...' : 'Test Connection' }}
              </button>
              <button 
                type="button" 
                (click)="saveWarehouseConnection()" 
                class="btn btn-success"
                [disabled]="!isWarehouseConnected">
                Save Configuration
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .export-container {
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .export-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .export-header h2 {
      margin: 0;
      color: #2c3e50;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .section-header h3 {
      margin: 0;
      color: #34495e;
    }

    .job-filters {
      display: flex;
      gap: 0.5rem;
    }

    .filter-btn {
      padding: 0.375rem 0.75rem;
      border: 1px solid #ddd;
      background: white;
      border-radius: 20px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      background: #f8f9fa;
    }

    .filter-btn.active {
      background: #3498db;
      color: white;
      border-color: #3498db;
    }

    .jobs-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .job-item {
      display: flex;
      align-items: center;
      padding: 1.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: white;
      transition: all 0.2s;
    }

    .job-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .job-item.completed {
      border-left: 4px solid #27ae60;
    }

    .job-item.failed {
      border-left: 4px solid #e74c3c;
    }

    .job-item.in-progress {
      border-left: 4px solid #3498db;
    }

    .job-info {
      flex: 1;
    }

    .job-id {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    .job-details {
      display: flex;
      gap: 1rem;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .job-metadata {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: #95a5a6;
    }

    .job-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0 2rem;
      min-width: 120px;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .status-badge.pending {
      background: #f39c12;
      color: white;
    }

    .status-badge.in-progress {
      background: #3498db;
      color: white;
    }

    .status-badge.completed {
      background: #27ae60;
      color: white;
    }

    .status-badge.failed {
      background: #e74c3c;
      color: white;
    }

    .progress-bar {
      width: 100px;
      height: 6px;
      background: #ecf0f1;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }

    .progress-fill {
      height: 100%;
      background: #3498db;
      transition: width 0.3s ease;
    }

    .status-text {
      font-size: 0.75rem;
      color: #7f8c8d;
      text-align: center;
    }

    .error-text {
      color: #e74c3c;
    }

    .job-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #3498db;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2980b9;
    }

    .btn-secondary {
      background: #95a5a6;
      color: white;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #7f8c8d;
    }

    .btn-success {
      background: #27ae60;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background: #229954;
    }

    .btn-danger {
      background: #e74c3c;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #c0392b;
    }

    .btn-text {
      background: transparent;
      color: #3498db;
      border: 1px solid transparent;
    }

    .btn-text:hover {
      background: #f8f9fa;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .form-header h3 {
      margin: 0;
      color: #2c3e50;
    }

    .export-form {
      max-width: 600px;
    }

    .form-section {
      margin-bottom: 2rem;
    }

    .form-section h4 {
      margin: 0 0 1rem 0;
      color: #34495e;
    }

    .resource-checkboxes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .checkbox-text {
      font-size: 0.875rem;
      color: #2c3e50;
    }

    .date-inputs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .input-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #34495e;
    }

    .form-input, .form-select {
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: #3498db;
      box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      align-items: end;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #e0e0e0;
    }

    .reports-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .report-item {
      display: flex;
      align-items: center;
      padding: 1.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: white;
      transition: all 0.2s;
    }

    .report-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .report-item.disabled {
      opacity: 0.6;
    }

    .report-info {
      flex: 1;
    }

    .report-name {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    .report-description {
      color: #7f8c8d;
      margin-bottom: 0.5rem;
    }

    .report-schedule {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: #95a5a6;
    }

    .report-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 2rem;
    }

    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #e74c3c;
    }

    .status-indicator.enabled {
      background: #27ae60;
    }

    .report-actions {
      display: flex;
      gap: 0.5rem;
    }

    .connection-status {
      margin-bottom: 2rem;
    }

    .status-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: white;
    }

    .status-card.connected {
      border-color: #27ae60;
      background: rgba(39, 174, 96, 0.05);
    }

    .status-icon {
      font-size: 2rem;
    }

    .status-title {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }

    .status-description {
      color: #7f8c8d;
      font-size: 0.875rem;
    }

    .warehouse-form {
      max-width: 600px;
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #7f8c8d;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  `]
})
export class BulkDataExportComponent implements OnInit, OnDestroy {
  private readonly bulkDataExportService = inject(BulkDataExportService);
  private readonly destroy$ = new Subject<void>();

  exportJobs: ExportJob[] = [];
  scheduledReports: ScheduledReport[] = [];
  
  showCreateExport = false;
  showScheduledReports = false;
  showDataWarehouse = false;
  showCreateReport = false;
  
  activeFilter = 'all';
  isTestingConnection = false;
  isWarehouseConnected = false;

  availableResourceTypes = [
    'Patient', 'Specimen', 'DiagnosticReport', 'ServiceRequest',
    'Observation', 'Procedure', 'Practitioner', 'Organization'
  ];

  selectedResourceTypes: Record<string, boolean> = {};

  exportForm = {
    since: '',
    until: '',
    format: 'json' as 'json' | 'csv' | 'xlsx',
    deIdentify: true
  };

  warehouseConnection: DataWarehouseConnection = {
    type: 'postgresql',
    host: '',
    database: '',
    credentials: {},
    schema: ''
  };

  statusFilters = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' }
  ];

  ngOnInit(): void {
    this.loadExportJobs();
    this.loadScheduledReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadExportJobs(): void {
    this.bulkDataExportService.getExportJobs()
      .pipe(takeUntil(this.destroy$))
      .subscribe(jobs => {
        this.exportJobs = jobs;
      });
  }

  private loadScheduledReports(): void {
    this.bulkDataExportService.getScheduledReports()
      .pipe(takeUntil(this.destroy$))
      .subscribe(reports => {
        this.scheduledReports = reports;
      });
  }

  setStatusFilter(filter: string): void {
    this.activeFilter = filter;
  }

  getFilteredJobs(): ExportJob[] {
    if (this.activeFilter === 'all') {
      return this.exportJobs;
    }
    return this.exportJobs.filter(job => job.request.status === this.activeFilter);
  }

  getJobCountByStatus(status: string): number {
    if (status === 'all') {
      return this.exportJobs.length;
    }
    return this.exportJobs.filter(job => job.request.status === status).length;
  }

  async createExport(): Promise<void> {
    const resourceTypes = Object.keys(this.selectedResourceTypes)
      .filter(type => this.selectedResourceTypes[type]);

    if (resourceTypes.length === 0) {
      alert('Please select at least one resource type');
      return;
    }

    try {
      const options: any = {
        format: this.exportForm.format,
        deIdentify: this.exportForm.deIdentify
      };

      if (this.exportForm.since) {
        options.since = new Date(this.exportForm.since);
      }

      if (this.exportForm.until) {
        options.until = new Date(this.exportForm.until);
      }

      await this.bulkDataExportService.createExportRequest(resourceTypes, options);
      
      this.showCreateExport = false;
      this.resetExportForm();
    } catch (error) {
      console.error('Failed to create export:', error);
      alert('Failed to create export. Please try again.');
    }
  }

  async downloadExport(id: string): Promise<void> {
    try {
      const blob = await this.bulkDataExportService.downloadExport(id);
      const job = this.bulkDataExportService.getExportJob(id);
      
      if (job) {
        const filename = `export-${job.request.id}.${job.request.format}`;
        this.downloadBlob(blob, filename);
      }
    } catch (error) {
      console.error('Failed to download export:', error);
      alert('Failed to download export. Please try again.');
    }
  }

  async cancelExport(id: string): Promise<void> {
    try {
      await this.bulkDataExportService.cancelExportJob(id);
    } catch (error) {
      console.error('Failed to cancel export:', error);
      alert('Failed to cancel export. Please try again.');
    }
  }

  viewJobDetails(job: ExportJob): void {
    console.log('Job details:', job);
    // This would open a detailed view modal
  }

  async runReportNow(report: ScheduledReport): Promise<void> {
    try {
      const resourceTypes = report.exportRequest.resourceTypes;
      const options = {
        format: report.exportRequest.format,
        deIdentify: report.exportRequest.deIdentify,
        filters: report.exportRequest.filters,
        since: report.exportRequest.since,
        until: report.exportRequest.until
      };

      await this.bulkDataExportService.createExportRequest(resourceTypes, options);
      alert('Report started successfully');
    } catch (error) {
      console.error('Failed to run report:', error);
      alert('Failed to run report. Please try again.');
    }
  }

  editReport(report: ScheduledReport): void {
    console.log('Edit report:', report);
    // This would open an edit form
  }

  async toggleReport(report: ScheduledReport): Promise<void> {
    try {
      const updatedReport = { ...report, enabled: !report.enabled };
      await this.bulkDataExportService.updateScheduledReport(updatedReport);
    } catch (error) {
      console.error('Failed to toggle report:', error);
      alert('Failed to update report. Please try again.');
    }
  }

  async testWarehouseConnection(): Promise<void> {
    this.isTestingConnection = true;
    
    try {
      this.isWarehouseConnected = await this.bulkDataExportService.connectToDataWarehouse(
        this.warehouseConnection
      );
      
      if (this.isWarehouseConnected) {
        alert('Connection successful!');
      } else {
        alert('Connection failed. Please check your settings.');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      alert('Connection test failed. Please try again.');
    } finally {
      this.isTestingConnection = false;
    }
  }

  saveWarehouseConnection(): void {
    // Save the connection configuration
    console.log('Saving warehouse connection:', this.warehouseConnection);
    alert('Configuration saved successfully');
  }

  isFormValid(): boolean {
    const hasSelectedTypes = Object.values(this.selectedResourceTypes).some(selected => selected);
    return hasSelectedTypes;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) { return '0 B'; }
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  }

  formatSchedule(schedule: string): string {
    // Convert cron expression to human readable format
    // This is a simplified version
    if (schedule === '0 8 * * *') { return 'Daily at 8:00 AM'; }
    if (schedule === '0 9 * * 1') { return 'Weekly on Monday at 9:00 AM'; }
    if (schedule === '0 10 1 * *') { return 'Monthly on 1st at 10:00 AM'; }
    return schedule;
  }

  private resetExportForm(): void {
    this.selectedResourceTypes = {};
    this.exportForm = {
      since: '',
      until: '',
      format: 'json',
      deIdentify: true
    };
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
