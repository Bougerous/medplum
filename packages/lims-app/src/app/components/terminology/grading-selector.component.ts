import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CodeableConcept } from '@medplum/fhirtypes';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { 
  GradingConcept, 
  TerminologyService, 
  ValidationResult 
} from '../../services/terminology.service';

export interface GradingSelection {
  gradingSystem: string;
  grade: GradingConcept;
  codeableConcept: CodeableConcept;
  additionalNotes?: string;
}

@Component({
  selector: 'app-grading-selector',
  template: `
    <div class="grading-selector">
      <div class="grading-header">
        <h3>Histologic Grading</h3>
        <p class="grading-description">Select appropriate grading based on morphologic features</p>
      </div>

      <form [formGroup]="gradingForm" class="grading-form">
        <!-- Grading System Selection -->
        <div class="form-group">
          <label for="gradingSystem">Grading System</label>
          <select 
            id="gradingSystem" 
            formControlName="gradingSystem" 
            class="form-control"
            [class.is-invalid]="gradingForm.get('gradingSystem')?.invalid && gradingForm.get('gradingSystem')?.touched">
            <option value="">Select grading system...</option>
            <option value="WHO">WHO Grading System</option>
            <option value="Gleason">Gleason Score (Prostate)</option>
            <option value="Nottingham">Nottingham Grading (Breast)</option>
            <option value="Fuhrman">Fuhrman Grade (Renal)</option>
            <option value="FIGO">FIGO Grading (Gynecologic)</option>
          </select>
          <div class="invalid-feedback" *ngIf="gradingForm.get('gradingSystem')?.invalid && gradingForm.get('gradingSystem')?.touched">
            Please select a grading system
          </div>
        </div>

        <!-- Grade Selection -->
        <div class="form-group" *ngIf="availableGrades.length > 0">
          <label for="grade">Grade</label>
          <div class="grade-options">
            <div 
              *ngFor="let grade of availableGrades" 
              class="grade-option"
              [class.selected]="selectedGrade?.code === grade.code"
              (click)="selectGrade(grade)">
              <div class="grade-header">
                <span class="grade-code">{{ grade.grade }}</span>
                <span class="grade-display">{{ grade.display }}</span>
              </div>
              <div class="grade-description">{{ grade.description }}</div>
              <div class="grade-numeric" *ngIf="grade.numericValue">
                Numeric Value: {{ grade.numericValue }}
              </div>
            </div>
          </div>
        </div>

        <!-- Additional Notes -->
        <div class="form-group">
          <label for="additionalNotes">Additional Notes</label>
          <textarea 
            id="additionalNotes"
            formControlName="additionalNotes"
            class="form-control"
            rows="3"
            placeholder="Additional grading notes or comments..."></textarea>
        </div>

        <!-- Validation Messages -->
        <div class="validation-messages" *ngIf="validationResult">
          <div class="alert alert-danger" *ngIf="!validationResult.isValid">
            <h5>Validation Errors:</h5>
            <ul>
              <li *ngFor="let error of validationResult.errors">{{ error }}</li>
            </ul>
          </div>
          <div class="alert alert-warning" *ngIf="validationResult.warnings.length > 0">
            <h5>Warnings:</h5>
            <ul>
              <li *ngFor="let warning of validationResult.warnings">{{ warning }}</li>
            </ul>
          </div>
        </div>

        <!-- Selected Grading Summary -->
        <div class="grading-summary" *ngIf="selectedGrade">
          <h4>Selected Grading</h4>
          <div class="summary-content">
            <div class="summary-item">
              <strong>System:</strong> {{ gradingForm.get('gradingSystem')?.value }}
            </div>
            <div class="summary-item">
              <strong>Grade:</strong> {{ selectedGrade.grade }} - {{ selectedGrade.display }}
            </div>
            <div class="summary-item">
              <strong>SNOMED CT Code:</strong> {{ selectedGrade.code }}
            </div>
            <div class="summary-item" *ngIf="selectedGrade.numericValue">
              <strong>Numeric Value:</strong> {{ selectedGrade.numericValue }}
            </div>
          </div>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['./grading-selector.component.scss'],
  imports: [CommonModule, ReactiveFormsModule],
  standalone: true
})
export class GradingSelectorComponent implements OnInit, OnDestroy {
  private terminologyService = inject(TerminologyService);

  @Input() initialGrading?: GradingSelection;
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Output() gradingSelected = new EventEmitter<GradingSelection>();
  @Output() validationChange = new EventEmitter<ValidationResult>();

  gradingForm!: FormGroup;
  availableGrades: GradingConcept[] = [];
  selectedGrade: GradingConcept | null = null;
  validationResult: ValidationResult | null = null;
  
  private destroy$ = new Subject<void>();
  private gradesSubject$ = new BehaviorSubject<GradingConcept[]>([]);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.setupFormSubscriptions();
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.gradingForm = new FormGroup({
      gradingSystem: new FormControl('', this.required ? [Validators.required] : []),
      additionalNotes: new FormControl('')
    });

    if (this.disabled) {
      this.gradingForm.disable();
    }
  }

  private setupFormSubscriptions(): void {
    // Watch for grading system changes
    this.gradingForm.get('gradingSystem')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(gradingSystem => {
        this.loadGradesForSystem(gradingSystem);
        this.selectedGrade = null;
      });

    // Watch for form changes to emit validation
    this.gradingForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(() => {
        this.validateCurrentSelection();
      });
  }

  private async loadInitialData(): Promise<void> {
    try {
      // Load all available grading concepts
      const allGrades = await this.terminologyService.getGradingConcepts();
      this.gradesSubject$.next(allGrades);

      // Set initial values if provided
      if (this.initialGrading) {
        this.gradingForm.patchValue({
          gradingSystem: this.initialGrading.gradingSystem,
          additionalNotes: this.initialGrading.additionalNotes
        });
        this.selectedGrade = this.initialGrading.grade;
      }
    } catch (error) {
      console.error('Failed to load grading data:', error);
    }
  }

  private async loadGradesForSystem(gradingSystem: string): Promise<void> {
    if (!gradingSystem) {
      this.availableGrades = [];
      return;
    }

    try {
      const grades = await this.terminologyService.getGradingConcepts(gradingSystem);
      this.availableGrades = grades.sort((a, b) => {
        // Sort by numeric value if available, otherwise by grade
        if (a.numericValue && b.numericValue) {
          return a.numericValue - b.numericValue;
        }
        return a.grade.localeCompare(b.grade);
      });
    } catch (error) {
      console.error('Failed to load grades for system:', gradingSystem, error);
      this.availableGrades = [];
    }
  }

  selectGrade(grade: GradingConcept): void {
    if (this.disabled) { return; }

    this.selectedGrade = grade;
    this.emitGradingSelection();
    this.validateCurrentSelection();
  }

  private emitGradingSelection(): void {
    if (!this.selectedGrade) { return; }

    const gradingSystem = this.gradingForm.get('gradingSystem')?.value;
    const additionalNotes = this.gradingForm.get('additionalNotes')?.value;

    const selection: GradingSelection = {
      gradingSystem,
      grade: this.selectedGrade,
      codeableConcept: this.terminologyService.createCodeableConcept(
        this.selectedGrade.code,
        this.selectedGrade.display,
        this.selectedGrade.system
      ),
      additionalNotes: additionalNotes || undefined
    };

    this.gradingSelected.emit(selection);
  }

  private async validateCurrentSelection(): Promise<void> {
    if (!this.selectedGrade) {
      this.validationResult = null;
      this.validationChange.emit(this.validationResult!);
      return;
    }

    try {
      const result = await this.terminologyService.validateDiagnosisCode(
        this.selectedGrade.code,
        this.selectedGrade.system
      );

      // Additional validation for grading-specific rules
      const gradingValidation = this.validateGradingRules();
      
      this.validationResult = {
        isValid: result.isValid && gradingValidation.isValid,
        concept: result.concept,
        errors: [...result.errors, ...gradingValidation.errors],
        warnings: [...result.warnings, ...gradingValidation.warnings]
      };

      this.validationChange.emit(this.validationResult);
    } catch (error) {
      console.error('Validation failed:', error);
      this.validationResult = {
        isValid: false,
        errors: ['Validation failed due to system error'],
        warnings: []
      };
      this.validationChange.emit(this.validationResult);
    }
  }

  private validateGradingRules(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.selectedGrade) {
      errors.push('No grade selected');
      return { isValid: false, errors, warnings };
    }

    const gradingSystem = this.gradingForm.get('gradingSystem')?.value;

    // Validate grade matches selected system
    if (this.selectedGrade.gradingSystem !== gradingSystem) {
      errors.push(`Selected grade does not match grading system ${gradingSystem}`);
    }

    // System-specific validation rules
    switch (gradingSystem) {
      case 'WHO':
        if (!['I', 'II', 'III', 'IV'].includes(this.selectedGrade.grade)) {
          warnings.push('Unusual WHO grade value');
        }
        break;
      case 'Gleason':
        if (this.selectedGrade.numericValue && (this.selectedGrade.numericValue < 2 || this.selectedGrade.numericValue > 10)) {
          errors.push('Gleason score must be between 2 and 10');
        }
        break;
      case 'Nottingham':
        if (this.selectedGrade.numericValue && (this.selectedGrade.numericValue < 3 || this.selectedGrade.numericValue > 9)) {
          errors.push('Nottingham grade must be between 3 and 9');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Public methods for external control
  reset(): void {
    this.gradingForm.reset();
    this.selectedGrade = null;
    this.availableGrades = [];
    this.validationResult = null;
  }

  setGrading(grading: GradingSelection): void {
    this.gradingForm.patchValue({
      gradingSystem: grading.gradingSystem,
      additionalNotes: grading.additionalNotes
    });
    this.selectedGrade = grading.grade;
    this.loadGradesForSystem(grading.gradingSystem);
  }

  isValid(): boolean {
    return this.gradingForm.valid && (this.validationResult?.isValid ?? false);
  }

  getCurrentSelection(): GradingSelection | null {
    if (!this.selectedGrade) { return null; }

    return {
      gradingSystem: this.gradingForm.get('gradingSystem')?.value,
      grade: this.selectedGrade,
      codeableConcept: this.terminologyService.createCodeableConcept(
        this.selectedGrade.code,
        this.selectedGrade.display,
        this.selectedGrade.system
      ),
      additionalNotes: this.gradingForm.get('additionalNotes')?.value
    };
  }
}