import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { MedplumService } from '../../../medplum.service';
import { DiagnosticReport } from '../../../types/fhir-types';

interface PendingReportItem {
  id: string;
  accessionNumber: string;
  patientName: string;
  testType: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: string;
  receivedDate: Date;
  dueDate: Date;
  assignedPathologist?: string;
  isOverdue: boolean;
  daysPending: number;
}

@Component({
  selector: 'app-pending-reports-widget',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="pending-reports-widget">
      <div class="widget-header">
        <h4>{{ config.title || 'Pending Reports' }}</h4>
        <div class="reports-stats">
          <span class="stat-item">
            <span class="stat-value">{{ reports.length }}</span>
            <span class="stat-label">Total</span>
          </span>
          <span class="stat-item overdue" *ngIf="overdueCount > 0">
            <span class="stat-value">{{ overdueCount }}</span>
            <span class="stat-label">Overdue</span>
          </span>
        </div>
      </div>
      
      <div class="reports-content">
        <div *ngIf="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading reports...</p>
        </div>
        
        <div *ngIf="!isLoading && reports.length === 0" class="empty-state">
          <div class="empty-icon">📄</div>
          <p>No pending reports</p>
        </div>
        
        <div *ngIf="!isLoading && reports.length > 0" class="reports-list">
          <div *ngFor="let report of reports" 
               class="report-item" 
               [ngClass]="{ 'overdue': report.isOverdue, 'priority': report.priority !== 'routine' }"
               (click)="selectReport(report)">
            <div class="report-info">
              <div class="report-header">
                <span class="accession-number">{{ report.accessionNumber }}</span>
                <span class="priority-badge" [ngClass]="report.priority">
                  {{ report.priority.toUpperCase() }}
                </span>
              </div>
              <div class="patient-name">{{ report.patientName }}</div>
              <div class="test-type">{{ report.testType }}</div>
              <div class="report-details">
                <span class="received-date">Received: {{ report.receivedDate | date:'short' }}</span>
                <span class="due-date" [ngClass]="{ 'overdue': report.isOverdue }">
                  Due: {{ report.dueDate | date:'short' }}
                </span>
              </div>
              <div class="assigned-pathologist" *ngIf="report.assignedPathologist">
                Assigned to: {{ report.assignedPathologist }}
              </div>
            </div>
            <div class="report-status">
              <div class="status-indicator" [ngClass]="getStatusClass(report.status)"></div>
              <span class="status-text">{{ report.status }}</span>
              <div class="days-pending" [ngClass]="{ 'overdue': report.isOverdue }">
                {{ report.daysPending }} days
              </div>
            </div>
          </div>
        </div>
        
        <div class="widget-actions" *ngIf="reports.length > 0">
          <button class="action-btn primary" routerLink="/result-entry">
            Review Next
          </button>
          <button class="action-btn secondary" routerLink="/reports">
            View All
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './pending-reports-widget.scss'
})
export class PendingReportsWidget implements OnInit, OnDestroy {
  private medplumService = inject(MedplumService);

  @Input() config: any = {};
  
  private destroy$ = new Subject<void>();
  
