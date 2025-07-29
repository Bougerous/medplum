import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { combineLatest, Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, takeUntil } from 'rxjs/operators';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService } from '../../services/notification.service';
import { QrScannerService, ScanResult } from '../../services/qr-scanner.service';
import {
  SpecimenLocation,
  SpecimenTrackingData,
  SpecimenTrackingService,
  WorkflowStation
} from '../../services/specimen-tracking.service';

@Component({
  selector: 'app-specimen-tracking',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="specimen-tracking-container">
      <!-- Header with QR Scanner -->
      <div class="tracking-header">
        <h2>Specimen Tracking</h2>
        <div class="scanner-controls">
          <button 
            class="btn btn-primary" 
            (click)="toggleScanner()"
            [disabled]="isScanning">
            <i class="icon-qr-code"></i>
            {{ isScanning ? 'Stop Scanner' : 'Start QR Scanner' }}
          </button>
          <input 
            type="text" 
            class="form-control barcode-input" 
            placeholder="Scan or enter specimen ID"
            [(ngModel)]="manualInput"
            (keyup.enter)="processManualInput()"
            #barcodeInput>
          <button 
            class="btn btn-secondary" 
            (click)="processManualInput()">
            Lookup
          </button>
        </div>
      </div>

      <!-- QR Scanner Area -->
      <div class="scanner-area" [class.active]="isScanning">
        <div id="qr-scanner" class="qr-scanner-container"></div>
        <div class="scanner-status" *ngIf="isScanning">
          <p>Point camera at QR code or barcode</p>
          <button class="btn btn-sm btn-outline-secondary" (click)="switchCamera()" 
                  *ngIf="availableCameras.length > 1">
            Switch Camera
          </button>
        </div>
      </div>

      <!-- Filters and Search -->
      <div class="filters-section">
        <div class="row">
          <div class="col-md-3">
            <input 
              type="text" 
              class="form-control" 
              placeholder="Search specimens..."
              [formControl]="searchControl">
          </div>
          <div class="col-md-2">
            <select class="form-control" [formControl]="locationFilter">
              <option value="">All Locations</option>
              <option *ngFor="let location of locations$ | async" [value]="location.id">
                {{ location.name }}
              </option>
            </select>
          </div>
          <div class="col-md-2">
            <select class="form-control" [formControl]="statusFilter">
              <option value="">All Statuses</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              <option value="unsatisfactory">Unsatisfactory</option>
            </select>
          </div>
          <div class="col-md-2">
            <select class="form-control" [formControl]="priorityFilter">
              <option value="">All Priorities</option>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </div>
          <div class="col-md-3">
            <div class="btn-group">
              <button class="btn btn-outline-primary" (click)="showOverdueOnly = !showOverdueOnly"
                      [class.active]="showOverdueOnly">
                Overdue Only ({{ overdueCount$ | async }})
              </button>
              <button class="btn btn-outline-warning" (click)="showAlertsOnly = !showAlertsOnly"
                      [class.active]="showAlertsOnly">
                With Alerts ({{ alertCount$ | async }})
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="stats-section">
        <div class="row">
          <div class="col-md-2" *ngFor="let location of locations$ | async">
            <div class="stat-card">
              <div class="stat-number">{{ getLocationCount(location.id) | async }}</div>
              <div class="stat-label">{{ location.name }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Specimens Table -->
      <div class="specimens-table-container">
        <table class="table table-striped table-hover">
          <thead>
            <tr>
              <th>
                <input type="checkbox" 
                       [checked]="isAllSelected()" 
                       [indeterminate]="isPartiallySelected()"
                       (change)="toggleSelectAll()">
              </th>
              <th>Specimen ID</th>
              <th>Patient</th>
              <th>Current Location</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Last Updated</th>
              <th>TAT Remaining</th>
              <th>Alerts</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let tracking of filteredSpecimens$ | async; trackBy: trackBySpecimenId"
                [class.overdue]="isOverdue(tracking)"
                [class.has-alerts]="tracking.alerts.length > 0">
              <td>
                <input type="checkbox" 
                       [checked]="isSelected(tracking.specimen.id!)"
                       (change)="toggleSelection(tracking.specimen.id!)">
              </td>
              <td>
                <strong>{{ getSpecimenDisplayId(tracking.specimen) }}</strong>
                <br>
                <small class="text-muted">{{ tracking.specimen.id }}</small>
              </td>
              <td>{{ getPatientName(tracking.specimen) }}</td>
              <td>
                <span class="location-badge" [attr.data-location]="tracking.currentLocation.type">
                  {{ tracking.currentLocation.name }}
                </span>
              </td>
              <td>
                <span class="status-badge" [attr.data-status]="tracking.currentStatus.code">
                  {{ tracking.currentStatus.display }}
                </span>
              </td>
              <td>
                <span class="priority-badge" [attr.data-priority]="tracking.priority">
                  {{ tracking.priority.toUpperCase() }}
                </span>
              </td>
              <td>{{ getLastUpdated(tracking) | date:'short' }}</td>
              <td>
                <span [class]="getTATClass(tracking)">
                  {{ getTATRemaining(tracking) }}
                </span>
              </td>
              <td>
                <div class="alerts-column">
                  <span *ngFor="let alert of tracking.alerts" 
                        class="alert-badge" 
                        [attr.data-severity]="alert.severity"
                        [title]="alert.message">
                    {{ alert.type }}
                  </span>
                </div>
              </td>
              <td>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" 
                          (click)="checkInSpecimen(tracking)"
                          [disabled]="!canCheckIn(tracking)">
                    Check In
                  </button>
                  <button class="btn btn-outline-secondary" 
                          (click)="checkOutSpecimen(tracking)"
                          [disabled]="!canCheckOut(tracking)">
                    Check Out
                  </button>
                  <button class="btn btn-outline-info" 
                          (click)="viewTimeline(tracking)">
                    Timeline
                  </button>
                  <button class="btn btn-outline-warning" 
                          (click)="updateLocation(tracking)">
                    Move
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Bulk Actions -->
      <div class="bulk-actions" *ngIf="selectedSpecimens.length > 0">
        <div class="selected-count">
          {{ selectedSpecimens.length }} specimen(s) selected
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" (click)="bulkCheckIn()">
            Bulk Check In
          </button>
          <button class="btn btn-secondary" (click)="bulkCheckOut()">
            Bulk Check Out
          </button>
          <button class="btn btn-info" (click)="bulkUpdateLocation()">
            Bulk Move
          </button>
          <button class="btn btn-outline-secondary" (click)="printLabels()">
            Print Labels
          </button>
          <button class="btn btn-outline-danger" (click)="clearSelection()">
            Clear Selection
          </button>
        </div>
      </div>
    </div>

    <!-- Check In/Out Modal -->
    <div class="modal" [class.show]="showCheckInModal" *ngIf="showCheckInModal">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ checkInMode ? 'Check In' : 'Check Out' }} Specimen</h5>
            <button type="button" class="btn-close" (click)="closeCheckInModal()"></button>
          </div>
          <div class="modal-body">
            <form [formGroup]="checkInForm">
              <div class="mb-3" *ngIf="checkInMode">
                <label class="form-label">Workflow Station</label>
                <select class="form-control" formControlName="stationId" required>
                  <option value="">Select Station</option>
                  <option *ngFor="let station of workflowStations$ | async" [value]="station.id">
                    {{ station.name }} ({{ station.location.name }})
                  </option>
                </select>
              </div>
              <div class="mb-3" *ngIf="!checkInMode">
                <label class="form-label">Destination Station (Optional)</label>
                <select class="form-control" formControlName="toStationId">
                  <option value="">In Transit</option>
                  <option *ngFor="let station of workflowStations$ | async" [value]="station.id">
                    {{ station.name }} ({{ station.location.name }})
                  </option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Comments</label>
                <textarea class="form-control" formControlName="comments" rows="3"></textarea>
              </div>
              <div class="mb-3" *ngIf="lastScanResult">
                <div class="alert alert-info">
                  <strong>QR Code Scanned:</strong> {{ lastScanResult.data }}
                  <br>
                  <small>Scanned at {{ lastScanResult.timestamp | date:'short' }}</small>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeCheckInModal()">
              Cancel
            </button>
            <button type="button" class="btn btn-primary" 
                    (click)="confirmCheckInOut()"
                    [disabled]="!checkInForm.valid">
              {{ checkInMode ? 'Check In' : 'Check Out' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline Modal -->
    <div class="modal" [class.show]="showTimelineModal" *ngIf="showTimelineModal">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Chain of Custody - {{ selectedTracking?.specimen?.id || 'Unknown' }}</h5>
            <button type="button" class="btn-close" (click)="closeTimelineModal()"></button>
          </div>
          <div class="modal-body">
            <div class="timeline" *ngIf="selectedTracking">
              <div class="timeline-item" *ngFor="let event of selectedTracking.chainOfCustody; let i = index">
                <div class="timeline-marker" [attr.data-index]="i + 1"></div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <strong>{{ event.toLocation }}</strong>
                    <span class="timestamp">{{ event.timestamp | date:'short' }}</span>
                  </div>
                  <div class="timeline-details">
                    <div *ngIf="event.fromLocation">From: {{ event.fromLocation }}</div>
                    <div>Status: {{ event.toStatus }}</div>
                    <div>Performed by: {{ getPerformerName(event.performedBy) }}</div>
                    <div *ngIf="event.qrCodeScanned" class="qr-indicator">
                      <i class="icon-qr-code"></i> QR Code Scanned
                    </div>
                    <div *ngIf="event.comments" class="comments">{{ event.comments }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeTimelineModal()">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./specimen-tracking.component.scss']
})
export class SpecimenTrackingComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private specimenTrackingService = inject(SpecimenTrackingService);
  private qrScannerService = inject(QrScannerService);
  private notificationService = inject(NotificationService);
  private errorHandlingService = inject(ErrorHandlingService);

  @ViewChild('barcodeInput') barcodeInput!: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();

  // Observables
  specimens$: Observable<SpecimenTrackingData[]>;
  filteredSpecimens$: Observable<SpecimenTrackingData[]>;
  locations$: Observable<SpecimenLocation[]>;
  workflowStations$: Observable<WorkflowStation[]>;
  overdueCount$: Observable<number>;
  alertCount$: Observable<number>;

  // Form controls
  searchControl: any;
  locationFilter: any;
  statusFilter: any;
  priorityFilter: any;
  checkInForm: FormGroup;

  // Scanner state
  isScanning = false;
  availableCameras: any[] = [];
  manualInput = '';
  lastScanResult: ScanResult | null = null;

  // UI state
  selectedSpecimens: string[] = [];
  showOverdueOnly = false;
  showAlertsOnly = false;
  showCheckInModal = false;
  showTimelineModal = false;
  checkInMode = true;
  selectedTracking: SpecimenTrackingData | null = null;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    // Initialize form controls after FormBuilder is injected
    this.searchControl = this.fb.control('');
    this.locationFilter = this.fb.control('');
    this.statusFilter = this.fb.control('');
    this.priorityFilter = this.fb.control('');

    this.checkInForm = this.fb.group({
      stationId: ['', Validators.required],
      toStationId: [''],
      comments: ['']
    });

    this.specimens$ = this.specimenTrackingService.getTrackedSpecimens();
    this.locations$ = this.specimenTrackingService.getLocations();
    this.workflowStations$ = this.specimenTrackingService.getWorkflowStations();

    // Initialize missing Observable properties
    this.filteredSpecimens$ = this.specimens$;
    this.overdueCount$ = this.specimens$.pipe(
      map(specimens => specimens.filter(s => this.isOverdue(s)).length)
    );
    this.alertCount$ = this.specimens$.pipe(
      map(specimens => specimens.filter(s => s.alerts.length > 0).length)
    );

    this.setupFilteredSpecimens();
    this.setupCounts();
  }

  ngOnInit(): void {
    this.initializeScanner();
    this.setupScannerSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopScanner();
  }

  private setupFilteredSpecimens(): void {
    const search$ = this.searchControl.valueChanges.pipe(startWith(''), debounceTime(300), distinctUntilChanged());
    const location$ = this.locationFilter.valueChanges.pipe(startWith(''));
    const status$ = this.statusFilter.valueChanges.pipe(startWith(''));
    const priority$ = this.priorityFilter.valueChanges.pipe(startWith(''));

    this.filteredSpecimens$ = combineLatest({
      specimens: this.specimens$,
      search: search$,
      location: location$,
      status: status$,
      priority: priority$
    }).pipe(
      map(({ specimens, search, location, status, priority }) => {
        return specimens.filter(tracking => {
          const matchesSearch = !search ||
            this.getSpecimenDisplayId(tracking.specimen).toLowerCase().includes((search as string).toLowerCase()) ||
            this.getPatientName(tracking.specimen).toLowerCase().includes((search as string).toLowerCase());

          const matchesLocation = !location || tracking.currentLocation.id === location;
          const matchesStatus = !status || tracking.currentStatus.code === status;
          const matchesPriority = !priority || tracking.priority === priority;

          const matchesOverdue = !this.showOverdueOnly || this.isOverdue(tracking);
          const matchesAlerts = !this.showAlertsOnly || tracking.alerts.length > 0;

          return matchesSearch && matchesLocation && matchesStatus &&
            matchesPriority && matchesOverdue && matchesAlerts;
        });
      })
    );
  }

  private setupCounts(): void {
    this.overdueCount$ = this.specimens$.pipe(
      map(specimens => specimens.filter(tracking => this.isOverdue(tracking)).length)
    );

    this.alertCount$ = this.specimens$.pipe(
      map(specimens => specimens.filter(tracking => tracking.alerts.length > 0).length)
    );
  }

  private async initializeScanner(): Promise<void> {
    try {
      this.availableCameras = await this.qrScannerService.getAvailableCameras();
    } catch (error) {
      console.error('Failed to initialize cameras:', error);
    }
  }

  private setupScannerSubscriptions(): void {
    this.qrScannerService.getScanResults()
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.handleScanResult(result);
      });
  }

  async toggleScanner(): Promise<void> {
    if (this.isScanning) {
      await this.stopScanner();
    } else {
      await this.startScanner();
    }
  }

  private async startScanner(): Promise<void> {
    try {
      await this.qrScannerService.startScannerWithUI('qr-scanner');
      this.isScanning = true;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'scanner-start');
      this.notificationService.showError('Scanner Error', 'Failed to start QR code scanner');
    }
  }

  private async stopScanner(): Promise<void> {
    try {
      await this.qrScannerService.stopScanning();
      this.isScanning = false;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'scanner-stop');
    }
  }

  async switchCamera(): Promise<void> {
    try {
      await this.qrScannerService.toggleCamera();
    } catch (_error) {
      this.notificationService.showWarning('Camera Switch', 'Unable to switch camera');
    }
  }

  processManualInput(): void {
    if (this.manualInput.trim()) {
      const result = this.qrScannerService.processBarcodeInput(this.manualInput.trim());
      this.handleScanResult(result);
      this.manualInput = '';
    }
  }

  private handleScanResult(result: ScanResult): void {
    this.lastScanResult = result;

    if (result.isValid && result.parsedData) {
      const specimenId = result.parsedData.specimenId || result.parsedData.accessionNumber;
      this.notificationService.showSuccess(
        'Specimen Scanned',
        `Found specimen: ${specimenId}`
      );

      // Auto-focus on the scanned specimen in the table
      this.searchControl.setValue(specimenId);
    } else {
      this.notificationService.showError(
        'Invalid QR Code',
        result.error || 'Unable to process scanned code'
      );
    }
  }

  // Selection methods
  isSelected(specimenId: string): boolean {
    return this.selectedSpecimens.includes(specimenId);
  }

  toggleSelection(specimenId: string): void {
    const index = this.selectedSpecimens.indexOf(specimenId);
    if (index > -1) {
      this.selectedSpecimens.splice(index, 1);
    } else {
      this.selectedSpecimens.push(specimenId);
    }
  }

  isAllSelected(): boolean {
    // This would need to be implemented based on current filtered specimens
    return false;
  }

  isPartiallySelected(): boolean {
    return this.selectedSpecimens.length > 0 && !this.isAllSelected();
  }

  toggleSelectAll(): void {
    // Implementation would depend on current filtered specimens
  }

  clearSelection(): void {
    this.selectedSpecimens = [];
  }

  // Check in/out methods
  checkInSpecimen(tracking: SpecimenTrackingData): void {
    this.selectedTracking = tracking;
    this.checkInMode = true;
    this.checkInForm.reset();
    this.showCheckInModal = true;
  }

  checkOutSpecimen(tracking: SpecimenTrackingData): void {
    this.selectedTracking = tracking;
    this.checkInMode = false;
    this.checkInForm.reset();
    this.showCheckInModal = true;
  }

  async confirmCheckInOut(): Promise<void> {
    if (!(this.checkInForm.valid && this.selectedTracking)) {
      return;
    }

    const formValue = this.checkInForm.value;
    const specimenId = this.selectedTracking.specimen.id!;

    try {
      if (this.checkInMode) {
        await this.specimenTrackingService.checkInSpecimen(
          specimenId,
          formValue.stationId,
          !!this.lastScanResult,
          formValue.comments
        );
      } else {
        // For check out, we need to determine the current station
        const currentStationId = 'current-station'; // This would be determined from tracking data
        await this.specimenTrackingService.checkOutSpecimen(
          specimenId,
          currentStationId,
          formValue.toStationId,
          formValue.comments
        );
      }

      this.closeCheckInModal();
      this.lastScanResult = null;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'check-in-out');
    }
  }

  closeCheckInModal(): void {
    this.showCheckInModal = false;
    this.selectedTracking = null;
    this.checkInForm.reset();
  }

  canCheckIn(tracking: SpecimenTrackingData): boolean {
    return tracking.currentStatus.code === 'available';
  }

  canCheckOut(tracking: SpecimenTrackingData): boolean {
    return tracking.currentStatus.code === 'available';
  }

  // Timeline methods
  viewTimeline(tracking: SpecimenTrackingData): void {
    this.selectedTracking = tracking;
    this.showTimelineModal = true;
  }

  closeTimelineModal(): void {
    this.showTimelineModal = false;
    this.selectedTracking = null;
  }

  // Location update methods
  updateLocation(_tracking: SpecimenTrackingData): void {
    // Implementation for location update modal
  }

  // Bulk operations
  bulkCheckIn(): void {
    // Implementation for bulk check in
  }

  bulkCheckOut(): void {
    // Implementation for bulk check out
  }

  bulkUpdateLocation(): void {
    // Implementation for bulk location update
  }

  printLabels(): void {
    // Implementation for label printing
  }

  // Utility methods
  getSpecimenDisplayId(specimen: any): string {
    return specimen.accessionIdentifier?.value || specimen.id || 'Unknown';
  }

  getPatientName(_specimen: any): string {
    // This would extract patient name from specimen subject reference
    return 'Patient Name'; // Placeholder
  }

  getLastUpdated(tracking: SpecimenTrackingData): Date {
    const lastEvent = tracking.chainOfCustody[tracking.chainOfCustody.length - 1];
    return lastEvent?.timestamp || new Date();
  }

  isOverdue(tracking: SpecimenTrackingData): boolean {
    if (!tracking.estimatedCompletion) { return false; }
    return new Date() > tracking.estimatedCompletion;
  }

  getTATRemaining(tracking: SpecimenTrackingData): string {
    if (!tracking.estimatedCompletion) { return 'N/A'; }

    const now = new Date();
    const remaining = tracking.estimatedCompletion.getTime() - now.getTime();

    if (remaining <= 0) {
      return 'Overdue';
    }

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  getTATClass(tracking: SpecimenTrackingData): string {
    if (!tracking.estimatedCompletion) { return 'normal'; }

    const now = new Date();
    const remaining = tracking.estimatedCompletion.getTime() - now.getTime();

    if (remaining <= 0) {
      return 'overdue';
    } else if (remaining < 2 * 60 * 60 * 1000) { // Less than 2 hours
      return 'warning';
    } else {
      return 'normal';
    }
  }

  getLocationCount(locationId: string): Observable<number> {
    return this.specimens$.pipe(
      map(specimens => specimens.filter(s => s.currentLocation.id === locationId).length)
    );
  }

  getPerformerName(_performer: any): string {
    // This would resolve the performer reference to get the actual name
    return 'User Name'; // Placeholder
  }

  trackBySpecimenId(index: number, tracking: SpecimenTrackingData): string {
    return tracking.specimen.id || index.toString();
  }
}