import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MedplumService } from '../../medplum.service';
import { Specimen } from '@medplum/fhirtypes';

interface SpecimenQueueItem {
  id: string;
  accessionNumber: string;
  patientName: string;
  specimenType: string;
  collectionDate: Date;
  priority: 'routine' | 'urgent' | 'stat';
  status: string;
  assignedTechnician?: string;
}

@Component({
  selector: 'app-specimen-queue-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-container">
      <div class="widget-header">
        <h3>Specimen Queue</h3>
        <span class="queue-count">{{ specimens.length }} pending</span>
      </div>
      
      <div class="widget-content">
        <div class="queue-filters">
          <button 
            *ngFor="let filter of filters" 
            [class.active]="activeFilter === filter.key"
            (click)="setFilter(filter.key)"
            class="filter-btn">
            {{ filter.label }} ({{ getFilterCount(filter.key) }})
          </button>
        </div>
        
        <div class="specimen-list">
          <div 
            *ngFor="let specimen of getFilteredSpecimens()" 
            class="specimen-item"
            [class.priority-stat]="specimen.priority === 'stat'"
            [class.priority-urgent]="specimen.priority === 'urgent'">
            
            <div class="specimen-info">
              <div class="accession-number">{{ specimen.accessionNumber }}</div>
              <div class="patient-name">{{ specimen.patientName }}</div>
              <div class="specimen-details">
                <span class="specimen-type">{{ specimen.specimenType }}</span>
                <span class="collection-date">{{ specimen.collectionDate | date:'short' }}</span>
              </div>
            </div>
            
            <div class="specimen-status">
              <span class="priority-badge" [class]="'priority-' + specimen.priority">
                {{ specimen.priority.toUpperCase() }}
              </span>
              <span class="status">{{ specimen.status }}</span>
            </div>
            
            <div class="specimen-actions">
              <button (click)="processSpecimen(specimen)" class="action-btn process">
                Process
              </button>
              <button (click)="viewDetails(specimen)" class="action-btn view">
                View
              </button>
            </div>
          </div>
        </div>
        
        <div *ngIf="getFilteredSpecimens().length === 0" class="empty-state">
          <p>No specimens in queue</p>
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

    .queue-count {
      background: #3498db;
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

    .queue-filters {
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
      background: #3498db;
      color: white;
      border-color: #3498db;
    }

    .specimen-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }

    .specimen-item {
      display: flex;
      align-items: center;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .specimen-item:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .specimen-item.priority-stat {
      border-left: 4px solid #e74c3c;
    }

    .specimen-item.priority-urgent {
      border-left: 4px solid #f39c12;
    }

    .specimen-info {
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

    .specimen-details {
      font-size: 0.875rem;
      color: #7f8c8d;
    }

    .specimen-details span {
      margin-right: 1rem;
    }

    .specimen-status {
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
    }

    .specimen-actions {
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

    .action-btn.process {
      background: #27ae60;
      color: white;
    }

    .action-btn.process:hover {
      background: #229954;
    }

    .action-btn.view {
      background: #3498db;
      color: white;
    }

    .action-btn.view:hover {
      background: #2980b9;
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
export class SpecimenQueueWidgetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() config: any = { limit: 10 };

  specimens: SpecimenQueueItem[] = [];
  activeFilter = 'all';

  filters = [
    { key: 'all', label: 'All' },
    { key: 'stat', label: 'STAT' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'routine', label: 'Routine' }
  ];

  constructor(private medplumService: MedplumService) {}

  ngOnInit(): void {
    this.loadSpecimens();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadSpecimens(): Promise<void> {
    try {
      // In a real implementation, this would search for actual specimens
      // For now, we'll use mock data
      this.specimens = [
        {
          id: '1',
          accessionNumber: 'SP20250719001',
          patientName: 'John Smith',
          specimenType: 'Blood',
          collectionDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
          priority: 'stat',
          status: 'Accessioned'
        },
        {
          id: '2',
          accessionNumber: 'SP20250719002',
          patientName: 'Jane Doe',
          specimenType: 'Tissue',
          collectionDate: new Date(Date.now() - 4 * 60 * 60 * 1000),
          priority: 'urgent',
          status: 'Processing'
        },
        {
          id: '3',
          accessionNumber: 'SP20250719003',
          patientName: 'Bob Johnson',
          specimenType: 'Urine',
          collectionDate: new Date(Date.now() - 6 * 60 * 60 * 1000),
          priority: 'routine',
          status: 'Accessioned'
        }
      ];
    } catch (error) {
      console.error('Failed to load specimens:', error);
    }
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
  }

  getFilteredSpecimens(): SpecimenQueueItem[] {
    if (this.activeFilter === 'all') {
      return this.specimens;
    }
    
    return this.specimens.filter(specimen => specimen.priority === this.activeFilter);
  }

  getFilterCount(filter: string): number {
    if (filter === 'all') {
      return this.specimens.length;
    }
    
    return this.specimens.filter(specimen => specimen.priority === filter).length;
  }

  processSpecimen(specimen: SpecimenQueueItem): void {
    console.log('Processing specimen:', specimen.accessionNumber);
    // Navigate to specimen processing workflow
  }

  viewDetails(specimen: SpecimenQueueItem): void {
    console.log('Viewing specimen details:', specimen.accessionNumber);
    // Navigate to specimen details view
  }
}