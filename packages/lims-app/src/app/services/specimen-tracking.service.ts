import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { Specimen, AuditEvent, Task, Reference, CodeableConcept } from '../types/fhir-types';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';

export interface SpecimenLocation {
  id: string;
  name: string;
  description: string;
  type: 'reception' | 'processing' | 'testing' | 'storage' | 'disposal';
  capacity?: number;
  currentCount?: number;
  equipment?: string[];
  responsible?: Reference;
}

export interface SpecimenStatus {
  code: string;
  display: string;
  system: string;
  definition?: string;
  allowedTransitions: string[];
}

export interface ChainOfCustodyEvent {
  id: string;
  specimenId: string;
  timestamp: Date;
  fromLocation?: string;
  toLocation: string;
  fromStatus?: string;
  toStatus: string;
  performedBy: Reference;
  reason?: string;
  comments?: string;
  qrCodeScanned?: boolean;
  auditEventId?: string;
}

export interface SpecimenTrackingData {
  specimen: Specimen;
  currentLocation: SpecimenLocation;
  currentStatus: SpecimenStatus;
  chainOfCustody: ChainOfCustodyEvent[];
  estimatedCompletion?: Date;
  turnaroundTime?: number;
  priority: 'routine' | 'urgent' | 'stat';
  alerts: SpecimenAlert[];
}

export interface SpecimenAlert {
  id: string;
  type: 'overdue' | 'location_mismatch' | 'temperature' | 'integrity' | 'missing';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged?: boolean;
  acknowledgedBy?: Reference;
}

export interface WorkflowStation {
  id: string;
  name: string;
  location: SpecimenLocation;
  requiredRoles: string[];
  equipment: string[];
  procedures: CodeableConcept[];
  averageProcessingTime: number; // minutes
  capacity: number;
  currentLoad: number;
}

