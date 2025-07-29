import { Injectable, inject } from '@angular/core';
import { CodeableConcept, ValueSet } from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { ErrorHandlingService } from './error-handling.service';

// SNOMED CT System URI
export const SNOMED_CT_SYSTEM = 'http://snomed.info/sct';

// Common SNOMED CT Code Systems
export const TERMINOLOGY_SYSTEMS = {
  SNOMED_CT: 'http://snomed.info/sct',
  LOINC: 'http://loinc.org',
  ICD_10: 'http://hl7.org/fhir/sid/icd-10',
  CPT: 'http://www.ama-assn.org/go/cpt',
  UCUM: 'http://unitsofmeasure.org'
} as const;

// SNOMED CT Concept interfaces
export interface SnomedConcept {
  code: string;
  display: string;
  system: string;
  definition?: string;
  synonyms?: string[];
  children?: SnomedConcept[];
  parents?: SnomedConcept[];
  relationships?: ConceptRelationship[];
}

export interface ConceptRelationship {
  type: string;
  target: SnomedConcept;
  description?: string;
}

// Specimen-specific SNOMED CT concepts
export interface SpecimenConcept extends SnomedConcept {
  specimenType: 'tissue' | 'fluid' | 'cell' | 'microorganism' | 'other';
  anatomicalSite?: SnomedConcept;
  morphology?: SnomedConcept;
  procedure?: SnomedConcept;
}

// Diagnosis and grading concepts
export interface DiagnosisConcept extends SnomedConcept {
  category: 'morphology' | 'etiology' | 'topography' | 'function';
  severity?: GradingConcept;
  stage?: StagingConcept;
}

export interface GradingConcept extends SnomedConcept {
  gradingSystem: string;
  grade: string;
  numericValue?: number;
  description: string;
}

export interface StagingConcept extends SnomedConcept {
  stagingSystem: string;
  stage: string;
  tComponent?: string;
  nComponent?: string;
  mComponent?: string;
  description: string;
}

// Search and validation interfaces
export interface TerminologySearchParams {
  query: string;
  system?: string;
  maxResults?: number;
  includeChildren?: boolean;
  includeParents?: boolean;
  filter?: {
    category?: string;
    domain?: string;
    active?: boolean;
  };
}

export interface ValidationResult {
  isValid: boolean;
  concept?: SnomedConcept;
  errors: string[];
  warnings: string[];
  suggestions?: SnomedConcept[];
}

@Injectable({
  providedIn: 'root'
})
export class TerminologyService {
  private errorHandlingService = inject(ErrorHandlingService);

  private conceptCache = new Map<string, SnomedConcept>();
  private valueSetCache = new Map<string, ValueSet>();
  private isInitialized$ = new BehaviorSubject<boolean>(false);

  // Common specimen type concepts
  private readonly COMMON_SPECIMEN_CONCEPTS: SpecimenConcept[] = [
    {
      code: '119376003',
      display: 'Tissue specimen',
      system: SNOMED_CT_SYSTEM,
      specimenType: 'tissue',
      definition: 'A specimen consisting of tissue'
    },
    {
      code: '119297000',
      display: 'Blood specimen',
      system: SNOMED_CT_SYSTEM,
      specimenType: 'fluid',
      definition: 'A specimen of blood'
    },
    {
      code: '119342007',
      display: 'Saliva specimen',
      system: SNOMED_CT_SYSTEM,
      specimenType: 'fluid',
      definition: 'A specimen of saliva'
    },
    {
      code: '119295008',
      display: 'Specimen obtained by aspiration',
      system: SNOMED_CT_SYSTEM,
      specimenType: 'fluid',
      definition: 'A specimen obtained by aspiration procedure'
    }
  ];

  // Common diagnosis concepts for pathology
  private readonly COMMON_DIAGNOSIS_CONCEPTS: DiagnosisConcept[] = [
    {
      code: '86049000',
      display: 'Malignant neoplasm, primary',
      system: SNOMED_CT_SYSTEM,
      category: 'morphology',
      definition: 'A primary malignant neoplasm'
    },
    {
      code: '21594007',
      display: 'Benign neoplasm',
      system: SNOMED_CT_SYSTEM,
      category: 'morphology',
      definition: 'A benign neoplasm'
    },
    {
      code: '128462008',
      display: 'Metastatic malignant neoplasm',
      system: SNOMED_CT_SYSTEM,
      category: 'morphology',
      definition: 'A metastatic malignant neoplasm'
    }
  ];

