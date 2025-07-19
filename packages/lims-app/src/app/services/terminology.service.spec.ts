import { TestBed } from '@angular/core/testing';
import { TerminologyService, SNOMED_CT_SYSTEM } from './terminology.service';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';

describe('TerminologyService', () => {
  let service: TerminologyService;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;
  let mockRetryService: jasmine.SpyObj<RetryService>;

  beforeEach(() => {
    const medplumSpy = jasmine.createSpyObj('MedplumService', ['searchResources', 'createResource']);
    const errorSpy = jasmine.createSpyObj('ErrorHandlingService', ['handleError']);
    const retrySpy = jasmine.createSpyObj('RetryService', ['executeWithRetry']);

    TestBed.configureTestingModule({
      providers: [
        TerminologyService,
        { provide: MedplumService, useValue: medplumSpy },
        { provide: ErrorHandlingService, useValue: errorSpy },
        { provide: RetryService, useValue: retrySpy }
      ]
    });

    service = TestBed.inject(TerminologyService);
    mockMedplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
    mockErrorHandlingService = TestBed.inject(ErrorHandlingService) as jasmine.SpyObj<ErrorHandlingService>;
    mockRetryService = TestBed.inject(RetryService) as jasmine.SpyObj<RetryService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('lookupConcept', () => {
    it('should return cached concept if available', async () => {
      const result = await service.lookupConcept('119376003', SNOMED_CT_SYSTEM);
      
      expect(result).toBeTruthy();
      expect(result?.code).toBe('119376003');
      expect(result?.display).toBe('Tissue specimen');
      expect(result?.system).toBe(SNOMED_CT_SYSTEM);
    });

    it('should return null for unknown concept', async () => {
      const result = await service.lookupConcept('unknown-code', SNOMED_CT_SYSTEM);
      
      expect(result).toBeNull();
    });
  });

  describe('searchConcepts', () => {
    it('should search concepts by display name', async () => {
      const results = await service.searchConcepts({
        query: 'tissue',
        maxResults: 10
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].display.toLowerCase()).toContain('tissue');
    });

    it('should search concepts by code', async () => {
      const results = await service.searchConcepts({
        query: '119376003',
        maxResults: 10
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].code).toBe('119376003');
    });

    it('should limit results to maxResults', async () => {
      const results = await service.searchConcepts({
        query: 'specimen',
        maxResults: 2
      });
      
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getSpecimenConcepts', () => {
    it('should return all specimen concepts when no type specified', async () => {
      const results = await service.getSpecimenConcepts();
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(concept => 'specimenType' in concept)).toBe(true);
    });

    it('should filter by specimen type', async () => {
      const results = await service.getSpecimenConcepts('tissue');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(concept => concept.specimenType === 'tissue')).toBe(true);
    });
  });

  describe('validateSpecimenCode', () => {
    it('should validate known specimen code', async () => {
      const result = await service.validateSpecimenCode('119376003', SNOMED_CT_SYSTEM);
      
      expect(result.isValid).toBe(true);
      expect(result.concept).toBeTruthy();
      expect(result.errors.length).toBe(0);
    });

    it('should invalidate unknown specimen code', async () => {
      const result = await service.validateSpecimenCode('unknown-code', SNOMED_CT_SYSTEM);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not found');
    });
  });

  describe('getDiagnosisConcepts', () => {
    it('should return all diagnosis concepts when no category specified', async () => {
      const results = await service.getDiagnosisConcepts();
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(concept => 'category' in concept)).toBe(true);
    });

    it('should filter by diagnosis category', async () => {
      const results = await service.getDiagnosisConcepts('morphology');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(concept => concept.category === 'morphology')).toBe(true);
    });
  });

  describe('getGradingConcepts', () => {
    it('should return all grading concepts when no system specified', async () => {
      const results = await service.getGradingConcepts();
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(concept => 'gradingSystem' in concept)).toBe(true);
    });

    it('should filter by grading system', async () => {
      const results = await service.getGradingConcepts('WHO');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(concept => concept.gradingSystem === 'WHO')).toBe(true);
    });
  });

  describe('createCodeableConcept', () => {
    it('should create valid CodeableConcept', () => {
      const result = service.createCodeableConcept('119376003', 'Tissue specimen', SNOMED_CT_SYSTEM);
      
      expect(result.coding).toBeTruthy();
      expect(result.coding!.length).toBe(1);
      expect(result.coding![0].system).toBe(SNOMED_CT_SYSTEM);
      expect(result.coding![0].code).toBe('119376003');
      expect(result.coding![0].display).toBe('Tissue specimen');
      expect(result.text).toBe('Tissue specimen');
    });
  });

  describe('createSpecimenCodeableConcept', () => {
    it('should create CodeableConcept from SpecimenConcept', () => {
      const specimenConcept = {
        code: '119376003',
        display: 'Tissue specimen',
        system: SNOMED_CT_SYSTEM,
        specimenType: 'tissue' as const
      };

      const result = service.createSpecimenCodeableConcept(specimenConcept);
      
      expect(result.coding).toBeTruthy();
      expect(result.coding!.length).toBe(1);
      expect(result.coding![0].code).toBe('119376003');
      expect(result.coding![0].display).toBe('Tissue specimen');
    });
  });

  describe('cache management', () => {
    it('should report cache size', () => {
      const size = service.getCacheSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should clear cache', () => {
      service.clearCache();
      const size = service.getCacheSize();
      expect(size).toBe(0);
    });
  });
});