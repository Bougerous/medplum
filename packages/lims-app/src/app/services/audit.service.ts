import { Injectable, OnDestroy } from '@angular/core';
import { AuditEvent, } from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { LIMSErrorType } from '../types/fhir-types';
import { AuthService } from './auth.service';
import { ErrorHandlingService } from './error-handling.service';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  action: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome: 'success' | 'minor-failure' | 'serious-failure' | 'major-failure';
  timestamp: Date;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export enum SecurityEventType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data-access',
  DATA_MODIFICATION = 'data-modification',
  SYSTEM_ACCESS = 'system-access',
  SECURITY_ALERT = 'security-alert',
}

@Injectable({
  providedIn: 'root',
})
export class AuditService implements OnDestroy {
  private securityEvents$ = new BehaviorSubject<SecurityEvent[]>([]);
  private eventQueue: SecurityEvent[] = [];
  private batchSize = 10;
  private batchTimeout = 5000; // 5 seconds
  private batchTimer: any;

  constructor(
    private medplumService: MedplumService,
    private authService: AuthService,
    private errorHandlingService: ErrorHandlingService,
  ) {
    this.startBatchProcessor();
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>,
  ): Promise<void> {
    const securityEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
      ipAddress: await this.getClientIpAddress(),
      userAgent: navigator.userAgent,
    };

    // Add to local queue
    this.eventQueue.push(securityEvent);

    // Update observable
    const currentEvents = this.securityEvents$.value;
    this.securityEvents$.next([securityEvent, ...currentEvents].slice(0, 100)); // Keep last 100 events

