import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { 
  Patient, 
  QuestionnaireResponse, 
} from '@medplum/fhirtypes';
import { Subject, takeUntil } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { NotificationService } from '../services/notification.service';
import { 
  AskOnOrderEntryData, 
  LabTest, 
  OrderSplitResult,
  TestCategory, 
  TestOrderingService 
} from '../services/test-ordering.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-test-ordering',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './test-ordering.html',
  styleUrl: './test-ordering.scss'
})
export class TestOrdering implements OnInit, OnDestroy {
  private formBuilder = inject(FormBuilder);
  private medplumService = inject(MedplumService);
  private testOrderingService = inject(TestOrderingService);
  private notificationService = inject(NotificationService);
  private errorHandlingService = inject(ErrorHandlingService);

  orderForm!: FormGroup;
  isSubmitting = false;
  searchResults: Patient[] = [];
  selectedPatient: Patient | null = null;
  selectedTests: LabTest[] = [];
  selectedCategory = 'hematology';
  testCategories: TestCategory[] = [];
  availableTests: LabTest[] = [];
  searchQuery = '';
  showAdvancedOptions = false;
  orderResult: OrderSplitResult | null = null;
  askOnOrderEntryData: { [testId: string]: AskOnOrderEntryData } = {};
  showAskOnOrderEntry = false;

  private destroy$ = new Subject<void>();

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadTestCatalog();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize the test ordering form
   */
  private initializeForm(): void {
    this.orderForm = this.formBuilder.group({
      patientSearch: ['', [Validators.required]],
      providerName: ['', [Validators.required]],
      providerId: ['', [Validators.required]],
      providerNPI: [''],
      priority: ['routine', [Validators.required]],
      orderDate: [new Date().toISOString().slice(0, 16), [Validators.required]],
      clinicalInfo: [''],
      urgentReason: [''],
      askOnOrderEntryResponses: this.formBuilder.array([])
    });
  }

