import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Claim, ClaimResponse, Coverage, Patient, Practitioner } from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { LIMSErrorType } from '../types/fhir-types';
import { CurrencyService } from './currency.service';
import { ErrorHandlingService } from './error-handling.service';
import { RetryService } from './retry.service';

// Candid Health API interfaces
export interface CandidHealthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  timeout: number;
  retryAttempts: number;
}

export interface CandidHealthClaim {
  external_id: string;
  patient_external_id: string;
  billing_provider: CandidHealthProvider;
  rendering_provider?: CandidHealthProvider;
  service_facility?: CandidHealthServiceFacility;
  subscriber_primary: CandidHealthSubscriber;
  subscriber_secondary?: CandidHealthSubscriber;
  responsible_party?: CandidHealthResponsibleParty;
  diagnosis_codes: CandidHealthDiagnosis[];
  clinical_notes?: CandidHealthClinicalNote[];
  billing_notes?: CandidHealthBillingNote[];
  place_of_service_code: string;
  patient_histories?: CandidHealthPatientHistory[];
  service_lines: CandidHealthServiceLine[];
  external_claim_submission?: CandidHealthExternalClaimSubmission;
}

export interface CandidHealthProvider {
  npi: string;
  taxonomy_code?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  address: CandidHealthAddress;
}

export interface CandidHealthAddress {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip_code: string;
  zip_plus_four_code?: string;
}

export interface CandidHealthServiceFacility {
  organization_name: string;
  npi?: string;
  address: CandidHealthAddress;
}

export interface CandidHealthSubscriber {
  insurance_card: CandidHealthInsuranceCard;
  patient_relationship_to_subscriber_code: string;
  date_of_birth?: string;
  address?: CandidHealthAddress;
}

export interface CandidHealthInsuranceCard {
  member_id: string;
  payer_name: string;
  payer_id: string;
  rx_bin?: string;
  rx_pcn?: string;
  image_url_front?: string;
  image_url_back?: string;
  emr_payer_crosswalk?: string;
  group_number?: string;
  plan_name?: string;
  plan_type?: string;
  insurance_type: 'primary' | 'secondary';
}

export interface CandidHealthResponsibleParty {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  address: CandidHealthAddress;
}

export interface CandidHealthDiagnosis {
  diagnosis_code: string;
  code_type: 'ABF' | 'BF' | 'BJ' | 'BK' | 'PR';
  name?: string;
}

export interface CandidHealthClinicalNote {
  category: 'clinical' | 'billing';
  notes: string;
}

export interface CandidHealthBillingNote {
  text: string;
}

export interface CandidHealthPatientHistory {
  category: string;
  questions: CandidHealthPatientHistoryQuestion[];
}

export interface CandidHealthPatientHistoryQuestion {
  id: string;
  text: string;
  responses: CandidHealthPatientHistoryResponse[];
}

export interface CandidHealthPatientHistoryResponse {
  response: string;
  follow_ups?: CandidHealthPatientHistoryResponse[];
}

export interface CandidHealthServiceLine {
  modifiers?: string[];
  procedure_code: string;
  quantity: string;
  units: string;
  charge_amount_cents: number;
  diagnosis_pointers: number[];
  drug_identification?: CandidHealthDrugIdentification;
  place_of_service_code?: string;
  description?: string;
  date_of_service: string;
  end_date_of_service?: string;
  ordering_provider?: CandidHealthProvider;
  initial_authorization_number?: string;
  authorization_number?: string;
  referral_number?: string;
  test_results?: CandidHealthTestResult[];
}

export interface CandidHealthDrugIdentification {
  service_id_qualifier: string;
  national_drug_code?: string;
  national_drug_unit_count?: string;
  measurement_unit_code?: string;
  link_sequence_number?: string;
  pharmacy_prescription_number?: string;
  conversion_formula?: string;
  drug_description?: string;
}

export interface CandidHealthTestResult {
  value: number;
  result_type: string;
  name?: string;
}

export interface CandidHealthExternalClaimSubmission {
  claim_created_at: string;
  patient_control_number: string;
  submission_records: CandidHealthSubmissionRecord[];
}

export interface CandidHealthSubmissionRecord {
  submitted_at: string;
  claim_frequency_code?: string;
  payer_responsibility_sequence_number_code?: string;
  intended_submission_medium?: string;
}

export interface CandidHealthClaimResponse {
  claim_id: string;
  external_id: string;
  patient_external_id: string;
  status: 'submitted' | 'accepted' | 'rejected' | 'paid' | 'denied';
  clearinghouse_response?: CandidHealthClearinghouseResponse;
  payer_response?: CandidHealthPayerResponse;
  payment_info?: CandidHealthPaymentInfo;
  created_at: string;
  updated_at: string;
}

