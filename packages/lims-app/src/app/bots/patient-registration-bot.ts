import { MedplumClient } from '@medplum/core';
import { 
  QuestionnaireResponse, 
  Patient, 
  Coverage, 
  Consent,
  Bundle,
  Identifier,
  HumanName,
  ContactPoint,
  Address,
  CodeableConcept,
  Reference
} from '@medplum/fhirtypes';

/**
 * Patient Registration Automation Bot
 * 
 * Processes QuestionnaireResponse resources to automatically create:
 * - Patient resources with conditional create logic
 * - Coverage resources for insurance information
 * - Consent resources for treatment authorization
 * 
 * Includes duplicate patient prevention and merging capabilities.
 */
export async function handler(medplum: MedplumClient, event: any): Promise<any> {
  console.log('Patient Registration Bot triggered', { eventType: event.type, resourceId: event.resource?.id });
  
  try {
    const questionnaireResponse = event.input as QuestionnaireResponse;
    
    if (!questionnaireResponse) {
      throw new Error('No QuestionnaireResponse provided in event input');
    }

    // Validate questionnaire response
    if (questionnaireResponse.status !== 'completed') {
      return { 
        success: false, 
        error: 'QuestionnaireResponse must be completed',
        resourceId: questionnaireResponse.id 
      };
    }

    // Extract patient information from questionnaire response
    const patientData = extractPatientData(questionnaireResponse);
    
    // Check for existing patients to prevent duplicates
    const existingPatient = await findExistingPatient(medplum, patientData);
    
    let patient: Patient;
    if (existingPatient) {
      console.log('Found existing patient, updating', { patientId: existingPatient.id });
      // Update existing patient with new information
      patient = await updateExistingPatient(medplum, existingPatient, patientData);
    } else {
      console.log('Creating new patient');
      // Create new patient with conditional create
      patient = await createNewPatient(medplum, patientData);
    }

    // Create coverage if insurance information is provided
    let coverage: Coverage | null = null;
    const coverageData = extractCoverageData(questionnaireResponse, patient);
    if (coverageData) {
      console.log('Creating coverage resource');
      coverage = await medplum.createResource(coverageData);
    }

    // Create consent for treatment
    console.log('Creating consent resource');
    const consent = await createTreatmentConsent(medplum, patient);

    // Update the questionnaire response to link to created resources
    await linkQuestionnaireResponseToPatient(medplum, questionnaireResponse, patient);

    const result = {
      success: true,
      patientId: patient.id,
      coverageId: coverage?.id,
      consentId: consent.id,
      isNewPatient: !existingPatient,
      timestamp: new Date().toISOString()
    };

    console.log('Patient registration completed successfully', result);
    return result;

  } catch (error) {
    console.error('Patient registration bot failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Extract patient data from questionnaire response
 */
function extractPatientData(response: QuestionnaireResponse): Partial<Patient> {
  const items = response.item || [];
  const patientData: Partial<Patient> = {
    resourceType: 'Patient'
  };

  // Extract basic demographics
  const firstName = findAnswerValue(items, 'firstName');
  const lastName = findAnswerValue(items, 'lastName');
  const middleName = findAnswerValue(items, 'middleName');
  
  if (firstName || lastName) {
    const name: HumanName = {
      use: 'official',
      family: lastName,
      given: [firstName, middleName].filter(Boolean)
    };
    patientData.name = [name];
  }

  // Extract birth date
  const birthDate = findAnswerValue(items, 'birthDate');
  if (birthDate) {
    patientData.birthDate = birthDate;
  }

  // Extract gender
  const gender = findAnswerValue(items, 'gender');
  if (gender) {
    patientData.gender = gender.toLowerCase() as 'male' | 'female' | 'other' | 'unknown';
  }

  // Extract identifiers (SSN, MRN, etc.)
  const ssn = findAnswerValue(items, 'ssn');
  const mrn = findAnswerValue(items, 'mrn');
  
  const identifiers: Identifier[] = [];
  if (ssn) {
    identifiers.push({
      use: 'official',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'SS',
          display: 'Social Security Number'
        }]
      },
      system: 'http://hl7.org/fhir/sid/us-ssn',
      value: ssn
    });
  }
  
  if (mrn) {
    identifiers.push({
      use: 'usual',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'MR',
          display: 'Medical Record Number'
        }]
      },
      system: 'http://lims.local/patient-id',
      value: mrn
    });
  }
  
  if (identifiers.length > 0) {
    patientData.identifier = identifiers;
  }

  // Extract contact information
  const phone = findAnswerValue(items, 'phone');
  const email = findAnswerValue(items, 'email');
  
  const telecom: ContactPoint[] = [];
  if (phone) {
    telecom.push({
      system: 'phone',
      value: phone,
      use: 'home'
    });
  }
  
  if (email) {
    telecom.push({
      system: 'email',
      value: email,
      use: 'home'
    });
  }
  
  if (telecom.length > 0) {
    patientData.telecom = telecom;
  }

  // Extract address
  const street = findAnswerValue(items, 'street');
  const city = findAnswerValue(items, 'city');
  const state = findAnswerValue(items, 'state');
  const zipCode = findAnswerValue(items, 'zipCode');
  
  if (street || city || state || zipCode) {
    const address: Address = {
      use: 'home',
      type: 'physical',
      line: street ? [street] : undefined,
      city,
      state,
      postalCode: zipCode,
      country: 'US'
    };
    patientData.address = [address];
  }

  // Extract emergency contact
  const emergencyContactName = findAnswerValue(items, 'emergencyContactName');
  const emergencyContactPhone = findAnswerValue(items, 'emergencyContactPhone');
  const emergencyContactRelationship = findAnswerValue(items, 'emergencyContactRelationship');
  
  if (emergencyContactName || emergencyContactPhone) {
    patientData.contact = [{
      relationship: emergencyContactRelationship ? [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
          code: 'C',
          display: emergencyContactRelationship
        }]
      }] : undefined,
      name: emergencyContactName ? {
        text: emergencyContactName
      } : undefined,
      telecom: emergencyContactPhone ? [{
        system: 'phone',
        value: emergencyContactPhone
      }] : undefined
    }];
  }

  return patientData;
}

