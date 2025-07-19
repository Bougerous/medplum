import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface TimelineEvent {
  timestamp: Date;
  location: string;
  status: string;
  user: string;
  comments?: string;
}

interface Sample {
  specimenId: string;
  barcode: string;
  patientName: string;
  testType: string;
  currentLocation: string;
  status: string;
  priority: 'routine' | 'urgent' | 'stat';
  collectedDate: Date;
  lastUpdated: Date;
  tatHours: number;
  timeline: TimelineEvent[];
}

@Component({
  selector: 'app-sample-tracking',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe],
  templateUrl: './sample-tracking.html',
  styleUrl: './sample-tracking.scss'
})
export class SampleTracking implements OnInit {
  // Search and filtering
  searchTerm = '';
  barcodeInput = '';
  selectedLocation = '';
  selectedStatus = '';
  dateFilter = '';
  
  // Data
  samples: Sample[] = [];
  filteredSamples: Sample[] = [];
  selectedSamples: string[] = [];
  
  // Modal state
  showLocationModal = false;
  showTimelineModal = false;
  selectedSample: Sample | null = null;
  locationForm!: FormGroup;

  constructor(private fb: FormBuilder) {
    this.initializeLocationForm();
  }

  ngOnInit() {
    this.loadSamples();
    this.filteredSamples = [...this.samples];
  }

  private initializeLocationForm() {
    this.locationForm = this.fb.group({
      newLocation: ['', Validators.required],
      newStatus: ['', Validators.required],
      comments: ['']
    });
  }

  private loadSamples() {
    // Mock data - in real app, this would come from API
    this.samples = [
      {
        specimenId: 'SPEC-001',
        barcode: '123456789',
        patientName: 'John Smith',
        testType: 'Complete Blood Count',
        currentLocation: 'hematology',
        status: 'testing',
        priority: 'routine',
        collectedDate: new Date('2024-01-15T08:30:00'),
        lastUpdated: new Date('2024-01-15T10:15:00'),
        tatHours: 24,
        timeline: [
          {
            timestamp: new Date('2024-01-15T08:30:00'),
            location: 'reception',
            status: 'received',
            user: 'Reception Clerk',
            comments: 'Sample received from phlebotomy'
          },
          {
            timestamp: new Date('2024-01-15T09:00:00'),
            location: 'processing',
            status: 'processing',
            user: 'Lab Tech 1',
            comments: 'Sample aliquoted for testing'
          },
          {
            timestamp: new Date('2024-01-15T10:15:00'),
            location: 'hematology',
            status: 'testing',
            user: 'Lab Tech 2',
            comments: 'Started CBC analysis'
          }
        ]
      },
      {
        specimenId: 'SPEC-002',
        barcode: '987654321',
        patientName: 'Jane Doe',
        testType: 'Basic Metabolic Panel',
        currentLocation: 'chemistry',
        status: 'testing',
        priority: 'urgent',
        collectedDate: new Date('2024-01-15T09:15:00'),
        lastUpdated: new Date('2024-01-15T11:30:00'),
        tatHours: 12,
        timeline: [
          {
            timestamp: new Date('2024-01-15T09:15:00'),
            location: 'reception',
            status: 'received',
            user: 'Reception Clerk'
          },
          {
            timestamp: new Date('2024-01-15T09:45:00'),
            location: 'processing',
            status: 'processing',
            user: 'Lab Tech 1'
          },
          {
            timestamp: new Date('2024-01-15T11:30:00'),
            location: 'chemistry',
            status: 'testing',
            user: 'Chemist',
            comments: 'Running comprehensive metabolic panel'
          }
        ]
      },
      {
        specimenId: 'SPEC-003',
        barcode: '456789123',
        patientName: 'Bob Johnson',
        testType: 'Culture & Sensitivity',
        currentLocation: 'microbiology',
        status: 'processing',
        priority: 'routine',
        collectedDate: new Date('2024-01-14T14:20:00'),
        lastUpdated: new Date('2024-01-15T08:00:00'),
        tatHours: 72,
        timeline: [
          {
            timestamp: new Date('2024-01-14T14:20:00'),
            location: 'reception',
            status: 'received',
            user: 'Reception Clerk'
          },
          {
            timestamp: new Date('2024-01-15T08:00:00'),
            location: 'microbiology',
            status: 'processing',
            user: 'Microbiologist',
            comments: 'Plated on selective media'
          }
        ]
      },
      {
        specimenId: 'SPEC-004',
        barcode: '789123456',
        patientName: 'Alice Wilson',
        testType: 'Thyroid Function',
        currentLocation: 'storage',
        status: 'completed',
        priority: 'stat',
        collectedDate: new Date('2024-01-15T11:45:00'),
        lastUpdated: new Date('2024-01-15T14:30:00'),
        tatHours: 4,
        timeline: [
          {
            timestamp: new Date('2024-01-15T11:45:00'),
            location: 'reception',
            status: 'received',
            user: 'Reception Clerk',
            comments: 'STAT sample - immediate processing'
          },
          {
            timestamp: new Date('2024-01-15T12:00:00'),
            location: 'chemistry',
            status: 'testing',
            user: 'Senior Chemist',
            comments: 'Priority processing for STAT order'
          },
          {
            timestamp: new Date('2024-01-15T13:15:00'),
            location: 'chemistry',
            status: 'completed',
            user: 'Senior Chemist',
            comments: 'Results verified and reported'
          },
          {
            timestamp: new Date('2024-01-15T14:30:00'),
            location: 'storage',
            status: 'stored',
            user: 'Lab Assistant',
            comments: 'Sample archived'
          }
        ]
      }
    ];
  }

  // Search and filtering methods
  onSearch() {
    this.applyFilters();
  }

