import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

// Services
import { TerminologyService } from '../services/terminology.service';

// Components
import { GradingSelectorComponent } from '../components/terminology/grading-selector.component';
import { StagingSelectorComponent } from '../components/terminology/staging-selector.component';
import { SpecimenDescriptionComponent } from '../components/terminology/specimen-description.component';
import { TerminologyDemoComponent } from '../components/terminology/terminology-demo.component';

// Directives
import { TerminologyValidatorDirective } from '../directives/terminology-validator.directive';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    // Import standalone components
    GradingSelectorComponent,
    StagingSelectorComponent,
    SpecimenDescriptionComponent,
    TerminologyDemoComponent,
    // Import standalone directive
    TerminologyValidatorDirective
  ],
  providers: [
    TerminologyService
  ],
  exports: [
    // Export components for use in other modules
    GradingSelectorComponent,
    StagingSelectorComponent,
    SpecimenDescriptionComponent,
    TerminologyDemoComponent,
    
    // Export directive for use in templates
    TerminologyValidatorDirective
  ]
})
export class TerminologyModule { }

// Export interfaces and types for use in other modules
export {
  TerminologyService,
  SNOMED_CT_SYSTEM,
  TERMINOLOGY_SYSTEMS
} from '../services/terminology.service';

export type {
  SnomedConcept,
  SpecimenConcept,
  DiagnosisConcept,
  GradingConcept,
  StagingConcept,
  ValidationResult,
  TerminologySearchParams
} from '../services/terminology.service';

export type { GradingSelection } from '../components/terminology/grading-selector.component';
export type { StagingSelection } from '../components/terminology/staging-selector.component';
export type { SpecimenDescription } from '../components/terminology/specimen-description.component';