/**
 * Find existing patient to prevent duplicates
 */
async function findExistingPatient(medplum: MedplumClient, patientData: Partial<Patient>): Promise<Patient | null> {
  // Search by identifiers first (most reliable)
  if (patientData.identifier) {
    for (const identifier of patientData.identifier) {
      if (identifier.value) {
        const searchResults = await medplum.searchResources('Patient', {
          identifier: `${identifier.system}|${identifier.value}`
        });
        
        if (searchResults.length > 0) {
          return searchResults[0];
        }
      }
    }
  }

  // Search by name and birth date as fallback
  if (patientData.name?.[0] && patientData.birthDate) {
    const name = patientData.name[0];
    const searchResults = await medplum.searchResources('Patient', {
      given: name.given?.[0],
      family: name.family,
      birthdate: patientData.birthDate
    });
    
    if (searchResults.length > 0) {
      return searchResults[0];
    }
  }

  return null;
}

/**
 * Update existing patient with new information
 */
async function updateExistingPatient(
  medplum: MedplumClient, 
  existingPatient: Patient, 
  newData: Partial<Patient>
): Promise<Patient> {
  // Merge new data with existing patient data
  const updatedPatient: Patient = {
    ...existingPatient,
    // Update name if provided
    name: newData.name || existingPatient.name,
    // Update telecom, merging with existing
    telecom: mergeContactPoints(existingPatient.telecom, newData.telecom),
    // Update address, merging with existing
    address: mergeAddresses(existingPatient.address, newData.address),
    // Update identifiers, merging with existing
    identifier: mergeIdentifiers(existingPatient.identifier, newData.identifier),
    // Update contact information
    contact: newData.contact || existingPatient.contact,
    // Update other fields if not already set
    birthDate: existingPatient.birthDate || newData.birthDate,
    gender: existingPatient.gender || newData.gender
  };

  return await medplum.updateResource(updatedPatient);
}

/**
 * Create new patient with conditional create logic
 */
