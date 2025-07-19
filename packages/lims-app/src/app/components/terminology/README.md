# SNOMED CT Terminology Integration

This module provides SNOMED CT terminology integration for the LIMS application, enabling structured coding of specimens, diagnoses, grading, and staging.

## Components

### 1. TerminologyService

Core service for SNOMED CT terminology operations:

```typescript
import { TerminologyService } from './services/terminology.service';

// Lookup a concept
const concept = await terminologyService.lookupConcept('119376003', SNOMED_CT_SYSTEM);

// Search concepts
const results = await terminologyService.searchConcepts({
  query: 'tissue specimen',
  maxResults: 10
});

// Validate codes
const validation = await terminologyService.validateSpecimenCode('119376003');
```

### 2. SpecimenDescriptionComponent

Structured specimen description using SNOMED CT:

```html
<app-specimen-description
  [required]="true"
  (descriptionChanged)="onSpecimenDescriptionChanged($event)"
  (validationChange)="onValidationChanged($event)">
</app-specimen-description>
```

```typescript
onSpecimenDescriptionChanged(description: SpecimenDescription) {
  console.log('Specimen type:', description.specimenType.display);
  console.log('Anatomical site:', description.anatomicalSite?.display);
  console.log('Generated description:', description.codeableConcepts);
}
```

### 3. GradingSelectorComponent

Histologic grading with validation:

```html
<app-grading-selector
  [required]="false"
  (gradingSelected)="onGradingSelected($event)"
  (validationChange)="onGradingValidationChanged($event)">
</app-grading-selector>
```

```typescript
onGradingSelected(grading: GradingSelection) {
  console.log('Grading system:', grading.gradingSystem);
  console.log('Grade:', grading.grade.display);
  console.log('SNOMED CT code:', grading.grade.code);
}
```

### 4. StagingSelectorComponent

Cancer staging with TNM support:

```html
<app-staging-selector
  [required]="false"
  (stagingSelected)="onStagingSelected($event)"
  (validationChange)="onStagingValidationChanged($event)">
</app-staging-selector>
```

```typescript
onStagingSelected(staging: StagingSelection) {
  console.log('Staging system:', staging.stagingSystem);
  console.log('TNM:', staging.tComponent, staging.nComponent, staging.mComponent);
  console.log('Overall stage:', staging.stage.display);
}
```

### 5. TerminologyValidatorDirective

Form validation directive:

```html
<input 
  type="text" 
  formControlName="specimenCode"
  appTerminologyValidator
  [conceptType]="'specimen'"
  [required]="true"
  [showValidationMessages]="true">
```

## Integration Examples

### Specimen Accessioning Integration

```typescript
// In specimen-accessioning.component.ts
import { SpecimenDescription } from '../components/terminology/specimen-description.component';

export class SpecimenAccessioningComponent {
  specimenDescription: SpecimenDescription | null = null;

  onSpecimenDescriptionChanged(description: SpecimenDescription) {
    this.specimenDescription = description;
    
    // Update specimen form with structured data
    this.specimenForm.patchValue({
      specimenType: description.specimenType.code,
      anatomicalSite: description.anatomicalSite?.code,
      description: this.generateDescription(description)
    });
  }

  private generateDescription(description: SpecimenDescription): string {
    let text = description.specimenType.display;
    
    if (description.anatomicalSite) {
      text += ` from ${description.anatomicalSite.display}`;
    }
    
    if (description.procedure) {
      text += ` obtained by ${description.procedure.display}`;
    }
    
    return text;
  }
}
```

### Pathology Report Integration

```typescript
// In pathology-report.component.ts
import { GradingSelection, StagingSelection } from '../modules/terminology.module';

export class PathologyReportComponent {
  grading: GradingSelection | null = null;
  staging: StagingSelection | null = null;

  onGradingSelected(grading: GradingSelection) {
    this.grading = grading;
    this.updateDiagnosticReport();
  }

  onStagingSelected(staging: StagingSelection) {
    this.staging = staging;
    this.updateDiagnosticReport();
  }

  private updateDiagnosticReport() {
    const observations: Observation[] = [];

    // Add grading observation
    if (this.grading) {
      observations.push({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '33732-9',
            display: 'Histologic grade'
          }]
        },
        valueCodeableConcept: this.grading.codeableConcept
      });
    }

    // Add staging observation
    if (this.staging) {
      observations.push({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '21908-9',
            display: 'Stage group'
          }]
        },
        valueCodeableConcept: this.staging.codeableConcept
      });
    }

    // Update diagnostic report with structured observations
    this.updateReport(observations);
  }
}
```

## FHIR Integration

The terminology components generate FHIR-compliant CodeableConcept structures:

```typescript
// Example CodeableConcept for tissue specimen
{
  "coding": [{
    "system": "http://snomed.info/sct",
    "code": "119376003",
    "display": "Tissue specimen"
  }],
  "text": "Tissue specimen"
}

// Example CodeableConcept for WHO Grade II
{
  "coding": [{
    "system": "http://snomed.info/sct",
    "code": "1663004",
    "display": "Grade II"
  }],
  "text": "Grade II"
}
```

## Validation Features

- Real-time SNOMED CT code validation
- Concept lookup and display
- Hierarchical concept relationships
- System-specific validation rules
- User-friendly error messages
- Suggestion of similar concepts

## Styling

The components include comprehensive SCSS styling with:
- Responsive design
- Dark theme support
- Print styles
- High contrast mode
- Accessibility features

## Testing

Run the terminology service tests:

```bash
npm test -- --include="**/terminology.service.spec.ts"
```

## Demo

View the complete integration demo:

```html
<app-terminology-demo></app-terminology-demo>
```

This demonstrates all components working together with validation and FHIR output.