@Injectable({
  providedIn: 'root'
})
export class SpecimenTrackingService {
  private trackedSpecimens$ = new BehaviorSubject<Map<string, SpecimenTrackingData>>(new Map());
  private locations$ = new BehaviorSubject<SpecimenLocation[]>([]);
  private workflowStations$ = new BehaviorSubject<WorkflowStation[]>([]);
  private chainOfCustodyEvents$ = new Subject<ChainOfCustodyEvent>();

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    this.initializeLocations();
    this.initializeWorkflowStations();
  }

  /**
   * Get all tracked specimens
   */
  getTrackedSpecimens(): Observable<SpecimenTrackingData[]> {
    return this.trackedSpecimens$.pipe(
      map(specimenMap => Array.from(specimenMap.values()))
    );
  }

  /**
   * Get specimen tracking data by ID
   */
  getSpecimenTracking(specimenId: string): Observable<SpecimenTrackingData | undefined> {
    return this.trackedSpecimens$.pipe(
      map(specimenMap => specimenMap.get(specimenId))
    );
  }

  /**
   * Get available locations
   */
  getLocations(): Observable<SpecimenLocation[]> {
    return this.locations$.asObservable();
  }

  /**
   * Get workflow stations
   */
  getWorkflowStations(): Observable<WorkflowStation[]> {
    return this.workflowStations$.asObservable();
  }

  /**
   * Get chain of custody events stream
   */
  getChainOfCustodyEvents(): Observable<ChainOfCustodyEvent> {
    return this.chainOfCustodyEvents$.asObservable();
  }

  /**
   * Check in specimen at workflow station
   */
  async checkInSpecimen(
    specimenId: string, 
    stationId: string, 
    qrCodeScanned: boolean = false,
    comments?: string
  ): Promise<void> {
    try {
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      const station = this.workflowStations$.value.find(s => s.id === stationId);
      
      if (!station) {
        throw new Error(`Workflow station ${stationId} not found`);
      }

      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Update specimen status
      const updatedSpecimen: Specimen = {
        ...specimen,
        status: 'available',
        extension: [
          ...(specimen.extension || []),
          {
            url: 'http://lims.local/specimen-location',
            valueString: station.location.id
          },
          {
            url: 'http://lims.local/last-updated',
            valueDateTime: new Date().toISOString()
          }
        ]
      };

      await this.medplumService.updateResource(updatedSpecimen);

      // Create chain of custody event
      const custodyEvent: ChainOfCustodyEvent = {
        id: this.generateEventId(),
        specimenId,
        timestamp: new Date(),
        toLocation: station.location.id,
        toStatus: 'available',
        performedBy: { reference: `Practitioner/${currentUser.id}` },
        comments,
        qrCodeScanned
      };

      // Create audit event
      const auditEvent: AuditEvent = {
        resourceType: 'AuditEvent',
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
          code: 'rest',
          display: 'RESTful Operation'
        },
        subtype: [{
          system: 'http://hl7.org/fhir/restful-interaction',
          code: 'update',
          display: 'Update'
        }],
        action: 'U',
        recorded: new Date().toISOString(),
        outcome: '0',
        agent: [{
          who: { reference: `Practitioner/${currentUser.id}` },
          requestor: true
        }],
        source: {
          observer: { reference: `Organization/${currentUser.project}` },
          type: [{
            system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
            code: '4',
            display: 'Application Server'
          }]
        },
        entity: [{
          what: { reference: `Specimen/${specimenId}` },
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
            code: '2',
            display: 'System Object'
          },
          detail: [{
            type: 'location',
            valueString: station.location.id
          }, {
            type: 'qr-scanned',
            valueString: qrCodeScanned.toString()
          }]
        }]
      };

      const createdAuditEvent = await this.medplumService.createResource(auditEvent);
      custodyEvent.auditEventId = createdAuditEvent.id;

      // Update tracking data
      await this.updateSpecimenTracking(specimenId, custodyEvent);

      // Emit event
      this.chainOfCustodyEvents$.next(custodyEvent);

      this.notificationService.showSuccess(
        'Specimen Checked In',
        `Specimen ${specimenId} checked in at ${station.name}`
      );

    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-checkin');
      throw error;
    }
  }

  /**
   * Check out specimen from workflow station
   */
  async checkOutSpecimen(
    specimenId: string, 
    fromStationId: string,
    toStationId?: string,
    comments?: string
  ): Promise<void> {
    try {
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      const fromStation = this.workflowStations$.value.find(s => s.id === fromStationId);
      const toStation = toStationId ? this.workflowStations$.value.find(s => s.id === toStationId) : null;
      
      if (!fromStation) {
        throw new Error(`Source workflow station ${fromStationId} not found`);
      }

      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Update specimen status
      const updatedSpecimen: Specimen = {
        ...specimen,
        status: toStation ? 'available' : 'unavailable',
        extension: [
          ...(specimen.extension || []).filter(ext => 
            ext.url !== 'http://lims.local/specimen-location'
          ),
          ...(toStation ? [{
            url: 'http://lims.local/specimen-location',
            valueString: toStation.location.id
          }] : []),
          {
            url: 'http://lims.local/last-updated',
            valueDateTime: new Date().toISOString()
          }
        ]
      };

      await this.medplumService.updateResource(updatedSpecimen);

      // Create chain of custody event
      const custodyEvent: ChainOfCustodyEvent = {
        id: this.generateEventId(),
        specimenId,
        timestamp: new Date(),
        fromLocation: fromStation.location.id,
        toLocation: toStation?.location.id || 'in-transit',
        fromStatus: 'available',
        toStatus: toStation ? 'available' : 'in-transit',
        performedBy: { reference: `Practitioner/${currentUser.id}` },
        comments
      };

      // Update tracking data
      await this.updateSpecimenTracking(specimenId, custodyEvent);

      // Emit event
      this.chainOfCustodyEvents$.next(custodyEvent);

      this.notificationService.showSuccess(
        'Specimen Checked Out',
        `Specimen ${specimenId} checked out from ${fromStation.name}${toStation ? ` to ${toStation.name}` : ''}`
      );

    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-checkout');
      throw error;
    }
  }

  /**
   * Update specimen location manually
   */
  async updateSpecimenLocation(
    specimenId: string,
    locationId: string,
    status: string,
    comments?: string
  ): Promise<void> {
    try {
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      const location = this.locations$.value.find(l => l.id === locationId);
      
      if (!location) {
        throw new Error(`Location ${locationId} not found`);
      }

      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Get current location from specimen
      const currentLocationExt = specimen.extension?.find(ext => 
        ext.url === 'http://lims.local/specimen-location'
      );
      const currentLocation = currentLocationExt?.valueString;

      // Update specimen
      const updatedSpecimen: Specimen = {
        ...specimen,
        status: status as any,
        extension: [
          ...(specimen.extension || []).filter(ext => 
            ext.url !== 'http://lims.local/specimen-location'
          ),
          {
            url: 'http://lims.local/specimen-location',
            valueString: locationId
          },
          {
            url: 'http://lims.local/last-updated',
            valueDateTime: new Date().toISOString()
          }
        ]
      };

      await this.medplumService.updateResource(updatedSpecimen);

      // Create chain of custody event
      const custodyEvent: ChainOfCustodyEvent = {
        id: this.generateEventId(),
        specimenId,
        timestamp: new Date(),
        fromLocation: currentLocation,
        toLocation: locationId,
        toStatus: status,
        performedBy: { reference: `Practitioner/${currentUser.id}` },
        comments
      };

      // Update tracking data
      await this.updateSpecimenTracking(specimenId, custodyEvent);

      // Emit event
      this.chainOfCustodyEvents$.next(custodyEvent);

    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-location-update');
      throw error;
    }
  }

  /**
   * Get specimens by location
   */
  async getSpecimensByLocation(locationId: string): Promise<SpecimenTrackingData[]> {
    try {
      const specimens = await this.medplumService.searchResources<Specimen>('Specimen', {
        'extension:specimen-location': locationId
      });

      const trackingData: SpecimenTrackingData[] = [];
      
      for (const specimen of specimens.entry || []) {
        if (specimen.resource) {
          const tracking = await this.buildTrackingData(specimen.resource);
          trackingData.push(tracking);
        }
      }

      return trackingData;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimens-by-location');
      return [];
    }
  }

  /**
   * Get overdue specimens
   */
  getOverdueSpecimens(): Observable<SpecimenTrackingData[]> {
    return this.trackedSpecimens$.pipe(
      map(specimenMap => {
        const now = new Date();
        return Array.from(specimenMap.values()).filter(tracking => {
          if (!tracking.estimatedCompletion || tracking.currentStatus.code === 'completed') {
            return false;
          }
          return now > tracking.estimatedCompletion;
        });
      })
    );
  }

  /**
   * Generate specimen alerts
   */
  private generateAlerts(tracking: SpecimenTrackingData): SpecimenAlert[] {
    const alerts: SpecimenAlert[] = [];
    const now = new Date();

    // Check for overdue specimens
    if (tracking.estimatedCompletion && now > tracking.estimatedCompletion) {
      const hoursOverdue = Math.floor((now.getTime() - tracking.estimatedCompletion.getTime()) / (1000 * 60 * 60));
      alerts.push({
        id: `overdue-${tracking.specimen.id}`,
        type: 'overdue',
        severity: hoursOverdue > 24 ? 'critical' : hoursOverdue > 4 ? 'high' : 'medium',
        message: `Specimen is ${hoursOverdue} hours overdue`,
        timestamp: now
      });
    }

    // Check for location mismatches or missing specimens
    if (!tracking.currentLocation) {
      alerts.push({
        id: `missing-${tracking.specimen.id}`,
        type: 'missing',
        severity: 'high',
        message: 'Specimen location unknown',
        timestamp: now
      });
    }

    return alerts;
  }

  /**
   * Initialize default locations
   */
  private initializeLocations(): void {
    const defaultLocations: SpecimenLocation[] = [
      {
        id: 'reception',
        name: 'Reception',
        description: 'Sample receiving area',
        type: 'reception',
        capacity: 100
      },
      {
        id: 'processing',
        name: 'Processing',
        description: 'Sample processing and aliquoting',
        type: 'processing',
        capacity: 50
      },
      {
        id: 'chemistry',
        name: 'Chemistry Lab',
        description: 'Clinical chemistry testing',
        type: 'testing',
        capacity: 200
      },
      {
        id: 'hematology',
        name: 'Hematology Lab',
        description: 'Blood cell analysis',
        type: 'testing',
        capacity: 150
      },
      {
        id: 'microbiology',
        name: 'Microbiology Lab',
        description: 'Culture and sensitivity testing',
        type: 'testing',
        capacity: 100
      },
      {
        id: 'histopathology',
        name: 'Histopathology Lab',
        description: 'Tissue processing and analysis',
        type: 'testing',
        capacity: 75
      },
      {
        id: 'storage-cold',
        name: 'Cold Storage',
        description: 'Refrigerated specimen storage',
        type: 'storage',
        capacity: 500
      },
      {
        id: 'storage-frozen',
        name: 'Frozen Storage',
        description: 'Frozen specimen storage',
        type: 'storage',
        capacity: 300
      },
      {
        id: 'disposal',
        name: 'Disposal',
        description: 'Specimen disposal area',
        type: 'disposal',
        capacity: 50
      }
    ];

    this.locations$.next(defaultLocations);
  }

  /**
   * Initialize workflow stations
   */
  private initializeWorkflowStations(): void {
    const locations = this.locations$.value;
    const defaultStations: WorkflowStation[] = [
      {
        id: 'reception-desk',
        name: 'Reception Desk',
        location: locations.find(l => l.id === 'reception')!,
        requiredRoles: ['lab-technician', 'reception-clerk'],
        equipment: ['barcode-scanner', 'label-printer'],
        procedures: [],
        averageProcessingTime: 5,
        capacity: 10,
        currentLoad: 0
      },
      {
        id: 'processing-station-1',
        name: 'Processing Station 1',
        location: locations.find(l => l.id === 'processing')!,
        requiredRoles: ['lab-technician'],
        equipment: ['centrifuge', 'pipettes', 'aliquot-tubes'],
        procedures: [],
        averageProcessingTime: 15,
        capacity: 5,
        currentLoad: 0
      },
      {
        id: 'chemistry-analyzer-1',
        name: 'Chemistry Analyzer 1',
        location: locations.find(l => l.id === 'chemistry')!,
        requiredRoles: ['lab-technician', 'chemist'],
        equipment: ['chemistry-analyzer', 'quality-controls'],
        procedures: [],
        averageProcessingTime: 30,
        capacity: 20,
        currentLoad: 0
      },
      {
        id: 'hematology-analyzer-1',
        name: 'Hematology Analyzer 1',
        location: locations.find(l => l.id === 'hematology')!,
        requiredRoles: ['lab-technician', 'hematologist'],
        equipment: ['hematology-analyzer', 'microscope'],
        procedures: [],
        averageProcessingTime: 20,
        capacity: 15,
        currentLoad: 0
      }
    ];

    this.workflowStations$.next(defaultStations);
  }

  /**
   * Update specimen tracking data
   */
  private async updateSpecimenTracking(specimenId: string, custodyEvent: ChainOfCustodyEvent): Promise<void> {
    const currentTracking = this.trackedSpecimens$.value;
    let trackingData = currentTracking.get(specimenId);

    if (!trackingData) {
      // Create new tracking data
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      trackingData = await this.buildTrackingData(specimen);
    }

    // Add custody event
    trackingData.chainOfCustody.push(custodyEvent);

    // Update current location and status
    if (custodyEvent.toLocation) {
      const location = this.locations$.value.find(l => l.id === custodyEvent.toLocation);
      if (location) {
        trackingData.currentLocation = location;
      }
    }

    // Generate alerts
    trackingData.alerts = this.generateAlerts(trackingData);

    // Update the map
    currentTracking.set(specimenId, trackingData);
    this.trackedSpecimens$.next(new Map(currentTracking));
  }

  /**
   * Build tracking data from specimen
   */
  private async buildTrackingData(specimen: Specimen): Promise<SpecimenTrackingData> {
    // Get current location
    const locationExt = specimen.extension?.find(ext => 
      ext.url === 'http://lims.local/specimen-location'
    );
    const locationId = locationExt?.valueString;
    const currentLocation = locationId ? 
      this.locations$.value.find(l => l.id === locationId) : 
      this.locations$.value[0]; // Default to first location

    // Get chain of custody events (would be loaded from audit events in real implementation)
    const chainOfCustody: ChainOfCustodyEvent[] = [];

    // Determine priority from specimen
    const priority = specimen.priority?.coding?.[0]?.code === 'urgent' ? 'urgent' : 
                    specimen.priority?.coding?.[0]?.code === 'stat' ? 'stat' : 'routine';

    const trackingData: SpecimenTrackingData = {
      specimen,
      currentLocation: currentLocation!,
      currentStatus: {
        code: specimen.status || 'available',
        display: this.getStatusDisplay(specimen.status || 'available'),
        system: 'http://hl7.org/fhir/specimen-status',
        allowedTransitions: this.getAllowedStatusTransitions(specimen.status || 'available')
      },
      chainOfCustody,
      priority,
      alerts: []
    };

    // Generate alerts
    trackingData.alerts = this.generateAlerts(trackingData);

    return trackingData;
  }

  /**
   * Get status display name
   */
  private getStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      'available': 'Available',
      'unavailable': 'Unavailable',
      'unsatisfactory': 'Unsatisfactory',
      'entered-in-error': 'Entered in Error'
    };
    return statusMap[status] || status;
  }

  /**
   * Get allowed status transitions
   */
  private getAllowedStatusTransitions(currentStatus: string): string[] {
    const transitionMap: { [key: string]: string[] } = {
      'available': ['unavailable', 'unsatisfactory'],
      'unavailable': ['available'],
      'unsatisfactory': ['available', 'entered-in-error'],
      'entered-in-error': []
    };
    return transitionMap[currentStatus] || [];
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `custody-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}