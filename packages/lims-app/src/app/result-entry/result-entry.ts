import { Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface TestResult {
  specimenId: string;
  patientName: string;
  patientMRN: string;
  patientDOB: Date;
  testType: string;
  status: 'ready' | 'in-progress' | 'pending-review' | 'completed';
  priority: 'routine' | 'urgent' | 'stat';
  collectedDate: Date;
  processedDate?: Date;
  parameters: TestParameter[];
}

interface TestParameter {
  name: string;
  value?: string;
  referenceRange: string;
  unit: string;
  flag?: 'H' | 'L' | 'C' | '';
  critical?: boolean;
}

@Component({
  selector: 'app-result-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './result-entry.html',
  styleUrl: './result-entry.scss'
})
export class ResultEntry implements OnInit {
  private fb = inject(FormBuilder);

  // Search and filtering
  searchTerm = '';
  selectedStatus = '';
  selectedPriority = '';
  
  // Data
  testResults: TestResult[] = [];
  filteredResults: TestResult[] = [];
  selectedResults: string[] = [];
  
  // Modal state
  showResultModal = false;
  currentResult: TestResult | null = null;
  resultForm!: FormGroup;

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.initializeForm();
  }

  ngOnInit() {
    this.loadTestResults();
    this.filteredResults = [...this.testResults];
  }

  private initializeForm() {
    this.resultForm = this.fb.group({
      parameters: this.fb.array([]),
      comments: [''],
      qcPassed: [false, Validators.requiredTrue],
      calibrationCurrent: [false, Validators.requiredTrue],
      controlsAcceptable: [false, Validators.requiredTrue]
    });
  }

  private loadTestResults() {
    // Mock data - in real app, this would come from API
    this.testResults = [
      {
        specimenId: 'SPEC-001',
        patientName: 'John Smith',
        patientMRN: 'MRN123456',
        patientDOB: new Date('1985-06-15'),
        testType: 'Complete Blood Count',
        status: 'ready',
        priority: 'routine',
        collectedDate: new Date('2024-01-15T08:30:00'),
        parameters: [
          { name: 'WBC', referenceRange: '4.5-11.0', unit: 'K/uL', critical: false },
          { name: 'RBC', referenceRange: '4.7-6.1', unit: 'M/uL', critical: false },
          { name: 'Hemoglobin', referenceRange: '14-18', unit: 'g/dL', critical: true },
          { name: 'Hematocrit', referenceRange: '42-52', unit: '%', critical: false }
        ]
      },
      {
        specimenId: 'SPEC-002',
        patientName: 'Jane Doe',
        patientMRN: 'MRN789012',
        patientDOB: new Date('1992-03-22'),
        testType: 'Basic Metabolic Panel',
        status: 'in-progress',
        priority: 'urgent',
        collectedDate: new Date('2024-01-15T09:15:00'),
        parameters: [
          { name: 'Glucose', referenceRange: '70-99', unit: 'mg/dL', critical: true },
          { name: 'BUN', referenceRange: '6-24', unit: 'mg/dL', critical: false },
          { name: 'Creatinine', referenceRange: '0.76-1.27', unit: 'mg/dL', critical: true },
          { name: 'Sodium', referenceRange: '136-145', unit: 'mmol/L', critical: true }
        ]
      },
      {
        specimenId: 'SPEC-003',
        patientName: 'Bob Johnson',
        patientMRN: 'MRN345678',
        patientDOB: new Date('1978-11-30'),
        testType: 'Lipid Panel',
        status: 'pending-review',
        priority: 'routine',
        collectedDate: new Date('2024-01-15T10:00:00'),
        parameters: [
          { name: 'Total Cholesterol', referenceRange: '<200', unit: 'mg/dL', critical: false },
          { name: 'HDL', referenceRange: '>40', unit: 'mg/dL', critical: false },
          { name: 'LDL', referenceRange: '<100', unit: 'mg/dL', critical: false },
          { name: 'Triglycerides', referenceRange: '<150', unit: 'mg/dL', critical: false }
        ]
      },
      {
        specimenId: 'SPEC-004',
        patientName: 'Alice Wilson',
        patientMRN: 'MRN901234',
        patientDOB: new Date('1965-08-18'),
        testType: 'Thyroid Function',
        status: 'ready',
        priority: 'stat',
        collectedDate: new Date('2024-01-15T11:45:00'),
        parameters: [
          { name: 'TSH', referenceRange: '0.27-4.20', unit: 'uIU/mL', critical: true },
          { name: 'Free T4', referenceRange: '0.93-1.70', unit: 'ng/dL', critical: true },
          { name: 'Free T3', referenceRange: '2.0-4.4', unit: 'pg/mL', critical: false }
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

  private applyFilters() {
    this.filteredResults = this.testResults.filter(result => {
      const matchesSearch = !this.searchTerm || 
        result.specimenId.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        result.patientName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        result.testType.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      const matchesStatus = !this.selectedStatus || result.status === this.selectedStatus;
      const matchesPriority = !this.selectedPriority || result.priority === this.selectedPriority;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }

  // Selection methods
  isSelected(specimenId: string): boolean {
    return this.selectedResults.includes(specimenId);
  }

  toggleSelection(specimenId: string) {
    const index = this.selectedResults.indexOf(specimenId);
    if (index > -1) {
      this.selectedResults.splice(index, 1);
    } else {
      this.selectedResults.push(specimenId);
    }
  }

  isAllSelected(): boolean {
    return this.filteredResults.length > 0 && 
           this.selectedResults.length === this.filteredResults.length;
  }

  isPartiallySelected(): boolean {
    return this.selectedResults.length > 0 && 
           this.selectedResults.length < this.filteredResults.length;
  }

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.selectedResults = [];
    } else {
      this.selectedResults = this.filteredResults.map(r => r.specimenId);
    }
  }

  // Result entry methods
  enterResults(result: TestResult) {
    this.currentResult = result;
    this.setupResultForm(result);
    this.showResultModal = true;
  }

  reviewResults(result: TestResult) {
    this.enterResults(result);
  }

  viewResults(result: TestResult) {
    this.enterResults(result);
  }

  private setupResultForm(result: TestResult) {
    const parametersArray = this.fb.array(
      result.parameters.map(param => 
        this.fb.group({
          name: [param.name],
          value: [param.value || ''],
          flag: [param.flag || ''],
          referenceRange: [param.referenceRange],
          unit: [param.unit]
        })
      )
    );

    this.resultForm.setControl('parameters', parametersArray);
  }

  getParametersArray() {
    return this.resultForm.get('parameters') as FormArray;
  }

  getParameterName(index: number): string {
    const param = this.getParametersArray().at(index);
    return param.get('name')?.value || '';
  }

  getParameterRange(index: number): string {
    const param = this.getParametersArray().at(index);
    return param.get('referenceRange')?.value || '';
  }

  getParameterUnit(index: number): string {
    const param = this.getParametersArray().at(index);
    return param.get('unit')?.value || '';
  }

  isAbnormal(index: number): boolean {
    const param = this.getParametersArray().at(index);
    const flag = param.get('flag')?.value;
    return flag === 'H' || flag === 'L' || flag === 'C';
  }

  // Form submission methods
  saveResults() {
    if (this.resultForm.valid && this.currentResult) {
      const formValue = this.resultForm.value;
      console.log('Saving results:', formValue);
      
      // Update the result status
      this.currentResult.status = 'completed';
      
      // In real app, would save to backend
      this.closeModal();
      this.applyFilters(); // Refresh the filtered list
    }
  }

  saveAsDraft() {
    if (this.currentResult) {
      this.currentResult.status = 'in-progress';
      console.log('Saved as draft');
      this.closeModal();
      this.applyFilters();
    }
  }

  saveForReview() {
    if (this.currentResult) {
      this.currentResult.status = 'pending-review';
      console.log('Sent for review');
      this.closeModal();
      this.applyFilters();
    }
  }

  closeModal() {
    this.showResultModal = false;
    this.currentResult = null;
    this.initializeForm();
  }

  // Bulk operations
  bulkVerify() {
    if (this.selectedResults.length > 0) {
      console.log('Bulk verifying results:', this.selectedResults);
      
      // Update selected results
      this.testResults.forEach(result => {
        if (this.selectedResults.includes(result.specimenId)) {
          result.status = 'completed';
        }
      });
      
      this.selectedResults = [];
      this.applyFilters();
    }
  }

  // Utility methods
  trackBySpecimenId(_index: number, result: TestResult): string {
    return result.specimenId;
  }

  getStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      'ready': 'Ready for Results',
      'in-progress': 'In Progress',
      'pending-review': 'Pending Review',
      'completed': 'Completed'
    };
    return statusMap[status] || status;
  }
}
