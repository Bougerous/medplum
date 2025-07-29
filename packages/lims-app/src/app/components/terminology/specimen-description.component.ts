import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CodeableConcept } from '@medplum/fhirtypes';
import { Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  takeUntil,
} from 'rxjs/operators';
import {
  SnomedConcept,
  SpecimenConcept,
  TerminologySearchParams,
  TerminologyService,
  ValidationResult,
} from '../../services/terminology.service';

export interface SpecimenDescription {
  specimenType: SpecimenConcept;
  anatomicalSite?: SnomedConcept;
  morphology?: SnomedConcept;
  procedure?: SnomedConcept;
  additionalDescriptors: SnomedConcept[];
  freeTextDescription?: string;
  codeableConcepts: CodeableConcept[];
}

@Component({
  selector: 'app-specimen-description',
  template: `
    <div class="specimen-description">
      <div class="description-header">
        <h3>Specimen Description</h3>
        <p class="description-subtitle">
          Use structured terminology to describe the specimen
        </p>
      </div>

      <form [formGroup]="descriptionForm" class="description-form">
        <!-- Specimen Type Selection -->
        <div class="form-group">
          <label for="specimenType">Specimen Type *</label>
          <div class="search-container">
            <input
              type="text"
              id="specimenType"
              formControlName="specimenTypeSearch"
              class="form-control"
              placeholder="Search for specimen type..."
              [class.is-invalid]="
                descriptionForm.get('specimenTypeSearch')?.invalid &&
                descriptionForm.get('specimenTypeSearch')?.touched
              "
            />
            <div class="search-results" *ngIf="specimenTypeResults.length > 0">
              <div
                *ngFor="let result of specimenTypeResults"
                class="search-result-item"
                (click)="selectSpecimenType(result)"
              >
                <div class="result-display">{{ result.display }}</div>
                <div class="result-code">{{ result.code }}</div>
                <div class="result-definition" *ngIf="result.definition">
                  {{ result.definition }}
                </div>
              </div>
            </div>
          </div>
          <div class="selected-concept" *ngIf="selectedSpecimenType">
            <span class="concept-display">{{
              selectedSpecimenType.display
            }}</span>
            <span class="concept-code">({{ selectedSpecimenType.code }})</span>
            <button
              type="button"
              class="btn-remove"
              (click)="clearSpecimenType()"
            >
              ×
            </button>
          </div>
          <div
            class="invalid-feedback"
            *ngIf="
              descriptionForm.get('specimenTypeSearch')?.invalid &&
              descriptionForm.get('specimenTypeSearch')?.touched
            "
          >
            Specimen type is required
          </div>
        </div>

        <!-- Anatomical Site -->
        <div class="form-group">
          <label for="anatomicalSite">Anatomical Site</label>
          <div class="search-container">
            <input
              type="text"
              id="anatomicalSite"
              formControlName="anatomicalSiteSearch"
              class="form-control"
              placeholder="Search for anatomical site..."
            />
            <div
              class="search-results"
              *ngIf="anatomicalSiteResults.length > 0"
            >
              <div
                *ngFor="let result of anatomicalSiteResults"
                class="search-result-item"
                (click)="selectAnatomicalSite(result)"
              >
                <div class="result-display">{{ result.display }}</div>
                <div class="result-code">{{ result.code }}</div>
                <div class="result-definition" *ngIf="result.definition">
                  {{ result.definition }}
                </div>
              </div>
            </div>
          </div>
          <div class="selected-concept" *ngIf="selectedAnatomicalSite">
            <span class="concept-display">{{
              selectedAnatomicalSite.display
            }}</span>
            <span class="concept-code"
              >({{ selectedAnatomicalSite.code }})</span
            >
            <button
              type="button"
              class="btn-remove"
              (click)="clearAnatomicalSite()"
            >
              ×
            </button>
          </div>
        </div>

        <!-- Morphology -->
        <div class="form-group">
          <label for="morphology">Morphology</label>
          <div class="search-container">
            <input
              type="text"
              id="morphology"
              formControlName="morphologySearch"
              class="form-control"
              placeholder="Search for morphology..."
            />
            <div class="search-results" *ngIf="morphologyResults.length > 0">
              <div
                *ngFor="let result of morphologyResults"
                class="search-result-item"
                (click)="selectMorphology(result)"
              >
                <div class="result-display">{{ result.display }}</div>
                <div class="result-code">{{ result.code }}</div>
                <div class="result-definition" *ngIf="result.definition">
                  {{ result.definition }}
                </div>
              </div>
            </div>
          </div>
          <div class="selected-concept" *ngIf="selectedMorphology">
            <span class="concept-display">{{
              selectedMorphology.display
            }}</span>
            <span class="concept-code">({{ selectedMorphology.code }})</span>
            <button
              type="button"
              class="btn-remove"
              (click)="clearMorphology()"
            >
              ×
            </button>
          </div>
        </div>

        <!-- Collection Procedure -->
        <div class="form-group">
          <label for="procedure">Collection Procedure</label>
          <div class="search-container">
            <input
              type="text"
              id="procedure"
              formControlName="procedureSearch"
              class="form-control"
              placeholder="Search for collection procedure..."
            />
            <div class="search-results" *ngIf="procedureResults.length > 0">
              <div
                *ngFor="let result of procedureResults"
                class="search-result-item"
                (click)="selectProcedure(result)"
              >
                <div class="result-display">{{ result.display }}</div>
                <div class="result-code">{{ result.code }}</div>
                <div class="result-definition" *ngIf="result.definition">
                  {{ result.definition }}
                </div>
              </div>
            </div>
          </div>
          <div class="selected-concept" *ngIf="selectedProcedure">
            <span class="concept-display">{{ selectedProcedure.display }}</span>
            <span class="concept-code">({{ selectedProcedure.code }})</span>
            <button type="button" class="btn-remove" (click)="clearProcedure()">
              ×
            </button>
          </div>
        </div>

        <!-- Additional Descriptors -->
        <div class="form-group">
          <label for="additionalDescriptors">Additional Descriptors</label>
          <div class="search-container">
            <input
              type="text"
              id="additionalDescriptors"
              formControlName="descriptorSearch"
              class="form-control"
              placeholder="Search for additional descriptors..."
            />
            <div class="search-results" *ngIf="descriptorResults.length > 0">
              <div
                *ngFor="let result of descriptorResults"
                class="search-result-item"
                (click)="addDescriptor(result)"
              >
                <div class="result-display">{{ result.display }}</div>
                <div class="result-code">{{ result.code }}</div>
                <div class="result-definition" *ngIf="result.definition">
                  {{ result.definition }}
                </div>
              </div>
            </div>
          </div>
          <div
            class="selected-descriptors"
            *ngIf="selectedDescriptors.length > 0"
          >
            <div
              *ngFor="let descriptor of selectedDescriptors; let i = index"
              class="selected-concept"
            >
              <span class="concept-display">{{ descriptor.display }}</span>
              <span class="concept-code">({{ descriptor.code }})</span>
              <button
                type="button"
                class="btn-remove"
                (click)="removeDescriptor(i)"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <!-- Free Text Description -->
        <div class="form-group">
          <label for="freeTextDescription"
            >Additional Free Text Description</label
          >
          <textarea
            id="freeTextDescription"
            formControlName="freeTextDescription"
            class="form-control"
            rows="3"
            placeholder="Additional description not captured by structured terms..."
          ></textarea>
        </div>

        <!-- Validation Messages -->
        <div class="validation-messages" *ngIf="validationResult">
          <div class="alert alert-danger" *ngIf="!validationResult.isValid">
            <h5>Validation Errors:</h5>
            <ul>
              <li *ngFor="let error of validationResult.errors">{{ error }}</li>
            </ul>
          </div>
          <div
            class="alert alert-warning"
            *ngIf="validationResult.warnings.length > 0"
          >
            <h5>Warnings:</h5>
            <ul>
              <li *ngFor="let warning of validationResult.warnings">
                {{ warning }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Description Summary -->
        <div class="description-summary" *ngIf="hasValidDescription()">
          <h4>Specimen Description Summary</h4>
          <div class="summary-content">
            <div class="summary-item" *ngIf="selectedSpecimenType">
              <strong>Type:</strong> {{ selectedSpecimenType.display }}
            </div>
            <div class="summary-item" *ngIf="selectedAnatomicalSite">
              <strong>Site:</strong> {{ selectedAnatomicalSite.display }}
            </div>
            <div class="summary-item" *ngIf="selectedMorphology">
              <strong>Morphology:</strong> {{ selectedMorphology.display }}
            </div>
            <div class="summary-item" *ngIf="selectedProcedure">
              <strong>Procedure:</strong> {{ selectedProcedure.display }}
            </div>
            <div class="summary-item" *ngIf="selectedDescriptors.length > 0">
              <strong>Descriptors:</strong>
              <span *ngFor="let desc of selectedDescriptors; let last = last">
                {{ desc.display }}<span *ngIf="!last">, </span>
              </span>
            </div>
            <div
              class="summary-item"
              *ngIf="descriptionForm.get('freeTextDescription')?.value"
            >
              <strong>Notes:</strong>
              {{ descriptionForm.get('freeTextDescription')?.value }}
            </div>
          </div>

          <!-- Generated Text Description -->
          <div class="generated-description">
            <h5>Generated Description:</h5>
            <p class="description-text">{{ getGeneratedDescription() }}</p>
          </div>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['./specimen-description.component.scss'],
  imports: [CommonModule, ReactiveFormsModule],
  standalone: true
})
export class SpecimenDescriptionComponent implements OnInit, OnDestroy {
  private terminologyService = inject(TerminologyService);

  @Input() initialDescription?: SpecimenDescription;
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Output() descriptionChanged = new EventEmitter<SpecimenDescription>();
  @Output() validationChange = new EventEmitter<ValidationResult>();

  descriptionForm!: FormGroup;

  // Selected concepts
  selectedSpecimenType: SpecimenConcept | null = null;
  selectedAnatomicalSite: SnomedConcept | null = null;
  selectedMorphology: SnomedConcept | null = null;
  selectedProcedure: SnomedConcept | null = null;
  selectedDescriptors: SnomedConcept[] = [];

  // Search results
  specimenTypeResults: SpecimenConcept[] = [];
  anatomicalSiteResults: SnomedConcept[] = [];
  morphologyResults: SnomedConcept[] = [];
  procedureResults: SnomedConcept[] = [];
  descriptorResults: SnomedConcept[] = [];

  validationResult: ValidationResult | null = null;

  private destroy$ = new Subject<void>();

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
    this.descriptionForm = new FormGroup({
      specimenTypeSearch: new FormControl(
        '',
        this.required ? [Validators.required] : [],
      ),
      anatomicalSiteSearch: new FormControl(''),
      morphologySearch: new FormControl(''),
      procedureSearch: new FormControl(''),
      descriptorSearch: new FormControl(''),
      freeTextDescription: new FormControl(''),
    });

    if (this.disabled) {
      this.descriptionForm.disable();
    }
  }

  private setupFormSubscriptions(): void {
    // Specimen type search
    this.descriptionForm
      .get('specimenTypeSearch')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.searchSpecimenTypes(query)),
      )
      .subscribe((results) => {
        this.specimenTypeResults = results;
      });

    // Anatomical site search
    this.descriptionForm
      .get('anatomicalSiteSearch')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.searchAnatomicalSites(query)),
      )
      .subscribe((results) => {
        this.anatomicalSiteResults = results;
      });

    // Morphology search
    this.descriptionForm
      .get('morphologySearch')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.searchMorphology(query)),
      )
      .subscribe((results) => {
        this.morphologyResults = results;
      });

    // Procedure search
    this.descriptionForm
      .get('procedureSearch')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.searchProcedures(query)),
      )
      .subscribe((results) => {
        this.procedureResults = results;
      });

    // Descriptor search
    this.descriptionForm
      .get('descriptorSearch')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.searchDescriptors(query)),
      )
      .subscribe((results) => {
        this.descriptorResults = results;
      });

    // Watch for any changes to emit description
    this.descriptionForm.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe(() => {
        this.emitDescription();
        this.validateDescription();
      });
  }

  private async loadInitialData(): Promise<void> {
    if (this.initialDescription) {
      this.selectedSpecimenType = this.initialDescription.specimenType;
      this.selectedAnatomicalSite =
        this.initialDescription.anatomicalSite || null;
      this.selectedMorphology = this.initialDescription.morphology || null;
      this.selectedProcedure = this.initialDescription.procedure || null;
      this.selectedDescriptors = [
        ...this.initialDescription.additionalDescriptors,
      ];

      this.descriptionForm.patchValue({
        freeTextDescription: this.initialDescription.freeTextDescription,
      });
    }
  }

  // Search methods
  private async searchSpecimenTypes(query: string): Promise<SpecimenConcept[]> {
    if (!query || query.length < 2) { return []; }

    try {
      const specimens = await this.terminologyService.getSpecimenConcepts();
      return specimens.filter(
        (specimen) =>
          specimen.display.toLowerCase().includes(query.toLowerCase()) ||
          specimen.code.includes(query),
      );
    } catch (error) {
      console.error('Failed to search specimen types:', error);
      return [];
    }
  }

  private async searchAnatomicalSites(query: string): Promise<SnomedConcept[]> {
    if (!query || query.length < 2) { return []; }

    try {
      const params: TerminologySearchParams = {
        query,
        maxResults: 10,
        filter: { category: 'anatomy' },
      };
      return await this.terminologyService.searchConcepts(params);
    } catch (error) {
      console.error('Failed to search anatomical sites:', error);
      return [];
    }
  }

  private async searchMorphology(query: string): Promise<SnomedConcept[]> {
    if (!query || query.length < 2) { return []; }

    try {
      const params: TerminologySearchParams = {
        query,
        maxResults: 10,
        filter: { category: 'morphology' },
      };
      return await this.terminologyService.searchConcepts(params);
    } catch (error) {
      console.error('Failed to search morphology:', error);
      return [];
    }
  }

  private async searchProcedures(query: string): Promise<SnomedConcept[]> {
    if (!query || query.length < 2) { return []; }

    try {
      const params: TerminologySearchParams = {
        query,
        maxResults: 10,
        filter: { category: 'procedure' },
      };
      return await this.terminologyService.searchConcepts(params);
    } catch (error) {
      console.error('Failed to search procedures:', error);
      return [];
    }
  }

  private async searchDescriptors(query: string): Promise<SnomedConcept[]> {
    if (!query || query.length < 2) { return []; }

    try {
      const params: TerminologySearchParams = {
        query,
        maxResults: 10,
      };
      return await this.terminologyService.searchConcepts(params);
    } catch (error) {
      console.error('Failed to search descriptors:', error);
      return [];
    }
  }

  // Selection methods
  selectSpecimenType(specimen: SpecimenConcept): void {
    this.selectedSpecimenType = specimen;
    this.descriptionForm.patchValue({ specimenTypeSearch: specimen.display });
    this.specimenTypeResults = [];
    this.emitDescription();
  }

  selectAnatomicalSite(site: SnomedConcept): void {
    this.selectedAnatomicalSite = site;
    this.descriptionForm.patchValue({ anatomicalSiteSearch: site.display });
    this.anatomicalSiteResults = [];
    this.emitDescription();
  }

  selectMorphology(morphology: SnomedConcept): void {
    this.selectedMorphology = morphology;
    this.descriptionForm.patchValue({ morphologySearch: morphology.display });
    this.morphologyResults = [];
    this.emitDescription();
  }

  selectProcedure(procedure: SnomedConcept): void {
    this.selectedProcedure = procedure;
    this.descriptionForm.patchValue({ procedureSearch: procedure.display });
    this.procedureResults = [];
    this.emitDescription();
  }

  addDescriptor(descriptor: SnomedConcept): void {
    if (!this.selectedDescriptors.find((d) => d.code === descriptor.code)) {
      this.selectedDescriptors.push(descriptor);
      this.descriptionForm.patchValue({ descriptorSearch: '' });
      this.descriptorResults = [];
      this.emitDescription();
    }
  }

  // Clear methods
  clearSpecimenType(): void {
    this.selectedSpecimenType = null;
    this.descriptionForm.patchValue({ specimenTypeSearch: '' });
    this.emitDescription();
  }

  clearAnatomicalSite(): void {
    this.selectedAnatomicalSite = null;
    this.descriptionForm.patchValue({ anatomicalSiteSearch: '' });
    this.emitDescription();
  }

  clearMorphology(): void {
    this.selectedMorphology = null;
    this.descriptionForm.patchValue({ morphologySearch: '' });
    this.emitDescription();
  }

  clearProcedure(): void {
    this.selectedProcedure = null;
    this.descriptionForm.patchValue({ procedureSearch: '' });
    this.emitDescription();
  }

  removeDescriptor(index: number): void {
    this.selectedDescriptors.splice(index, 1);
    this.emitDescription();
  }

  private emitDescription(): void {
    if (!this.selectedSpecimenType) { return; }

    const codeableConcepts: CodeableConcept[] = [];

    // Add specimen type
    codeableConcepts.push(
      this.terminologyService.createSpecimenCodeableConcept(
        this.selectedSpecimenType,
      ),
    );

    // Add other concepts if selected
    if (this.selectedAnatomicalSite) {
      codeableConcepts.push(
        this.terminologyService.createCodeableConcept(
          this.selectedAnatomicalSite.code,
          this.selectedAnatomicalSite.display,
          this.selectedAnatomicalSite.system,
        ),
      );
    }

    if (this.selectedMorphology) {
      codeableConcepts.push(
        this.terminologyService.createCodeableConcept(
          this.selectedMorphology.code,
          this.selectedMorphology.display,
          this.selectedMorphology.system,
        ),
      );
    }

    if (this.selectedProcedure) {
      codeableConcepts.push(
        this.terminologyService.createCodeableConcept(
          this.selectedProcedure.code,
          this.selectedProcedure.display,
          this.selectedProcedure.system,
        ),
      );
    }

    // Add descriptors
    this.selectedDescriptors.forEach((descriptor) => {
      codeableConcepts.push(
        this.terminologyService.createCodeableConcept(
          descriptor.code,
          descriptor.display,
          descriptor.system,
        ),
      );
    });

    const description: SpecimenDescription = {
      specimenType: this.selectedSpecimenType,
      anatomicalSite: this.selectedAnatomicalSite || undefined,
      morphology: this.selectedMorphology || undefined,
      procedure: this.selectedProcedure || undefined,
      additionalDescriptors: this.selectedDescriptors,
      freeTextDescription:
        this.descriptionForm.get('freeTextDescription')?.value || undefined,
      codeableConcepts,
    };

    this.descriptionChanged.emit(description);
  }

  private async validateDescription(): Promise<void> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required specimen type
    if (this.required && !this.selectedSpecimenType) {
      errors.push('Specimen type is required');
    }

    // Validate selected concepts
    if (this.selectedSpecimenType) {
      try {
        const validation = await this.terminologyService.validateSpecimenCode(
          this.selectedSpecimenType.code,
          this.selectedSpecimenType.system,
        );

        if (!validation.isValid) {
          errors.push(...validation.errors);
        }
        warnings.push(...validation.warnings);
      } catch (_error) {
        errors.push('Failed to validate specimen type');
      }
    }

    this.validationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    this.validationChange.emit(this.validationResult);
  }

  hasValidDescription(): boolean {
    return !!this.selectedSpecimenType;
  }

  getGeneratedDescription(): string {
    if (!this.selectedSpecimenType) { return ''; }

    let description = this.selectedSpecimenType.display;

    if (this.selectedAnatomicalSite) {
      description += ` from ${this.selectedAnatomicalSite.display}`;
    }

    if (this.selectedProcedure) {
      description += ` obtained by ${this.selectedProcedure.display}`;
    }

    if (this.selectedMorphology) {
      description += ` showing ${this.selectedMorphology.display}`;
    }

    if (this.selectedDescriptors.length > 0) {
      const descriptorText = this.selectedDescriptors
        .map((d) => d.display)
        .join(', ');
      description += ` with ${descriptorText}`;
    }

    const freeText = this.descriptionForm.get('freeTextDescription')?.value;
    if (freeText) {
      description += `. ${freeText}`;
    }

    return description;
  }

  // Public methods
  reset(): void {
    this.descriptionForm.reset();
    this.selectedSpecimenType = null;
    this.selectedAnatomicalSite = null;
    this.selectedMorphology = null;
    this.selectedProcedure = null;
    this.selectedDescriptors = [];
    this.validationResult = null;
  }

  isValid(): boolean {
    return (
      this.descriptionForm.valid && (this.validationResult?.isValid ?? false)
    );
  }

  getCurrentDescription(): SpecimenDescription | null {
    if (!this.hasValidDescription()) { return null; }

    const codeableConcepts: CodeableConcept[] = [];

    if (this.selectedSpecimenType) {
      codeableConcepts.push(
        this.terminologyService.createSpecimenCodeableConcept(
          this.selectedSpecimenType,
        ),
      );
    }

    return {
      specimenType: this.selectedSpecimenType!,
      anatomicalSite: this.selectedAnatomicalSite || undefined,
      morphology: this.selectedMorphology || undefined,
      procedure: this.selectedProcedure || undefined,
      additionalDescriptors: this.selectedDescriptors,
      freeTextDescription:
        this.descriptionForm.get('freeTextDescription')?.value || undefined,
      codeableConcepts,
    };
  }
}
