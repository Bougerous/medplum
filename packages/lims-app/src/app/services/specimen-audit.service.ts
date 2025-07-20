import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { MedplumService } from '../medplum.service';
import { AuditEvent, Specimen } from '../types/fhir-types';
import { AuthService } from './auth.service';
import { ErrorHandlingService } from './error-handling.service';

export interface SpecimenAuditTrail {
  specimenId: string;
  accessionNumber: string;
  events: AuditEventSummary[];
  complianceStatus: ComplianceStatus;
  chainOfCustodyIntegrity: ChainOfCustodyIntegrity;
  qualityMetrics: QualityMetrics;
}

export interface AuditEventSummary {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  action: string;
  outcome: 'success' | 'failure' | 'warning';
  performer: {
    id: string;
    name: string;
    role: string;
  };
  location?: string;
  details: { [key: string]: any };
  complianceFlags: ComplianceFlag[];
}

export enum AuditEventType {
  SPECIMEN_RECEIVED = 'specimen-received',
  SPECIMEN_PROCESSED = 'specimen-processed',
  LOCATION_CHANGED = 'location-changed',
  STATUS_CHANGED = 'status-changed',
  QR_CODE_SCANNED = 'qr-code-scanned',
  LABEL_PRINTED = 'label-printed',
  TEMPERATURE_RECORDED = 'temperature-recorded',
  QUALITY_CHECK = 'quality-check',
  DISPOSAL = 'disposal',
  ERROR_OCCURRED = 'error-occurred'
}

export interface ComplianceStatus {
  overall: 'compliant' | 'non-compliant' | 'warning';
  chainOfCustody: 'intact' | 'broken' | 'questionable';
  temperatureControl: 'maintained' | 'excursion' | 'unknown';
  timeRequirements: 'met' | 'exceeded' | 'critical';
  documentation: 'complete' | 'incomplete' | 'missing';
  violations: ComplianceViolation[];
}

export interface ComplianceViolation {
  id: string;
  type: 'chain-of-custody' | 'temperature' | 'time' | 'documentation' | 'procedure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  correctionAction?: string;
}

export interface ComplianceFlag {
  type: 'warning' | 'violation' | 'critical';
  category: string;
  message: string;
  requiresAction: boolean;
}

export interface ChainOfCustodyIntegrity {
  status: 'intact' | 'broken' | 'questionable';
  gaps: CustodyGap[];
  handoffs: CustodyHandoff[];
  totalHandoffs: number;
  averageHandoffTime: number;
  longestGap: number; // in minutes
}

export interface CustodyGap {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in minutes
  reason?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface CustodyHandoff {
  id: string;
  timestamp: Date;
  fromPerson: string;
  toPerson: string;
  fromLocation: string;
  toLocation: string;
  qrCodeScanned: boolean;
  witnessed: boolean;
  witness?: string;
}

export interface QualityMetrics {
  handlingScore: number; // 0-100
  timelinessScore: number; // 0-100
  documentationScore: number; // 0-100
  overallScore: number; // 0-100
  benchmarkComparison: {
    betterThan: number; // percentage of similar specimens
    category: 'excellent' | 'good' | 'average' | 'poor';
  };
}

export interface ComplianceReport {
  id: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalSpecimens: number;
    compliantSpecimens: number;
    violationsCount: number;
    criticalViolations: number;
    averageHandlingTime: number;
    complianceRate: number;
  };
  violations: ComplianceViolation[];
  trends: ComplianceTrend[];
  recommendations: string[];
  generatedAt: Date;
  generatedBy: string;
}

