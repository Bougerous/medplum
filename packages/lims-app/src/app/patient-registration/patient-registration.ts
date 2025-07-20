import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import {
  Patient,
  Questionnaire,
  QuestionnaireResponse
} from '@medplum/fhirtypes';
import { Subject, takeUntil } from 'rxjs';
import { ErrorHandlingService } from '../services/error-handling.service';
import { NotificationService } from '../services/notification.service';
import { PatientRegistrationData, QuestionnaireService } from '../services/questionnaire.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-patient-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './patient-registration.html',
  styleUrl: './patient-registration.scss'
})
export class PatientRegistration implements OnInit, OnDestroy {
  patientForm!: FormGroup;
  isSubmitting = false;
  availableQuestionnaires: Questionnaire[] = [];
  selectedQuestionnaire: Questionnaire | null = null;
  duplicatePatients: Patient[] = [];
  showDuplicateWarning = false;
  registrationResult: PatientRegistrationData | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private formBuilder: FormBuilder,
    private questionnaireService: QuestionnaireService,
    private notificationService: NotificationService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadQuestionnaires();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   *
   * Initialize the patient registration form
   */
  private initializeForm(): void {
    this.patientForm = this.formBuilder.group({
      // Demographics
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      dateOfBirth: ['', [Validators.required]],
      gender: [''],

      // Contact Information
      phone: ['', [Validators.pattern(/^\+?[\d\s\-()]+$/)]],
      email: ['', [Validators.email]],
      address: [''],

      // Insurance Information
      insuranceProvider: [''],
      policyNumber: [''],
      groupNumber: [''],

      // Consent
      treatmentConsent: [false, [Validators.requiredTrue]],
      privacyConsent: [false, [Validators.requiredTrue]],

      // Additional questionnaire responses
      additionalResponses: this.formBuilder.array([])
    });

    // Watch for changes to check duplicates
    this.patientForm.get('firstName')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkForDuplicates());

