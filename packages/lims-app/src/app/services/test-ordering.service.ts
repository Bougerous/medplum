import { Injectable } from '@angular/core';
import { 
  Questionnaire,
  QuestionnaireResponse,
  ServiceRequest, 
} from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';

export interface LabTest {
  id: string;
  name: string;
  description: string;
  code: string;
  category: string;
  loincCode?: string;
  cptCode?: string;
  price?: number;
  turnaroundTime?: number; // hours
  specimenTypes: string[];
  askOnOrderEntry?: Questionnaire;
  prerequisites?: string[];
  methodology?: string;
  referenceRanges?: ReferenceRange[];
}

export interface ReferenceRange {
  low?: number;
  high?: number;
  unit: string;
  ageMin?: number;
  ageMax?: number;
  gender?: 'male' | 'female';
  condition?: string;
}

export interface TestCategory {
  key: string;
  name: string;
  description?: string;
  tests: LabTest[];
}

export interface OrderSplitResult {
  orders: ServiceRequest[];
  specimenRequirements: SpecimenRequirement[];
  totalEstimatedCost?: number;
  estimatedTurnaroundTime?: number;
}

export interface SpecimenRequirement {
  type: string;
  volume?: number;
  unit?: string;
  container?: string;
  tests: string[];
  priority: 'routine' | 'urgent' | 'stat';
}

