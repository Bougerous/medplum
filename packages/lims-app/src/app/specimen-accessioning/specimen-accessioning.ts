import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { 
  CodeableConcept, 
  Patient 
} from '@medplum/fhirtypes';
import { Subject, takeUntil } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { NotificationService } from '../services/notification.service';
import { SpecimenAccessionData, SpecimenService } from '../services/specimen.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-specimen-accessioning',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './specimen-accessioning.html',
  styleUrl: './specimen-accessioning.scss'
})
export class SpecimenAccessioning implements OnInit, OnDestroy {
  specimenForm!: FormGroup;
  isSubmitting = false;
  searchResults: Patient[] = [];
  selectedPatient: Patient | null = null;
  availableSpecimenTypes: CodeableConcept[] = [];
  availableContainerTypes: CodeableConcept[] = [];
  accessionResult: SpecimenAccessionData | null = null;
  showQRCode = false;

  private destroy$ = new Subject<void>();

  constructor(
    private formBuilder: FormBuilder,
    private medplumService: MedplumService,
    private specimenService: SpecimenService,
    private notificationService: NotificationService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadSpecimenTypes();
    this.loadContainerTypes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize the specimen accessioning form
   */
  private initializeForm(): void {
    this.specimenForm = this.formBuilder.group({
      patientSearch: ['', [Validators.required]],
      specimenType: ['', [Validators.required]],
      collectionDate: [new Date().toISOString().slice(0, 16), [Validators.required]],
      collectionMethod: [''],
      bodySite: [''],
      containerType: [''],
      quantity: [''],
      quantityUnit: ['mL'],
      notes: [''],
      priority: ['routine']
    });
  }

  /**
   * Load available specimen types
   */
  private loadSpecimenTypes(): void {
    this.specimenService.getSpecimenTypes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (types) => {
          this.availableSpecimenTypes = types;
        },
        error: (error) => {
          this.errorHandlingService.handleError(error, 'specimen-types-loading');
        }
      });
  }

  /**
   * Load available container types
   */
  private loadContainerTypes(): void {
    this.specimenService.getContainerTypes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (types) => {
          this.availableContainerTypes = types;
        },
        error: (error) => {
          this.errorHandlingService.handleError(error, 'container-types-loading');
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
    
    this.specimenForm.patchValue({
      patientSearch: patientName
    });
    this.searchResults = [];
  }

  /**
   * Get selected specimen type object
   */
  getSelectedSpecimenType(): CodeableConcept | null {
    const selectedValue = this.specimenForm.get('specimenType')?.value;
    return this.availableSpecimenTypes.find(type => 
      type.coding?.[0]?.code === selectedValue || type.text === selectedValue
    ) || null;
  }

  /**
   * Get selected container type object
   */
  getSelectedContainerType(): CodeableConcept | null {
    const selectedValue = this.specimenForm.get('containerType')?.value;
    if (!selectedValue) { return null; }
    
    return this.availableContainerTypes.find(type => 
      type.coding?.[0]?.code === selectedValue || type.text === selectedValue
    ) || null;
  }

  /**
   * Submit the specimen accessioning form
   */
  async onSubmit(): Promise<void> {
    if (this.specimenForm.invalid || this.isSubmitting || !this.selectedPatient) {
      this.markFormGroupTouched(this.specimenForm);
      this.notificationService.showWarning('Form Validation', 'Please fill in all required fields and select a patient.');
      return;
    }

    this.isSubmitting = true;
    const formValue = this.specimenForm.value;

    try {
      const specimenType = this.getSelectedSpecimenType();
      if (!specimenType) {
        throw new Error('Invalid specimen type selected');
      }

      const specimenData = {
        type: specimenType,
        collectionDate: formValue.collectionDate,
        collectionMethod: formValue.collectionMethod ? {
          text: formValue.collectionMethod
        } : undefined,
        bodySite: formValue.bodySite ? {
          text: formValue.bodySite
        } : undefined,
        containerType: this.getSelectedContainerType() || undefined,
        quantity: formValue.quantity ? {
          value: parseFloat(formValue.quantity),
          unit: formValue.quantityUnit
        } : undefined,
        notes: formValue.notes
      };

      if (this.selectedPatient?.id) {
        this.accessionResult = await this.specimenService.createSpecimen(
          this.selectedPatient.id,
          specimenData
        );
      }

      this.notificationService.showSuccess(
        'Specimen Accessioned Successfully',
        `Accession number: ${this.accessionResult.accessionNumber}`
      );

      this.showQRCode = true;
      
    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-accessioning');
      this.notificationService.showError(
        'Accessioning Failed',
        'Failed to process specimen. Please try again.'
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Print specimen label
   */
  printLabel(): void {
    if (!this.accessionResult) { return; }
    
    const labelData = this.accessionResult.labelData;
    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Specimen Label - ${labelData.accessionNumber}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px;
                background: white;
              }
              .label { 
                border: 2px solid #000; 
                padding: 15px; 
                width: 350px; 
                margin: 0 auto;
                background: white;
              }
              .header {
                text-align: center;
                border-bottom: 1px solid #000;
                padding-bottom: 10px;
                margin-bottom: 10px;
              }
              .accession { 
                font-size: 20px; 
                font-weight: bold; 
                text-align: center;
                margin-bottom: 10px;
              }
              .patient-info { 
                margin: 10px 0; 
                font-size: 14px;
              }
              .specimen-info {
                margin: 10px 0;
                font-size: 12px;
                color: #666;
              }
              .qr-placeholder {
                width: 80px;
                height: 80px;
                border: 1px solid #000;
                margin: 10px auto;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                text-align: center;
              }
              .barcode { 
                font-family: 'Courier New', monospace; 
                font-size: 16px; 
                text-align: center;
                letter-spacing: 2px;
                margin-top: 10px;
              }
              @media print {
                body { margin: 0; padding: 10px; }
                .label { width: auto; }
              }
            </style>
          </head>
          <body>
            <div class="label">
              <div class="header">
                <strong>Laboratory Specimen</strong>
              </div>
              <div class="accession">${labelData.accessionNumber}</div>
              <div class="patient-info">
                <strong>Patient:</strong> ${labelData.patientName}<br>
                <strong>DOB:</strong> ${labelData.patientDOB}<br>
                <strong>Collection:</strong> ${new Date(labelData.collectionDate).toLocaleDateString()}
              </div>
              <div class="specimen-info">
                <strong>Type:</strong> ${labelData.specimenType}<br>
                ${labelData.containerType ? `<strong>Container:</strong> ${labelData.containerType}<br>` : ''}
                <strong>Priority:</strong> ${this.specimenForm.get('priority')?.value || 'Routine'}
              </div>
              <div class="qr-placeholder">
                QR CODE<br>
                ${labelData.accessionNumber}
              </div>
              <div class="barcode">${labelData.accessionNumber}</div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 1000);
              };
            </script>
          </body>
        </html>
      `);
    }
  }

  /**
   * Generate new specimen for same patient
   */
  newSpecimenForPatient(): void {
    if (!this.selectedPatient) { return; }
    
    // Reset form but keep patient selected
    this.specimenForm.reset();
    this.specimenForm.patchValue({
      patientSearch: `${this.selectedPatient.name?.[0]?.given?.[0]} ${this.selectedPatient.name?.[0]?.family}`,
      collectionDate: new Date().toISOString().slice(0, 16),
      quantityUnit: 'mL',
      priority: 'routine'
    });
    
    this.accessionResult = null;
    this.showQRCode = false;
  }

  /**
   * Reset form completely
   */
  resetForm(): void {
    this.specimenForm.reset();
    this.specimenForm.patchValue({
      collectionDate: new Date().toISOString().slice(0, 16),
      quantityUnit: 'mL',
      priority: 'routine'
    });
    
    this.selectedPatient = null;
    this.searchResults = [];
    this.accessionResult = null;
    this.showQRCode = false;
  }

  /**
   * Mark all form controls as touched to show validation errors
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    for (const key of Object.keys(formGroup.controls)) {
      const control = formGroup.get(key);
      control?.markAsTouched();
    }
  }

  /**
   * Get validation error message for a field
   */
  getFieldError(fieldName: string): string {
    const field = this.specimenForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors.required) { return `${fieldName} is required`; }
    }
    return '';
  }

  /**
   * Check if field has error
   */
  hasFieldError(fieldName: string): boolean {
    const field = this.specimenForm.get(fieldName);
    return !!(field?.errors && field.touched);
  }

  /**
   * Get QR code data for display
   */
  getQRCodeData(): string {
    return this.accessionResult?.qrCodeData || '';
  }
}