    this.patientForm.get('lastName')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkForDuplicates());

    this.patientForm.get('dateOfBirth')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkForDuplicates());
  }

  /**
   *
   * Load available questionnaires
   */
  private loadQuestionnaires(): void {
    this.questionnaireService.getAvailableQuestionnaires()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (questionnaires) => {
          this.availableQuestionnaires = questionnaires;
          if (questionnaires.length > 0) {
            this.selectedQuestionnaire = questionnaires[0];
            this.buildDynamicForm();
          }
        },
        error: (error) => {
          this.errorHandlingService.handleError(error, 'questionnaire-loading');
        }
      });
  }

  /**
   *
   * Build dynamic form based on selected questionnaire
   */
  private buildDynamicForm(): void {
    if (!this.selectedQuestionnaire) {
      return;
    }

    const additionalResponses = this.patientForm.get('additionalResponses') as FormArray;
    additionalResponses.clear();

    for (const item of this.selectedQuestionnaire.item || []) {
      if (item.type === 'group' && item.item) {
        for (const subItem of item.item) {
          // Skip items already handled by basic form
          const basicFields = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'phone', 'email', 'address', 'insuranceProvider', 'policyNumber', 'treatmentConsent', 'privacyConsent'];
          if (!basicFields.includes(subItem.linkId || '')) {
            const control = this.createFormControlForItem(subItem);
            additionalResponses.push(this.formBuilder.group({
              linkId: [subItem.linkId],
              text: [subItem.text],
              type: [subItem.type],
              required: [subItem.required],
              answer: control
            }));
          }
        }
      }
    }
  }

  /**
   *
   * Create form control based on questionnaire item type
   */
  private createFormControlForItem(item: any): FormControl {
    const validators = item.required ? [Validators.required] : [];

    switch (item.type) {
      case 'boolean':
        return new FormControl(false, validators);
      case 'integer':
      case 'decimal':
        return new FormControl(null, validators);
      case 'date':
        return new FormControl('', validators);
      case 'choice':
        return new FormControl('', validators);
      default:
        return new FormControl('', validators);
    }
  }

  /**
   *
   * Get additional responses form array
   */
  get additionalResponses(): FormArray {
    return this.patientForm.get('additionalResponses') as FormArray;
  }

  /**
   *
   * Check for potential duplicate patients
   */
  private async checkForDuplicates(): Promise<void> {
    const firstName = this.patientForm.get('firstName')?.value;
    const lastName = this.patientForm.get('lastName')?.value;
    const dateOfBirth = this.patientForm.get('dateOfBirth')?.value;

    if (firstName && lastName && dateOfBirth) {
      try {
        const patientData: Partial<Patient> = {
          name: [{
            given: [firstName],
            family: lastName
          }],
          birthDate: dateOfBirth
        };

        this.duplicatePatients = await this.questionnaireService.checkForDuplicatePatient(patientData);
        this.showDuplicateWarning = this.duplicatePatients.length > 0;

        if (this.showDuplicateWarning) {
          this.notificationService.showWarning(
            'Potential Duplicate Patient',
            `Found ${this.duplicatePatients.length} similar patient(s). Please verify this is not a duplicate.`
          );
        }
      } catch (error) {
        // Silently handle duplicate check errors
        console.warn('Error checking for duplicates:', error);
      }
    }
  }

  /**
   *
   * Select a questionnaire
   */
  selectQuestionnaire(questionnaire: Questionnaire): void {
    this.selectedQuestionnaire = questionnaire;
    this.buildDynamicForm();
  }

  /**
   *
   * Submit the patient registration form
   */
  async onSubmit(): Promise<void> {
    if (this.patientForm.invalid || this.isSubmitting) {
      this.markFormGroupTouched(this.patientForm);
      this.notificationService.showWarning('Form Validation', 'Please fill in all required fields correctly.');
      return;
    }

    // Show confirmation if duplicates found
    if (this.showDuplicateWarning) {
      const confirmed = confirm(
        `Potential duplicate patients found:\n${this.duplicatePatients.map(p =>
          `${p.name?.[0]?.given?.[0]} ${p.name?.[0]?.family} (DOB: ${p.birthDate})`
        ).join('\n')}\n\nDo you want to continue with registration?`
      );

      if (!confirmed) {
        return;
      }
    }

    this.isSubmitting = true;

    try {
      // Create questionnaire response from form data
      const questionnaireResponse = this.createQuestionnaireResponse();

      // Register patient using questionnaire service
      this.registrationResult = await this.questionnaireService.createPatientRegistration(questionnaireResponse);

      this.notificationService.showSuccess(
        'Patient Registered Successfully',
        `Patient ${this.registrationResult.patient.name?.[0]?.given?.[0]} ${this.registrationResult.patient.name?.[0]?.family} has been registered.`
      );

      // Reset form
      this.resetForm();

    } catch (error) {
      this.errorHandlingService.handleError(error, 'patient-registration');
      this.notificationService.showError(
        'Registration Failed',
        'Failed to register patient. Please try again.'
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   *
   * Create questionnaire response from form data
   */
  private createQuestionnaireResponse(): QuestionnaireResponse {
    const formValue = this.patientForm.value;

    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      authored: new Date().toISOString(),
      questionnaire: this.selectedQuestionnaire?.url || `Questionnaire/${this.selectedQuestionnaire?.id}`,
      item: [
        {
          linkId: 'demographics',
          text: 'Demographics',
          item: [
            {
              linkId: 'firstName',
              text: 'First Name',
              answer: [{ valueString: formValue.firstName }]
            },
            {
              linkId: 'lastName',
              text: 'Last Name',
              answer: [{ valueString: formValue.lastName }]
            },
            {
              linkId: 'dateOfBirth',
              text: 'Date of Birth',
              answer: [{ valueDate: formValue.dateOfBirth }]
            },
            {
              linkId: 'gender',
              text: 'Gender',
              answer: formValue.gender ? [{ valueString: formValue.gender }] : []
            }
          ]
        },
        {
          linkId: 'contact',
          text: 'Contact Information',
          item: [
            {
              linkId: 'phone',
              text: 'Phone Number',
              answer: formValue.phone ? [{ valueString: formValue.phone }] : []
            },
            {
              linkId: 'email',
              text: 'Email Address',
              answer: formValue.email ? [{ valueString: formValue.email }] : []
            },
            {
              linkId: 'address',
              text: 'Address',
              answer: formValue.address ? [{ valueString: formValue.address }] : []
            }
          ]
        },
        {
          linkId: 'insurance',
          text: 'Insurance Information',
          item: [
            {
              linkId: 'insuranceProvider',
              text: 'Insurance Provider',
              answer: formValue.insuranceProvider ? [{ valueString: formValue.insuranceProvider }] : []
            },
            {
              linkId: 'policyNumber',
              text: 'Policy Number',
              answer: formValue.policyNumber ? [{ valueString: formValue.policyNumber }] : []
            },
            {
              linkId: 'groupNumber',
              text: 'Group Number',
              answer: formValue.groupNumber ? [{ valueString: formValue.groupNumber }] : []
            }
          ]
        },
        {
          linkId: 'consent',
          text: 'Consent',
          item: [
            {
              linkId: 'treatmentConsent',
              text: 'I consent to treatment and testing',
              answer: [{ valueBoolean: formValue.treatmentConsent }]
            },
            {
              linkId: 'privacyConsent',
              text: 'I acknowledge the privacy notice',
              answer: [{ valueBoolean: formValue.privacyConsent }]
            }
          ]
        }
      ]
    };

    // Add additional responses from dynamic form
    const additionalResponses = this.patientForm.get('additionalResponses') as FormArray;
    additionalResponses.controls.forEach(control => {
      const responseItem = control.value;
      if (responseItem.linkId && responseItem.answer) {
        response.item?.push({
          linkId: responseItem.linkId,
          text: responseItem.text,
          answer: responseItem.answer
        });
      }
    });

    return response;
  }

  /**
   *
   * Reset the form
   */
  private resetForm(): void {
    this.patientForm.reset();
    this.duplicatePatients = [];
    this.showDuplicateWarning = false;
    this.registrationResult = null;

    // Reset additional responses
    const additionalResponses = this.patientForm.get('additionalResponses') as FormArray;
    additionalResponses.clear();

    // Rebuild dynamic form if questionnaire is selected
    if (this.selectedQuestionnaire) {
      this.buildDynamicForm();
    }
  }

  /**
   *
   * Mark all form controls as touched to trigger validation display
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else {
        control?.markAsTouched();
      }
    });
  }

  /**
   *
   * Get validation error message for a field
   */
  getFieldError(fieldName: string): string {
    const field = this.patientForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors.required) { return `${fieldName} is required`; }
      if (field.errors.email) { return 'Please enter a valid email address'; }
      if (field.errors.pattern) { return 'Please enter a valid phone number'; }
      if (field.errors.minlength) { return `${fieldName} must be at least ${field.errors.minlength.requiredLength} characters`; }
    }
    return '';
  }

  /**
   *
   * Check if field has error
   */
  hasFieldError(fieldName: string): boolean {
    const field = this.patientForm.get(fieldName);
    return !!(field?.errors && field.touched);
  }
}