    // Process batch if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      await this.processBatch();
    }

    console.log('Security event logged:', securityEvent);
  }

  /**
   * Log authentication events
   */
  async logAuthenticationEvent(
    action:
      | 'login-attempt'
      | 'login-success'
      | 'login-failure'
      | 'logout'
      | 'session-timeout',
    userId?: string,
    details?: any,
  ): Promise<void> {
    await this.logSecurityEvent({
      type: SecurityEventType.AUTHENTICATION,
      action,
      userId,
      outcome: action.includes('failure') ? 'serious-failure' : 'success',
      details,
    });
  }

  /**
   * Log authorization events
   */
  async logAuthorizationEvent(
    action: 'access-granted' | 'access-denied' | 'permission-check',
    resourceType?: string,
    resourceId?: string,
    details?: any,
  ): Promise<void> {
    const currentUser = this.authService.getCurrentUserSync();

    await this.logSecurityEvent({
      type: SecurityEventType.AUTHORIZATION,
      action,
      userId: currentUser?.practitioner.id,
      resourceType,
      resourceId,
      outcome: action === 'access-denied' ? 'serious-failure' : 'success',
      details,
    });
  }

  /**
   * Log data access events
   */
  async logDataAccessEvent(
    action: 'read' | 'search' | 'export',
    resourceType: string,
    resourceId?: string,
    details?: any,
  ): Promise<void> {
    const currentUser = this.authService.getCurrentUserSync();

    await this.logSecurityEvent({
      type: SecurityEventType.DATA_ACCESS,
      action,
      userId: currentUser?.practitioner.id,
      resourceType,
      resourceId,
      outcome: 'success',
      details,
    });
  }

  /**
   * Log data modification events
   */
  async logDataModificationEvent(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId?: string,
    details?: any,
  ): Promise<void> {
    const currentUser = this.authService.getCurrentUserSync();

    await this.logSecurityEvent({
      type: SecurityEventType.DATA_MODIFICATION,
      action,
      userId: currentUser?.practitioner.id,
      resourceType,
      resourceId,
      outcome: 'success',
      details,
    });
  }

  /**
   * Log system access events
   */
  async logSystemAccessEvent(
    action: 'page-access' | 'feature-access' | 'admin-access',
    details?: any,
  ): Promise<void> {
    const currentUser = this.authService.getCurrentUserSync();

    await this.logSecurityEvent({
      type: SecurityEventType.SYSTEM_ACCESS,
      action,
      userId: currentUser?.practitioner.id,
      outcome: 'success',
      details,
    });
  }

  /**
   * Log security alerts
   */
  async logSecurityAlert(
    action:
      | 'suspicious-activity'
      | 'multiple-failed-logins'
      | 'unauthorized-access-attempt',
    details?: any,
  ): Promise<void> {
    const currentUser = this.authService.getCurrentUserSync();

    await this.logSecurityEvent({
      type: SecurityEventType.SECURITY_ALERT,
      action,
      userId: currentUser?.practitioner.id,
      outcome: 'success',
      details,
    });
  }

  /**
   * Generic log event method for backward compatibility
   */
  async logEvent(event: any): Promise<void> {
    console.log('Audit event:', event);
    // For now, just log to console. In a real implementation, this would be more sophisticated
  }

  /**
   * Get security events observable
   */
  getSecurityEvents(): Observable<SecurityEvent[]> {
    return this.securityEvents$.asObservable();
  }

  /**
   * Get recent security events
   */
  getRecentEvents(limit: number = 50): SecurityEvent[] {
    return this.securityEvents$.value.slice(0, limit);
  }

  /**
   * Search security events
   */
  searchEvents(criteria: {
    type?: SecurityEventType;
    action?: string;
    userId?: string;
    resourceType?: string;
    outcome?: string;
    fromDate?: Date;
    toDate?: Date;
  }): SecurityEvent[] {
    let events = this.securityEvents$.value;

    if (criteria.type) {
      events = events.filter((event) => event.type === criteria.type);
    }

    if (criteria.action) {
      events = events.filter((event) => event.action === criteria.action);
    }

    if (criteria.userId) {
      events = events.filter((event) => event.userId === criteria.userId);
    }

    if (criteria.resourceType) {
      events = events.filter(
        (event) => event.resourceType === criteria.resourceType,
      );
    }

    if (criteria.outcome) {
      events = events.filter((event) => event.outcome === criteria.outcome);
    }

    if (criteria.fromDate) {
      events = events.filter((event) => event.timestamp >= criteria.fromDate!);
    }

    if (criteria.toDate) {
      events = events.filter((event) => event.timestamp <= criteria.toDate!);
    }

    return events;
  }

  /**
   * Create FHIR AuditEvent from SecurityEvent
   */
  private createFHIRAuditEvent(securityEvent: SecurityEvent): AuditEvent {
    const auditEvent: AuditEvent = {
      resourceType: 'AuditEvent',
      type: {
        system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
        code: this.mapEventTypeToCode(securityEvent.type),
        display: this.mapEventTypeToDisplay(securityEvent.type),
      },
      action: securityEvent.action as any,
      recorded: securityEvent.timestamp.toISOString(),
      outcome: securityEvent.outcome as any,
      agent: [
        {
          type: {
            coding: [
              {
                system:
                  'http://terminology.hl7.org/CodeSystem/extra-security-role-type',
                code: 'humanuser',
                display: 'Human User',
              },
            ],
          },
          who: securityEvent.userId
            ? {
              reference: `Practitioner/${securityEvent.userId}`,
            }
            : {
              identifier: {
                value: 'anonymous',
              },
            },
          requestor: true,
          network: {
            address: securityEvent.ipAddress,
            type: '2', // IP Address
          },
        },
      ],
      source: {
        site: 'LIMS Application',
        observer: {
          display: 'LIMS Audit Service',
        },
      },
    };

    // Add entity information if available
    if (securityEvent.resourceType && securityEvent.resourceId) {
      auditEvent.entity = [
        {
          what: {
            reference: `${securityEvent.resourceType}/${securityEvent.resourceId}`,
          },
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
            code: '2', // System Object
            display: 'System Object',
          },
        },
      ];
    }

    // Add details if available
    if (securityEvent.details) {
      auditEvent.outcomeDesc = JSON.stringify(securityEvent.details);
    }

    return auditEvent;
  }

  /**
   * Process batch of events
   */
  private async processBatch(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToProcess = this.eventQueue.splice(0, this.batchSize);

    try {
      // Create FHIR AuditEvent resources
      const auditEvents = eventsToProcess.map((event) =>
        this.createFHIRAuditEvent(event),
      );

      // Send to Medplum in batch
      for (const auditEvent of auditEvents) {
        await this.medplumService.createResource(auditEvent);
      }

      console.log(`Processed ${eventsToProcess.length} audit events`);
    } catch (error) {
      console.error('Failed to process audit events:', error);

      // Re-queue failed events
      this.eventQueue.unshift(...eventsToProcess);

      // Log the error
      this.errorHandlingService.handleError({
        type: LIMSErrorType.INTEGRATION_ERROR,
        message: 'Failed to process audit events',
        details: error,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Start batch processor timer
   */
  private startBatchProcessor(): void {
    this.batchTimer = setInterval(async () => {
      if (this.eventQueue.length > 0) {
        await this.processBatch();
      }
    }, this.batchTimeout);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get client IP address (simplified)
   */
  private async getClientIpAddress(): Promise<string> {
    // In a real implementation, you might use a service to get the actual IP
    return 'unknown';
  }

  /**
   * Map security event type to FHIR code
   */
  private mapEventTypeToCode(type: SecurityEventType): string {
    const mapping: Record<SecurityEventType, string> = {
      [SecurityEventType.AUTHENTICATION]: 'rest',
      [SecurityEventType.AUTHORIZATION]: 'rest',
      [SecurityEventType.DATA_ACCESS]: 'rest',
      [SecurityEventType.DATA_MODIFICATION]: 'rest',
      [SecurityEventType.SYSTEM_ACCESS]: 'rest',
      [SecurityEventType.SECURITY_ALERT]: 'rest',
    };

    return mapping[type] || 'rest';
  }

  /**
   * Map security event type to display name
   */
  private mapEventTypeToDisplay(type: SecurityEventType): string {
    const mapping: Record<SecurityEventType, string> = {
      [SecurityEventType.AUTHENTICATION]: 'Authentication Event',
      [SecurityEventType.AUTHORIZATION]: 'Authorization Event',
      [SecurityEventType.DATA_ACCESS]: 'Data Access Event',
      [SecurityEventType.DATA_MODIFICATION]: 'Data Modification Event',
      [SecurityEventType.SYSTEM_ACCESS]: 'System Access Event',
      [SecurityEventType.SECURITY_ALERT]: 'Security Alert',
    };

    return mapping[type] || 'Security Event';
  }

  /**
   * Log unauthorized access attempts
   */
  async logUnauthorizedAccess(
    userId: string,
    resource: string,
    details?: string,
  ): Promise<void> {
    await this.logSecurityEvent({
      type: SecurityEventType.AUTHORIZATION,
      action: 'unauthorized-access',
      userId,
      outcome: 'serious-failure',
      details: {
        resource,
        description: details,
      },
    });
  }

  /**
   * Log patient portal access events
   */
  async logPatientPortalAccess(
    patientId: string,
    action: string,
    details?: string,
  ): Promise<void> {
    await this.logSecurityEvent({
      type: SecurityEventType.SYSTEM_ACCESS,
      action: `patient-portal-${action}`,
      resourceType: 'Patient',
      resourceId: patientId,
      outcome: 'success',
      details: {
        description: details,
        portal: 'patient',
      },
    });
  }

  /**
   * Cleanup on service destruction
   */
  ngOnDestroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Process remaining events
    if (this.eventQueue.length > 0) {
      this.processBatch();
    }
  }
}