  // Grading systems
  private readonly GRADING_CONCEPTS: GradingConcept[] = [
    {
      code: '12619005',
      display: 'Grade I',
      system: SNOMED_CT_SYSTEM,
      gradingSystem: 'WHO',
      grade: 'I',
      numericValue: 1,
      description: 'Well differentiated, low grade'
    },
    {
      code: '1663004',
      display: 'Grade II',
      system: SNOMED_CT_SYSTEM,
      gradingSystem: 'WHO',
      grade: 'II',
      numericValue: 2,
      description: 'Moderately differentiated, intermediate grade'
    },
    {
      code: '61026006',
      display: 'Grade III',
      system: SNOMED_CT_SYSTEM,
      gradingSystem: 'WHO',
      grade: 'III',
      numericValue: 3,
      description: 'Poorly differentiated, high grade'
    }
  ];

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      // Pre-populate cache with common concepts
      for (const concept of this.COMMON_SPECIMEN_CONCEPTS) {
        this.conceptCache.set(concept.code, concept);
      }

      for (const concept of this.COMMON_DIAGNOSIS_CONCEPTS) {
        this.conceptCache.set(concept.code, concept);
      }

      for (const concept of this.GRADING_CONCEPTS) {
        this.conceptCache.set(concept.code, concept);
      }

