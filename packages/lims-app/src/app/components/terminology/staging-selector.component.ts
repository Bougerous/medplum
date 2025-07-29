import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CodeableConcept } from '@medplum/fhirtypes';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { 
  SNOMED_CT_SYSTEM, 
  StagingConcept, 
  TerminologyService, 
  ValidationResult
} from '../../services/terminology.service';

export interface StagingSelection {
  stagingSystem: string;
  stage: StagingConcept;
  tComponent?: string;
  nComponent?: string;
  mComponent?: string;
  codeableConcept: CodeableConcept;
  additionalNotes?: string;
}

@Component({
  selector: 'app-staging-selector',
  template: `
    <div class="staging-selector">
      <div class="staging-header">
        <h3>Cancer Staging</h3>
        <p class="staging-description">Select appropriate staging system and components</p>
      </div>

      <form [formGroup]="stagingForm" class="staging-form">
        <!-- Staging System Selection -->
        <div class="form-group">
          <label for="stagingSystem">Staging System</label>
          <select 
            id="stagingSystem" 
            formControlName="stagingSystem" 
            class="form-control"
            [class.is-invalid]="stagingForm.get('stagingSystem')?.invalid && stagingForm.get('stagingSystem')?.touched">
            <option value="">Select staging system...</option>
            <option value="TNM">TNM Classification</option>
            <option value="AJCC">AJCC Cancer Staging</option>
            <option value="FIGO">FIGO Staging (Gynecologic)</option>
            <option value="Ann-Arbor">Ann Arbor (Lymphoma)</option>
            <option value="Dukes">Dukes Classification (Colorectal)</option>
          </select>
          <div class="invalid-feedback" *ngIf="stagingForm.get('stagingSystem')?.invalid && stagingForm.get('stagingSystem')?.touched">
            Please select a staging system
          </div>
        </div>

        <!-- TNM Components (shown for TNM and AJCC systems) -->
        <div class="tnm-components" *ngIf="showTNMComponents()">
          <h4>TNM Components</h4>
          
          <div class="component-grid">
            <!-- T Component -->
            <div class="form-group">
              <label for="tComponent">T - Primary Tumor</label>
              <select id="tComponent" formControlName="tComponent" class="form-control">
                <option value="">Select T component...</option>
                <option value="TX">TX - Primary tumor cannot be assessed</option>
                <option value="T0">T0 - No evidence of primary tumor</option>
                <option value="Tis">Tis - Carcinoma in situ</option>
                <option value="T1">T1 - Tumor invades submucosa</option>
                <option value="T2">T2 - Tumor invades muscularis propria</option>
                <option value="T3">T3 - Tumor invades through muscularis propria</option>
                <option value="T4">T4 - Tumor invades other organs</option>
              </select>
            </div>

            <!-- N Component -->
            <div class="form-group">
              <label for="nComponent">N - Regional Lymph Nodes</label>
              <select id="nComponent" formControlName="nComponent" class="form-control">
                <option value="">Select N component...</option>
                <option value="NX">NX - Regional lymph nodes cannot be assessed</option>
                <option value="N0">N0 - No regional lymph node metastasis</option>
                <option value="N1">N1 - Metastasis in 1-3 regional lymph nodes</option>
                <option value="N2">N2 - Metastasis in 4-6 regional lymph nodes</option>
                <option value="N3">N3 - Metastasis in 7 or more regional lymph nodes</option>
              </select>
            </div>

            <!-- M Component -->
            <div class="form-group">
              <label for="mComponent">M - Distant Metastasis</label>
              <select id="mComponent" formControlName="mComponent" class="form-control">
                <option value="">Select M component...</option>
                <option value="MX">MX - Distant metastasis cannot be assessed</option>
                <option value="M0">M0 - No distant metastasis</option>
                <option value="M1">M1 - Distant metastasis present</option>
              </select>
            </div>
          </div>

          <!-- Overall Stage Calculation -->
          <div class="overall-stage" *ngIf="calculatedStage">
            <h5>Calculated Overall Stage</h5>
            <div class="stage-display">
              <span class="stage-value">{{ calculatedStage }}</span>
              <span class="stage-components">({{ getTNMString() }})</span>
            </div>
          </div>
        </div>

        <!-- Direct Stage Selection (for non-TNM systems) -->
        <div class="form-group" *ngIf="!showTNMComponents() && availableStages.length > 0">
          <label for="directStage">Stage</label>
          <div class="stage-options">
            <div 
              *ngFor="let stage of availableStages" 
              class="stage-option"
              [class.selected]="selectedStage?.code === stage.code"
              (click)="selectStage(stage)">
              <div class="stage-header">
                <span class="stage-code">{{ stage.stage }}</span>
                <span class="stage-display">{{ stage.display }}</span>
              </div>
              <div class="stage-description">{{ stage.description }}</div>
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
            placeholder="Additional staging notes, modifiers, or comments..."></textarea>
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

        <!-- Selected Staging Summary -->
        <div class="staging-summary" *ngIf="hasValidSelection()">
          <h4>Selected Staging</h4>
          <div class="summary-content">
            <div class="summary-item">
              <strong>System:</strong> {{ stagingForm.get('stagingSystem')?.value }}
            </div>
            <div class="summary-item" *ngIf="showTNMComponents()">
              <strong>TNM:</strong> {{ getTNMString() }}
            </div>
            <div class="summary-item" *ngIf="calculatedStage">
              <strong>Overall Stage:</strong> {{ calculatedStage }}
            </div>
            <div class="summary-item" *ngIf="selectedStage">
              <strong>SNOMED CT Code:</strong> {{ selectedStage.code }}
            </div>
          </div>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['./staging-selector.component.scss'],
  imports: [CommonModule, ReactiveFormsModule],
  standalone: true
})
export class StagingSelectorComponent implements OnInit, OnDestroy {
  private terminologyService = inject(TerminologyService);

  @Input() initialStaging?: StagingSelection;
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Output() stagingSelected = new EventEmitter<StagingSelection>();
  @Output() validationChange = new EventEmitter<ValidationResult>();

  stagingForm!: FormGroup;
  availableStages: StagingConcept[] = [];
  selectedStage: StagingConcept | null = null;
  calculatedStage: string | null = null;
  validationResult: ValidationResult | null = null;
  
  private destroy$ = new Subject<void>();

  // Mock staging concepts - in production these would come from terminology service
  private readonly STAGING_CONCEPTS: StagingConcept[] = [
    {
      code: '258215001',
      display: 'Stage 0',
      system: SNOMED_CT_SYSTEM,
      stagingSystem: 'TNM',
      stage: '0',
      description: 'Carcinoma in situ'
    },
    {
      code: '258219007',
      display: 'Stage I',
      system: SNOMED_CT_SYSTEM,
      stagingSystem: 'TNM',
      stage: 'I',
      description: 'Early-stage cancer confined to organ of origin'
    },
    {
      code: '258224007',
      display: 'Stage II',
      system: SNOMED_CT_SYSTEM,
      stagingSystem: 'TNM',
      stage: 'II',
      description: 'Limited local spread'
    },
    {
      code: '258228005',
      display: 'Stage III',
      system: SNOMED_CT_SYSTEM,
      stagingSystem: 'TNM',
      stage: 'III',
      description: 'Extensive local and regional spread'
    },
    {
      code: '258232003',
      display: 'Stage IV',
      system: SNOMED_CT_SYSTEM,
      stagingSystem: 'TNM',
      stage: 'IV',
      description: 'Distant metastasis'
    }
  ];

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
    this.stagingForm = new FormGroup({
      stagingSystem: new FormControl('', this.required ? [Validators.required] : []),
      tComponent: new FormControl(''),
      nComponent: new FormControl(''),
      mComponent: new FormControl(''),
      additionalNotes: new FormControl('')
    });

    if (this.disabled) {
      this.stagingForm.disable();
    }
  }

  private setupFormSubscriptions(): void {
    // Watch for staging system changes
    this.stagingForm.get('stagingSystem')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(stagingSystem => {
        this.loadStagesForSystem(stagingSystem);
        this.selectedStage = null;
        this.calculatedStage = null;
        this.resetTNMComponents();
      });

    // Watch for TNM component changes
    ['tComponent', 'nComponent', 'mComponent'].forEach(component => {
      this.stagingForm.get(component)?.valueChanges
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(300)
        )
        .subscribe(() => {
          this.calculateOverallStage();
          this.validateCurrentSelection();
        });
    });

    // Watch for form changes to emit validation
    this.stagingForm.valueChanges
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
      // Set initial values if provided
      if (this.initialStaging) {
        this.stagingForm.patchValue({
          stagingSystem: this.initialStaging.stagingSystem,
          tComponent: this.initialStaging.tComponent,
          nComponent: this.initialStaging.nComponent,
          mComponent: this.initialStaging.mComponent,
          additionalNotes: this.initialStaging.additionalNotes
        });
        this.selectedStage = this.initialStaging.stage;
        this.calculateOverallStage();
      }
    } catch (error) {
      console.error('Failed to load staging data:', error);
    }
  }

  private loadStagesForSystem(stagingSystem: string): void {
    if (!stagingSystem) {
      this.availableStages = [];
      return;
    }

    // Filter staging concepts by system
    this.availableStages = this.STAGING_CONCEPTS.filter(
      stage => stage.stagingSystem === stagingSystem || stagingSystem === 'TNM' || stagingSystem === 'AJCC'
    );
  }

  private resetTNMComponents(): void {
    this.stagingForm.patchValue({
      tComponent: '',
      nComponent: '',
      mComponent: ''
    });
  }

  showTNMComponents(): boolean {
    const system = this.stagingForm.get('stagingSystem')?.value;
    return system === 'TNM' || system === 'AJCC';
  }

  selectStage(stage: StagingConcept): void {
    if (this.disabled) { return; }

    this.selectedStage = stage;
    this.emitStagingSelection();
    this.validateCurrentSelection();
  }

  private calculateOverallStage(): void {
    if (!this.showTNMComponents()) { return; }

    const t = this.stagingForm.get('tComponent')?.value;
    const n = this.stagingForm.get('nComponent')?.value;
    const m = this.stagingForm.get('mComponent')?.value;

    if (!((t && n ) && m)) {
      this.calculatedStage = null;
      return;
    }

    // Simplified stage calculation logic
    this.calculatedStage = this.calculateStageFromTNM(t, n, m);
    
    // Find corresponding staging concept
    const stageNumber = this.calculatedStage?.replace('Stage ', '');
    this.selectedStage = this.STAGING_CONCEPTS.find(
      stage => stage.stage === stageNumber
    ) || null;

    if (this.selectedStage) {
      this.emitStagingSelection();
    }
  }

  private calculateStageFromTNM(t: string, n: string, m: string): string {
    // Simplified TNM to stage calculation
    if (m === 'M1') { return 'Stage IV'; }
    if (t === 'Tis' && n === 'N0' && m === 'M0') { return 'Stage 0'; }
    if (t === 'T1' && n === 'N0' && m === 'M0') { return 'Stage I'; }
    if ((t === 'T2' || t === 'T1') && n === 'N0' && m === 'M0') { return 'Stage I'; }
    if ((t === 'T3' || t === 'T2') && n === 'N0' && m === 'M0') { return 'Stage II'; }
    if (n === 'N1' || n === 'N2') { return 'Stage III'; }
    if (n === 'N3') { return 'Stage III'; }
    if (t === 'T4') { return 'Stage III'; }
    
    return 'Stage Unknown';
  }

  getTNMString(): string {
    const t = this.stagingForm.get('tComponent')?.value || '';
    const n = this.stagingForm.get('nComponent')?.value || '';
    const m = this.stagingForm.get('mComponent')?.value || '';
    
    if (!((t || n ) || m)) { return ''; }
    
    return `${t}${n}${m}`.trim();
  }

  private emitStagingSelection(): void {
    if (!this.selectedStage) { return; }

    const stagingSystem = this.stagingForm.get('stagingSystem')?.value;
    const additionalNotes = this.stagingForm.get('additionalNotes')?.value;

    const selection: StagingSelection = {
      stagingSystem,
      stage: this.selectedStage,
      tComponent: this.stagingForm.get('tComponent')?.value || undefined,
      nComponent: this.stagingForm.get('nComponent')?.value || undefined,
      mComponent: this.stagingForm.get('mComponent')?.value || undefined,
      codeableConcept: this.terminologyService.createCodeableConcept(
        this.selectedStage.code,
        this.selectedStage.display,
        this.selectedStage.system
      ),
      additionalNotes: additionalNotes || undefined
    };

    this.stagingSelected.emit(selection);
  }

  private async validateCurrentSelection(): Promise<void> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate staging system selection
    const stagingSystem = this.stagingForm.get('stagingSystem')?.value;
    if (this.required && !stagingSystem) {
      errors.push('Staging system is required');
    }

    // Validate TNM components if applicable
    if (this.showTNMComponents()) {
      const t = this.stagingForm.get('tComponent')?.value;
      const n = this.stagingForm.get('nComponent')?.value;
      const m = this.stagingForm.get('mComponent')?.value;

      if (stagingSystem && (!((t && n ) && m))) {
        warnings.push('All TNM components should be specified for complete staging');
      }

      // Validate TNM combination logic
      if (t && n && m) {
        const validationResult = this.validateTNMCombination(t, n, m);
        errors.push(...validationResult.errors);
        warnings.push(...validationResult.warnings);
      }
    }

    // Validate selected stage concept
    if (this.selectedStage) {
      try {
        const conceptValidation = await this.terminologyService.validateDiagnosisCode(
          this.selectedStage.code,
          this.selectedStage.system
        );
        
        if (!conceptValidation.isValid) {
          errors.push(...conceptValidation.errors);
        }
        warnings.push(...conceptValidation.warnings);
      } catch (_error) {
        errors.push('Failed to validate staging concept');
      }
    }

    this.validationResult = {
      isValid: errors.length === 0,
      concept: this.selectedStage || undefined,
      errors,
      warnings
    };

    this.validationChange.emit(this.validationResult);
  }

  private validateTNMCombination(t: string, n: string, m: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for impossible combinations
    if (t === 'T0' && (n !== 'N0' || m !== 'M0')) {
      errors.push('T0 (no primary tumor) should have N0 and M0');
    }

    if (t === 'Tis' && n !== 'N0') {
      errors.push('Carcinoma in situ (Tis) should have N0');
    }

    if (m === 'M1' && this.calculatedStage !== 'Stage IV') {
      warnings.push('Distant metastasis (M1) typically indicates Stage IV');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  hasValidSelection(): boolean {
    return !!(this.selectedStage || (this.showTNMComponents() && this.calculatedStage));
  }

  // Public methods for external control
  reset(): void {
    this.stagingForm.reset();
    this.selectedStage = null;
    this.calculatedStage = null;
    this.availableStages = [];
    this.validationResult = null;
  }

  setStaging(staging: StagingSelection): void {
    this.stagingForm.patchValue({
      stagingSystem: staging.stagingSystem,
      tComponent: staging.tComponent,
      nComponent: staging.nComponent,
      mComponent: staging.mComponent,
      additionalNotes: staging.additionalNotes
    });
    this.selectedStage = staging.stage;
    this.loadStagesForSystem(staging.stagingSystem);
    this.calculateOverallStage();
  }

  isValid(): boolean {
    return this.stagingForm.valid && (this.validationResult?.isValid ?? false);
  }

  getCurrentSelection(): StagingSelection | null {
    if (!this.hasValidSelection()) { return null; }

    return {
      stagingSystem: this.stagingForm.get('stagingSystem')?.value,
      stage: this.selectedStage!,
      tComponent: this.stagingForm.get('tComponent')?.value || undefined,
      nComponent: this.stagingForm.get('nComponent')?.value || undefined,
      mComponent: this.stagingForm.get('mComponent')?.value || undefined,
      codeableConcept: this.selectedStage ? this.terminologyService.createCodeableConcept(
        this.selectedStage.code,
        this.selectedStage.display,
        this.selectedStage.system
      ) : undefined,
      additionalNotes: this.stagingForm.get('additionalNotes')?.value
    };
  }
}