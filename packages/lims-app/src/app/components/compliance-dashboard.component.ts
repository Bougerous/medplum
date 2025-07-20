import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  AuditTrailEntry, 
  ComplianceReport,
  ComplianceReportingService,
  ComplianceReportType
} from '../services/compliance-reporting.service';

// Extend AuditTrailEntry to add UI-specific properties
interface ExtendedAuditTrailEntry extends AuditTrailEntry {
  showDetails?: boolean;
}

@Component({
  selector: 'app-compliance-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="compliance-container">
      <div class="compliance-header">
        <h2>Compliance & Audit Dashboard</h2>
        <div class="header-actions">
          <button (click)="showGenerateReport = true" class="btn btn-primary">
            Generate Report
          </button>
          <button (click)="showAuditTrail = true" class="btn btn-secondary">
            Audit Trail
          </button>
        </div>
      </div>

      <!-- Compliance Overview -->
      <div class="compliance-overview" *ngIf="!showGenerateReport && !showAuditTrail">
        <div class="overview-cards">
          <div class="overview-card compliance-status">
            <div class="card-header">
              <h3>Overall Compliance</h3>
              <span class="status-icon" [class]="getOverallComplianceStatus()">
                {{ getComplianceIcon(getOverallComplianceStatus()) }}
              </span>
            </div>
            <div class="card-content">
              <div class="compliance-score">{{ getOverallComplianceScore() | number:'1.0-0' }}%</div>
              <div class="compliance-description">{{ getComplianceDescription() }}</div>
            </div>
          </div>

          <div class="overview-card recent-reports">
            <div class="card-header">
              <h3>Recent Reports</h3>
              <span class="report-count">{{ complianceReports.length }}</span>
            </div>
            <div class="card-content">
              <div class="recent-report-list">
                <div 
                  *ngFor="let report of getRecentReports()" 
                  class="recent-report-item"
                  [class]="report.status">
                  <span class="report-type">{{ getReportTypeLabel(report.type) }}</span>
                  <span class="report-date">{{ report.generatedAt | date:'short' }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="overview-card critical-findings">
            <div class="card-header">
              <h3>Critical Findings</h3>
              <span class="findings-count" [class.critical]="getCriticalFindingsCount() > 0">
                {{ getCriticalFindingsCount() }}
              </span>
            </div>
            <div class="card-content">
              <div class="findings-list">
                <div *ngFor="let finding of getCriticalFindings()" class="finding-item">
                  <span class="finding-text">{{ finding }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="overview-card audit-activity">
            <div class="card-header">
              <h3>Audit Activity</h3>
              <span class="activity-indicator" [class.active]="hasRecentAuditActivity()">
                {{ hasRecentAuditActivity() ? '●' : '○' }}
              </span>
            </div>
            <div class="card-content">
              <div class="activity-stats">
                <div class="stat-item">
                  <span class="stat-value">{{ getTodayAuditCount() }}</span>
                  <span class="stat-label">Today</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ getWeekAuditCount() }}</span>
                  <span class="stat-label">This Week</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Compliance Reports List -->
        <div class="reports-section">
          <div class="section-header">
            <h3>Compliance Reports</h3>
            <div class="report-filters">
              <button 
                *ngFor="let filter of reportFilters" 
                [class.active]="activeReportFilter === filter.key"
                (click)="setReportFilter(filter.key)"
                class="filter-btn">
                {{ filter.label }}
              </button>
            </div>
          </div>

          <div class="reports-list">
            <div 
              *ngFor="let report of getFilteredReports()" 
              class="report-item"
              [class]="report.status">
              
              <div class="report-info">
                <div class="report-title">{{ report.title }}</div>
                <div class="report-description">{{ report.description }}</div>
                <div class="report-metadata">
                  <span class="report-period">
                    {{ report.period.start | date:'short' }} - {{ report.period.end | date:'short' }}
                  </span>
                  <span class="report-generated">
                    Generated: {{ report.generatedAt | date:'short' }}
                  </span>
                </div>
              </div>

              <div class="report-status">
                <div class="status-badge" [class]="report.status">
                  {{ report.status | titlecase }}
                </div>
                <div class="compliance-summary" *ngIf="report.status === 'completed'">
                  <div class="summary-item">
                    <span class="summary-label">Compliance Rate:</span>
                    <span class="summary-value" [class]="getComplianceClass(report.summary.complianceRate)">
                      {{ report.summary.complianceRate | number:'1.0-0' }}%
                    </span>
                  </div>
                  <div class="summary-item" *ngIf="report.summary.criticalFindings > 0">
                    <span class="summary-label">Critical Findings:</span>
                    <span class="summary-value critical">{{ report.summary.criticalFindings }}</span>
                  </div>
                </div>
              </div>

              <div class="report-actions">
                <button 
                  *ngIf="report.status === 'completed'" 
                  (click)="viewReport(report)"
                  class="btn btn-sm btn-primary">
                  View
                </button>
                <button 
                  *ngIf="report.status === 'completed'" 
                  (click)="downloadReport(report)"
                  class="btn btn-sm btn-secondary">
                  Download
                </button>
                <button 
                  *ngIf="report.status === 'generating'" 
                  (click)="cancelReport(report)"
                  class="btn btn-sm btn-danger">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div *ngIf="getFilteredReports().length === 0" class="empty-state">
            <div class="empty-icon">📋</div>
            <p>No compliance reports found</p>
            <button (click)="showGenerateReport = true" class="btn btn-primary">
              Generate First Report
            </button>
          </div>
        </div>
      </div>

      <!-- Generate Report Form -->
      <div class="generate-report" *ngIf="showGenerateReport">
        <div class="form-header">
          <h3>Generate Compliance Report</h3>
          <button (click)="showGenerateReport = false" class="btn btn-text">
            ← Back
          </button>
        </div>

        <form (ngSubmit)="generateReport()" class="report-form">
          <div class="form-section">
            <h4>Report Type</h4>
            <div class="report-type-grid">
              <label 
                *ngFor="let type of availableReportTypes" 
                class="report-type-card"
                [class.selected]="reportForm.type === type.key">
                <input 
                  type="radio" 
                  [value]="type.key"
                  [(ngModel)]="reportForm.type"
                  name="reportType"
                  class="radio-input">
                <div class="card-content">
                  <div class="card-icon">{{ type.icon }}</div>
                  <div class="card-title">{{ type.label }}</div>
                  <div class="card-description">{{ type.description }}</div>
                </div>
              </label>
            </div>
          </div>

          <div class="form-section">
            <h4>Report Period</h4>
            <div class="period-options">
              <div class="quick-periods">
                <button 
                  *ngFor="let period of quickPeriods" 
                  type="button"
                  (click)="setQuickPeriod(period)"
                  class="period-btn">
                  {{ period.label }}
                </button>
              </div>
              <div class="custom-period">
                <div class="date-inputs">
                  <div class="input-group">
                    <label>From:</label>
                    <input 
                      type="date" 
                      [(ngModel)]="reportForm.startDate"
                      name="startDate"
                      class="form-input">
                  </div>
                  <div class="input-group">
                    <label>To:</label>
                    <input 
                      type="date" 
                      [(ngModel)]="reportForm.endDate"
                      name="endDate"
                      class="form-input">
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" (click)="showGenerateReport = false" class="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="!isReportFormValid()">
              Generate Report
            </button>
          </div>
        </form>
      </div>

      <!-- Audit Trail -->
      <div class="audit-trail" *ngIf="showAuditTrail">
        <div class="form-header">
          <h3>Audit Trail</h3>
          <button (click)="showAuditTrail = false" class="btn btn-text">
            ← Back
          </button>
        </div>

        <div class="audit-filters">
          <div class="filter-row">
            <div class="input-group">
              <label>User:</label>
              <select [(ngModel)]="auditFilters.userId" class="form-select">
                <option value="">All Users</option>
                <option *ngFor="let user of getUniqueUsers()" [value]="user">{{ user }}</option>
              </select>
            </div>
            <div class="input-group">
              <label>Action:</label>
              <select [(ngModel)]="auditFilters.action" class="form-select">
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="read">Read</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </select>
            </div>
            <div class="input-group">
              <label>Resource:</label>
              <select [(ngModel)]="auditFilters.resourceType" class="form-select">
                <option value="">All Resources</option>
                <option value="Patient">Patient</option>
                <option value="Specimen">Specimen</option>
                <option value="DiagnosticReport">DiagnosticReport</option>
              </select>
            </div>
            <button (click)="applyAuditFilters()" class="btn btn-primary">
              Apply Filters
            </button>
          </div>
        </div>

        <div class="audit-entries">
          <div 
            *ngFor="let entry of getFilteredAuditEntries()" 
            class="audit-entry"
            [class]="entry.outcome">
            
            <div class="entry-timestamp">
              {{ entry.timestamp | date:'short' }}
            </div>
            
            <div class="entry-user">
              <div class="user-name">{{ entry.userName }}</div>
              <div class="user-id">{{ entry.userId }}</div>
            </div>
            
            <div class="entry-action">
              <div class="action-type">{{ entry.action }}</div>
              <div class="resource-info">
                {{ entry.resourceType }}/{{ entry.resourceId }}
              </div>
            </div>
            
            <div class="entry-outcome">
              <span class="outcome-badge" [class]="entry.outcome">
                {{ entry.outcome | titlecase }}
              </span>
            </div>
            
            <div class="entry-details" *ngIf="entry.details">
              <button (click)="toggleDetails(entry)" class="btn btn-sm btn-text">
                {{ entry.showDetails ? 'Hide' : 'Show' }} Details
              </button>
              <div class="details-content" *ngIf="entry.showDetails">
                <pre>{{ entry.details | json }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="getFilteredAuditEntries().length === 0" class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>No audit entries found</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .compliance-container {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .compliance-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .compliance-header h2 {
      margin: 0;
      color: #2c3e50;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    .overview-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .overview-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1.5rem;
      transition: all 0.2s;
    }

    .overview-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .card-header h3 {
      margin: 0;
      color: #2c3e50;
      font-size: 1.125rem;
    }

    .status-icon {
      font-size: 1.5rem;
    }

    .status-icon.good {
      color: #27ae60;
    }

    .status-icon.warning {
      color: #f39c12;
    }

    .status-icon.critical {
      color: #e74c3c;
    }

    .compliance-score {
      font-size: 2.5rem;
      font-weight: 700;
      color: #27ae60;
      margin-bottom: 0.5rem;
    }

    .compliance-description {
      color: #7f8c8d;
      font-size: 0.875rem;
    }

    .report-count {
      background: #3498db;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .recent-report-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .recent-report-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .recent-report-item.completed {
      background: rgba(39, 174, 96, 0.1);
      color: #27ae60;
    }

    .recent-report-item.generating {
      background: rgba(52, 152, 219, 0.1);
      color: #3498db;
    }

    .findings-count {
      background: #95a5a6;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .findings-count.critical {
      background: #e74c3c;
    }

    .findings-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .finding-item {
      padding: 0.5rem;
      background: rgba(231, 76, 60, 0.1);
      border-radius: 4px;
      font-size: 0.875rem;
      color: #e74c3c;
    }

    .activity-indicator {
      font-size: 1.5rem;
    }

    .activity-indicator.active {
      color: #27ae60;
    }

    .activity-stats {
      display: flex;
      justify-content: space-around;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #2c3e50;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #7f8c8d;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .section-header h3 {
      margin: 0;
      color: #2c3e50;
    }

    .report-filters {
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

    .report-item.completed {
      border-left: 4px solid #27ae60;
    }

    .report-item.generating {
      border-left: 4px solid #3498db;
    }

    .report-item.failed {
      border-left: 4px solid #e74c3c;
    }

    .report-info {
      flex: 1;
    }

    .report-title {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    .report-description {
      color: #7f8c8d;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }

    .report-metadata {
      display: flex;
      gap: 1rem;
      font-size: 0.75rem;
      color: #95a5a6;
    }

    .report-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0 2rem;
      min-width: 150px;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .status-badge.generating {
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

    .compliance-summary {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.75rem;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
    }

    .summary-label {
      color: #7f8c8d;
    }

    .summary-value {
      font-weight: 600;
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

    .report-actions {
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

    .report-form {
      max-width: 800px;
    }

    .form-section {
      margin-bottom: 2rem;
    }

    .form-section h4 {
      margin: 0 0 1rem 0;
      color: #34495e;
    }

    .report-type-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
    }

    .report-type-card {
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .report-type-card:hover {
      border-color: #3498db;
    }

    .report-type-card.selected {
      border-color: #3498db;
      background: rgba(52, 152, 219, 0.05);
    }

    .radio-input {
      display: none;
    }

    .card-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .card-title {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    .card-description {
      font-size: 0.875rem;
      color: #7f8c8d;
      line-height: 1.4;
    }

    .period-options {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .quick-periods {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .period-btn {
      padding: 0.5rem 1rem;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .period-btn:hover {
      background: #f8f9fa;
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

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #e0e0e0;
    }

    .audit-filters {
      margin-bottom: 1.5rem;
    }

    .filter-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) auto;
      gap: 1rem;
      align-items: end;
    }

    .audit-entries {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .audit-entry {
      display: grid;
      grid-template-columns: 150px 200px 1fr 100px auto;
      gap: 1rem;
      align-items: center;
      padding: 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: white;
      font-size: 0.875rem;
    }

    .audit-entry.success {
      border-left: 4px solid #27ae60;
    }

    .audit-entry.failure {
      border-left: 4px solid #e74c3c;
    }

    .audit-entry.warning {
      border-left: 4px solid #f39c12;
    }

    .entry-timestamp {
      color: #7f8c8d;
    }

    .user-name {
      font-weight: 600;
      color: #2c3e50;
    }

    .user-id {
      color: #95a5a6;
      font-size: 0.75rem;
    }

    .action-type {
      font-weight: 600;
      color: #34495e;
    }

    .resource-info {
      color: #7f8c8d;
      font-size: 0.75rem;
    }

    .outcome-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .outcome-badge.success {
      background: #27ae60;
      color: white;
    }

    .outcome-badge.failure {
      background: #e74c3c;
      color: white;
    }

    .outcome-badge.warning {
      background: #f39c12;
      color: white;
    }

    .details-content {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #f8f9fa;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .details-content pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
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
export class ComplianceDashboardComponent implements OnInit, OnDestroy {
  private readonly complianceReportingService = inject(ComplianceReportingService);
  private readonly destroy$ = new Subject<void>();

  complianceReports: ComplianceReport[] = [];
  auditEntries: ExtendedAuditTrailEntry[] = [];

  showGenerateReport = false;
  showAuditTrail = false;

  activeReportFilter = 'all';

  reportForm = {
    type: '' as ComplianceReportType,
    startDate: '',
    endDate: ''
  };

  auditFilters = {
    userId: '',
    action: '',
    resourceType: ''
  };

  reportFilters = [
    { key: 'all', label: 'All Reports' },
    { key: 'completed', label: 'Completed' },
    { key: 'generating', label: 'Generating' },
    { key: 'failed', label: 'Failed' }
  ];

  availableReportTypes = [
    {
      key: 'clia-compliance' as ComplianceReportType,
      label: 'CLIA Compliance',
      description: 'Comprehensive CLIA regulatory compliance analysis',
      icon: '🏥'
    },
    {
      key: 'cap-inspection' as ComplianceReportType,
      label: 'CAP Inspection',
      description: 'CAP accreditation readiness assessment',
      icon: '✅'
    },
    {
      key: 'hipaa-audit' as ComplianceReportType,
      label: 'HIPAA Audit',
      description: 'Privacy and security compliance audit',
      icon: '🔒'
    },
    {
      key: 'quality-assurance' as ComplianceReportType,
      label: 'Quality Assurance',
      description: 'Quality management system performance',
      icon: '📊'
    },
    {
      key: 'population-health' as ComplianceReportType,
      label: 'Population Health',
      description: 'Population health metrics and outcomes',
      icon: '👥'
    },
    {
      key: 'clinical-outcomes' as ComplianceReportType,
      label: 'Clinical Outcomes',
      description: 'Clinical effectiveness and patient outcomes',
      icon: '🩺'
    }
  ];

  quickPeriods = [
    { key: 'last-30-days', label: 'Last 30 Days', days: 30 },
    { key: 'last-90-days', label: 'Last 90 Days', days: 90 },
    { key: 'last-6-months', label: 'Last 6 Months', days: 180 },
    { key: 'last-year', label: 'Last Year', days: 365 }
  ];

  ngOnInit(): void {
    this.loadComplianceReports();
    this.loadAuditTrail();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadComplianceReports(): void {
    this.complianceReportingService.getComplianceReports()
      .pipe(takeUntil(this.destroy$))
      .subscribe(reports => {
        this.complianceReports = reports;
      });
  }

  private loadAuditTrail(): void {
    this.complianceReportingService.getAuditTrail()
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        this.auditEntries = entries.map(entry => ({ ...entry, showDetails: false }));
      });
  }

  getOverallComplianceScore(): number {
    if (this.complianceReports.length === 0) { return 0; }

    const completedReports = this.complianceReports.filter(r => r.status === 'completed');
    if (completedReports.length === 0) { return 0; }

    const totalScore = completedReports.reduce((sum, report) => sum + report.summary.complianceRate, 0);
    return totalScore / completedReports.length;
  }

  getOverallComplianceStatus(): 'good' | 'warning' | 'critical' {
    const score = this.getOverallComplianceScore();
    if (score >= 90) { return 'good'; }
    if (score >= 75) { return 'warning'; }
    return 'critical';
  }

  getComplianceIcon(status: 'good' | 'warning' | 'critical'): string {
    switch (status) {
      case 'good': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
    }
  }

  getComplianceDescription(): string {
    const status = this.getOverallComplianceStatus();
    switch (status) {
      case 'good': return 'All compliance metrics are within acceptable ranges';
      case 'warning': return 'Some compliance areas need attention';
      case 'critical': return 'Critical compliance issues require immediate action';
    }
  }

  getRecentReports(): ComplianceReport[] {
    return this.complianceReports
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
      .slice(0, 5);
  }

  getCriticalFindingsCount(): number {
    return this.complianceReports
      .filter(r => r.status === 'completed')
      .reduce((sum, report) => sum + report.summary.criticalFindings, 0);
  }

  getCriticalFindings(): string[] {
    const findings: string[] = [];

    this.complianceReports
      .filter(r => r.status === 'completed')
      .forEach(report => {
        findings.push(...report.summary.recommendations.slice(0, 3));
      });

    return findings.slice(0, 5);
  }

  hasRecentAuditActivity(): boolean {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.auditEntries.some(entry => entry.timestamp > oneDayAgo);
  }

  getTodayAuditCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.auditEntries.filter(entry => entry.timestamp >= today).length;
  }

  getWeekAuditCount(): number {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.auditEntries.filter(entry => entry.timestamp >= weekAgo).length;
  }

  setReportFilter(filter: string): void {
    this.activeReportFilter = filter;
  }

  getFilteredReports(): ComplianceReport[] {
    if (this.activeReportFilter === 'all') {
      return this.complianceReports;
    }
    return this.complianceReports.filter(report => report.status === this.activeReportFilter);
  }

  getReportTypeLabel(type: ComplianceReportType): string {
    const reportType = this.availableReportTypes.find(t => t.key === type);
    return reportType?.label || type;
  }

  getComplianceClass(rate: number): string {
    if (rate >= 90) { return 'good'; }
    if (rate >= 75) { return 'warning'; }
    return 'critical';
  }

  async generateReport(): Promise<void> {
    if (!this.isReportFormValid()) { return; }

    try {
      const startDate = new Date(this.reportForm.startDate);
      const endDate = new Date(this.reportForm.endDate);

      await this.complianceReportingService.generateComplianceReport(
        this.reportForm.type,
        { start: startDate, end: endDate }
      );

      this.showGenerateReport = false;
      this.resetReportForm();
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    }
  }

  setQuickPeriod(period: any): void {
    const endDate = new Date();
    const startDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);

    this.reportForm.startDate = startDate.toISOString().split('T')[0];
    this.reportForm.endDate = endDate.toISOString().split('T')[0];
  }

  isReportFormValid(): boolean {
    return !!(this.reportForm.type && this.reportForm.startDate && this.reportForm.endDate);
  }

  viewReport(report: ComplianceReport): void {
    console.log('Viewing report:', report);
    // This would open a detailed report view
  }

  downloadReport(report: ComplianceReport): void {
    console.log('Downloading report:', report);
    // This would trigger a download
  }

  cancelReport(report: ComplianceReport): void {
    console.log('Cancelling report:', report);
    // This would cancel the report generation
  }

  getUniqueUsers(): string[] {
    const users = new Set(this.auditEntries.map(entry => entry.userId));
    return Array.from(users);
  }

  applyAuditFilters(): void {
    // Filters are applied in getFilteredAuditEntries()
  }

  getFilteredAuditEntries(): ExtendedAuditTrailEntry[] {
    return this.auditEntries.filter(entry => {
      if (this.auditFilters.userId && entry.userId !== this.auditFilters.userId) {
        return false;
      }
      if (this.auditFilters.action && entry.action !== this.auditFilters.action) {
        return false;
      }
      if (this.auditFilters.resourceType && entry.resourceType !== this.auditFilters.resourceType) {
        return false;
      }
      return true;
    });
  }

  toggleDetails(entry: ExtendedAuditTrailEntry): void {
    entry.showDetails = !entry.showDetails;
  }

  private resetReportForm(): void {
    this.reportForm = {
      type: '' as ComplianceReportType,
      startDate: '',
      endDate: ''
    };
  }
}