  onFilterChange() {
    this.applyFilters();
  }

  scanBarcode() {
    if (this.barcodeInput.trim()) {
      this.searchTerm = this.barcodeInput.trim();
      this.barcodeInput = '';
      this.applyFilters();
    }
  }

  private applyFilters() {
    this.filteredSamples = this.samples.filter(sample => {
      const matchesSearch = !this.searchTerm || 
        sample.specimenId.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        sample.patientName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        sample.barcode.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      const matchesLocation = !this.selectedLocation || sample.currentLocation === this.selectedLocation;
      const matchesStatus = !this.selectedStatus || sample.status === this.selectedStatus;
      
      let matchesDate = true;
      if (this.dateFilter) {
        const filterDate = new Date(this.dateFilter);
        const sampleDate = new Date(sample.collectedDate.toDateString());
        matchesDate = sampleDate.getTime() === filterDate.getTime();
      }
      
      return matchesSearch && matchesLocation && matchesStatus && matchesDate;
    });
  }

  // Statistics methods
  getLocationCount(location: string): number {
    return this.samples.filter(s => s.currentLocation === location).length;
  }

  getStatusCount(status: string): number {
    return this.samples.filter(s => s.status === status).length;
  }

  getOverdueCount(): number {
    const now = new Date();
    return this.samples.filter(sample => {
      const hoursElapsed = (now.getTime() - sample.collectedDate.getTime()) / (1000 * 60 * 60);
      return hoursElapsed > sample.tatHours && sample.status !== 'completed' && sample.status !== 'stored';
    }).length;
  }

  // Selection methods
  isSelected(specimenId: string): boolean {
    return this.selectedSamples.includes(specimenId);
  }

  toggleSelection(specimenId: string) {
    const index = this.selectedSamples.indexOf(specimenId);
    if (index > -1) {
      this.selectedSamples.splice(index, 1);
    } else {
      this.selectedSamples.push(specimenId);
    }
  }

  isAllSelected(): boolean {
    return this.filteredSamples.length > 0 && 
           this.selectedSamples.length === this.filteredSamples.length;
  }

  isPartiallySelected(): boolean {
    return this.selectedSamples.length > 0 && 
           this.selectedSamples.length < this.filteredSamples.length;
  }

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.selectedSamples = [];
    } else {
      this.selectedSamples = this.filteredSamples.map(s => s.specimenId);
    }
  }

  // Location update methods
  updateLocation(sample: Sample) {
    this.selectedSample = sample;
    this.locationForm.patchValue({
      newLocation: sample.currentLocation,
      newStatus: sample.status,
      comments: ''
    });
    this.showLocationModal = true;
  }

  saveLocationUpdate() {
    if (this.locationForm.valid && this.selectedSample) {
      const formValue = this.locationForm.value;
      
      // Update sample
      this.selectedSample.currentLocation = formValue.newLocation;
      this.selectedSample.status = formValue.newStatus;
      this.selectedSample.lastUpdated = new Date();
      
      // Add timeline event
      this.selectedSample.timeline.push({
        timestamp: new Date(),
        location: formValue.newLocation,
        status: formValue.newStatus,
        user: 'Current User',
        comments: formValue.comments
      });
      
      console.log('Location updated:', formValue);
      this.closeLocationModal();
      this.applyFilters(); // Refresh the filtered list
    }
  }

  closeLocationModal() {
    this.showLocationModal = false;
    this.selectedSample = null;
    this.locationForm.reset();
  }

  // Timeline methods
  viewTimeline(sample: Sample) {
    this.selectedSample = sample;
    this.showTimelineModal = true;
  }

  closeTimelineModal() {
    this.showTimelineModal = false;
    this.selectedSample = null;
  }

  // Action methods
  exportData() {
    console.log('Exporting data for', this.filteredSamples.length, 'samples');
    // In real app, would generate CSV/Excel export
  }

  printLabels() {
    if (this.selectedSamples.length > 0) {
      console.log('Printing labels for:', this.selectedSamples);
      // In real app, would generate labels for printing
    }
  }

  // Display methods
  getLocationDisplay(location: string): string {
    const locationMap: { [key: string]: string } = {
      'reception': 'Reception',
      'processing': 'Processing',
      'chemistry': 'Chemistry',
      'hematology': 'Hematology',
      'microbiology': 'Microbiology',
      'storage': 'Storage',
      'disposed': 'Disposed'
    };
    return locationMap[location] || location;
  }

  getStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      'received': 'Received',
      'processing': 'Processing',
      'testing': 'Testing',
      'completed': 'Completed',
      'stored': 'Stored',
      'disposed': 'Disposed'
    };
    return statusMap[status] || status;
  }

  getTATRemaining(sample: Sample): string {
    const now = new Date();
    const hoursElapsed = (now.getTime() - sample.collectedDate.getTime()) / (1000 * 60 * 60);
    const remaining = sample.tatHours - hoursElapsed;
    
    if (remaining <= 0) {
      return 'Overdue';
    } else if (remaining < 1) {
      return `${Math.round(remaining * 60)}m`;
    } else {
      return `${Math.round(remaining)}h`;
    }
  }

  getTATClass(sample: Sample): string {
    const now = new Date();
    const hoursElapsed = (now.getTime() - sample.collectedDate.getTime()) / (1000 * 60 * 60);
    const remaining = sample.tatHours - hoursElapsed;
    
    if (remaining <= 0) {
      return 'overdue';
    } else if (remaining < 2) {
      return 'warning';
    } else {
      return 'normal';
    }
  }

  // Utility methods
  trackBySampleId(index: number, sample: Sample): string {
    return sample.specimenId;
  }
}
