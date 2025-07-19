import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { 
  Specimen, 
  Patient, 
  ServiceRequest,
  Identifier,
  CodeableConcept,
  Reference
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { LaboratorySpecimen, SpecimenProcessing, SpecimenContainer } from '../types/fhir-types';

export interface SpecimenAccessionData {
  specimen: Specimen;
  accessionNumber: string;
  qrCodeData: string;
  labelData: SpecimenLabelData;
}

export interface SpecimenLabelData {
  accessionNumber: string;
  patientName: string;
  patientDOB: string;
  collectionDate: string;
  specimenType: string;
  containerType?: string;
  qrCodeUrl: string;
}

export interface ChainOfCustodyEntry {
  timestamp: string;
  action: 'received' | 'processed' | 'transferred' | 'stored' | 'disposed';
  location: string;
  performer: Reference;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SpecimenService {
  private specimenTypes$ = new BehaviorSubject<CodeableConcept[]>([]);
  private containerTypes$ = new BehaviorSubject<CodeableConcept[]>([]);
  private accessionCounter = 1;

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService
  ) {
    this.loadSpecimenTypes();
    this.loadContainerTypes();
  }

  /**
   * Load available specimen types
   */
  private loadSpecimenTypes(): void {
    // In a real implementation, these would be loaded from a terminology service
    const specimenTypes: CodeableConcept[] = [
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119376003',
          display: 'Tissue specimen'
        }],
        text: 'Tissue specimen'
      },
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119297000',
          display: 'Blood specimen'
        }],
        text: 'Blood specimen'
      },
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '122575003',
          display: 'Urine specimen'
        }],
        text: 'Urine specimen'
      },
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119334006',
          display: 'Sputum specimen'
        }],
        text: 'Sputum specimen'
      },
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '258580003',
          display: 'Whole blood specimen'
        }],
        text: 'Whole blood specimen'
      },
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119361006',
          display: 'Plasma specimen'
        }],
        text: 'Plasma specimen'
      },
      {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '119364003',
          display: 'Serum specimen'
        }],
        text: 'Serum specimen'
      }
    ];

    this.specimenTypes$.next(specimenTypes);
  }

  /**
   * Load available container types
   */
  private loadContainerTypes(): void {
    const containerTypes: CodeableConcept[] = [
      {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0487',
          code: 'TUBE',
          display: 'Tube'
        }],
        text: 'Tube'
      },
      {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0487',
          code: 'BOTTLE',
          display: 'Bottle'
        }],
        text: 'Bottle'
      },
      {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0487',
          code: 'VIAL',
          display: 'Vial'
        }],
        text: 'Vial'
      },
      {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0487',
          code: 'CUP',
          display: 'Cup'
        }],
        text: 'Cup'
      },
      {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0487',
          code: 'SLIDE',
          display: 'Slide'
        }],
        text: 'Slide'
      }
    ];

    this.containerTypes$.next(containerTypes);
  }

  /**
   * Get available specimen types
   */
  getSpecimenTypes(): Observable<CodeableConcept[]> {
    return this.specimenTypes$.asObservable();
  }

  /**
   * Get available container types
   */
  getContainerTypes(): Observable<CodeableConcept[]> {
    return this.containerTypes$.asObservable();
  }

  /**
   * Generate unique accession number
   */
  generateAccessionNumber(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const sequence = this.accessionCounter.toString().padStart(4, '0');
    
    this.accessionCounter++;
    
    return `SP${year}${month}${day}${sequence}`;
  }

  /**
   * Create specimen with proper FHIR metadata
   */
  async createSpecimen(
    patientId: string,
    specimenData: {
      type: CodeableConcept;
      collectionDate: string;
      collectionMethod?: CodeableConcept;
      bodySite?: CodeableConcept;
      containerType?: CodeableConcept;
      quantity?: { value: number; unit: string };
      notes?: string;
    }
  ): Promise<SpecimenAccessionData> {
    try {
      const accessionNumber = this.generateAccessionNumber();
      
      // Create specimen identifier
      const accessionIdentifier: Identifier = {
        use: 'official',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'ACSN',
            display: 'Accession ID'
          }]
        },
        value: accessionNumber,
        assigner: {
          display: 'Laboratory Information System'
        }
      };

      // Build specimen resource
      const specimen: Specimen = {
        resourceType: 'Specimen',
        identifier: [accessionIdentifier],
        accessionIdentifier: accessionIdentifier,
        status: 'available',
        type: specimenData.type,
        subject: {
          reference: `Patient/${patientId}`
        },
        collection: {
          collectedDateTime: specimenData.collectionDate,
          method: specimenData.collectionMethod,
          bodySite: specimenData.bodySite,
          quantity: specimenData.quantity ? {
            value: specimenData.quantity.value,
            unit: specimenData.quantity.unit
          } : undefined
        }
      };

      // Add container information if provided
      if (specimenData.containerType) {
        specimen.container = [{
          type: specimenData.containerType
        }];
      }

      // Add notes if provided
      if (specimenData.notes) {
        specimen.note = [{
          text: specimenData.notes
        }];
      }

      // Create the specimen resource
      const createdSpecimen = await this.medplumService.createResource(specimen as any);
      
      // Get patient information for label
      const patient = await this.medplumService.readResource<Patient>('Patient', patientId);
      
      // Generate QR code data
      const qrCodeData = this.generateQRCodeData(accessionNumber, patientId);
      
      // Create label data
      const labelData = this.createLabelData(createdSpecimen, patient, accessionNumber);
      
      // Initialize chain of custody
      await this.addChainOfCustodyEntry(createdSpecimen.id!, {
        timestamp: new Date().toISOString(),
        action: 'received',
        location: 'Accessioning Station',
        performer: {
          display: 'Lab Technician' // In real implementation, get current user
        },
        notes: 'Specimen received and accessioned'
      });

      return {
        specimen: createdSpecimen,
        accessionNumber,
        qrCodeData,
        labelData
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-creation');
      throw error;
    }
  }

  /**
   * Generate QR code data for specimen
   */
  private generateQRCodeData(accessionNumber: string, patientId: string): string {
    const qrData = {
      type: 'specimen',
      accessionNumber,
      patientId,
      timestamp: new Date().toISOString(),
      url: `${window.location.origin}/specimen/${accessionNumber}`
    };
    
    return JSON.stringify(qrData);
  }

  /**
   * Create label data for printing
   */
  private createLabelData(
    specimen: Specimen, 
    patient: Patient, 
    accessionNumber: string
  ): SpecimenLabelData {
    const patientName = patient.name?.[0] ? 
      `${patient.name[0].given?.[0] || ''} ${patient.name[0].family || ''}`.trim() : 
      'Unknown Patient';

    return {
      accessionNumber,
      patientName,
      patientDOB: patient.birthDate || 'Unknown',
      collectionDate: specimen.collection?.collectedDateTime || new Date().toISOString().split('T')[0],
      specimenType: specimen.type?.text || 'Unknown',
      containerType: specimen.container?.[0]?.type?.text,
      qrCodeUrl: `${window.location.origin}/specimen/${accessionNumber}`
    };
  }

  /**
   * Update specimen status
   */
  async updateSpecimenStatus(
    specimenId: string, 
    status: 'available' | 'unavailable' | 'unsatisfactory' | 'entered-in-error',
    notes?: string
  ): Promise<Specimen> {
    try {
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      
      specimen.status = status;
      
      if (notes) {
        if (!specimen.note) specimen.note = [];
        specimen.note.push({
          text: `Status updated to ${status}: ${notes}`,
          time: new Date().toISOString()
        });
      }

      const updatedSpecimen = await this.medplumService.updateResource(specimen);
      
      // Add chain of custody entry
      await this.addChainOfCustodyEntry(specimenId, {
        timestamp: new Date().toISOString(),
        action: 'processed',
        location: 'Laboratory',
        performer: {
          display: 'Lab Technician'
        },
        notes: `Status updated to ${status}${notes ? ': ' + notes : ''}`
      });

      return updatedSpecimen;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-status-update');
      throw error;
    }
  }

  /**
   * Add chain of custody entry
   */
  private async addChainOfCustodyEntry(
    specimenId: string, 
    entry: ChainOfCustodyEntry
  ): Promise<void> {
    try {
      // In a real implementation, this would create an AuditEvent resource
      // For now, we'll add it as a note to the specimen
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      
      if (!specimen.note) specimen.note = [];
      
      specimen.note.push({
        text: `Chain of Custody: ${entry.action} at ${entry.location} by ${entry.performer.display}${entry.notes ? ' - ' + entry.notes : ''}`,
        time: entry.timestamp
      });

      await this.medplumService.updateResource(specimen);
    } catch (error) {
      console.warn('Failed to add chain of custody entry:', error);
      // Don't throw error as this is supplementary information
    }
  }

  /**
   * Search specimens by various criteria
   */
  async searchSpecimens(criteria: {
    patientId?: string;
    accessionNumber?: string;
    status?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Specimen[]> {
    try {
      const searchParams: Record<string, string> = {};
      
      if (criteria.patientId) {
        searchParams.subject = `Patient/${criteria.patientId}`;
      }
      
      if (criteria.accessionNumber) {
        searchParams.identifier = criteria.accessionNumber;
      }
      
      if (criteria.status) {
        searchParams.status = criteria.status;
      }
      
      if (criteria.dateFrom || criteria.dateTo) {
        let dateRange = '';
        if (criteria.dateFrom) dateRange += `ge${criteria.dateFrom}`;
        if (criteria.dateTo) {
          if (dateRange) dateRange += '&';
          dateRange += `le${criteria.dateTo}`;
        }
        searchParams.collected = dateRange;
      }

      const results = await this.medplumService.searchResources<Specimen>('Specimen', searchParams);
      return results.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-search');
      return [];
    }
  }

  /**
   * Get specimen by accession number
   */
  async getSpecimenByAccessionNumber(accessionNumber: string): Promise<Specimen | null> {
    try {
      const results = await this.searchSpecimens({ accessionNumber });
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-lookup');
      return null;
    }
  }

  /**
   * Generate specimen processing steps
   */
  generateProcessingSteps(specimenType: string): SpecimenProcessing[] {
    const baseSteps: SpecimenProcessing[] = [
      {
        description: 'Specimen received and logged',
        procedure: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '33747000',
            display: 'Collection of specimen'
          }]
        },
        timeDateTime: new Date().toISOString()
      }
    ];

    // Add type-specific processing steps
    switch (specimenType.toLowerCase()) {
      case 'tissue':
        baseSteps.push(
          {
            description: 'Gross examination',
            procedure: {
              coding: [{
                system: 'http://snomed.info/sct',
                code: '127785005',
                display: 'Gross examination'
              }]
            }
          },
          {
            description: 'Tissue processing',
            procedure: {
              coding: [{
                system: 'http://snomed.info/sct',
                code: '127786006',
                display: 'Tissue processing'
              }]
            }
          }
        );
        break;
      
      case 'blood':
        baseSteps.push(
          {
            description: 'Centrifugation',
            procedure: {
              coding: [{
                system: 'http://snomed.info/sct',
                code: '85457002',
                display: 'Centrifugation'
              }]
            }
          }
        );
        break;
    }

    return baseSteps;
  }
}