      this.isInitialized$.next(true);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'terminology-initialization');
      throw error;
    }
  }

  // Core terminology lookup methods
  async lookupConcept(code: string, system: string = SNOMED_CT_SYSTEM): Promise<SnomedConcept | null> {
    try {
      // Check cache first
      const cacheKey = `${system}|${code}`;
      const cachedConcept = this.conceptCache.get(cacheKey);
      if (cachedConcept) {
        return cachedConcept;
      }

      // For now, return mock data - in production this would call Medplum's terminology service
      const mockConcept = this.getMockConcept(code, system);
      if (mockConcept) {
        this.conceptCache.set(cacheKey, mockConcept);
        return mockConcept;
      }

      return null;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'concept-lookup');
      return null;
    }
  }

  async searchConcepts(params: TerminologySearchParams): Promise<SnomedConcept[]> {
    try {
      const results: SnomedConcept[] = [];
      const query = params.query.toLowerCase();
      const maxResults = params.maxResults || 20;

      // Search in cached concepts
      for (const concept of this.conceptCache.values()) {
        if (results.length >= maxResults) {
          break;
        }

        if (concept.display.toLowerCase().includes(query) ||
            concept.code.includes(query) ||
            concept.synonyms?.some(syn => syn.toLowerCase().includes(query))) {
          
          // Apply filters if specified
          if (this.matchesFilter(concept, params.filter)) {
            results.push(concept);
          }
        }
      }

      return results;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'concept-search');
      return [];
    }
  }

  // Specimen-specific methods
  async getSpecimenConcepts(specimenType?: string): Promise<SpecimenConcept[]> {
    const concepts = this.COMMON_SPECIMEN_CONCEPTS;
    
    if (specimenType) {
      return concepts.filter(concept => concept.specimenType === specimenType);
    }
    
    return concepts;
  }

  async validateSpecimenCode(code: string, system: string = SNOMED_CT_SYSTEM): Promise<ValidationResult> {
    try {
      const concept = await this.lookupConcept(code, system);
      
      if (!concept) {
        return {
          isValid: false,
          errors: [`Code ${code} not found in system ${system}`],
          warnings: [],
          suggestions: await this.getSimilarConcepts(code)
        };
      }

      // Additional validation for specimen concepts
      const isSpecimenConcept = this.isValidSpecimenConcept(concept);
      
      return {
        isValid: isSpecimenConcept,
        concept,
        errors: isSpecimenConcept ? [] : ['Code is not a valid specimen concept'],
        warnings: []
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation failed: ${error}`],
        warnings: []
      };
    }
  }

  // Diagnosis and grading methods
  async getDiagnosisConcepts(category?: string): Promise<DiagnosisConcept[]> {
    const concepts = this.COMMON_DIAGNOSIS_CONCEPTS;
    
    if (category) {
      return concepts.filter(concept => concept.category === category);
    }
    
    return concepts;
  }

  async getGradingConcepts(gradingSystem?: string): Promise<GradingConcept[]> {
    const concepts = this.GRADING_CONCEPTS;
    
    if (gradingSystem) {
      return concepts.filter(concept => concept.gradingSystem === gradingSystem);
    }
    
    return concepts;
  }

  async validateDiagnosisCode(code: string, system: string = SNOMED_CT_SYSTEM): Promise<ValidationResult> {
    try {
      const concept = await this.lookupConcept(code, system);
      
      if (!concept) {
        return {
          isValid: false,
          errors: [`Diagnosis code ${code} not found in system ${system}`],
          warnings: [],
          suggestions: await this.getSimilarConcepts(code)
        };
      }

      const isDiagnosisConcept = this.isValidDiagnosisConcept(concept);
      
      return {
        isValid: isDiagnosisConcept,
        concept,
        errors: isDiagnosisConcept ? [] : ['Code is not a valid diagnosis concept'],
        warnings: []
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Diagnosis validation failed: ${error}`],
        warnings: []
      };
    }
  }

  // CodeableConcept creation helpers
  createCodeableConcept(code: string, display: string, system: string = SNOMED_CT_SYSTEM): CodeableConcept {
    return {
      coding: [{
        system,
        code,
        display
      }],
      text: display
    };
  }

  createSpecimenCodeableConcept(specimenConcept: SpecimenConcept): CodeableConcept {
    return this.createCodeableConcept(
      specimenConcept.code,
      specimenConcept.display,
      specimenConcept.system
    );
  }

  createDiagnosisCodeableConcept(diagnosisConcept: DiagnosisConcept): CodeableConcept {
    const codeableConcept = this.createCodeableConcept(
      diagnosisConcept.code,
      diagnosisConcept.display,
      diagnosisConcept.system
    );

    // Add additional coding for grading if available
    if (diagnosisConcept.severity) {
      if (codeableConcept.coding) {
        codeableConcept.coding.push({
        system: SNOMED_CT_SYSTEM,
        code: diagnosisConcept.severity.code,
        display: diagnosisConcept.severity.display
        });
      }
    }

    return codeableConcept;
  }

  // Validation helpers
  async validateCodeableConcept(codeableConcept: CodeableConcept): Promise<ValidationResult> {
    if (!codeableConcept.coding || codeableConcept.coding.length === 0) {
      return {
        isValid: false,
        errors: ['CodeableConcept must have at least one coding'],
        warnings: []
      };
    }

    const primaryCoding = codeableConcept.coding[0];
    
    if (!(primaryCoding.code && primaryCoding.system)) {
      return {
        isValid: false,
        errors: ['Primary coding must have both code and system'],
        warnings: []
      };
    }

    return await this.validateSpecimenCode(primaryCoding.code, primaryCoding.system);
  }

  // Utility methods
  private getMockConcept(code: string, _system: string): SnomedConcept | null {
    // This would be replaced with actual Medplum terminology service calls
    const mockConcepts: { [key: string]: SnomedConcept } = {
      '119376003': {
        code: '119376003',
        display: 'Tissue specimen',
        system: SNOMED_CT_SYSTEM,
        definition: 'A specimen consisting of tissue'
      },
      '86049000': {
        code: '86049000',
        display: 'Malignant neoplasm, primary',
        system: SNOMED_CT_SYSTEM,
        definition: 'A primary malignant neoplasm'
      }
    };

    return mockConcepts[code] || null;
  }

  private matchesFilter(concept: SnomedConcept, filter?: { category?: string; domain?: string }): boolean {
    if (!filter) {
      return true;
    }

    // Apply category filter for diagnosis concepts
    if (filter.category && 'category' in concept) {
      return (concept as DiagnosisConcept).category === filter.category;
    }

    // Apply domain filter for specimen concepts
    if (filter.domain && 'specimenType' in concept) {
      return (concept as SpecimenConcept).specimenType === filter.domain;
    }

    return true;
  }

  private isValidSpecimenConcept(concept: SnomedConcept): boolean {
    // Check if concept is in specimen hierarchy
    const specimenRootCodes = ['123038009', '119376003', '119297000']; // Specimen, Tissue specimen, Blood specimen
    return specimenRootCodes.includes(concept.code) || 
           concept.display.toLowerCase().includes('specimen');
  }

  private isValidDiagnosisConcept(concept: SnomedConcept): boolean {
    // Check if concept is in diagnosis/morphology hierarchy
    const diagnosisRootCodes = ['64572001', '86049000', '21594007']; // Disease, Malignant neoplasm, Benign neoplasm
    return diagnosisRootCodes.includes(concept.code) ||
           concept.display.toLowerCase().includes('neoplasm') ||
           concept.display.toLowerCase().includes('carcinoma') ||
           concept.display.toLowerCase().includes('adenoma');
  }

  private async getSimilarConcepts(code: string): Promise<SnomedConcept[]> {
    // Simple similarity search - in production would use proper terminology service
    const results: SnomedConcept[] = [];
    
    for (const concept of this.conceptCache.values()) {
      if (concept.code.includes(code.substring(0, 3)) || 
          concept.display.toLowerCase().includes(code.toLowerCase())) {
        results.push(concept);
        if (results.length >= 5) {
          break;
        }
      }
    }
    
    return results;
  }

  // Observable getters
  getInitializationStatus(): Observable<boolean> {
    return this.isInitialized$.asObservable();
  }

  // Cache management
  clearCache(): void {
    this.conceptCache.clear();
    this.valueSetCache.clear();
  }

  getCacheSize(): number {
    return this.conceptCache.size;
  }
}