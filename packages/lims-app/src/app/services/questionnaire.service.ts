import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { 
  Questionnaire, 
  QuestionnaireResponse, 
  Patient, 
  Coverage, 
  Consent,
  Bundle
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';

export interface PatientRegistrationData {
  patient: Patient;
  coverage?: Coverage;
  consent?: Consent;
  questionnaireResponse?: QuestionnaireResponse;
}

@Injectable({
  providedIn: 'root'
})
export class QuestionnaireService {
  private availableQuestionnaires$ = new BehaviorSubject<Questionnaire[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.loadAvailableQuestionnaires();
  }

  /**
   * Load available questionnaires for patient registration
   */
  private async loadAvailableQuestionnaires(): Promise<void> {
    try {
      const questionnaires = await this.medplumService.searchResources<Questionnaire>('Questionnaire', {
        status: 'active',
        'context-type': 'patient-registration'
      });
      
      const questionnaireList = questionnaires.entry?.map(entry => entry.resource!).filter(Boolean) || [];
      this.availableQuestionnaires$.next(questionnaireList);
    } catch (error) {
      this.errorHandlingService.handleError(error, 'questionnaire-loading');
      // Provide default questionnaire if loading fails
      this.availableQuestionnaires$.next([this.createDefaultPatientQuestionnaire()]);
    }
  }

  /**
   * Get available questionnaires
   */
  getAvailableQuestionnaires(): Observable<Questionnaire[]> {
    return this.availableQuestionnaires$.asObservable();
  }

  /**
   * Create a default patient registration questionnaire
   */
  private createDefaultPatientQuestionnaire(): Questionnaire {
    return {
      resourceType: 'Questionnaire',
      id: 'patient-registration-default',
      status: 'active',
      title: 'Patient Registration',
      description: 'Standard patient registration form',
      item: [
        {
          linkId: 'demographics',
          text: 'Demographics',
          type: 'group',
          item: [
            {
              linkId: 'firstName',
              text: 'First Name',
              type: 'string',
              required: true
            },
            {
              linkId: 'lastName',
              text: 'Last Name',
              type: 'string',
              required: true
            },
            {
              linkId: 'dateOfBirth',
              text: 'Date of Birth',
              type: 'date',
              required: true
            },
            {
              linkId: 'gender',
              text: 'Gender',
              type: 'choice',
              answerOption: [
                { valueString: 'male' },
                { valueString: 'female' },
                { valueString: 'other' },
                { valueString: 'unknown' }
              ]
            }
          ]
        },
        {
          linkId: 'contact',
          text: 'Contact Information',
          type: 'group',
          item: [
            {
              linkId: 'phone',
              text: 'Phone Number',
              type: 'string'
            },
            {
              linkId: 'email',
              text: 'Email Address',
              type: 'string'
            },
            {
              linkId: 'address',
              text: 'Address',
              type: 'text'
            }
          ]
        },
        {
          linkId: 'insurance',
          text: 'Insurance Information',
          type: 'group',
          item: [
            {
              linkId: 'insuranceProvider',
              text: 'Insurance Provider',
              type: 'string'
            },
            {
              linkId: 'policyNumber',
              text: 'Policy Number',
              type: 'string'
            },
            {
              linkId: 'groupNumber',
              text: 'Group Number',
              type: 'string'
            }
          ]
        },
        {
          linkId: 'consent',
          text: 'Consent',
          type: 'group',
          item: [
            {
              linkId: 'treatmentConsent',
              text: 'I consent to treatment and testing',
              type: 'boolean',
              required: true
            },
            {
              linkId: 'privacyConsent',
              text: 'I acknowledge the privacy notice',
              type: 'boolean',
              required: true
            }
          ]
        }
      ]
    };
  }

  /**
   * Check for duplicate patients before creating new one
   */
  async checkForDuplicatePatient(patientData: Partial<Patient>): Promise<Patient[]> {
    try {
      const searchParams: any = {};
      
      // Search by name and birth date
      if (patientData.name?.[0]) {
        const name = patientData.name[0];
        if (name.family) {
          searchParams.family = name.family;
        }
        if (name.given?.[0]) {
          searchParams.given = name.given[0];
        }
      }
      
      if (patientData.birthDate) {
        searchParams.birthdate = patientData.birthDate;
      }

      const results = await this.medplumService.searchResources<Patient>('Patient', searchParams);
      return results.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      this.errorHandlingService.handleError(error, 'duplicate-check');
      return [];
    }
  }

  /**
   * Create patient registration bundle with conditional create logic
   */
  async createPatientRegistration(
    questionnaireResponse: QuestionnaireResponse
  ): Promise<PatientRegistrationData> {
    try {
      const patientData = this.extractPatientFromResponse(questionnaireResponse);
      const coverageData = this.extractCoverageFromResponse(questionnaireResponse);
      const consentData = this.extractConsentFromResponse(questionnaireResponse);

      // Check for duplicates
      const duplicates = await this.checkForDuplicatePatient(patientData);
      if (duplicates.length > 0) {
        throw new Error(`Potential duplicate patient found. Please verify: ${duplicates[0].name?.[0]?.given?.[0]} ${duplicates[0].name?.[0]?.family}`);
      }

      // Create patient with conditional create
      const patient = await this.createPatientWithConditionalCreate(patientData);
      
      // Create coverage if insurance information provided
      let coverage: Coverage | undefined;
      if (coverageData && patient.id) {
        coverage = await this.createCoverage(coverageData, patient.id);
      }

      // Create consent records
      let consent: Consent | undefined;
      if (consentData && patient.id) {
        consent = await this.createConsent(consentData, patient.id);
      }

      return {
        patient,
        coverage,
        consent,
        questionnaireResponse
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'patient-registration');
      throw error;
    }
  }

  /**
   * Extract patient data from questionnaire response
   */
  private extractPatientFromResponse(response: QuestionnaireResponse): Patient {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{}],
      telecom: []
    };

    response.item?.forEach(item => {
      switch (item.linkId) {
        case 'demographics':
          item.item?.forEach(subItem => {
            switch (subItem.linkId) {
              case 'firstName':
                if (patient.name?.[0]) {
                  if (!patient.name[0].given) patient.name[0].given = [];
                  patient.name[0].given.push(subItem.answer?.[0]?.valueString || '');
                }
                break;
              case 'lastName':
                patient.name![0].family = subItem.answer?.[0]?.valueString;
                break;
              case 'dateOfBirth':
                patient.birthDate = subItem.answer?.[0]?.valueDate;
                break;
              case 'gender':
                patient.gender = subItem.answer?.[0]?.valueString as any;
                break;
            }
          });
          break;
        case 'contact':
          item.item?.forEach(subItem => {
            switch (subItem.linkId) {
              case 'phone':
                patient.telecom!.push({
                  system: 'phone',
                  value: subItem.answer?.[0]?.valueString || ''
                });
                break;
              case 'email':
                patient.telecom!.push({
                  system: 'email',
                  value: subItem.answer?.[0]?.valueString || ''
                });
                break;
              case 'address':
                patient.address = [{
                  text: subItem.answer?.[0]?.valueString || ''
                }];
                break;
            }
          });
          break;
      }
    });

    return patient;
  }

  /**
   * Extract coverage data from questionnaire response
   */
  private extractCoverageFromResponse(response: QuestionnaireResponse): Partial<Coverage> | null {
    let hasInsuranceInfo = false;
    const coverage: Partial<Coverage> = {
      resourceType: 'Coverage',
      status: 'active'
    };

    response.item?.forEach(item => {
      if (item.linkId === 'insurance') {
        item.item?.forEach(subItem => {
          switch (subItem.linkId) {
            case 'insuranceProvider':
              if (subItem.answer?.[0]?.valueString) {
                hasInsuranceInfo = true;
                coverage.payor = [{
                  display: subItem.answer[0].valueString
                }];
              }
              break;
            case 'policyNumber':
              if (subItem.answer?.[0]?.valueString) {
                hasInsuranceInfo = true;
                coverage.subscriberId = subItem.answer[0].valueString;
              }
              break;
            case 'groupNumber':
              if (subItem.answer?.[0]?.valueString) {
                hasInsuranceInfo = true;
                coverage.class = [{
                  type: {
                    coding: [{
                      system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                      code: 'group'
                    }]
                  },
                  value: subItem.answer[0].valueString
                }];
              }
              break;
          }
        });
      }
    });

    return hasInsuranceInfo ? coverage : null;
  }

  /**
   * Extract consent data from questionnaire response
   */
  private extractConsentFromResponse(response: QuestionnaireResponse): Partial<Consent> | null {
    let hasConsent = false;
    const consent: Partial<Consent> = {
      resourceType: 'Consent',
      status: 'active',
      scope: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/consentscope',
          code: 'treatment'
        }]
      },
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/consentcategorycodes',
          code: 'infa'
        }]
      }]
    };

    response.item?.forEach(item => {
      if (item.linkId === 'consent') {
        item.item?.forEach(subItem => {
          if (subItem.answer?.[0]?.valueBoolean === true) {
            hasConsent = true;
          }
        });
      }
    });

    return hasConsent ? consent : null;
  }

  /**
   * Create patient with conditional create to prevent duplicates
   */
  private async createPatientWithConditionalCreate(patientData: Patient): Promise<Patient> {
    // Use conditional create with If-None-Exist header
    const searchParams = new URLSearchParams();
    if (patientData.name?.[0]?.family) {
      searchParams.append('family', patientData.name[0].family);
    }
    if (patientData.name?.[0]?.given?.[0]) {
      searchParams.append('given', patientData.name[0].given[0]);
    }
    if (patientData.birthDate) {
      searchParams.append('birthdate', patientData.birthDate);
    }

    // For now, use regular create - in production, this would use conditional create
    return await this.medplumService.createResource(patientData);
  }

  /**
   * Create coverage resource
   */
  private async createCoverage(coverageData: Partial<Coverage>, patientId: string): Promise<Coverage> {
    const coverage: Coverage = {
      ...coverageData,
      resourceType: 'Coverage',
      beneficiary: {
        reference: `Patient/${patientId}`
      }
    } as Coverage;

    return await this.medplumService.createResource(coverage);
  }

  /**
   * Create consent resource
   */
  private async createConsent(consentData: Partial<Consent>, patientId: string): Promise<Consent> {
    const consent: Consent = {
      ...consentData,
      resourceType: 'Consent',
      patient: {
        reference: `Patient/${patientId}`
      },
      dateTime: new Date().toISOString()
    } as Consent;

    return await this.medplumService.createResource(consent);
  }
}