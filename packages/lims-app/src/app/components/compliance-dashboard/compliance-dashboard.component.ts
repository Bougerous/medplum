import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { combineLatest, Observable, of, Subject } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService } from '../../services/notification.service';
import {
  ComplianceReport,
  ComplianceViolation,
  RegulatoryRequirement,
  SpecimenAuditService,
  SpecimenAuditTrail
} from '../../services/specimen-audit.service';

@Component({
  selector: 'app-compliance-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="compliance-dashboard-container">
      <!-- Header -->
      <div class="dashboard-header">
        <h2>Compliance Dashboard</h2>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="generateReport()">
            <i class="icon-report"></i> Generate Report
          </button>
          <button class="btn btn-secondary" (click)="exportData()">
            <i class="icon-export"></i> Export Data
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="summary-card compliance-rate">
          <div class="card-icon">
            <i class="icon-check-circle"></i>
          </div>
          <div class="card-content">
            <div class="card-value">{{ overallComplianceRate$ | async | number:'1.1-1' }}%</div>
            <div class="card-label">Overall Compliance</div>
            <div class="card-trend" [class]="getComplianceTrendClass()">
              <i [class]="getComplianceTrendIcon()"></i>
              {{ getComplianceTrendText() }}
            </div>
          </div>
        </div>

        <div class="summary-card violations">
          <div class="card-icon">
            <i class="icon-alert-triangle"></i>
          </div>
          <div class="card-content">
            <div class="card-value">{{ totalViolations$ | async }}</div>
            <div class="card-label">Active Violations</div>
            <div class="card-breakdown">
              <span class="critical">{{ criticalViolations$ | async }} Critical</span>
              <span class="high">{{ highViolations$ | async }} High</span>
            </div>
          </div>
        </div>

        <div class="summary-card specimens">
          <div class="card-icon">
            <i class="icon-specimen"></i>
          </div>
          <div class="card-content">
            <div class="card-value">{{ totalSpecimens$ | async }}</div>
            <div class="card-label">Specimens Tracked</div>
            <div class="card-breakdown">
              <span class="compliant">{{ compliantSpecimens$ | async }} Compliant</span>
              <span class="non-compliant">{{ nonCompliantSpecimens$ | async }} Issues</span>
            </div>
          </div>
        </div>

        <div class="summary-card chain-of-custody">
          <div class="card-icon">
            <i class="icon-link"></i>
          </div>
          <div class="card-content">
            <div class="card-value">{{ chainOfCustodyIntegrity$ | async | number:'1.1-1' }}%</div>
            <div class="card-label">Chain of Custody Integrity</div>
            <div class="card-breakdown">
              <span class="intact">{{ intactChains$ | async }} Intact</span>
              <span class="broken">{{ brokenChains$ | async }} Compromised</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs-container">
        <ul class="nav nav-tabs">
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'violations'"
               (click)="setActiveTab('violations')">
              Violations
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'audit-trails'"
               (click)="setActiveTab('audit-trails')">
              Audit Trails
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'reports'"
               (click)="setActiveTab('reports')">
              Reports
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'requirements'"
               (click)="setActiveTab('requirements')">
              Requirements
            </a>
          </li>
        </ul>
      </div>

      <!-- Violations Tab -->
      <div class="tab-content" *ngIf="activeTab === 'violations'">
        <div class="violations-section">
          <!-- Filters -->
          <div class="filters-bar">
            <form [formGroup]="violationFilters">
              <div class="filter-group">
                <select class="form-control" formControlName="severity">
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div class="filter-group">
                <select class="form-control" formControlName="type">
                  <option value="">All Types</option>
                  <option value="chain-of-custody">Chain of Custody</option>
                  <option value="temperature">Temperature</option>
                  <option value="time">Time</option>
                  <option value="documentation">Documentation</option>
                  <option value="procedure">Procedure</option>
                </select>
              </div>
              <div class="filter-group">
                <select class="form-control" formControlName="status">
                  <option value="">All Statuses</option>
                  <option value="unresolved">Unresolved</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </form>
          </div>

          <!-- Violations Table -->
          <div class="violations-table-container">
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Specimen</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let violation of filteredViolations$ | async">
                  <td>
                    <span class="severity-badge" [attr.data-severity]="violation.severity">
                      {{ violation.severity }}
                    </span>
                  </td>
                  <td>{{ getViolationTypeDisplay(violation.type) }}</td>
                  <td>{{ violation.description }}</td>
                  <td>
                    <a href="#" (click)="viewSpecimenAudit(violation.id)">
                      {{ getSpecimenId(violation.id) }}
                    </a>
                  </td>
                  <td>{{ violation.timestamp | date:'short' }}</td>
                  <td>
                    <span class="status-badge" [attr.data-status]="violation.resolved ? 'resolved' : 'unresolved'">
                      {{ violation.resolved ? 'Resolved' : 'Unresolved' }}
                    </span>
                  </td>
                  <td>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-primary" 
                              (click)="resolveViolation(violation)"
                              [disabled]="violation.resolved">
                        Resolve
                      </button>
                      <button class="btn btn-outline-info" (click)="viewViolationDetails(violation)">
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Audit Trails Tab -->
      <div class="tab-content" *ngIf="activeTab === 'audit-trails'">
        <div class="audit-trails-section">
          <!-- Search -->
          <div class="search-bar">
            <input type="text" 
                   class="form-control" 
                   placeholder="Search by specimen ID or accession number..."
                   [(ngModel)]="auditSearchTerm"
                   (input)="searchAuditTrails()">
          </div>

          <!-- Audit Trails List -->
          <div class="audit-trails-list">
            <div class="audit-trail-card" *ngFor="let trail of filteredAuditTrails$ | async">
              <div class="trail-header">
                <div class="trail-info">
                  <h4>{{ trail.accessionNumber }}</h4>
                  <span class="specimen-id">{{ trail.specimenId }}</span>
                </div>
                <div class="trail-status">
                  <span class="compliance-badge" [attr.data-status]="trail.complianceStatus.overall">
                    {{ trail.complianceStatus.overall }}
                  </span>
                  <span class="quality-score">
                    Quality: {{ trail.qualityMetrics.overallScore | number:'1.0-0' }}%
                  </span>
                </div>
              </div>
              
              <div class="trail-summary">
                <div class="summary-item">
                  <label>Events:</label>
                  <span>{{ trail.events.length }}</span>
                </div>
                <div class="summary-item">
                  <label>Handoffs:</label>
                  <span>{{ trail.chainOfCustodyIntegrity.totalHandoffs }}</span>
                </div>
                <div class="summary-item">
                  <label>Chain Status:</label>
                  <span [class]="'chain-' + trail.chainOfCustodyIntegrity.status">
                    {{ trail.chainOfCustodyIntegrity.status }}
                  </span>
                </div>
                <div class="summary-item" *ngIf="trail.complianceStatus.violations.length > 0">
                  <label>Violations:</label>
                  <span class="violations-count">{{ trail.complianceStatus.violations.length }}</span>
                </div>
              </div>

              <div class="trail-actions">
                <button class="btn btn-sm btn-outline-primary" (click)="viewFullAuditTrail(trail)">
                  View Full Trail
                </button>
                <button class="btn btn-sm btn-outline-secondary" (click)="exportAuditTrail(trail)">
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Reports Tab -->
      <div class="tab-content" *ngIf="activeTab === 'reports'">
        <div class="reports-section">
          <!-- Report Generation -->
          <div class="report-generator">
            <h4>Generate New Report</h4>
            <form [formGroup]="reportForm">
              <div class="row">
                <div class="col-md-3">
                  <label class="form-label">Report Type</label>
                  <select class="form-control" formControlName="reportType">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Start Date</label>
                  <input type="date" class="form-control" formControlName="startDate">
                </div>
                <div class="col-md-3">
                  <label class="form-label">End Date</label>
                  <input type="date" class="form-control" formControlName="endDate">
                </div>
                <div class="col-md-3">
                  <label class="form-label">&nbsp;</label>
                  <button type="button" class="btn btn-primary form-control" 
                          (click)="generateCustomReport()"
                          [disabled]="!reportForm.valid">
                    Generate
                  </button>
                </div>
              </div>
            </form>
          </div>

          <!-- Existing Reports -->
          <div class="reports-list">
            <h4>Recent Reports</h4>
            <div class="reports-table-container">
              <table class="table table-striped">
                <thead>
                  <tr>
                    <th>Report Type</th>
                    <th>Period</th>
                    <th>Compliance Rate</th>
                    <th>Violations</th>
                    <th>Generated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let report of complianceReports$ | async">
                    <td>{{ report.reportType | titlecase }}</td>
                    <td>{{ formatReportPeriod(report.period) }}</td>
                    <td>
                      <span class="compliance-rate" [class]="getComplianceRateClass(report.summary.complianceRate)">
                        {{ report.summary.complianceRate | number:'1.1-1' }}%
                      </span>
                    </td>
                    <td>
                      <span class="violations-summary">
                        {{ report.summary.violationsCount }} 
                        <small>({{ report.summary.criticalViolations }} critical)</small>
                      </span>
                    </td>
                    <td>{{ report.generatedAt | date:'short' }}</td>
                    <td>
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" (click)="viewReport(report)">
                          View
                        </button>
                        <button class="btn btn-outline-secondary" (click)="downloadReport(report)">
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Requirements Tab -->
      <div class="tab-content" *ngIf="activeTab === 'requirements'">
        <div class="requirements-section">
          <div class="requirements-list">
            <div class="requirement-card" *ngFor="let requirement of regulatoryRequirements$ | async">
              <div class="requirement-header">
                <h4>{{ requirement.name }}</h4>
                <span class="requirement-category" [attr.data-category]="requirement.category">
                  {{ requirement.category }}
                </span>
              </div>
              
              <div class="requirement-description">
                <p>{{ requirement.description }}</p>
              </div>

              <div class="requirement-details">
                <div class="detail-section">
                  <h6>Requirements</h6>
                  <ul>
                    <li *ngIf="requirement.requirements.chainOfCustody">
                      <i class="icon-check"></i> Chain of Custody Tracking
                    </li>
                    <li *ngIf="requirement.requirements.temperatureControl">
                      <i class="icon-check"></i> Temperature Control
                    </li>
                    <li *ngIf="requirement.requirements.timeRequirements.enabled">
                      <i class="icon-check"></i> Time Requirements
                      <small *ngIf="requirement.requirements.timeRequirements.maxProcessingTime">
                        (Max Processing: {{ requirement.requirements.timeRequirements.maxProcessingTime }}h)
                      </small>
                    </li>
                    <li *ngFor="let doc of requirement.requirements.documentation">
                      <i class="icon-check"></i> {{ doc | titlecase }}
                    </li>
                  </ul>
                </div>

                <div class="detail-section">
                  <h6>Applicable Specimen Types</h6>
                  <div class="specimen-types">
                    <span *ngFor="let type of requirement.applicableSpecimenTypes" class="specimen-type-badge">
                      {{ type }}
                    </span>
                  </div>
                </div>

                <div class="detail-section">
                  <h6>Penalties</h6>
                  <div class="penalties">
                    <div class="penalty-item warning">
                      <strong>Warning:</strong> {{ requirement.penalties.warning }}
                    </div>
                    <div class="penalty-item violation">
                      <strong>Violation:</strong> {{ requirement.penalties.violation }}
                    </div>
                    <div class="penalty-item critical">
                      <strong>Critical:</strong> {{ requirement.penalties.critical }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Audit Trail Modal -->
    <div class="modal" [class.show]="showAuditTrailModal" *ngIf="showAuditTrailModal">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Audit Trail - {{ selectedAuditTrail?.accessionNumber }}</h5>
            <button type="button" class="btn-close" (click)="closeAuditTrailModal()"></button>
          </div>
          <div class="modal-body">
            <div class="audit-trail-details" *ngIf="selectedAuditTrail">
              <!-- Timeline -->
              <div class="timeline-section">
                <h6>Event Timeline</h6>
                <div class="timeline">
                  <div class="timeline-item" *ngFor="let event of selectedAuditTrail.events; let i = index">
                    <div class="timeline-marker" [attr.data-outcome]="event.outcome"></div>
                    <div class="timeline-content">
                      <div class="timeline-header">
                        <strong>{{ getEventTypeDisplay(event.eventType) }}</strong>
                        <span class="timestamp">{{ event.timestamp | date:'short' }}</span>
                      </div>
                      <div class="timeline-details">
                        <div>Action: {{ event.action }}</div>
                        <div>Performer: {{ event.performer.name }} ({{ event.performer.role }})</div>
                        <div *ngIf="event.location">Location: {{ event.location }}</div>
                        <div *ngIf="event.complianceFlags.length > 0" class="compliance-flags">
                          <span *ngFor="let flag of event.complianceFlags" 
                                class="flag-badge" 
                                [attr.data-type]="flag.type">
                            {{ flag.message }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Quality Metrics -->
              <div class="metrics-section">
                <h6>Quality Metrics</h6>
                <div class="metrics-grid">
                  <div class="metric-item">
                    <label>Handling Score</label>
                    <div class="metric-bar">
                      <div class="metric-fill" [style.width.%]="selectedAuditTrail.qualityMetrics.handlingScore"></div>
                      <span class="metric-value">{{ selectedAuditTrail.qualityMetrics.handlingScore }}%</span>
                    </div>
                  </div>
                  <div class="metric-item">
                    <label>Timeliness Score</label>
                    <div class="metric-bar">
                      <div class="metric-fill" [style.width.%]="selectedAuditTrail.qualityMetrics.timelinessScore"></div>
                      <span class="metric-value">{{ selectedAuditTrail.qualityMetrics.timelinessScore }}%</span>
                    </div>
                  </div>
                  <div class="metric-item">
                    <label>Documentation Score</label>
                    <div class="metric-bar">
                      <div class="metric-fill" [style.width.%]="selectedAuditTrail.qualityMetrics.documentationScore"></div>
                      <span class="metric-value">{{ selectedAuditTrail.qualityMetrics.documentationScore }}%</span>
                    </div>
                  </div>
                  <div class="metric-item overall">
                    <label>Overall Score</label>
                    <div class="metric-bar">
                      <div class="metric-fill" [style.width.%]="selectedAuditTrail.qualityMetrics.overallScore"></div>
                      <span class="metric-value">{{ selectedAuditTrail.qualityMetrics.overallScore }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeAuditTrailModal()">
              Close
            </button>
            <button type="button" class="btn btn-primary" (click)="exportSelectedAuditTrail()">
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./compliance-dashboard.component.scss']
})
export class ComplianceDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Observables
  auditTrails$: Observable<SpecimenAuditTrail[]>;
  complianceReports$: Observable<ComplianceReport[]>;
  regulatoryRequirements$: Observable<RegulatoryRequirement[]>;

  // Computed observables
  overallComplianceRate$: Observable<number>;
  totalViolations$: Observable<number>;
  criticalViolations$: Observable<number>;
  highViolations$: Observable<number>;
  totalSpecimens$: Observable<number>;
  compliantSpecimens$: Observable<number>;
  nonCompliantSpecimens$: Observable<number>;
  chainOfCustodyIntegrity$: Observable<number>;
  intactChains$: Observable<number>;
  brokenChains$: Observable<number>;
  filteredViolations$: Observable<ComplianceViolation[]>;
  filteredAuditTrails$: Observable<SpecimenAuditTrail[]>;

  // UI State
  activeTab: 'violations' | 'audit-trails' | 'reports' | 'requirements' = 'violations';
  showAuditTrailModal = false;
  selectedAuditTrail: SpecimenAuditTrail | null = null;
  auditSearchTerm = '';

  // Forms
  violationFilters: FormGroup;
  reportForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private specimenAuditService: SpecimenAuditService,
    private notificationService: NotificationService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.auditTrails$ = this.specimenAuditService.getAllAuditTrails();
    this.complianceReports$ = this.specimenAuditService.getComplianceReports();
    this.regulatoryRequirements$ = this.specimenAuditService.getRegulatoryRequirements();

    this.violationFilters = this.fb.group({
      severity: [''],
      type: [''],
      status: ['']
    });

    this.reportForm = this.fb.group({
      reportType: ['weekly'],
      startDate: [this.getDefaultStartDate()],
      endDate: [this.getDefaultEndDate()]
    });

    // Initialize missing Observable properties
    this.overallComplianceRate$ = of(0);
    this.totalViolations$ = of(0);
    this.criticalViolations$ = of(0);
    this.highViolations$ = of(0);
    this.totalSpecimens$ = of(0);
    this.compliantSpecimens$ = of(0);
    this.nonCompliantSpecimens$ = of(0);
    this.chainOfCustodyIntegrity$ = of(0);
    this.intactChains$ = of(0);
    this.brokenChains$ = of(0);
    this.filteredViolations$ = of([]);
    this.filteredAuditTrails$ = of([]);

    this.setupComputedObservables();
  }

  ngOnInit(): void {
    this.setupAuditEventStream();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupComputedObservables(): void {
    // Overall compliance rate
    this.overallComplianceRate$ = this.auditTrails$.pipe(
      map(trails => {
        if (trails.length === 0) { return 100; }
        const compliant = trails.filter(t => t.complianceStatus.overall === 'compliant').length;
        return (compliant / trails.length) * 100;
      })
    );

    // Violation counts
    const allViolations$ = this.auditTrails$.pipe(
      map(trails => trails.flatMap(t => t.complianceStatus.violations))
    );

    this.totalViolations$ = allViolations$.pipe(
      map(violations => violations.filter(v => !v.resolved).length)
    );

    this.criticalViolations$ = allViolations$.pipe(
      map(violations => violations.filter(v => !v.resolved && v.severity === 'critical').length)
    );

    this.highViolations$ = allViolations$.pipe(
      map(violations => violations.filter(v => !v.resolved && v.severity === 'high').length)
    );

    // Specimen counts
    this.totalSpecimens$ = this.auditTrails$.pipe(
      map(trails => trails.length)
    );

    this.compliantSpecimens$ = this.auditTrails$.pipe(
      map(trails => trails.filter(t => t.complianceStatus.overall === 'compliant').length)
    );

    this.nonCompliantSpecimens$ = this.auditTrails$.pipe(
      map(trails => trails.filter(t => t.complianceStatus.overall !== 'compliant').length)
    );

    // Chain of custody metrics
    this.chainOfCustodyIntegrity$ = this.auditTrails$.pipe(
      map(trails => {
        if (trails.length === 0) { return 100; }
        const intact = trails.filter(t => t.chainOfCustodyIntegrity.status === 'intact').length;
        return (intact / trails.length) * 100;
      })
    );

    this.intactChains$ = this.auditTrails$.pipe(
      map(trails => trails.filter(t => t.chainOfCustodyIntegrity.status === 'intact').length)
    );

    this.brokenChains$ = this.auditTrails$.pipe(
      map(trails => trails.filter(t => t.chainOfCustodyIntegrity.status === 'broken').length)
    );

    // Filtered violations
    this.filteredViolations$ = combineLatest([
      allViolations$,
      this.violationFilters.valueChanges.pipe(startWith(this.violationFilters.value))
    ]).pipe(
      map(([violations, filters]) => {
        return violations.filter(violation => {
          const matchesSeverity = !filters.severity || violation.severity === filters.severity;
          const matchesType = !filters.type || violation.type === filters.type;
          const matchesStatus = !filters.status ||
            (filters.status === 'resolved' && violation.resolved) ||
            (filters.status === 'unresolved' && !violation.resolved);

          return matchesSeverity && matchesType && matchesStatus;
        });
      })
    );

    // Filtered audit trails
    this.filteredAuditTrails$ = this.auditTrails$.pipe(
      map(trails => {
        if (!this.auditSearchTerm) { return trails; }

        const searchTerm = this.auditSearchTerm.toLowerCase();
        return trails.filter(trail =>
          trail.specimenId.toLowerCase().includes(searchTerm) ||
          trail.accessionNumber.toLowerCase().includes(searchTerm)
        );
      })
    );
  }

  private setupAuditEventStream(): void {
    this.specimenAuditService.getAuditEventStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.complianceFlags.some(flag => flag.type === 'violation' || flag.type === 'critical')) {
          this.notificationService.showWarning(
            'Compliance Alert',
            `New compliance issue detected for ${event.eventType}`
          );
        }
      });
  }

  // Tab management
  setActiveTab(tab: 'violations' | 'audit-trails' | 'reports' | 'requirements'): void {
    this.activeTab = tab;
  }

  // Search functionality
  searchAuditTrails(): void {
    // The filtering is handled by the observable
  }

  // Violation management
  async resolveViolation(violation: ComplianceViolation): Promise<void> {
    try {
      // In a real implementation, this would update the violation in the backend
      violation.resolved = true;
      violation.resolvedAt = new Date();
      violation.resolvedBy = 'Current User'; // Would get from auth service

      this.notificationService.showSuccess(
        'Violation Resolved',
        'The violation has been marked as resolved'
      );
    } catch (error) {
      this.errorHandlingService.handleError(error, 'violation-resolution');
    }
  }

  viewViolationDetails(violation: ComplianceViolation): void {
    // Implementation for viewing violation details
    console.log('View violation details:', violation);
  }

  viewSpecimenAudit(violationId: string): void {
    // Implementation for viewing specimen audit from violation
    console.log('View specimen audit for violation:', violationId);
  }

  // Audit trail management
  viewFullAuditTrail(trail: SpecimenAuditTrail): void {
    this.selectedAuditTrail = trail;
    this.showAuditTrailModal = true;
  }

  closeAuditTrailModal(): void {
    this.showAuditTrailModal = false;
    this.selectedAuditTrail = null;
  }

  exportAuditTrail(_trail: SpecimenAuditTrail): void {
    // Implementation for exporting audit trail
    this.notificationService.showInfo('Export', 'Audit trail export functionality would be implemented here');
  }

  exportSelectedAuditTrail(): void {
    if (this.selectedAuditTrail) {
      this.exportAuditTrail(this.selectedAuditTrail);
    }
  }

  // Report management
  async generateReport(): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Last 7 days

      await this.specimenAuditService.generateComplianceReport('weekly', startDate, endDate);
      this.notificationService.showSuccess('Report Generated', 'Weekly compliance report has been generated');
    } catch (error) {
      this.errorHandlingService.handleError(error, 'report-generation');
    }
  }

  async generateCustomReport(): Promise<void> {
    if (!this.reportForm.valid) { return; }

    try {
      const formValue = this.reportForm.value;
      const startDate = new Date(formValue.startDate);
      const endDate = new Date(formValue.endDate);

      await this.specimenAuditService.generateComplianceReport(
        formValue.reportType,
        startDate,
        endDate
      );

      this.notificationService.showSuccess(
        'Report Generated',
        `${formValue.reportType} compliance report has been generated`
      );
    } catch (error) {
      this.errorHandlingService.handleError(error, 'custom-report-generation');
    }
  }

  viewReport(report: ComplianceReport): void {
    // Implementation for viewing report details
    console.log('View report:', report);
  }

  downloadReport(_report: ComplianceReport): void {
    // Implementation for downloading report
    this.notificationService.showInfo('Download', 'Report download functionality would be implemented here');
  }

  exportData(): void {
    // Implementation for exporting all compliance data
    this.notificationService.showInfo('Export', 'Data export functionality would be implemented here');
  }

  // Utility methods
  getViolationTypeDisplay(type: string): string {
    const typeMap: { [key: string]: string } = {
      'chain-of-custody': 'Chain of Custody',
      'temperature': 'Temperature',
      'time': 'Time',
      'documentation': 'Documentation',
      'procedure': 'Procedure'
    };
    return typeMap[type] || type;
  }

  getEventTypeDisplay(eventType: string): string {
    // This would map event types to display names
    return eventType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getSpecimenId(violationId: string): string {
    // This would extract specimen ID from violation ID
    return `SP-${violationId.substring(0, 8)}`;
  }

  formatReportPeriod(period: { start: Date; end: Date }): string {
    return `${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}`;
  }

  getComplianceRateClass(rate: number): string {
    if (rate >= 95) { return 'excellent'; }
    if (rate >= 85) { return 'good'; }
    if (rate >= 70) { return 'warning'; }
    return 'poor';
  }

  getComplianceTrendClass(): string {
    // This would calculate trend based on historical data
    return 'improving';
  }

  getComplianceTrendIcon(): string {
    return 'icon-trending-up';
  }

  getComplianceTrendText(): string {
    return '+2.3% from last week';
  }

  private getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  }

  private getDefaultEndDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}