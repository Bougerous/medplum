import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';

interface PendingReport {
  id: string;
  accessionNumber: string;
  patientName: string;
  testType: string;
  collectionDate: Date;
  priority: 'routine' | 'urgent' | 'stat';
  status: 'preliminary' | 'final' | 'amended' | 'cancelled';
  assignedPathologist?: string;
  daysOld: number;
}

@Component({
  selector: 'app-pending-reports-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Pending Reports</h3>
        <span class="report-count">{{ reports.length }} pending</span>
      </div>
      
      <div class="widget-content">
        <div class="report-filters">
          <button 
            *ngFor="let filter of filters" 
            [class.active]="activeFilter === filter.key"
            (click)="setFilter(filter.key)"
            class="filter-btn">
            {{ filter.label }} ({{ getFilterCount(filter.key) }})
          </button>
        </div>
        
        <div class="report-list">
          <div 
            *ngFor="let report of getFilteredReports()" 
            class="report-item"
            [class.overdue]="report.daysOld > 2"
            [class.priority-stat]="report.priority === 'stat'"
            [class.priority-urgent]="report.priority === 'urgent'">
            
            <div class="report-info">
              <div class="accession-number">{{ report.accessionNumber }}</div>
              <div class="patient-name">{{ report.patientName }}</div>
              <div class="report-details">
                <span class="test-type">{{ report.testType }}</span>
                <span class="collection-date">{{ report.collectionDate | date:'short' }}</span>
                <span class="days-old" [class.overdue]="report.daysOld > 2">
                  {{ report.daysOld }} days old
                </span>
              </div>
            </div>
            
            <div class="report-status">
              <span class="priority-badge" [class]="'priority-' + report.priority">
                {{ report.priority.toUpperCase() }}
              </span>
              <span class="status">{{ report.status }}</span>
              <span *ngIf="report.assignedPathologist" class="pathologist">
                {{ report.assignedPathologist }}
              </span>
            </div>
            
            <div class="report-actions">
              <button (click)="reviewReport(report)" class="action-btn review">
                Review
              </button>
              <button (click)="signReport(report)" class="action-btn sign">
                Sign
              </button>
            </div>
          </div>
        </div>
        
        <div *ngIf="getFilteredReports().length === 0" class="empty-state">
          <p>No pending reports</p>
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

    .report-count {
      background: #e67e22;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-size: 0.875rem;
    }

    .widget-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .report-filters {
      padding: 0.5rem 1rem;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      gap: 0.5rem;
    }

    .filter-btn {
      padding: 0.25rem 0.75rem;
      border: 1px solid #ddd;
      background: white;
      border-radius: 16px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      background: #f5f5f5;
    }

    .filter-btn.active {
      background: #e67e22;
      color: white;
      border-color: #e67e22;
    }

    .report-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }

    .report-item {
      display: flex;
      align-items: center;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .report-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .report-item.overdue {
      border-left: 4px solid #e74c3c;
      background: #fdf2f2;
    }

    .report-item.priority-stat {
      border-left: 4px solid #e74c3c;
    }

    .report-item.priority-urgent {
      border-left: 4px solid #f39c12;
    }

    .report-info {
      flex: 1;
    }

    .accession-number {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }

    .patient-name {
      color: #34495e;
      margin-bottom: 0.25rem;
    }

    .report-details {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .report-details span {
      margin-right: 1rem;
    }

    .days-old.overdue {
      color: #e74c3c;
      font-weight: 600;
    }

    .report-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0 1rem;
    }

    .priority-badge {
      padding: 0.125rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .priority-badge.priority-stat {
      background: #e74c3c;
      color: white;
    }

    .priority-badge.priority-urgent {
      background: #f39c12;
      color: white;
    }

    .priority-badge.priority-routine {
      background: #95a5a6;
      color: white;
    }

    .status {
      font-size: 0.875rem;
      color: #7f8c8d;
      margin-bottom: 0.25rem;
    }

    .pathologist {
      font-size: 0.75rem;
      color: #3498db;
    }

    .report-actions {
      display: flex;
      gap: 0.5rem;
    }

    .action-btn {
      padding: 0.375rem 0.75rem;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn.review {
      background: #3498db;
      color: white;
    }

    .action-btn.review:hover {
      background: #2980b9;
    }

    .action-btn.sign {
      background: #27ae60;
      color: white;
    }

    .action-btn.sign:hover {
      background: #229954;
    }

    .empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #7f8c8d;
    }
  `]
})
export class PendingReportsWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { limit: 10 };

  reports: PendingReport[] = [];
  activeFilter = 'all';

  filters = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'stat', label: 'STAT' },
    { key: 'urgent', label: 'Urgent' }
  ];

  ngOnInit(): void {
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadReports(): Promise<void> {
    try {
      // In a real implementation, this would search for actual diagnostic reports
      // For now, we'll use mock data
      this.reports = [
        {
          id: '1',
          accessionNumber: 'SP20250717001',
          patientName: 'Alice Johnson',
          testType: 'Histopathology',
          collectionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          priority: 'stat',
          status: 'preliminary',
          assignedPathologist: 'Dr. Smith',
          daysOld: 3
        },
        {
          id: '2',
          accessionNumber: 'SP20250718002',
          patientName: 'Bob Wilson',
          testType: 'Cytology',
          collectionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          priority: 'urgent',
          status: 'preliminary',
          assignedPathologist: 'Dr. Jones',
          daysOld: 2
        },
        {
          id: '3',
          accessionNumber: 'SP20250719003',
          patientName: 'Carol Brown',
          testType: 'Microbiology',
          collectionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          priority: 'routine',
          status: 'preliminary',
          daysOld: 1
        }
      ];
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
  }

  getFilteredReports(): PendingReport[] {
    if (this.activeFilter === 'all') {
      return this.reports;
    }
    
    if (this.activeFilter === 'overdue') {
      return this.reports.filter(report => report.daysOld > 2);
    }
    
    return this.reports.filter(report => report.priority === this.activeFilter);
  }

  getFilterCount(filter: string): number {
    if (filter === 'all') {
      return this.reports.length;
    }
    
    if (filter === 'overdue') {
      return this.reports.filter(report => report.daysOld > 2).length;
    }
    
    return this.reports.filter(report => report.priority === filter).length;
  }

  reviewReport(report: PendingReport): void {
    console.log('Reviewing report:', report.accessionNumber);
    // Navigate to report review interface
  }

  signReport(report: PendingReport): void {
    console.log('Signing report:', report.accessionNumber);
    // Navigate to report signing interface
  }
}