  reports: PendingReportItem[] = [];
  isLoading = true;
  overdueCount = 0;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  ngOnInit(): void {
    this.loadReports();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadReports(): Promise<void> {
    try {
      this.isLoading = true;
      
      // Build search parameters based on config
      const searchParams: any = {
        status: 'partial,preliminary',
        _sort: '-date',
        _count: this.config.limit || 10
      };
      
      if (this.config.assignedToMe) {
        // Add filter for reports assigned to current user
        // This would be implemented based on your assignment logic
      }
      
      if (this.config.showOverdue) {
        // Add filter for overdue reports
        const overdueDate = new Date();
        overdueDate.setDate(overdueDate.getDate() - 2); // 2 days overdue threshold
        searchParams.date = `lt${overdueDate.toISOString()}`;
      }

      const reports = await this.medplumService.searchDiagnosticReports(searchParams);
      this.reports = this.mapReportsToItems(reports);
      this.overdueCount = this.reports.filter(r => r.isOverdue).length;
      
    } catch (error) {
      console.error('Failed to load reports:', error);
      this.reports = this.getMockReports(); // Fallback to mock data
      this.overdueCount = this.reports.filter(r => r.isOverdue).length;
    } finally {
      this.isLoading = false;
    }
  }

  private mapReportsToItems(reports: DiagnosticReport[]): PendingReportItem[] {
    return reports.map(report => {
      const receivedDate = new Date(report.effectiveDateTime || report.issued || Date.now());
      const dueDate = this.calculateDueDate(receivedDate, report);
      const daysPending = Math.floor((Date.now() - receivedDate.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: report.id!,
        accessionNumber: this.getAccessionNumber(report),
        patientName: this.getPatientName(report),
        testType: this.getTestType(report),
        priority: this.getPriority(report),
        status: report.status || 'unknown',
        receivedDate,
        dueDate,
        assignedPathologist: this.getAssignedPathologist(report),
        isOverdue: Date.now() > dueDate.getTime(),
        daysPending
      };
    });
  }

  private getAccessionNumber(report: DiagnosticReport): string {
    // Extract accession number from identifier or specimen reference
    return report.identifier?.[0]?.value || 'N/A';
  }

  private getPatientName(_report: DiagnosticReport): string {
    // This would typically involve a lookup to the Patient resource
    // For now, return a placeholder
    return 'Patient Name'; // TODO: Implement patient lookup
  }

  private getTestType(report: DiagnosticReport): string {
    return report.code?.coding?.[0]?.display || 'Unknown Test';
  }

  private getPriority(report: DiagnosticReport): 'routine' | 'urgent' | 'stat' {
    // Check for priority extension or other indicators
    const priorityExtension = report.extension?.find(
      ext => ext.url === 'http://lims.local/report/priority'
    );
    
    if (priorityExtension?.valueString) {
      return priorityExtension.valueString as 'routine' | 'urgent' | 'stat';
    }
    
    return 'routine';
  }

  private getAssignedPathologist(report: DiagnosticReport): string | undefined {
    // Check for assignment extension or performer
    const performer = report.performer?.[0];
    if (performer?.display) {
      return performer.display;
    }
    
    const assignmentExtension = report.extension?.find(
      ext => ext.url === 'http://lims.local/report/assigned-pathologist'
    );
    
    return assignmentExtension?.valueString;
  }

  private calculateDueDate(receivedDate: Date, report: DiagnosticReport): Date {
    // Calculate due date based on test type and priority
    const dueDate = new Date(receivedDate);
    const priority = this.getPriority(report);
    
    switch (priority) {
      case 'stat':
        dueDate.setHours(dueDate.getHours() + 2); // 2 hours for STAT
        break;
      case 'urgent':
        dueDate.setHours(dueDate.getHours() + 24); // 24 hours for urgent
        break;
      default:
        dueDate.setDate(dueDate.getDate() + 2); // 2 days for routine
        break;
    }
    
    return dueDate;
  }

  private startAutoRefresh(): void {
    const refreshInterval = this.config.refreshInterval || 60000; // 1 minute default
    
    interval(refreshInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.loadReports())
      )
      .subscribe();
  }

  selectReport(report: PendingReportItem): void {
    // Navigate to report review page
    console.log('Selected report:', report);
  }

  getStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'partial': 'status-partial',
      'preliminary': 'status-preliminary',
      'final': 'status-final',
      'amended': 'status-amended',
      'cancelled': 'status-cancelled'
    };
    
    return statusMap[status] || 'status-unknown';
  }

  private getMockReports(): PendingReportItem[] {
    const now = new Date();
    return [
      {
        id: '1',
        accessionNumber: 'SP20250719001',
        patientName: 'John Doe',
        testType: 'Histopathology',
        priority: 'stat',
        status: 'partial',
        receivedDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        dueDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago (overdue)
        assignedPathologist: 'Dr. Smith',
        isOverdue: true,
        daysPending: 3
      },
      {
        id: '2',
        accessionNumber: 'SP20250719002',
        patientName: 'Jane Smith',
        testType: 'Cytology',
        priority: 'urgent',
        status: 'preliminary',
        receivedDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        dueDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        assignedPathologist: 'Dr. Johnson',
        isOverdue: false,
        daysPending: 2
      },
      {
        id: '3',
        accessionNumber: 'SP20250719003',
        patientName: 'Bob Johnson',
        testType: 'Immunohistochemistry',
        priority: 'routine',
        status: 'partial',
        receivedDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        dueDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        isOverdue: false,
        daysPending: 1
      }
    ];
  }
}