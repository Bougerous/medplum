import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { GradingSelection, GradingSelectorComponent } from './grading-selector.component';
import { StagingSelection, StagingSelectorComponent } from './staging-selector.component';
import { SpecimenDescription, SpecimenDescriptionComponent } from './specimen-description.component';
import { ValidationResult } from '../../services/terminology.service';
import { TerminologyValidatorDirective } from '../../directives/terminology-validator.directive';

@Component({
  selector: 'app-terminology-demo',
  template: `
    <div class="terminology-demo">
      <div class="demo-header">
        <h2>SNOMED CT Terminology Integration Demo</h2>
        <p>This demo showcases the SNOMED CT terminology integration components for LIMS.</p>
      </div>

      <div class="demo-sections">
        <!-- Specimen Description Demo -->
        <section class="demo-section">
          <h3>Specimen Description</h3>
          <p>Use structured SNOMED CT terminology to describe specimens:</p>
          
          <app-specimen-description
            [required]="true"
            (descriptionChanged)="onSpecimenDescriptionChanged($event)"
            (validationChange)="onSpecimenValidationChanged($event)">
          </app-specimen-description>

          <div class="demo-output" *ngIf="specimenDescription">
            <h4>Selected Specimen Description:</h4>
            <pre>{{ specimenDescription | json }}</pre>
          </div>
        </section>

        <!-- Grading Demo -->
        <section class="demo-section">
          <h3>Histologic Grading</h3>
          <p>Select appropriate grading using standardized systems:</p>
          
          <app-grading-selector
            [required]="false"
            (gradingSelected)="onGradingSelected($event)"
            (validationChange)="onGradingValidationChanged($event)">
          </app-grading-selector>

          <div class="demo-output" *ngIf="gradingSelection">
            <h4>Selected Grading:</h4>
            <pre>{{ gradingSelection | json }}</pre>
          </div>
        </section>

        <!-- Staging Demo -->
        <section class="demo-section">
          <h3>Cancer Staging</h3>
          <p>Use TNM and other staging systems with validation:</p>
          
          <app-staging-selector
            [required]="false"
            (stagingSelected)="onStagingSelected($event)"
            (validationChange)="onStagingValidationChanged($event)">
          </app-staging-selector>

          <div class="demo-output" *ngIf="stagingSelection">
            <h4>Selected Staging:</h4>
            <pre>{{ stagingSelection | json }}</pre>
          </div>
        </section>

        <!-- Validation Demo -->
        <section class="demo-section">
          <h3>Terminology Validation</h3>
          <p>Test the terminology validation directive:</p>
          
          <form [formGroup]="validationForm" class="validation-demo-form">
            <div class="form-group">
              <label for="specimenCode">Specimen Code (try: 119376003)</label>
              <input 
                type="text" 
                id="specimenCode"
                formControlName="specimenCode"
                class="form-control"
                appTerminologyValidator
                [conceptType]="'specimen'"
                [required]="true"
                [showValidationMessages]="true"
                placeholder="Enter SNOMED CT specimen code...">
            </div>

            <div class="form-group">
              <label for="diagnosisCode">Diagnosis Code (try: 86049000)</label>
              <input 
                type="text" 
                id="diagnosisCode"
                formControlName="diagnosisCode"
                class="form-control"
                appTerminologyValidator
                [conceptType]="'diagnosis'"
                [required]="false"
                [showValidationMessages]="true"
                placeholder="Enter SNOMED CT diagnosis code...">
            </div>

            <div class="form-group">
              <label for="anyCode">Any SNOMED CT Code</label>
              <input 
                type="text" 
                id="anyCode"
                formControlName="anyCode"
                class="form-control"
                appTerminologyValidator
                [conceptType]="'any'"
                [required]="false"
                [showValidationMessages]="true"
                placeholder="Enter any SNOMED CT code...">
            </div>
          </form>
        </section>

        <!-- Summary -->
        <section class="demo-section">
          <h3>Integration Summary</h3>
          <div class="summary-content">
            <div class="summary-item">
              <strong>Specimen Description Valid:</strong> 
              <span [class]="specimenValidation?.isValid ? 'valid' : 'invalid'">
                {{ specimenValidation?.isValid ? 'Yes' : 'No' }}
              </span>
            </div>
            <div class="summary-item">
              <strong>Grading Valid:</strong> 
              <span [class]="gradingValidation?.isValid ? 'valid' : 'invalid'">
                {{ gradingValidation?.isValid ? 'Yes' : 'No' }}
              </span>
            </div>
            <div class="summary-item">
              <strong>Staging Valid:</strong> 
              <span [class]="stagingValidation?.isValid ? 'valid' : 'invalid'">
                {{ stagingValidation?.isValid ? 'Yes' : 'No' }}
              </span>
            </div>
            <div class="summary-item">
              <strong>Form Valid:</strong> 
              <span [class]="validationForm.valid ? 'valid' : 'invalid'">
                {{ validationForm.valid ? 'Yes' : 'No' }}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styleUrls: ['./terminology-demo.component.scss'],
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    SpecimenDescriptionComponent,
    GradingSelectorComponent,
    StagingSelectorComponent,
    TerminologyValidatorDirective
  ],
  standalone: true
})
export class TerminologyDemoComponent implements OnInit {
  validationForm: FormGroup;
  
  // Component outputs
  specimenDescription: SpecimenDescription | null = null;
  gradingSelection: GradingSelection | null = null;
  stagingSelection: StagingSelection | null = null;
  
  // Validation results
  specimenValidation: ValidationResult | null = null;
  gradingValidation: ValidationResult | null = null;
  stagingValidation: ValidationResult | null = null;

  constructor() {
    this.validationForm = new FormGroup({
      specimenCode: new FormControl(''),
      diagnosisCode: new FormControl(''),
      anyCode: new FormControl('')
    });
  }

  ngOnInit(): void {
    // Set some example values
    this.validationForm.patchValue({
      specimenCode: '119376003', // Tissue specimen
      diagnosisCode: '86049000',  // Malignant neoplasm, primary
      anyCode: '21594007'         // Benign neoplasm
    });
  }

  onSpecimenDescriptionChanged(description: SpecimenDescription): void {
    this.specimenDescription = description;
    console.log('Specimen description changed:', description);
  }

  onSpecimenValidationChanged(validation: ValidationResult): void {
    this.specimenValidation = validation;
    console.log('Specimen validation changed:', validation);
  }

  onGradingSelected(grading: GradingSelection): void {
    this.gradingSelection = grading;
    console.log('Grading selected:', grading);
  }

  onGradingValidationChanged(validation: ValidationResult): void {
    this.gradingValidation = validation;
    console.log('Grading validation changed:', validation);
  }

  onStagingSelected(staging: StagingSelection): void {
    this.stagingSelection = staging;
    console.log('Staging selected:', staging);
  }

  onStagingValidationChanged(validation: ValidationResult): void {
    this.stagingValidation = validation;
    console.log('Staging validation changed:', validation);
  }
}