async function createNewPatient(medplum: MedplumClient, patientData: Partial<Patient>): Promise<Patient> {
  // Generate a unique identifier if none provided
  if (!patientData.identifier || patientData.identifier.length === 0) {
    const uniqueId = `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    patientData.identifier = [{
      use: 'usual',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'MR',
          display: 'Medical Record Number'
        }]
      },
      system: 'http://lims.local/patient-id',
      value: uniqueId
    }];
  }

  return await medplum.createResource(patientData as Patient);
}

/**
 * Extract coverage data from questionnaire response
 */
function extractCoverageData(response: QuestionnaireResponse, patient: Patient): Coverage | null {
  const items = response.item || [];
  
  const insuranceCompany = findAnswerValue(items, 'insuranceCompany');
  const policyNumber = findAnswerValue(items, 'policyNumber');
  const groupNumber = findAnswerValue(items, 'groupNumber');
  const subscriberId = findAnswerValue(items, 'subscriberId');
  
  if (!insuranceCompany && !policyNumber) {
    return null; // No insurance information provided
  }

  const coverage: Coverage = {
    resourceType: 'Coverage',
    status: 'active',
    type: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'EHCPOL',
        display: 'Extended Healthcare Policy'
      }]
    },
    beneficiary: {
      reference: `Patient/${patient.id}`
    },
    payor: [{
      display: insuranceCompany || 'Unknown Insurance Company'
    }]
  };

  // Add identifiers for policy and group numbers
  const identifiers: Identifier[] = [];
  
  if (policyNumber) {
    identifiers.push({
      use: 'official',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'FILL',
          display: 'Filler Identifier'
        }]
      },
      value: policyNumber
    });
  }
  
  if (subscriberId) {
    identifiers.push({
      use: 'official',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'MB',
          display: 'Member Number'
        }]
      },
      value: subscriberId
    });
  }
  
  if (identifiers.length > 0) {
    coverage.identifier = identifiers;
  }

  // Add class information for group number
  if (groupNumber) {
    coverage.class = [{
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
          code: 'group',
          display: 'Group'
        }]
      },
      value: groupNumber
    }];
  }

  return coverage;
}

/**
 * Create treatment consent
 */
async function createTreatmentConsent(medplum: MedplumClient, patient: Patient): Promise<Consent> {
  const consent: Consent = {
    resourceType: 'Consent',
    status: 'active',
    scope: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/consentscope',
        code: 'treatment',
        display: 'Treatment'
      }]
    },
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/consentcategorycodes',
        code: 'hcd',
        display: 'Health Care Directive'
      }]
    }],
    patient: {
      reference: `Patient/${patient.id}`
    },
    dateTime: new Date().toISOString(),
    provision: {
      type: 'permit',
      purpose: [{
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
        code: 'TREAT',
        display: 'Treatment'
      }]
    }
  };

  return await medplum.createResource(consent);
}

/**
 * Link questionnaire response to created patient
 */
async function linkQuestionnaireResponseToPatient(
  medplum: MedplumClient, 
  response: QuestionnaireResponse, 
  patient: Patient
): Promise<void> {
  const updatedResponse: QuestionnaireResponse = {
    ...response,
    subject: {
      reference: `Patient/${patient.id}`
    }
  };

  await medplum.updateResource(updatedResponse);
}

// Helper functions

function findAnswerValue(items: any[], linkId: string): string | undefined {
  for (const item of items) {
    if (item.linkId === linkId && item.answer && item.answer.length > 0) {
      return item.answer[0].valueString || item.answer[0].valueDate || item.answer[0].valueCoding?.display;
    }
    
    // Recursively search in nested items
    if (item.item) {
      const nestedResult = findAnswerValue(item.item, linkId);
      if (nestedResult) {
        return nestedResult;
      }
    }
  }
  return undefined;
}

function mergeContactPoints(existing?: ContactPoint[], newPoints?: ContactPoint[]): ContactPoint[] | undefined {
  if (!existing && !newPoints) return undefined;
  if (!existing) return newPoints;
  if (!newPoints) return existing;
  
  // Merge, avoiding duplicates based on system and value
  const merged = [...existing];
  for (const newPoint of newPoints) {
    const exists = existing.some(ep => ep.system === newPoint.system && ep.value === newPoint.value);
    if (!exists) {
      merged.push(newPoint);
    }
  }
  return merged;
}

function mergeAddresses(existing?: Address[], newAddresses?: Address[]): Address[] | undefined {
  if (!existing && !newAddresses) return undefined;
  if (!existing) return newAddresses;
  if (!newAddresses) return existing;
  
  // For addresses, replace existing with new if provided
  return newAddresses;
}

function mergeIdentifiers(existing?: Identifier[], newIdentifiers?: Identifier[]): Identifier[] | undefined {
  if (!existing && !newIdentifiers) return undefined;
  if (!existing) return newIdentifiers;
  if (!newIdentifiers) return existing;
  
  // Merge, avoiding duplicates based on system and value
  const merged = [...existing];
  for (const newId of newIdentifiers) {
    const exists = existing.some(ei => ei.system === newId.system && ei.value === newId.value);
    if (!exists) {
      merged.push(newId);
    }
  }
  return merged;
}