export interface CandidHealthClearinghouseResponse {
  status: string;
  message?: string;
  errors?: string[];
  warnings?: string[];
  submission_id?: string;
}

export interface CandidHealthPayerResponse {
  status: string;
  adjudication_date?: string;
  claim_adjustment_reason_codes?: string[];
  remittance_advice?: string;
  check_number?: string;
  check_date?: string;
}

export interface CandidHealthPaymentInfo {
  amount_cents: number;
  payment_date?: string;
  payment_method?: string;
  check_number?: string;
  era_check_number?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CandidHealthService {
  private config: CandidHealthConfig;
  private accessToken$ = new BehaviorSubject<string | null>(null);
  private submittedClaims$ = new BehaviorSubject<CandidHealthClaimResponse[]>([]);

  constructor(
    private http: HttpClient,
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private retryService: RetryService,
    private currencyService: CurrencyService
  ) {
    this.config = this.getDefaultConfig();
    this.initializeAuthentication();
  }

  /**
   * Submit claim to Candid Health
   */
  async submitClaim(claim: Claim): Promise<CandidHealthClaimResponse> {
    try {
      // Convert FHIR Claim to Candid Health format
      const candidClaim = await this.convertFhirClaimToCandid(claim);

      // Submit to Candid Health API
      const response = await this.makeApiCall<CandidHealthClaimResponse>(
        'POST',
        '/claims',
        candidClaim
      );

      // Store the response
      const currentClaims = this.submittedClaims$.value;
      this.submittedClaims$.next([...currentClaims, response]);

      // Create FHIR ClaimResponse resource
      await this.createFhirClaimResponse(claim, response);

      return response;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to submit claim to Candid Health',
        details: { claimId: claim.id, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get claim status from Candid Health
   */
  async getClaimStatus(externalId: string): Promise<CandidHealthClaimResponse> {
    try {
      const response = await this.makeApiCall<CandidHealthClaimResponse>(
        'GET',
        `/claims/${externalId}`
      );

      return response;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to get claim status from Candid Health',
        details: { externalId, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Process webhook from Candid Health
   */
  async processWebhook(webhookData: unknown): Promise<void> {
    try {
      const claimResponse = webhookData as CandidHealthClaimResponse;

      // Find the original FHIR claim
      const originalClaim = await this.findOriginalClaim(claimResponse.external_id);
      if (!originalClaim) {
        throw new Error(`Original claim not found for external ID: ${claimResponse.external_id}`);
      }

      // Update FHIR ClaimResponse
      await this.updateFhirClaimResponse(originalClaim, claimResponse);

      // Update local state
      const currentClaims = this.submittedClaims$.value;
      const index = currentClaims.findIndex(c => c.external_id === claimResponse.external_id);
      if (index >= 0) {
        currentClaims[index] = claimResponse;
      } else {
        currentClaims.push(claimResponse);
      }
      this.submittedClaims$.next([...currentClaims]);

      // Trigger payment reconciliation if claim is paid
      if (claimResponse.status === 'paid' && claimResponse.payment_info) {
        await this.triggerPaymentReconciliation(originalClaim, claimResponse);
      }
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to process Candid Health webhook',
        details: { webhookData, error },
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Get submitted claims
   */
  getSubmittedClaims(): Observable<CandidHealthClaimResponse[]> {
    return this.submittedClaims$.asObservable();
  }

  /**
   * Validate claim before submission
   */
  async validateClaimForCandid(claim: Claim): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check required fields for Candid Health
      if (!claim.patient?.reference) {
        errors.push('Patient reference is required');
      }

      if (!claim.provider?.reference) {
        errors.push('Provider reference is required');
      }

      if (!claim.item || claim.item.length === 0) {
        errors.push('At least one service line is required');
      }

      // Validate service lines
      if (claim.item) {
        for (const item of claim.item) {
          if (!item.productOrService?.coding?.[0]?.code) {
            errors.push(`Service line ${item.sequence}: Procedure code is required`);
          }

          if (!(item.servicedDate || item.servicedPeriod)) {
            errors.push(`Service line ${item.sequence}: Service date is required`);
          }

          if (!item.unitPrice?.value || item.unitPrice.value <= 0) {
            errors.push(`Service line ${item.sequence}: Unit price must be greater than zero`);
          }
        }
      }

      // Check for insurance information
      if (!claim.insurance || claim.insurance.length === 0) {
        warnings.push('No insurance information provided');
      }

      // Validate diagnosis codes
      if (!claim.diagnosis || claim.diagnosis.length === 0) {
        warnings.push('No diagnosis codes provided');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (_error) {
      return {
        isValid: false,
        errors: ['Validation failed due to system error'],
        warnings: []
      };
    }
  }

  // Private helper methods

  private getDefaultConfig(): CandidHealthConfig {
    return {
      baseUrl: 'https://api.candidhealth.com/api',
      clientId: process.env.CANDID_CLIENT_ID || '',
      clientSecret: process.env.CANDID_CLIENT_SECRET || '',
      environment: 'sandbox',
      timeout: 30000,
      retryAttempts: 3
    };
  }

  private async initializeAuthentication(): Promise<void> {
    try {
      const token = await this.authenticate();
      this.accessToken$.next(token);
    } catch (error) {
      console.error('Failed to authenticate with Candid Health:', error);
    }
  }

  private async authenticate(): Promise<string> {
    const authData = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'client_credentials'
    };

    const response = await this.http.post<{ access_token: string }>(
      `${this.config.baseUrl}/auth/token`,
      authData
    ).toPromise();

    if (!response?.access_token) {
      throw new Error('Failed to obtain access token from Candid Health');
    }

    return response.access_token;
  }

  private async makeApiCall<T>(method: string, endpoint: string, data?: unknown): Promise<T> {
    const token = this.accessToken$.value;
    if (!token) {
      throw new Error('No access token available');
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    const url = `${this.config.baseUrl}${endpoint}`;

    return this.retryService.executeWithRetry(async () => {
      let response;

      switch (method.toUpperCase()) {
        case 'GET':
          response = await this.http.get<T>(url, { headers }).toPromise();
          break;
        case 'POST':
          response = await this.http.post<T>(url, data, { headers }).toPromise();
          break;
        case 'PUT':
          response = await this.http.put<T>(url, data, { headers }).toPromise();
          break;
        case 'DELETE':
          response = await this.http.delete<T>(url, { headers }).toPromise();
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }

      if (!response) {
        throw new Error('No response received from Candid Health API');
      }

      return response;
    }, { maxRetries: this.config.retryAttempts });
  }

  private async convertFhirClaimToCandid(claim: Claim): Promise<CandidHealthClaim> {
    // Get patient information
    const patientId = claim.patient?.reference?.split('/')[1];
    if (!patientId) {
      throw new Error('Patient reference is required');
    }

    const patient = await this.medplumService.readResource<Patient>('Patient', patientId);

    // Get provider information
    const providerId = claim.provider?.reference?.split('/')[1];
    if (!providerId) {
      throw new Error('Provider reference is required');
    }

    const provider = await this.medplumService.readResource<Practitioner>('Practitioner', providerId);

    // Get coverage information
    let coverage: Coverage | undefined;
    if (claim.insurance?.[0]?.coverage?.reference) {
      const coverageId = claim.insurance[0].coverage.reference.split('/')[1];
      coverage = await this.medplumService.readResource<Coverage>('Coverage', coverageId);
    }

    // Convert to Candid Health format
    const candidClaim: CandidHealthClaim = {
      external_id: claim.id || `claim-${Date.now()}`,
      patient_external_id: patient.id || '',
      billing_provider: this.convertProviderToCandid(provider),
      place_of_service_code: '11', // Office
      diagnosis_codes: this.convertDiagnosesToCandid(claim.diagnosis || []),
      service_lines: this.convertServiceLinesToCandid(claim.item || []),
      subscriber_primary: coverage ? this.convertCoverageToCandid(coverage, patient) : this.createSelfPaySubscriber(patient)
    };

    return candidClaim;
  }

  private convertProviderToCandid(provider: Practitioner): CandidHealthProvider {
    const name = provider.name?.[0];
    return {
      npi: provider.identifier?.find(id => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value || '',
      first_name: name?.given?.[0] || '',
      last_name: name?.family || '',
      address: {
        address1: '123 Main St', // Default address - should be from provider resource
        city: 'Anytown',
        state: 'CA',
        zip_code: '12345'
      }
    };
  }

  private convertDiagnosesToCandid(diagnoses: unknown[]): CandidHealthDiagnosis[] {
    return diagnoses.map((diagnosis: any) => ({
      diagnosis_code: diagnosis.diagnosisCodeableConcept?.coding?.[0]?.code || '',
      code_type: 'ABF' as const,
      name: diagnosis.diagnosisCodeableConcept?.coding?.[0]?.display
    }));
  }

  private convertServiceLinesToCandid(items: unknown[]): CandidHealthServiceLine[] {
    return items.map((item: any) => ({
      procedure_code: item.productOrService?.coding?.[0]?.code || '',
      quantity: item.quantity?.value?.toString() || '1',
      units: 'UN',
      charge_amount_cents: Math.round((item.unitPrice?.value || 0) * 100),
      diagnosis_pointers: [1], // Default to first diagnosis
      date_of_service: item.servicedDate || new Date().toISOString().split('T')[0],
      description: item.productOrService?.coding?.[0]?.display
    }));
  }

  private convertCoverageToCandid(coverage: Coverage, patient: Patient): CandidHealthSubscriber {
    return {
      insurance_card: {
        member_id: coverage.subscriberId || '',
        payer_name: coverage.payor?.[0]?.display || 'Unknown Payer',
        payer_id: coverage.payor?.[0]?.identifier?.value || '',
        insurance_type: 'primary'
      },
      patient_relationship_to_subscriber_code: '18', // Self
      date_of_birth: patient.birthDate
    };
  }

  private createSelfPaySubscriber(patient: Patient): CandidHealthSubscriber {
    return {
      insurance_card: {
        member_id: patient.id || '',
        payer_name: 'Self Pay',
        payer_id: 'SELF',
        insurance_type: 'primary'
      },
      patient_relationship_to_subscriber_code: '18' // Self
    };
  }

  private async createFhirClaimResponse(claim: Claim, candidResponse: CandidHealthClaimResponse): Promise<ClaimResponse> {
    const claimResponse: ClaimResponse = {
      resourceType: 'ClaimResponse',
      status: this.mapCandidStatusToFhir(candidResponse.status),
      type: claim.type,
      use: claim.use,
      patient: claim.patient,
      created: new Date().toISOString(),
      insurer: {
        display: 'Candid Health Clearinghouse'
      },
      requestor: claim.provider,
      request: {
        reference: `Claim/${claim.id}`
      },
      outcome: candidResponse.status === 'accepted' || candidResponse.status === 'paid' ? 'complete' : 'error',
      disposition: candidResponse.clearinghouse_response?.message || candidResponse.status,
      payment: candidResponse.payment_info ? {
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/ex-paymenttype',
            code: 'complete'
          }]
        },
        amount: this.currencyService.createINRMoney(candidResponse.payment_info.amount_cents / 100),
        date: candidResponse.payment_info.payment_date
      } : undefined
    };

    return await this.medplumService.createResource(claimResponse);
  }

  private async updateFhirClaimResponse(claim: Claim, candidResponse: CandidHealthClaimResponse): Promise<void> {
    // Find existing ClaimResponse
    const claimResponses = await this.medplumService.searchResources<ClaimResponse>('ClaimResponse', {
      request: `Claim/${claim.id}`
    });

    if (claimResponses.entry?.[0]?.resource) {
      const existingResponse = claimResponses.entry[0].resource;
      const updatedResponse: ClaimResponse = {
        ...existingResponse,
        status: this.mapCandidStatusToFhir(candidResponse.status),
        outcome: candidResponse.status === 'accepted' || candidResponse.status === 'paid' ? 'complete' : 'error',
        disposition: candidResponse.clearinghouse_response?.message || candidResponse.status,
        payment: candidResponse.payment_info ? {
          type: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/ex-paymenttype',
              code: 'complete'
            }]
          },
          amount: this.currencyService.createINRMoney(candidResponse.payment_info.amount_cents / 100),
          date: candidResponse.payment_info.payment_date
        } : undefined
      };

      await this.medplumService.updateResource(updatedResponse);
    }
  }

  private mapCandidStatusToFhir(candidStatus: string): ClaimResponse['status'] {
    switch (candidStatus) {
      case 'submitted':
        return 'active';
      case 'accepted':
      case 'paid':
        return 'active';
      case 'rejected':
      case 'denied':
        return 'cancelled';
      default:
        return 'active';
    }
  }

  private async findOriginalClaim(externalId: string): Promise<Claim | null> {
    try {
      const claims = await this.medplumService.searchResources<Claim>('Claim', {
        identifier: externalId
      });

      return claims.entry?.[0]?.resource || null;
    } catch (error) {
      console.error('Failed to find original claim:', error);
      return null;
    }
  }

  private async triggerPaymentReconciliation(claim: Claim, candidResponse: CandidHealthClaimResponse): Promise<void> {
    // This would trigger the payment reconciliation service
    console.log(`Triggering payment reconciliation for claim ${claim.id} with payment ${candidResponse.payment_info?.amount_cents}`);
  }
}