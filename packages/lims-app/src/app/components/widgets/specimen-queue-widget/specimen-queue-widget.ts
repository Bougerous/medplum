import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { MedplumService } from '../../../medplum.service';
import { Specimen } from '../../../types/fhir-types';

interface SpecimenQueueItem {
  id: string;
  accessionNumber: string;
  patientName: string;
  specimenType: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: string;
  receivedTime: Date;
  assignedTechnician?: string;
  estimatedCompletion?: Date;
}

@Component({
  selector: 'app-specimen-queue-widget',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="specimen-queue-widget">
      <div class="widget-header">
        <h4>{{ config.title || 'Specimen Queue' }}</h4>
        <div class="queue-stats">
          <span class="stat-item">
            <span class="stat-value">{{ specimens.length }}</span>
            <span class="stat-label">Total</span>
          </span>
          <span class="stat-item urgent" *ngIf="urgentCount > 0">
            <span class="stat-value">{{ urgentCount }}</span>
            <span class="stat-label">Urgent</span>
          </span>
        </div>
      </div>
      
      <div class="queue-content">
        <div *ngIf="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading specimens...</p>
        </div>
        
        <div *ngIf="!isLoading && specimens.length === 0" class="empty-state">
          <div class="empty-icon">🧪</div>
          <p>No specimens in queue</p>
        </div>
        
        <div *ngIf="!isLoading && specimens.length > 0" class="specimen-list">
          <div *ngFor="let specimen of specimens" 
               class="specimen-item" 
               [ngClass]="specimen.priority"
               (click)="selectSpecimen(specimen)">
            <div class="specimen-info">
              <div class="specimen-header">
                <span class="accession-number">{{ specimen.accessionNumber }}</span>
                <span class="priority-badge" [ngClass]="specimen.priority">
                  {{ specimen.priority.toUpperCase() }}
                </span>
              </div>
              <div class="patient-name">{{ specimen.patientName }}</div>
              <div class="specimen-details">
                <span class="specimen-type">{{ specimen.specimenType }}</span>
                <span class="received-time">{{ specimen.receivedTime | date:'short' }}</span>
              </div>
            </div>
            <div class="specimen-status">
              <div class="status-indicator" [ngClass]="getStatusClass(specimen.status)"></div>
              <span class="status-text">{{ specimen.status }}</span>
            </div>
          </div>
        </div>
        
        <div class="widget-actions" *ngIf="specimens.length > 0">
          <button class="action-btn primary" routerLink="/specimen-accessioning">
            Process Next
          </button>
          <button class="action-btn secondary" routerLink="/sample-tracking">
            View All
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './specimen-queue-widget.scss'
})
export class SpecimenQueueWidget implements OnInit, OnDestroy {
  @Input() config: any = {};
  
  private destroy$ = new Subject<void>();
  
  specimens: SpecimenQueueItem[] = [];
  isLoading = true;
  urgentCount = 0;

  constructor(private medplumService: MedplumService) {}

  ngOnInit(): void {
    this.loadSpecimens();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadSpecimens(): Promise<void> {
    try {
      this.isLoading = true;
      
      // Build search parameters based on config
      const searchParams: any = {
        status: 'available',
        _sort: '-received',
        _count: this.config.limit || 10
      };
      
      if (this.config.assignedToMe) {
        // Add filter for specimens assigned to current user
        // This would be implemented based on your assignment logic
      }
      
      if (this.config.priority) {
        // Add priority filter
        searchParams['extension:priority'] = this.config.priority;
      }

      const specimens = await this.medplumService.searchSpecimens(searchParams);
      this.specimens = this.mapSpecimensToQueueItems(specimens);
      this.urgentCount = this.specimens.filter(s => s.priority === 'urgent' || s.priority === 'stat').length;
      
    } catch (error) {
      console.error('Failed to load specimens:', error);
      this.specimens = this.getMockSpecimens(); // Fallback to mock data
    } finally {
      this.isLoading = false;
    }
  }

  private mapSpecimensToQueueItems(specimens: Specimen[]): SpecimenQueueItem[] {
    return specimens.map(specimen => ({
      id: specimen.id!,
      accessionNumber: specimen.accessionIdentifier?.value || 'N/A',
      patientName: this.getPatientName(specimen),
      specimenType: specimen.type?.coding?.[0]?.display || 'Unknown',
      priority: this.getPriority(specimen),
      status: specimen.status || 'available',
      receivedTime: new Date(specimen.receivedTime || specimen.collection?.collectedDateTime || Date.now()),
      assignedTechnician: this.getAssignedTechnician(specimen),
      estimatedCompletion: this.getEstimatedCompletion(specimen)
    }));
  }

  private getPatientName(_specimen: Specimen): string {
    // This would typically involve a lookup to the Patient resource
    // For now, return a placeholder
    return 'Patient Name'; // TODO: Implement patient lookup
  }

  private getPriority(specimen: Specimen): 'routine' | 'urgent' | 'stat' {
    // Check for priority extension or other indicators
    const priorityExtension = specimen.extension?.find(
      ext => ext.url === 'http://lims.local/specimen/priority'
    );
    
    if (priorityExtension?.valueString) {
      return priorityExtension.valueString as 'routine' | 'urgent' | 'stat';
    }
    
    return 'routine';
  }

  private getAssignedTechnician(specimen: Specimen): string | undefined {
    // Check for assignment extension
    const assignmentExtension = specimen.extension?.find(
      ext => ext.url === 'http://lims.local/specimen/assigned-technician'
    );
    
    return assignmentExtension?.valueString;
  }

  private getEstimatedCompletion(_specimen: Specimen): Date | undefined {
    // Calculate based on specimen type and current workload
    // This is a simplified implementation
    const baseTime = new Date();
    baseTime.setHours(baseTime.getHours() + 4); // Default 4 hours
    return baseTime;
  }

  private startAutoRefresh(): void {
    const refreshInterval = this.config.refreshInterval || 30000; // 30 seconds default
    
    interval(refreshInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.loadSpecimens())
      )
      .subscribe();
  }

  selectSpecimen(specimen: SpecimenQueueItem): void {
    // Navigate to specimen details or processing page
    console.log('Selected specimen:', specimen);
  }

  getStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'available': 'status-available',
      'processing': 'status-processing',
      'completed': 'status-completed',
      'on-hold': 'status-hold'
    };
    
    return statusMap[status] || 'status-unknown';
  }

  private getMockSpecimens(): SpecimenQueueItem[] {
    return [
      {
        id: '1',
        accessionNumber: 'SP20250719001',
        patientName: 'John Doe',
        specimenType: 'Blood',
        priority: 'stat',
        status: 'available',
        receivedTime: new Date(Date.now() - 30 * 60 * 1000),
        assignedTechnician: 'Tech A'
      },
      {
        id: '2',
        accessionNumber: 'SP20250719002',
        patientName: 'Jane Smith',
        specimenType: 'Tissue',
        priority: 'urgent',
        status: 'processing',
        receivedTime: new Date(Date.now() - 60 * 60 * 1000),
        assignedTechnician: 'Tech B'
      },
      {
        id: '3',
        accessionNumber: 'SP20250719003',
        patientName: 'Bob Johnson',
        specimenType: 'Urine',
        priority: 'routine',
        status: 'available',
        receivedTime: new Date(Date.now() - 90 * 60 * 1000)
      }
    ];
  }
}