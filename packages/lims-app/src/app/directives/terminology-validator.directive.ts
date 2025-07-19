import { Directive, Input, OnInit, OnDestroy, ElementRef, Renderer2 } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, Validator, ValidationErrors } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, switchMap } from 'rxjs/operators';
import { TerminologyService, ValidationResult, SNOMED_CT_SYSTEM } from '../services/terminology.service';

@Directive({
  selector: '[appTerminologyValidator]',
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: TerminologyValidatorDirective,
      multi: true
    }
  ],
  standalone: true
})
export class TerminologyValidatorDirective implements Validator, OnInit, OnDestroy {
  @Input() terminologySystem: string = SNOMED_CT_SYSTEM;
  @Input() conceptType: 'specimen' | 'diagnosis' | 'procedure' | 'any' = 'any';
  @Input() required: boolean = false;
  @Input() showValidationMessages: boolean = true;

  private destroy$ = new Subject<void>();
  private validationSubject$ = new Subject<string>();
  private currentValidationResult: ValidationResult | null = null;

  constructor(
    private terminologyService: TerminologyService,
    private elementRef: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.setupValidation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupValidation(): void {
    this.validationSubject$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500),
        switchMap(code => this.validateCode(code))
      )
      .subscribe(result => {
        this.currentValidationResult = result;
        this.updateElementAppearance(result);
      });
  }

  private async validateCode(code: string): Promise<ValidationResult> {
    if (!code) {
      return {
        isValid: !this.required,
        errors: this.required ? ['Code is required'] : [],
        warnings: []
      };
    }

    try {
      switch (this.conceptType) {
        case 'specimen':
          return await this.terminologyService.validateSpecimenCode(code, this.terminologySystem);
        case 'diagnosis':
          return await this.terminologyService.validateDiagnosisCode(code, this.terminologySystem);
        default:
          // For 'any' or 'procedure', use general concept lookup
          const concept = await this.terminologyService.lookupConcept(code, this.terminologySystem);
          return {
            isValid: !!concept,
            concept: concept || undefined,
            errors: concept ? [] : [`Code ${code} not found in ${this.terminologySystem}`],
            warnings: []
          };
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation failed: ${error}`],
        warnings: []
      };
    }
  }

  private updateElementAppearance(result: ValidationResult): void {
    if (!this.showValidationMessages) return;

    const element = this.elementRef.nativeElement;
    
    // Remove existing validation classes
    this.renderer.removeClass(element, 'terminology-valid');
    this.renderer.removeClass(element, 'terminology-invalid');
    this.renderer.removeClass(element, 'terminology-warning');

    // Remove existing validation messages
    const existingMessages = element.parentNode?.querySelectorAll('.terminology-validation-message');
    existingMessages?.forEach((msg: Element) => msg.remove());

    if (!result) return;

    // Add appropriate class
    if (result.isValid) {
      this.renderer.addClass(element, 'terminology-valid');
      if (result.warnings.length > 0) {
        this.renderer.addClass(element, 'terminology-warning');
      }
    } else {
      this.renderer.addClass(element, 'terminology-invalid');
    }

    // Add validation messages
    if (result.errors.length > 0 || result.warnings.length > 0) {
      const messageContainer = this.renderer.createElement('div');
      this.renderer.addClass(messageContainer, 'terminology-validation-message');

      if (result.errors.length > 0) {
        const errorDiv = this.renderer.createElement('div');
        this.renderer.addClass(errorDiv, 'terminology-errors');
        
        result.errors.forEach(error => {
          const errorItem = this.renderer.createElement('div');
          this.renderer.addClass(errorItem, 'terminology-error');
          this.renderer.setProperty(errorItem, 'textContent', error);
          this.renderer.appendChild(errorDiv, errorItem);
        });
        
        this.renderer.appendChild(messageContainer, errorDiv);
      }

      if (result.warnings.length > 0) {
        const warningDiv = this.renderer.createElement('div');
        this.renderer.addClass(warningDiv, 'terminology-warnings');
        
        result.warnings.forEach(warning => {
          const warningItem = this.renderer.createElement('div');
          this.renderer.addClass(warningItem, 'terminology-warning');
          this.renderer.setProperty(warningItem, 'textContent', warning);
          this.renderer.appendChild(warningDiv, warningItem);
        });
        
        this.renderer.appendChild(messageContainer, warningDiv);
      }

      // Insert message container after the input element
      this.renderer.insertBefore(element.parentNode, messageContainer, element.nextSibling);
    }

    // Show concept information if valid
    if (result.isValid && result.concept && this.showValidationMessages) {
      const conceptInfo = this.renderer.createElement('div');
      this.renderer.addClass(conceptInfo, 'terminology-concept-info');
      
      const conceptDisplay = this.renderer.createElement('div');
      this.renderer.addClass(conceptDisplay, 'concept-display');
      this.renderer.setProperty(conceptDisplay, 'textContent', result.concept.display);
      this.renderer.appendChild(conceptInfo, conceptDisplay);

      if (result.concept.definition) {
        const conceptDefinition = this.renderer.createElement('div');
        this.renderer.addClass(conceptDefinition, 'concept-definition');
        this.renderer.setProperty(conceptDefinition, 'textContent', result.concept.definition);
        this.renderer.appendChild(conceptInfo, conceptDefinition);
      }

      this.renderer.insertBefore(element.parentNode, conceptInfo, element.nextSibling);
    }
  }

  // Validator interface implementation
  validate(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return this.required ? { terminologyRequired: true } : null;
    }

    // Trigger validation
    this.validationSubject$.next(control.value);

    // Return current validation state
    if (this.currentValidationResult) {
      if (!this.currentValidationResult.isValid) {
        return {
          terminologyInvalid: {
            errors: this.currentValidationResult.errors,
            warnings: this.currentValidationResult.warnings
          }
        };
      }
    }

    return null;
  }

  // Public methods for programmatic validation
  async validateValue(value: string): Promise<ValidationResult> {
    return await this.validateCode(value);
  }

  getCurrentValidationResult(): ValidationResult | null {
    return this.currentValidationResult;
  }
}