export interface ComplianceTrend {
  metric: string;
  period: string;
  value: number;
  change: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface RegulatoryRequirement {
  id: string;
  name: string;
  description: string;
  category: 'CAP' | 'CLIA' | 'FDA' | 'ISO' | 'HIPAA' | 'Custom';
  requirements: {
    chainOfCustody: boolean;
    temperatureControl: boolean;
    timeRequirements: {
      enabled: boolean;
      maxProcessingTime?: number; // hours
      maxStorageTime?: number; // hours
    };
    documentation: string[];
    qualityControls: string[];
  };
  applicableSpecimenTypes: string[];
  penalties: {
    warning: string;
    violation: string;
    critical: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SpecimenAuditService {
  private auditTrails$ = new BehaviorSubject<Map<string, SpecimenAuditTrail>>(new Map());
  private complianceReports$ = new BehaviorSubject<ComplianceReport[]>([]);
  private regulatoryRequirements$ = new BehaviorSubject<RegulatoryRequirement[]>([]);
  private auditEventStream$ = new Subject<AuditEventSummary>();

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private authService: AuthService
  ) {
    this.initializeRegulatoryRequirements();
  }

  /**
   * Get audit trail for a specific specimen
   */
  getSpecimenAuditTrail(specimenId: string): Observable<SpecimenAuditTrail | undefined> {
    return this.auditTrails$.pipe(
      map(trails => trails.get(specimenId))
    );
  }

  /**
   * Get all audit trails
   */
  getAllAuditTrails(): Observable<SpecimenAuditTrail[]> {
    return this.auditTrails$.pipe(
      map(trails => Array.from(trails.values()))
    );
  }

  /**
   * Get audit event stream
   */
  getAuditEventStream(): Observable<AuditEventSummary> {
    return this.auditEventStream$.asObservable();
  }

  /**
   * Record audit event
   */
  async recordAuditEvent(
    specimenId: string,
    eventType: AuditEventType,
    action: string,
    details: { [key: string]: any } = {},
    outcome: 'success' | 'failure' | 'warning' = 'success'
  ): Promise<void> {
    try {
      const currentUser = this.authService.getCurrentUserSync();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Create FHIR AuditEvent
      const auditEvent: AuditEvent = {
        resourceType: 'AuditEvent',
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
          code: 'rest',
          display: 'RESTful Operation'
        },
        subtype: [{
          system: 'http://lims.local/audit-event-types',
          code: eventType,
          display: this.getEventTypeDisplay(eventType)
        }],
        action: action as any,
        recorded: new Date().toISOString(),
        outcome: outcome === 'success' ? '0' : outcome === 'warning' ? '4' : '8',
        agent: [{
          who: { reference: `Practitioner/${currentUser.practitioner.id}` },
          requestor: true,
          role: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
              code: 'PROV',
              display: 'Healthcare Provider'
            }]
          }]
        }],
        source: {
          observer: { reference: `Organization/${currentUser.projectMembership?.project}` },
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
          detail: Object.entries(details).map(([key, value]) => ({
            type: key,
            valueString: String(value)
          }))
        }]
      };

      const createdAuditEvent = await this.medplumService.createResource(auditEvent);

      // Create audit event summary
      const eventSummary: AuditEventSummary = {
        id: createdAuditEvent.id!,
        timestamp: new Date(),
        eventType,
        action,
        outcome,
        performer: {
          id: currentUser.practitioner.id!,
          name: currentUser.practitioner.name?.[0]?.text || 'Unknown User',
          role: this.getUserRole(currentUser)
        },
        location: details.location,
        details,
        complianceFlags: this.evaluateCompliance(eventType, details, outcome)
      };

      // Update audit trail
      await this.updateAuditTrail(specimenId, eventSummary);

      // Emit event
      this.auditEventStream$.next(eventSummary);

    } catch (error) {
      this.errorHandlingService.handleError(error, 'audit-event-recording');
      throw error;
    }
  }

  /**
   * Load audit trail for specimen
   */
  async loadSpecimenAuditTrail(specimenId: string): Promise<SpecimenAuditTrail> {
    try {
      // Get specimen details
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      const accessionNumber = specimen.accessionIdentifier?.value || specimenId;

      // Search for audit events related to this specimen
      const auditEvents = await this.medplumService.searchResources<AuditEvent>('AuditEvent', {
        'entity': `Specimen/${specimenId}`
      });

      // Convert to audit event summaries
      const events: AuditEventSummary[] = [];
      for (const entry of auditEvents.entry || []) {
        if (entry.resource) {
          const summary = await this.convertToAuditEventSummary(entry.resource);
          events.push(summary);
        }
      }

      // Sort events by timestamp
      events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Analyze chain of custody
      const chainOfCustodyIntegrity = this.analyzeChainOfCustody(events);

      // Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics(events, chainOfCustodyIntegrity);

      // Evaluate compliance
      const complianceStatus = this.evaluateOverallCompliance(events, chainOfCustodyIntegrity);

      const auditTrail: SpecimenAuditTrail = {
        specimenId,
        accessionNumber,
        events,
        complianceStatus,
        chainOfCustodyIntegrity,
        qualityMetrics
      };

      // Cache the audit trail
      const currentTrails = this.auditTrails$.value;
      currentTrails.set(specimenId, auditTrail);
      this.auditTrails$.next(new Map(currentTrails));

      return auditTrail;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'audit-trail-loading');
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    reportType: 'daily' | 'weekly' | 'monthly' | 'custom',
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    try {
      // Search for audit events in the specified period
      const auditEvents = await this.medplumService.searchResources<AuditEvent>('AuditEvent', {
        'date': `le${endDate.toISOString().split('T')[0]}`
      });

      // Group events by specimen
      const specimenEvents = new Map<string, AuditEventSummary[]>();
      for (const entry of auditEvents.entry || []) {
        if (entry.resource) {
          const summary = await this.convertToAuditEventSummary(entry.resource);
          const specimenId = this.extractSpecimenId(entry.resource);

          if (specimenId) {
            if (!specimenEvents.has(specimenId)) {
              specimenEvents.set(specimenId, []);
            }
            specimenEvents.get(specimenId)?.push(summary);
          }
        }
      }

      // Analyze compliance for each specimen
      const violations: ComplianceViolation[] = [];
      let compliantSpecimens = 0;
      let totalHandlingTime = 0;
      let criticalViolations = 0;

      for (const [_specimenId, events] of specimenEvents) {
        const chainOfCustody = this.analyzeChainOfCustody(events);
        const compliance = this.evaluateOverallCompliance(events, chainOfCustody);

        if (compliance.overall === 'compliant') {
          compliantSpecimens++;
        }

        violations.push(...compliance.violations);
        criticalViolations += compliance.violations.filter(v => v.severity === 'critical').length;

        // Calculate handling time (simplified)
        if (events.length > 1) {
          const firstEvent = events[0];
          const lastEvent = events[events.length - 1];
          totalHandlingTime += (lastEvent.timestamp.getTime() - firstEvent.timestamp.getTime()) / (1000 * 60 * 60); // hours
        }
      }

      const totalSpecimens = specimenEvents.size;
      const complianceRate = totalSpecimens > 0 ? (compliantSpecimens / totalSpecimens) * 100 : 100;
      const averageHandlingTime = totalSpecimens > 0 ? totalHandlingTime / totalSpecimens : 0;

      // Generate trends (simplified)
      const trends: ComplianceTrend[] = [
        {
          metric: 'Compliance Rate',
          period: `${startDate.toDateString()} - ${endDate.toDateString()}`,
          value: complianceRate,
          change: 0, // Would calculate from previous period
          trend: 'stable'
        }
      ];

      // Generate recommendations
      const recommendations = this.generateRecommendations(violations, complianceRate);

      const currentUser = this.authService.getCurrentUserSync();
      const report: ComplianceReport = {
        id: `report-${Date.now()}`,
        reportType,
        period: { start: startDate, end: endDate },
        summary: {
          totalSpecimens,
          compliantSpecimens,
          violationsCount: violations.length,
          criticalViolations,
          averageHandlingTime,
          complianceRate
        },
        violations,
        trends,
        recommendations,
        generatedAt: new Date(),
        generatedBy: currentUser?.practitioner.name?.[0]?.text || 'System'
      };

      // Cache the report
      const currentReports = this.complianceReports$.value;
      this.complianceReports$.next([...currentReports, report]);

      return report;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'compliance-report-generation');
      throw error;
    }
  }

  /**
   * Get compliance reports
   */
  getComplianceReports(): Observable<ComplianceReport[]> {
    return this.complianceReports$.asObservable();
  }

  /**
   * Get regulatory requirements
   */
  getRegulatoryRequirements(): Observable<RegulatoryRequirement[]> {
    return this.regulatoryRequirements$.asObservable();
  }

  /**
   * Validate specimen against regulatory requirements
   */
  validateSpecimenCompliance(
    specimenId: string,
    requirementIds: string[]
  ): Observable<{ requirement: RegulatoryRequirement; compliant: boolean; violations: string[] }[]> {
    return combineLatest([
      this.getSpecimenAuditTrail(specimenId),
      this.getRegulatoryRequirements()
    ]).pipe(
      map(([auditTrail, requirements]) => {
        if (!auditTrail) { return []; }

        return requirements
          .filter(req => requirementIds.includes(req.id))
          .map(requirement => {
            const violations: string[] = [];
            let compliant = true;

            // Check chain of custody requirement
            if (requirement.requirements.chainOfCustody &&
              auditTrail.chainOfCustodyIntegrity.status !== 'intact') {
              violations.push('Chain of custody integrity compromised');
              compliant = false;
            }

            // Check time requirements
            if (requirement.requirements.timeRequirements.enabled) {
              // Implementation would check actual timing against requirements
            }

            // Check documentation requirements
            if (requirement.requirements.documentation.length > 0) {
              // Implementation would verify required documentation exists
            }

            return { requirement, compliant, violations };
          });
      })
    );
  }

  /**
   * Update audit trail with new event
   */
  private async updateAuditTrail(specimenId: string, newEvent: AuditEventSummary): Promise<void> {
    const currentTrails = this.auditTrails$.value;
    let auditTrail = currentTrails.get(specimenId);

    if (!auditTrail) {
      // Load the full audit trail if not cached
      auditTrail = await this.loadSpecimenAuditTrail(specimenId);
    } else {
      // Add the new event
      auditTrail.events.push(newEvent);
      auditTrail.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Recalculate metrics
      auditTrail.chainOfCustodyIntegrity = this.analyzeChainOfCustody(auditTrail.events);
      auditTrail.qualityMetrics = this.calculateQualityMetrics(auditTrail.events, auditTrail.chainOfCustodyIntegrity);
      auditTrail.complianceStatus = this.evaluateOverallCompliance(auditTrail.events, auditTrail.chainOfCustodyIntegrity);

      // Update cache
      currentTrails.set(specimenId, auditTrail);
      this.auditTrails$.next(new Map(currentTrails));
    }
  }

  /**
   * Convert FHIR AuditEvent to AuditEventSummary
   */
  private async convertToAuditEventSummary(auditEvent: AuditEvent): Promise<AuditEventSummary> {
    const eventType = auditEvent.subtype?.[0]?.code as AuditEventType || AuditEventType.ERROR_OCCURRED;
    const outcome = auditEvent.outcome === '0' ? 'success' : auditEvent.outcome === '4' ? 'warning' : 'failure';

    // Extract performer information
    const agent = auditEvent.agent?.[0];
    const performerId = agent?.who?.reference?.replace('Practitioner/', '') || 'unknown';

    // In a real implementation, you would look up the practitioner details
    const performer = {
      id: performerId,
      name: 'Unknown User', // Would be looked up
      role: 'Unknown Role'   // Would be looked up
    };

    // Extract details from entity
    const details: { [key: string]: any } = {};
    const entity = auditEvent.entity?.[0];
    if (entity?.detail) {
      for (const detail of entity.detail) {
        if (detail.type && detail.valueString) {
          details[detail.type] = detail.valueString;
        }
      }
    }

    return {
      id: auditEvent.id!,
      timestamp: new Date(auditEvent.recorded),
      eventType,
      action: auditEvent.action || 'unknown',
      outcome,
      performer,
      location: details.location,
      details,
      complianceFlags: this.evaluateCompliance(eventType, details, outcome)
    };
  }

  /**
   * Analyze chain of custody integrity
   */
  private analyzeChainOfCustody(events: AuditEventSummary[]): ChainOfCustodyIntegrity {
    const handoffs: CustodyHandoff[] = [];
    const gaps: CustodyGap[] = [];

    let previousEvent: AuditEventSummary | null = null;
    let totalHandoffTime = 0;

    for (const event of events) {
      if (event.eventType === AuditEventType.LOCATION_CHANGED && previousEvent) {
        const handoff: CustodyHandoff = {
          id: `handoff-${event.id}`,
          timestamp: event.timestamp,
          fromPerson: previousEvent.performer.name,
          toPerson: event.performer.name,
          fromLocation: previousEvent.location || 'Unknown',
          toLocation: event.location || 'Unknown',
          qrCodeScanned: event.details.qrCodeScanned === 'true',
          witnessed: false // Would be determined from event details
        };

        handoffs.push(handoff);

        const handoffTime = event.timestamp.getTime() - previousEvent.timestamp.getTime();
        totalHandoffTime += handoffTime;

        // Check for gaps (more than 30 minutes between events)
        if (handoffTime > 30 * 60 * 1000) {
          gaps.push({
            id: `gap-${event.id}`,
            startTime: previousEvent.timestamp,
            endTime: event.timestamp,
            duration: handoffTime / (1000 * 60), // minutes
            severity: handoffTime > 2 * 60 * 60 * 1000 ? 'high' : 'medium' // 2 hours
          });
        }
      }

      previousEvent = event;
    }

    const averageHandoffTime = handoffs.length > 0 ? totalHandoffTime / handoffs.length / (1000 * 60) : 0; // minutes
    const longestGap = gaps.length > 0 ? Math.max(...gaps.map(g => g.duration)) : 0;

    let status: 'intact' | 'broken' | 'questionable' = 'intact';
    if (gaps.some(g => g.severity === 'high')) {
      status = 'broken';
    } else if (gaps.length > 0) {
      status = 'questionable';
    }

    return {
      status,
      gaps,
      handoffs,
      totalHandoffs: handoffs.length,
      averageHandoffTime,
      longestGap
    };
  }

  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(
    events: AuditEventSummary[],
    chainOfCustody: ChainOfCustodyIntegrity
  ): QualityMetrics {
    // Simplified quality scoring
    let handlingScore = 100;
    let timelinessScore = 100;
    const documentationScore = 100;

    // Reduce scores based on issues
    if (chainOfCustody.status === 'broken') {
      handlingScore -= 30;
    } else if (chainOfCustody.status === 'questionable') {
      handlingScore -= 15;
    }

    if (chainOfCustody.longestGap > 120) { // 2 hours
      timelinessScore -= 25;
    }

    const errorEvents = events.filter(e => e.outcome === 'failure');
    handlingScore -= errorEvents.length * 10;

    const overallScore = (handlingScore + timelinessScore + documentationScore) / 3;

    let category: 'excellent' | 'good' | 'average' | 'poor';
    if (overallScore >= 90) { category = 'excellent'; }
    else if (overallScore >= 75) { category = 'good'; }
    else if (overallScore >= 60) { category = 'average'; }
    else { category = 'poor'; }

    return {
      handlingScore: Math.max(0, handlingScore),
      timelinessScore: Math.max(0, timelinessScore),
      documentationScore: Math.max(0, documentationScore),
      overallScore: Math.max(0, overallScore),
      benchmarkComparison: {
        betterThan: Math.random() * 100, // Would be calculated from actual benchmarks
        category
      }
    };
  }

  /**
   * Evaluate overall compliance
   */
  private evaluateOverallCompliance(
    events: AuditEventSummary[],
    chainOfCustody: ChainOfCustodyIntegrity
  ): ComplianceStatus {
    const violations: ComplianceViolation[] = [];

    // Check chain of custody violations
    if (chainOfCustody.status === 'broken') {
      violations.push({
        id: `violation-${Date.now()}`,
        type: 'chain-of-custody',
        severity: 'high',
        description: 'Chain of custody integrity compromised',
        timestamp: new Date(),
        resolved: false
      });
    }

    // Check for gaps in custody
    for (const gap of chainOfCustody.gaps) {
      if (gap.severity === 'high') {
        violations.push({
          id: `violation-gap-${gap.id}`,
          type: 'chain-of-custody',
          severity: 'medium',
          description: `Custody gap of ${gap.duration.toFixed(1)} minutes detected`,
          timestamp: gap.startTime,
          resolved: false
        });
      }
    }

    // Check for error events
    const errorEvents = events.filter(e => e.outcome === 'failure');
    for (const errorEvent of errorEvents) {
      violations.push({
        id: `violation-error-${errorEvent.id}`,
        type: 'procedure',
        severity: 'medium',
        description: `Error occurred during ${errorEvent.action}`,
        timestamp: errorEvent.timestamp,
        resolved: false
      });
    }

    const criticalViolations = violations.filter(v => v.severity === 'critical').length;
    const highViolations = violations.filter(v => v.severity === 'high').length;

    let overall: 'compliant' | 'non-compliant' | 'warning';
    if (criticalViolations > 0 || highViolations > 2) {
      overall = 'non-compliant';
    } else if (violations.length > 0) {
      overall = 'warning';
    } else {
      overall = 'compliant';
    }

    return {
      overall,
      chainOfCustody: chainOfCustody.status,
      temperatureControl: 'unknown', // Would be determined from temperature events
      timeRequirements: 'met', // Would be calculated based on actual requirements
      documentation: 'complete', // Would be verified against requirements
      violations
    };
  }

  /**
   * Evaluate compliance flags for an event
   */
  private evaluateCompliance(
    eventType: AuditEventType,
    details: { [key: string]: any },
    outcome: 'success' | 'failure' | 'warning'
  ): ComplianceFlag[] {
    const flags: ComplianceFlag[] = [];

    if (outcome === 'failure') {
      flags.push({
        type: 'violation',
        category: 'procedure',
        message: 'Event failed to complete successfully',
        requiresAction: true
      });
    }

    if (eventType === AuditEventType.LOCATION_CHANGED && !details.qrCodeScanned) {
      flags.push({
        type: 'warning',
        category: 'chain-of-custody',
        message: 'Location changed without QR code scan',
        requiresAction: false
      });
    }

    return flags;
  }

  /**
   * Generate recommendations based on violations
   */
  private generateRecommendations(violations: ComplianceViolation[], complianceRate: number): string[] {
    const recommendations: string[] = [];

    if (complianceRate < 90) {
      recommendations.push('Review and strengthen specimen handling procedures');
    }

    const custodyViolations = violations.filter(v => v.type === 'chain-of-custody').length;
    if (custodyViolations > 0) {
      recommendations.push('Implement mandatory QR code scanning for all specimen transfers');
      recommendations.push('Provide additional training on chain of custody procedures');
    }

    const timeViolations = violations.filter(v => v.type === 'time').length;
    if (timeViolations > 0) {
      recommendations.push('Review workflow efficiency and identify bottlenecks');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue current excellent compliance practices');
    }

    return recommendations;
  }

  /**
   * Initialize regulatory requirements
   */
  private initializeRegulatoryRequirements(): void {
    const defaultRequirements: RegulatoryRequirement[] = [
      {
        id: 'cap-specimen-handling',
        name: 'CAP Specimen Handling Requirements',
        description: 'College of American Pathologists specimen handling standards',
        category: 'CAP',
        requirements: {
          chainOfCustody: true,
          temperatureControl: true,
          timeRequirements: {
            enabled: true,
            maxProcessingTime: 24,
            maxStorageTime: 72
          },
          documentation: ['collection-time', 'handler-identification', 'location-tracking'],
          qualityControls: ['temperature-monitoring', 'integrity-checks']
        },
        applicableSpecimenTypes: ['*'],
        penalties: {
          warning: 'Documentation required for corrective action',
          violation: 'Formal investigation and corrective action plan',
          critical: 'Potential suspension of testing privileges'
        }
      },
      {
        id: 'clia-quality-control',
        name: 'CLIA Quality Control Requirements',
        description: 'Clinical Laboratory Improvement Amendments quality standards',
        category: 'CLIA',
        requirements: {
          chainOfCustody: true,
          temperatureControl: false,
          timeRequirements: {
            enabled: false
          },
          documentation: ['specimen-identification', 'test-ordering'],
          qualityControls: ['specimen-integrity']
        },
        applicableSpecimenTypes: ['blood', 'urine', 'tissue'],
        penalties: {
          warning: 'Quality improvement plan required',
          violation: 'Regulatory reporting required',
          critical: 'License suspension possible'
        }
      }
    ];

    this.regulatoryRequirements$.next(defaultRequirements);
  }

  /**
   * Helper methods
   */
  private getEventTypeDisplay(eventType: AuditEventType): string {
    const displayMap: { [key in AuditEventType]: string } = {
      [AuditEventType.SPECIMEN_RECEIVED]: 'Specimen Received',
      [AuditEventType.SPECIMEN_PROCESSED]: 'Specimen Processed',
      [AuditEventType.LOCATION_CHANGED]: 'Location Changed',
      [AuditEventType.STATUS_CHANGED]: 'Status Changed',
      [AuditEventType.QR_CODE_SCANNED]: 'QR Code Scanned',
      [AuditEventType.LABEL_PRINTED]: 'Label Printed',
      [AuditEventType.TEMPERATURE_RECORDED]: 'Temperature Recorded',
      [AuditEventType.QUALITY_CHECK]: 'Quality Check',
      [AuditEventType.DISPOSAL]: 'Disposal',
      [AuditEventType.ERROR_OCCURRED]: 'Error Occurred'
    };
    return displayMap[eventType] || 'Unknown Event';
  }

  private getUserRole(user: any): string {
    // Extract user role from user object
    return user.role || 'Unknown Role';
  }

  private extractSpecimenId(auditEvent: AuditEvent): string | null {
    const entity = auditEvent.entity?.[0];
    if (entity?.what?.reference?.startsWith('Specimen/')) {
      return entity.what.reference.replace('Specimen/', '');
    }
    return null;
  }
}