export interface AskOnOrderEntryData {
  questionnaire: Questionnaire;
  response?: QuestionnaireResponse;
  required: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TestOrderingService {
  private testCategories$ = new BehaviorSubject<TestCategory[]>([]);
  private availableTests$ = new BehaviorSubject<LabTest[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.loadTestCatalog();
  }

  /**
   * Load test catalog with LOINC codes
   */
  private loadTestCatalog(): void {
    const testCategories: TestCategory[] = [
      {
        key: 'hematology',
        name: 'Hematology',
        description: 'Blood cell counts and coagulation studies',
        tests: [
          {
            id: 'cbc-diff',
            name: 'Complete Blood Count with Differential',
            description: 'CBC with automated differential',
            code: 'CBC-DIFF',
            category: 'hematology',
            loincCode: '58410-2',
            cptCode: '85025',
            price: 45.00,
            turnaroundTime: 2,
            specimenTypes: ['whole-blood'],
            methodology: 'Flow cytometry',
            referenceRanges: [
              { low: 4.5, high: 11.0, unit: '10^3/uL', condition: 'WBC count' },
              { low: 4.2, high: 5.4, unit: '10^6/uL', gender: 'male', condition: 'RBC count' },
              { low: 3.6, high: 4.8, unit: '10^6/uL', gender: 'female', condition: 'RBC count' }
            ]
          },
          {
            id: 'pt-inr',
            name: 'Prothrombin Time with INR',
            description: 'PT/INR for anticoagulation monitoring',
            code: 'PT-INR',
            category: 'hematology',
            loincCode: '5902-2',
            cptCode: '85610',
            price: 25.00,
            turnaroundTime: 1,
            specimenTypes: ['plasma'],
            methodology: 'Clot-based assay',
            referenceRanges: [
              { low: 11.0, high: 13.0, unit: 'seconds', condition: 'PT' },
              { low: 0.8, high: 1.2, unit: 'ratio', condition: 'INR' }
            ]
          },
          {
            id: 'ptt',
            name: 'Partial Thromboplastin Time',
            description: 'aPTT for intrinsic pathway assessment',
            code: 'PTT',
            category: 'hematology',
            loincCode: '3173-2',
            cptCode: '85730',
            price: 20.00,
            turnaroundTime: 1,
            specimenTypes: ['plasma'],
            methodology: 'Clot-based assay'
          }
        ]
      },
      {
        key: 'chemistry',
        name: 'Clinical Chemistry',
        description: 'Metabolic panels and individual chemistry tests',
        tests: [
          {
            id: 'bmp',
            name: 'Basic Metabolic Panel',
            description: 'Glucose, BUN, creatinine, electrolytes',
            code: 'BMP',
            category: 'chemistry',
            loincCode: '51990-0',
            cptCode: '80048',
            price: 35.00,
            turnaroundTime: 4,
            specimenTypes: ['serum', 'plasma'],
            methodology: 'Ion-selective electrode'
          },
          {
            id: 'cmp',
            name: 'Comprehensive Metabolic Panel',
            description: 'BMP plus liver function tests',
            code: 'CMP',
            category: 'chemistry',
            loincCode: '24323-8',
            cptCode: '80053',
            price: 50.00,
            turnaroundTime: 4,
            specimenTypes: ['serum', 'plasma'],
            methodology: 'Automated chemistry analyzer'
          },
          {
            id: 'lipid-panel',
            name: 'Lipid Panel',
            description: 'Total cholesterol, HDL, LDL, triglycerides',
            code: 'LIPID',
            category: 'chemistry',
            loincCode: '57698-3',
            cptCode: '80061',
            price: 40.00,
            turnaroundTime: 6,
            specimenTypes: ['serum', 'plasma'],
            methodology: 'Enzymatic assay',
            askOnOrderEntry: this.createFastingQuestionnaire()
          },
          {
            id: 'hba1c',
            name: 'Hemoglobin A1c',
            description: 'Glycated hemoglobin for diabetes monitoring',
            code: 'HBA1C',
            category: 'chemistry',
            loincCode: '4548-4',
            cptCode: '83036',
            price: 30.00,
            turnaroundTime: 4,
            specimenTypes: ['whole-blood'],
            methodology: 'HPLC'
          }
        ]
      },
      {
        key: 'microbiology',
        name: 'Microbiology',
        description: 'Cultures and antimicrobial susceptibility testing',
        tests: [
          {
            id: 'urine-culture',
            name: 'Urine Culture with Sensitivity',
            description: 'Bacterial culture and antimicrobial susceptibility',
            code: 'URICX',
            category: 'microbiology',
            loincCode: '630-4',
            cptCode: '87086',
            price: 60.00,
            turnaroundTime: 48,
            specimenTypes: ['urine'],
            methodology: 'Culture and identification'
          },
          {
            id: 'blood-culture',
            name: 'Blood Culture',
            description: 'Aerobic and anaerobic blood culture',
            code: 'BLDCX',
            category: 'microbiology',
            loincCode: '600-7',
            cptCode: '87040',
            price: 80.00,
            turnaroundTime: 72,
            specimenTypes: ['whole-blood'],
            methodology: 'Automated culture system'
          }
        ]
      },
      {
        key: 'immunology',
        name: 'Immunology & Serology',
        description: 'Antibody and antigen testing',
        tests: [
          {
            id: 'hiv-screen',
            name: 'HIV 1/2 Antibody Screen',
            description: 'HIV screening test',
            code: 'HIV',
            category: 'immunology',
            loincCode: '75622-1',
            cptCode: '86703',
            price: 55.00,
            turnaroundTime: 24,
            specimenTypes: ['serum', 'plasma'],
            methodology: 'Chemiluminescent immunoassay'
          },
          {
            id: 'hbsag',
            name: 'Hepatitis B Surface Antigen',
            description: 'HBsAg screening',
            code: 'HBSAG',
            category: 'immunology',
            loincCode: '5196-1',
            cptCode: '87340',
            price: 45.00,
            turnaroundTime: 24,
            specimenTypes: ['serum', 'plasma'],
            methodology: 'Chemiluminescent immunoassay'
          }
        ]
      },
      {
        key: 'molecular',
        name: 'Molecular Diagnostics',
        description: 'PCR and genetic testing',
        tests: [
          {
            id: 'covid-pcr',
            name: 'SARS-CoV-2 PCR',
            description: 'COVID-19 molecular test',
            code: 'COVID',
            category: 'molecular',
            loincCode: '94500-6',
            cptCode: '87635',
            price: 100.00,
            turnaroundTime: 4,
            specimenTypes: ['nasopharyngeal-swab'],
            methodology: 'RT-PCR'
          },
          {
            id: 'flu-pcr',
            name: 'Influenza A/B PCR',
            description: 'Influenza molecular test',
            code: 'FLU',
            category: 'molecular',
            loincCode: '92142-9',
            cptCode: '87502',
            price: 85.00,
            turnaroundTime: 4,
            specimenTypes: ['nasopharyngeal-swab'],
            methodology: 'RT-PCR'
          }
        ]
      }
    ];

    this.testCategories$.next(testCategories);
    
    // Flatten all tests
    const allTests = testCategories.reduce((acc, category) => {
      return acc.concat(category.tests);
    }, [] as LabTest[]);
    
    this.availableTests$.next(allTests);
  }

  /**
   * Get test categories
   */
  getTestCategories(): Observable<TestCategory[]> {
    return this.testCategories$.asObservable();
  }

  /**
   * Get all available tests
   */
  getAvailableTests(): Observable<LabTest[]> {
    return this.availableTests$.asObservable();
  }

  /**
   * Get tests by category
   */
  getTestsByCategory(categoryKey: string): LabTest[] {
    const categories = this.testCategories$.value;
    const category = categories.find(cat => cat.key === categoryKey);
    return category ? category.tests : [];
  }

  /**
   * Search tests by name or code
   */
  searchTests(query: string): LabTest[] {
    const allTests = this.availableTests$.value;
    const searchTerm = query.toLowerCase();
    
    return allTests.filter(test => 
      test.name.toLowerCase().includes(searchTerm) ||
      test.code.toLowerCase().includes(searchTerm) ||
      test.description.toLowerCase().includes(searchTerm) ||
      (test.loincCode?.toLowerCase().includes(searchTerm))
    );
  }

  /**
   * Get test by ID
   */
  getTestById(testId: string): LabTest | null {
    const allTests = this.availableTests$.value;
    return allTests.find(test => test.id === testId) || null;
  }

  /**
   * Create service requests with order splitting
   */
  async createTestOrders(
    patientId: string,
    selectedTests: LabTest[],
    orderData: {
      providerId: string;
      providerName: string;
      priority: 'routine' | 'urgent' | 'stat';
      clinicalInfo?: string;
      askOnOrderEntryResponses?: { [testId: string]: QuestionnaireResponse };
    }
  ): Promise<OrderSplitResult> {
    try {
      // Group tests by specimen requirements
      const specimenGroups = this.groupTestsBySpecimen(selectedTests);
      
      // Create service requests
      const orders: ServiceRequest[] = [];
      const specimenRequirements: SpecimenRequirement[] = [];
      
      for (const group of specimenGroups) {
        for (const test of group.tests) {
          const serviceRequest: ServiceRequest = {
            resourceType: 'ServiceRequest',
            status: 'draft',
            intent: 'order',
            priority: orderData.priority,
            code: {
              coding: test.loincCode ? [{
                system: 'http://loinc.org',
                code: test.loincCode,
                display: test.name
              }] : [],
              text: test.name
            },
            subject: {
              reference: `Patient/${patientId}`
            },
            authoredOn: new Date().toISOString(),
            requester: {
              reference: `Practitioner/${orderData.providerId}`,
              display: orderData.providerName
            },
            reasonCode: orderData.clinicalInfo ? [{
              text: orderData.clinicalInfo
            }] : undefined,
            note: [{
              text: `Test: ${test.name} - ${test.description}`
            }],
            specimen: [{
              reference: `Specimen/${group.specimenType}` // This would be actual specimen reference
            }]
          };

          // Add Ask-on-Order-Entry response if provided
          if (orderData.askOnOrderEntryResponses?.[test.id]) {
            serviceRequest.supportingInfo = [{
              reference: `QuestionnaireResponse/${orderData.askOnOrderEntryResponses[test.id].id}`
            }];
          }

          const createdOrder = await this.medplumService.createResource(serviceRequest);
          orders.push(createdOrder);
        }

        specimenRequirements.push({
          type: group.specimenType,
          volume: group.totalVolume,
          unit: 'mL',
          container: this.getRecommendedContainer(group.specimenType),
          tests: group.tests.map(t => t.name),
          priority: orderData.priority
        });
      }

      // Calculate totals
      const totalEstimatedCost = selectedTests.reduce((sum, test) => sum + (test.price || 0), 0);
      const estimatedTurnaroundTime = Math.max(...selectedTests.map(test => test.turnaroundTime || 24));

      return {
        orders,
        specimenRequirements,
        totalEstimatedCost,
        estimatedTurnaroundTime
      };

    } catch (error) {
      this.errorHandlingService.handleError(error, 'test-ordering');
      throw error;
    }
  }

  /**
   * Get Ask-on-Order-Entry questionnaire for test
   */
  getAskOnOrderEntryQuestionnaire(testId: string): AskOnOrderEntryData | null {
    const test = this.getTestById(testId);
    if (!(test?.askOnOrderEntry)) {
      return null;
    }

    return {
      questionnaire: test.askOnOrderEntry,
      required: true
    };
  }

  /**
   * Validate test prerequisites
   */
  validateTestPrerequisites(selectedTests: LabTest[]): { valid: boolean; missingPrerequisites: string[] } {
    const selectedTestIds = selectedTests.map(t => t.id);
    const missingPrerequisites: string[] = [];

    for (const test of selectedTests) {
      if (test.prerequisites) {
        for (const prerequisite of test.prerequisites) {
          if (!selectedTestIds.includes(prerequisite)) {
            const prereqTest = this.getTestById(prerequisite);
            if (prereqTest) {
              missingPrerequisites.push(`${test.name} requires ${prereqTest.name}`);
            }
          }
        }
      }
    }

    return {
      valid: missingPrerequisites.length === 0,
      missingPrerequisites
    };
  }

  /**
   * Get estimated turnaround time for test combination
   */
  getEstimatedTurnaroundTime(selectedTests: LabTest[]): number {
    if (selectedTests.length === 0) { return 0; }
    return Math.max(...selectedTests.map(test => test.turnaroundTime || 24));
  }

  /**
   * Get total estimated cost
   */
  getTotalEstimatedCost(selectedTests: LabTest[]): number {
    return selectedTests.reduce((sum, test) => sum + (test.price || 0), 0);
  }

  /**
   * Group tests by specimen requirements
   */
  private groupTestsBySpecimen(tests: LabTest[]): Array<{
    specimenType: string;
    tests: LabTest[];
    totalVolume: number;
  }> {
    const groups: { [specimenType: string]: LabTest[] } = {};

    // Group tests by primary specimen type
    for (const test of tests) {
      const primarySpecimen = test.specimenTypes[0];
      if (!groups[primarySpecimen]) {
        groups[primarySpecimen] = [];
      }
      groups[primarySpecimen].push(test);
    }

    // Convert to array format with volume calculations
    return Object.entries(groups).map(([specimenType, groupTests]) => ({
      specimenType,
      tests: groupTests,
      totalVolume: this.calculateRequiredVolume(groupTests, specimenType)
    }));
  }

  /**
   * Calculate required specimen volume
   */
  private calculateRequiredVolume(tests: LabTest[], specimenType: string): number {
    // Base volumes by specimen type (in mL)
    const baseVolumes: { [key: string]: number } = {
      'serum': 0.5,
      'plasma': 0.5,
      'whole-blood': 2.0,
      'urine': 10.0,
      'nasopharyngeal-swab': 0.1
    };

    const baseVolume = baseVolumes[specimenType] || 1.0;
    const testCount = tests.length;
    
    // Add 0.2mL per additional test, minimum 0.5mL
    return Math.max(baseVolume + (testCount - 1) * 0.2, 0.5);
  }

  /**
   * Get recommended container for specimen type
   */
  private getRecommendedContainer(specimenType: string): string {
    const containers: { [key: string]: string } = {
      'serum': 'Red top tube (no additive)',
      'plasma': 'Lavender top tube (EDTA)',
      'whole-blood': 'Lavender top tube (EDTA)',
      'urine': 'Sterile urine container',
      'nasopharyngeal-swab': 'Viral transport medium'
    };

    return containers[specimenType] || 'Appropriate collection container';
  }

  /**
   * Create fasting questionnaire for lipid panel
   */
  private createFastingQuestionnaire(): Questionnaire {
    return {
      resourceType: 'Questionnaire',
      id: 'fasting-questionnaire',
      status: 'active',
      title: 'Fasting Status',
      description: 'Patient fasting status for lipid testing',
      item: [
        {
          linkId: 'fasting-status',
          text: 'Has the patient been fasting for at least 9-12 hours?',
          type: 'boolean',
          required: true
        },
        {
          linkId: 'last-meal-time',
          text: 'When was the patient\'s last meal?',
          type: 'dateTime',
          enableWhen: [{
            question: 'fasting-status',
            operator: '=',
            answerBoolean: false
          }]
        },
        {
          linkId: 'medications',
          text: 'List any medications taken in the last 24 hours',
          type: 'text'
        }
      ]
    };
  }
}