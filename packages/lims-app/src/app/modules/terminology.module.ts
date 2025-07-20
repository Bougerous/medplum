import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
// Components
import { GradingSelectorComponent } from '../components/terminology/grading-selector.component';
import { SpecimenDescriptionComponent } from '../components/terminology/specimen-description.component';
import { StagingSelectorComponent } from '../components/terminology/staging-selector.component';
import { TerminologyDemoComponent } from '../components/terminology/terminology-demo.component';
// Directives
import { TerminologyValidatorDirective } from '../directives/terminology-validator.directive';
// Services
import { TerminologyService } from '../services/terminology.service';

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


export type { GradingSelection } from '../components/terminology/grading-selector.component';
export type { SpecimenDescription } from '../components/terminology/specimen-description.component';
export type { StagingSelection } from '../components/terminology/staging-selector.component';
export type {
  DiagnosisConcept,
  GradingConcept,
  SnomedConcept,
  SpecimenConcept,
  StagingConcept,
  TerminologySearchParams, 
  ValidationResult
} from '../services/terminology.service';
// Export interfaces and types for use in other modules
export {
  SNOMED_CT_SYSTEM,
  TERMINOLOGY_SYSTEMS, 
  TerminologyService
} from '../services/terminology.service';