  /**
   * Load test catalog
   */
  private loadTestCatalog(): void {
    this.testOrderingService.getTestCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.testCategories = categories;
          if (categories.length > 0) {
            this.selectedCategory = categories[0].key;
          }
        },
        error: (error) => {
          this.errorHandlingService.handleError(error, 'test-catalog-loading');
        }
      });

    this.testOrderingService.getAvailableTests()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tests) => {
          this.availableTests = tests;
        },
        error: (error) => {
          this.errorHandlingService.handleError(error, 'test-catalog-loading');
        }
      });
  }

  /**
   * Search for patients
   */
  async searchPatients(event: Event): Promise<void> {
    const searchTerm = (event.target as HTMLInputElement).value;
    if (searchTerm.length < 2) {
      this.searchResults = [];
      return;
    }

    try {
      const searchResults = await this.medplumService.searchPatients({
        name: searchTerm
      });
      this.searchResults = searchResults;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'patient-search');
      this.searchResults = [];
    }
  }

  /**
   * Select a patient from search results
   */
  selectPatient(patient: Patient): void {
    this.selectedPatient = patient;
    const patientName = patient.name?.[0] ? 
      `${patient.name[0].given?.[0] || ''} ${patient.name[0].family || ''}`.trim() : 
      'Unknown Patient';
    
    this.orderForm.patchValue({
      patientSearch: patientName
    });
    this.searchResults = [];
  }

  /**
   * Select test category
   */
  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.searchQuery = ''; // Clear search when switching categories
  }

  /**
   * Get tests for selected category
   */
  getTestsForCategory(category: string): LabTest[] {
    return this.testOrderingService.getTestsByCategory(category);
  }

  /**
   * Get filtered tests based on search query
   */
  getFilteredTests(): LabTest[] {
    if (this.searchQuery.trim()) {
      return this.testOrderingService.searchTests(this.searchQuery);
    }
    return this.getTestsForCategory(this.selectedCategory);
  }

  /**
   * Toggle test selection
   */
  toggleTest(test: LabTest): void {
    const index = this.selectedTests.findIndex(t => t.id === test.id);
    if (index > -1) {
      this.selectedTests.splice(index, 1);
      this.removeAskOnOrderEntry(test.id);
    } else {
      this.selectedTests.push(test);
      this.checkAskOnOrderEntry(test);
    }
    this.updateOrderSummary();
  }

  /**
   * Check if test is selected
   */
  isTestSelected(test: LabTest): boolean {
    return this.selectedTests.some(t => t.id === test.id);
  }

  /**
   * Remove test from selection
   */
  removeTest(test: LabTest): void {
    const index = this.selectedTests.findIndex(t => t.id === test.id);
    if (index > -1) {
      this.selectedTests.splice(index, 1);
      this.removeAskOnOrderEntry(test.id);
      this.updateOrderSummary();
    }
  }

  /**
   * Check for Ask-on-Order-Entry questionnaires
   */
  private checkAskOnOrderEntry(test: LabTest): void {
    const askOnOrderEntry = this.testOrderingService.getAskOnOrderEntryQuestionnaire(test.id);
    if (askOnOrderEntry) {
      this.askOnOrderEntryData[test.id] = askOnOrderEntry;
      this.showAskOnOrderEntry = true;
    }
  }

  /**
   * Remove Ask-on-Order-Entry data
   */
  private removeAskOnOrderEntry(testId: string): void {
    delete this.askOnOrderEntryData[testId];
    if (Object.keys(this.askOnOrderEntryData).length === 0) {
      this.showAskOnOrderEntry = false;
    }
  }

  /**
   * Update order summary with cost and turnaround time
   */
  private updateOrderSummary(): void {
    // Validate prerequisites
    const validation = this.testOrderingService.validateTestPrerequisites(this.selectedTests);
    if (!validation.valid) {
      this.notificationService.showWarning(
        'Missing Prerequisites',
        validation.missingPrerequisites.join('\n')
      );
    }
  }

  /**
   * Get estimated total cost
   */
  getTotalEstimatedCost(): number {
    return this.testOrderingService.getTotalEstimatedCost(this.selectedTests);
  }

  /**
   * Get estimated turnaround time
   */
  getEstimatedTurnaroundTime(): number {
    return this.testOrderingService.getEstimatedTurnaroundTime(this.selectedTests);
  }

  /**
   * Get specimen requirements summary
   */
  getSpecimenRequirements(): string[] {
    const specimenTypes = new Set<string>();
    for (const test of this.selectedTests) {
      for (const type of test.specimenTypes) {
        specimenTypes.add(type);
      }
    }
    return Array.from(specimenTypes);
  }

  /**
   * Handle Ask-on-Order-Entry response
   */
  onAskOnOrderEntryResponse(testId: string, response: QuestionnaireResponse): void {
    if (this.askOnOrderEntryData[testId]) {
      this.askOnOrderEntryData[testId].response = response;
    }
  }

  /**
   * Check if all Ask-on-Order-Entry questionnaires are completed
   */
  areAskOnOrderEntryComplete(): boolean {
    return Object.values(this.askOnOrderEntryData).every(data => 
      !data.required || data.response
    );
  }

  /**
   * Submit the test order
   */
  async onSubmit(): Promise<void> {
    if (this.orderForm.invalid || this.isSubmitting || !this.selectedPatient || this.selectedTests.length === 0) {
      this.markFormGroupTouched(this.orderForm);
      this.notificationService.showWarning('Form Validation', 'Please fill in all required fields and select at least one test.');
      return;
    }

    if (!this.areAskOnOrderEntryComplete()) {
      this.notificationService.showWarning('Incomplete Information', 'Please complete all Ask-on-Order-Entry questionnaires.');
      return;
    }

    this.isSubmitting = true;
    const formValue = this.orderForm.value;

    try {
      // Prepare Ask-on-Order-Entry responses
      const askOnOrderEntryResponses: { [testId: string]: QuestionnaireResponse } = {};
      for (const [testId, data] of Object.entries(this.askOnOrderEntryData)) {
        if (data.response) {
          askOnOrderEntryResponses[testId] = data.response;
        }
      }

      // Create test orders with order splitting
      if (this.selectedPatient?.id) {
        this.orderResult = await this.testOrderingService.createTestOrders(
          this.selectedPatient.id,
          this.selectedTests,
          {
            providerId: formValue.providerId,
            providerName: formValue.providerName,
            priority: formValue.priority,
            clinicalInfo: formValue.clinicalInfo,
            askOnOrderEntryResponses
          }
        );
      }

      this.notificationService.showSuccess(
        'Orders Created Successfully',
        `${this.orderResult.orders.length} test order(s) created. Estimated cost: ${this.orderResult.totalEstimatedCost?.toFixed(2) || '0.00'}`
      );

      // Reset form for new order
      this.resetForm();
      
    } catch (error) {
      this.errorHandlingService.handleError(error, 'test-ordering');
      this.notificationService.showError(
        'Order Creation Failed',
        'Failed to create test orders. Please try again.'
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Reset form to initial state
   */
  resetForm(): void {
    this.orderForm.reset();
    this.orderForm.patchValue({
      priority: 'routine',
      orderDate: new Date().toISOString().slice(0, 16)
    });
    
    this.selectedPatient = null;
    this.selectedTests = [];
    this.searchResults = [];
    this.askOnOrderEntryData = {};
    this.showAskOnOrderEntry = false;
    this.orderResult = null;
    this.searchQuery = '';
  }

  /**
   * Create new order for same patient
   */
  newOrderForPatient(): void {
    if (!this.selectedPatient) { return; }
    
    const patientName = this.selectedPatient.name?.[0] ? 
      `${this.selectedPatient.name[0].given?.[0]} ${this.selectedPatient.name[0].family}` : 
      'Unknown Patient';
    
    this.orderForm.reset();
    this.orderForm.patchValue({
      patientSearch: patientName,
      priority: 'routine',
      orderDate: new Date().toISOString().slice(0, 16)
    });
    
    this.selectedTests = [];
    this.askOnOrderEntryData = {};
    this.showAskOnOrderEntry = false;
    this.orderResult = null;
    this.searchQuery = '';
  }

  /**
   * Mark all form controls as touched to show validation errors
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    for (const key of Object.keys(formGroup.controls)) {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        for (const arrayControl of control.controls) {
          if (arrayControl instanceof FormGroup) {
            this.markFormGroupTouched(arrayControl);
          } else {
            arrayControl.markAsTouched();
          }
        }
      }
    }
  }

  /**
   * Get validation error message for a field
   */
  getFieldError(fieldName: string): string {
    const field = this.orderForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors.required) { return `${fieldName} is required`; }
    }
    return '';
  }

  /**
   * Check if field has error
   */
  hasFieldError(fieldName: string): boolean {
    const field = this.orderForm.get(fieldName);
    return !!(field?.errors && field.touched);
  }

  /**
   * Format turnaround time display
   */
  formatTurnaroundTime(hours: number): string {
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (remainingHours === 0) {
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  }

  getTestById(testId: string): LabTest | undefined {
    return this.availableTests.find(test => test.id === testId);
  }
}
