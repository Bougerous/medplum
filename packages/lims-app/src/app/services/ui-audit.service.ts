import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { AuthService } from './auth.service';
import { AuditEvent } from '../types/fhir-types';

export interface UIInteractionEvent {
  id: string;
  userId: string;
  userRole: string[];
  action: string;
  component: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditFilter {
  userId?: string;
  action?: string;
  component?: string;
  resource?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UIAuditService {
  private auditEvents$ = new Subject<UIInteractionEvent>();
  private sessionId: string;
  private isAuditingEnabled = true;

  constructor(
    private medplumService: MedplumService,
    private authService: AuthService
  ) {
    this.sessionId = this.generateSessionId();
    this.initializeAuditing();
  }

  /**
   * Log a UI interaction event
   */
  logInteraction(
    action: string,
    component: string,
    details?: Record<string, unknown>,
    resource?: string,
    resourceId?: string
  ): void {
    if (!this.isAuditingEnabled) {
      return;
    }

    const currentUser = this.authService.getCurrentUserSync();
    if (!currentUser) {
      return;
    }

    const event: UIInteractionEvent = {
      id: this.generateEventId(),
      userId: currentUser.practitioner.id!,
      userRole: currentUser.roles,
      action,
      component,
      resource,
      resourceId,
      details,
      timestamp: new Date(),
      sessionId: this.sessionId,
      ipAddress: this.getClientIP(),
      userAgent: navigator.userAgent
    };

    // Emit event for real-time monitoring
    this.auditEvents$.next(event);

    // Store in FHIR AuditEvent resource
    this.createFHIRAuditEvent(event);
  }

  /**
   * Log dashboard widget interaction
   */
  logWidgetInteraction(
    widgetType: string,
    action: string,
    details?: any
  ): void {
    this.logInteraction(
      action,
      `dashboard-widget-${widgetType}`,
      details
    );
  }

  /**
   * Log navigation event
   */
  logNavigation(
    fromRoute: string,
    toRoute: string,
    details?: any
  ): void {
    this.logInteraction(
      'navigation',
      'router',
      {
        from: fromRoute,
        to: toRoute,
        ...details
      }
    );
  }

  /**
   * Log data access event
   */
  logDataAccess(
    resource: string,
    resourceId: string,
    action: 'view' | 'search' | 'export',
    details?: any
  ): void {
    this.logInteraction(
      `data-${action}`,
      'data-access',
      details,
      resource,
      resourceId
    );
  }

  /**
   * Log permission check failure
   */
  logPermissionDenied(
    attemptedAction: string,
    resource?: string,
    details?: any
  ): void {
    this.logInteraction(
      'permission-denied',
      'security',
      {
        attemptedAction,
        resource,
        ...details
      }
    );
  }

  /**
   * Log form submission
   */
  logFormSubmission(
    formName: string,
    action: 'create' | 'update' | 'delete',
    resourceType?: string,
    resourceId?: string,
    details?: any
  ): void {
    this.logInteraction(
      `form-${action}`,
      `form-${formName}`,
      details,
      resourceType,
      resourceId
    );
  }

  /**
   * Log search operation
   */
  logSearch(
    searchType: string,
    query: string,
    resultCount: number,
    details?: any
  ): void {
    this.logInteraction(
      'search',
      `search-${searchType}`,
      {
        query,
        resultCount,
        ...details
      }
    );
  }

  /**
   * Log report generation
   */
  logReportGeneration(
    reportType: string,
    format: string,
    parameters?: any
  ): void {
    this.logInteraction(
      'report-generation',
      'reporting',
      {
        reportType,
        format,
        parameters
      }
    );
  }

  /**
   * Log configuration change
   */
  logConfigurationChange(
    configType: string,
    oldValue: any,
    newValue: any,
    details?: any
  ): void {
    this.logInteraction(
      'configuration-change',
      'system-config',
      {
        configType,
        oldValue,
        newValue,
        ...details
      }
    );
  }

  /**
   * Get audit events as observable
   */
  getAuditEvents(): Observable<UIInteractionEvent> {
    return this.auditEvents$.asObservable();
  }

  /**
   * Query audit events from FHIR store
   */
  async queryAuditEvents(filter: AuditFilter): Promise<UIInteractionEvent[]> {
    try {
      const searchParams: any = {
        type: 'http://terminology.hl7.org/CodeSystem/audit-event-type|rest',
        _sort: '-date',
        _count: filter.limit || 100
      };

      if (filter.userId) {
        searchParams['agent.who.identifier'] = filter.userId;
      }

      if (filter.dateFrom) {
        searchParams['date'] = `ge${filter.dateFrom.toISOString()}`;
      }

      if (filter.dateTo) {
        const dateFilter = searchParams['date'] || '';
        searchParams['date'] = `${dateFilter}${dateFilter ? '&' : ''}le${filter.dateTo.toISOString()}`;
      }

      const bundle = await this.medplumService.searchResources<AuditEvent>('AuditEvent', searchParams);
      
      return bundle.entry?.map(entry => this.mapFHIRAuditEventToUIEvent(entry.resource!)) || [];
    } catch (error) {
      console.error('Failed to query audit events:', error);
      return [];
    }
  }

  /**
   * Enable or disable auditing
   */
  setAuditingEnabled(enabled: boolean): void {
    this.isAuditingEnabled = enabled;
    
    if (enabled) {
      this.logInteraction('audit-enabled', 'system-config');
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Start new session
   */
  startNewSession(): void {
    this.sessionId = this.generateSessionId();
    this.logInteraction('session-start', 'authentication');
  }

  /**
   * End current session
   */
  endSession(): void {
    this.logInteraction('session-end', 'authentication');
  }

  private initializeAuditing(): void {
    // Log service initialization
    this.logInteraction('audit-service-init', 'system');

    // Set up automatic session management
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.logInteraction('user-authenticated', 'authentication');
      } else {
        this.logInteraction('user-logged-out', 'authentication');
      }
    });

    // Log page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.logInteraction(
        document.hidden ? 'page-hidden' : 'page-visible',
        'browser-event'
      );
    });

    // Log before page unload
    window.addEventListener('beforeunload', () => {
      this.logInteraction('page-unload', 'browser-event');
    });
  }

  private async createFHIRAuditEvent(event: UIInteractionEvent): Promise<void> {
    try {
      const auditEvent: AuditEvent = {
        resourceType: 'AuditEvent',
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
          code: 'rest',
          display: 'RESTful Operation'
        },
        action: this.mapActionToFHIRCode(event.action),
        recorded: event.timestamp.toISOString(),
        outcome: '0', // Success
        agent: [{
          type: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/extra-security-role-type',
              code: 'humanuser',
              display: 'Human User'
            }]
          },
          who: {
            identifier: {
              value: event.userId
            }
          },
          requestor: true,
          role: event.userRole.map(role => ({
            coding: [{
              system: 'http://lims.local/user-roles',
              code: role,
              display: role
            }]
          }))
        }],
        source: {
          site: 'LIMS Web Application',
          observer: {
            display: 'LIMS UI Audit Service'
          },
          type: [{
            system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
            code: '4',
            display: 'Application Server'
          }]
        },
        entity: event.resource ? [{
          what: {
            reference: `${event.resource}/${event.resourceId || 'unknown'}`
          },
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
            code: '2',
            display: 'System Object'
          }
        }] : undefined,
        extension: [{
          url: 'http://lims.local/audit/ui-interaction',
          valueString: JSON.stringify({
            component: event.component,
            details: event.details,
            sessionId: event.sessionId,
            userAgent: event.userAgent,
            ipAddress: event.ipAddress
          })
        }]
      };

      await this.medplumService.createResource(auditEvent);
    } catch (error) {
      console.error('Failed to create FHIR audit event:', error);
    }
  }

  private mapActionToFHIRCode(action: string): string {
    // Map UI actions to FHIR audit event action codes
    const actionMap: { [key: string]: string } = {
      'create': 'C',
      'read': 'R',
      'update': 'U',
      'delete': 'D',
      'search': 'R',
      'view': 'R',
      'navigation': 'R',
      'export': 'R',
      'login': 'E',
      'logout': 'E'
    };

    // Extract base action from compound actions
    const baseAction = action.split('-')[0];
    return actionMap[baseAction] || 'E'; // Execute as default
  }

  private mapFHIRAuditEventToUIEvent(auditEvent: AuditEvent): UIInteractionEvent {
    const extension = auditEvent.extension?.find(
      ext => ext.url === 'http://lims.local/audit/ui-interaction'
    );
    
    const extensionData = extension?.valueString ? JSON.parse(extension.valueString) : {};
    
    return {
      id: auditEvent.id!,
      userId: auditEvent.agent?.[0]?.who?.identifier?.value || 'unknown',
      userRole: auditEvent.agent?.[0]?.role?.map(r => r.coding?.[0]?.code || '') || [],
      action: this.mapFHIRCodeToAction(auditEvent.action || 'E'),
      component: extensionData.component || 'unknown',
      resource: auditEvent.entity?.[0]?.what?.reference?.split('/')[0],
      resourceId: auditEvent.entity?.[0]?.what?.reference?.split('/')[1],
      details: extensionData.details,
      timestamp: new Date(auditEvent.recorded || Date.now()),
      sessionId: extensionData.sessionId || 'unknown',
      ipAddress: extensionData.ipAddress,
      userAgent: extensionData.userAgent
    };
  }

  private mapFHIRCodeToAction(code: string): string {
    const codeMap: { [key: string]: string } = {
      'C': 'create',
      'R': 'read',
      'U': 'update',
      'D': 'delete',
      'E': 'execute'
    };
    
    return codeMap[code] || 'unknown';
  }

  private generateSessionId(): string {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  private generateEventId(): string {
    return 'event-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  private getClientIP(): string {
    // In a real implementation, this would be obtained from the server
    // For client-side, we can't reliably get the real IP
    return 'client-side';
  }
}