import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { AuditEvent, DiagnosticReport, Specimen, ServiceRequest } from '@medplum/fhirtypes';
import { SearchParams } from '../types/fhir-types';

export interface ComplianceReport {
  id: string;
  type: ComplianceReportType;
  title: string;
  description: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  status: 'generating' | 'completed' | 'failed';
  data: any;
  summary: ComplianceSummary;
  downloadUrl?: string;
}

export type ComplianceReportType = 
  | 'clia-compliance'
  | 'cap-inspection'
  | 'hipaa-audit'
  | 'quality-assurance'
  | 'turnaround-time'
  | 'proficiency-testing'
  | 'personnel-competency'
  | 'equipment-maintenance'
  | 'population-health'
  | 'clinical-outcomes';

export interface ComplianceSummary {
  totalItems: number;
  compliantItems: number;
  nonCompliantItems: number;
  complianceRate: number;
  criticalFindings: number;
  recommendations: string[];
}

export interface AuditTrailEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'success' | 'failure' | 'warning';
}

export interface QualityAssuranceMetric {
  category: string;
  metric: string;
  value: number;
  target: number;
  unit: string;
  status: 'pass' | 'fail' | 'warning';
  trend: 'improving' | 'declining' | 'stable';
  lastUpdated: Date;
}

export interface PopulationHealthMetric {
  population: string;
  testType: string;
  totalTests: number;
  positiveResults: number;
  positivityRate: number;
  ageGroups: Record<string, number>;
  geographicDistribution: Record<string, number>;
  trends: Array<{
    period: string;
    value: number;
  }>;
}

export interface ClinicalOutcome {
  condition: string;
  totalCases: number;
  earlyDetection: number;
  treatmentResponse: number;
  followUpCompliance: number;
  outcomes: {
    improved: number;
    stable: number;
    declined: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ComplianceReportingService {
  private complianceReports$ = new BehaviorSubject<ComplianceReport[]>([]);
  private auditTrail$ = new BehaviorSubject<AuditTrailEntry[]>([]);

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService
  ) {}

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    type: ComplianceReportType,
    period: { start: Date; end: Date },
    options?: any
  ): Promise<ComplianceReport> {
    const report: ComplianceReport = {
      id: this.generateReportId(),
      type,
      title: this.getReportTitle(type),
      description: this.getReportDescription(type),
      generatedAt: new Date(),
      period,
      status: 'generating',
      data: {},
      summary: {
        totalItems: 0,
        compliantItems: 0,
        nonCompliantItems: 0,
        complianceRate: 0,
        criticalFindings: 0,
        recommendations: []
      }
    };

    // Add to reports list
    const currentReports = this.complianceReports$.value;
    this.complianceReports$.next([...currentReports, report]);

    // Generate report data asynchronously
    this.processComplianceReport(report, options);

    return report;
  }

  /**
   * Get all compliance reports
   */
  getComplianceReports(): Observable<ComplianceReport[]> {
    return this.complianceReports$.asObservable();
  }

  /**
   * Get specific compliance report
   */
  getComplianceReport(id: string): ComplianceReport | undefined {
    return this.complianceReports$.value.find(report => report.id === id);
  }

  /**
   * Get audit trail entries
   */
  getAuditTrail(
    filters?: {
      userId?: string;
      resourceType?: string;
      action?: string;
      dateRange?: { start: Date; end: Date };
    }
  ): Observable<AuditTrailEntry[]> {
    // In a real implementation, this would query AuditEvent resources
    return this.auditTrail$.asObservable();
  }

  /**
   * Generate CLIA compliance report
   */
  async generateCLIAComplianceReport(period: { start: Date; end: Date }): Promise<any> {
    try {
      // CLIA requirements include:
      // - Personnel qualifications
      // - Quality control
      // - Proficiency testing
      // - Quality assurance
      // - Patient test management

      const [
        personnelRecords,
        qualityControlData,
        proficiencyTestResults,
        patientTestData
      ] = await Promise.all([
        this.getPersonnelQualifications(period),
        this.getQualityControlData(period),
        this.getProficiencyTestResults(period),
        this.getPatientTestData(period)
      ]);

      return {
        personnel: personnelRecords,
        qualityControl: qualityControlData,
        proficiencyTesting: proficiencyTestResults,
        patientTesting: patientTestData,
        compliance: this.calculateCLIACompliance({
          personnelRecords,
          qualityControlData,
          proficiencyTestResults,
          patientTestData
        })
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'clia-compliance-report');
      throw error;
    }
  }

  /**
   * Generate CAP inspection report
   */
  async generateCAPInspectionReport(period: { start: Date; end: Date }): Promise<any> {
    try {
      // CAP checklist items include:
      // - Laboratory director qualifications
      // - Technical supervisor qualifications
      // - Testing personnel qualifications
      // - Quality management system
      // - Pre-analytical systems
      // - Analytical systems
      // - Post-analytical systems

      const checklistItems = await this.evaluateCAPChecklist(period);
      
      return {
        checklistItems,
        summary: this.summarizeCAPCompliance(checklistItems),
        recommendations: this.generateCAPRecommendations(checklistItems)
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'cap-inspection-report');
      throw error;
    }
  }

  /**
   * Generate HIPAA audit report
   */
  async generateHIPAAAuditReport(period: { start: Date; end: Date }): Promise<any> {
    try {
      const auditEvents = await this.getAuditEvents(period);
      
      const hipaaAnalysis = {
        accessLogs: this.analyzeAccessLogs(auditEvents),
        dataBreaches: this.identifyPotentialBreaches(auditEvents),
        userActivity: this.analyzeUserActivity(auditEvents),
        systemSecurity: this.evaluateSystemSecurity(auditEvents),
        businessAssociates: this.auditBusinessAssociates()
      };

      return {
        ...hipaaAnalysis,
        compliance: this.calculateHIPAACompliance(hipaaAnalysis),
        recommendations: this.generateHIPAARecommendations(hipaaAnalysis)
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'hipaa-audit-report');
      throw error;
    }
  }

  /**
   * Generate quality assurance report
   */
  async generateQualityAssuranceReport(period: { start: Date; end: Date }): Promise<any> {
    try {
      const qaMetrics = await this.getQualityAssuranceMetrics(period);
      
      return {
        metrics: qaMetrics,
        trends: this.analyzeQualityTrends(qaMetrics),
        incidents: await this.getQualityIncidents(period),
        corrective_actions: await this.getCorrectiveActions(period),
        recommendations: this.generateQARecommendations(qaMetrics)
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'quality-assurance-report');
      throw error;
    }
  }

  /**
   * Generate population health report
   */
  async generatePopulationHealthReport(period: { start: Date; end: Date }): Promise<any> {
    try {
      const populationMetrics = await this.getPopulationHealthMetrics(period);
      
      return {
        demographics: this.analyzePopulationDemographics(populationMetrics),
        diseasePrevalence: this.analyzeDiseasePrevalence(populationMetrics),
        screeningPrograms: this.evaluateScreeningPrograms(populationMetrics),
        healthOutcomes: this.analyzeHealthOutcomes(populationMetrics),
        recommendations: this.generatePopulationHealthRecommendations(populationMetrics)
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'population-health-report');
      throw error;
    }
  }

  /**
   * Generate clinical outcomes report
   */
  async generateClinicalOutcomesReport(period: { start: Date; end: Date }): Promise<any> {
    try {
      const outcomes = await this.getClinicalOutcomes(period);
      
      return {
        outcomes,
        effectiveness: this.analyzeTestEffectiveness(outcomes),
        patientImpact: this.analyzePatientImpact(outcomes),
        costEffectiveness: this.analyzeCostEffectiveness(outcomes),
        recommendations: this.generateClinicalRecommendations(outcomes)
      };
    } catch (error) {
      this.errorHandlingService.handleError(error, 'clinical-outcomes-report');
      throw error;
    }
  }

  // Private helper methods

  private async processComplianceReport(report: ComplianceReport, options?: any): Promise<void> {
    try {
      let data: any;

      switch (report.type) {
        case 'clia-compliance':
          data = await this.generateCLIAComplianceReport(report.period);
          break;
        case 'cap-inspection':
          data = await this.generateCAPInspectionReport(report.period);
          break;
        case 'hipaa-audit':
          data = await this.generateHIPAAAuditReport(report.period);
          break;
        case 'quality-assurance':
          data = await this.generateQualityAssuranceReport(report.period);
          break;
        case 'population-health':
          data = await this.generatePopulationHealthReport(report.period);
          break;
        case 'clinical-outcomes':
          data = await this.generateClinicalOutcomesReport(report.period);
          break;
        default:
          throw new Error(`Unsupported report type: ${report.type}`);
      }

      report.data = data;
      report.summary = this.generateReportSummary(data, report.type);
      report.status = 'completed';

    } catch (error) {
      report.status = 'failed';
      this.errorHandlingService.handleError(error, 'compliance-report-generation');
    }

    // Update the report in the list
    this.updateComplianceReport(report);
  }

  private updateComplianceReport(updatedReport: ComplianceReport): void {
    const currentReports = this.complianceReports$.value;
    const index = currentReports.findIndex(r => r.id === updatedReport.id);
    
    if (index >= 0) {
      currentReports[index] = updatedReport;
      this.complianceReports$.next([...currentReports]);
    }
  }

  private getReportTitle(type: ComplianceReportType): string {
    const titles: Record<ComplianceReportType, string> = {
      'clia-compliance': 'CLIA Compliance Report',
      'cap-inspection': 'CAP Inspection Readiness Report',
      'hipaa-audit': 'HIPAA Security Audit Report',
      'quality-assurance': 'Quality Assurance Report',
      'turnaround-time': 'Turnaround Time Analysis Report',
      'proficiency-testing': 'Proficiency Testing Report',
      'personnel-competency': 'Personnel Competency Report',
      'equipment-maintenance': 'Equipment Maintenance Report',
      'population-health': 'Population Health Report',
      'clinical-outcomes': 'Clinical Outcomes Report'
    };

    return titles[type];
  }

  private getReportDescription(type: ComplianceReportType): string {
    const descriptions: Record<ComplianceReportType, string> = {
      'clia-compliance': 'Comprehensive analysis of CLIA regulatory compliance including personnel qualifications, quality control, and proficiency testing.',
      'cap-inspection': 'Detailed evaluation against CAP inspection checklist items for laboratory accreditation readiness.',
      'hipaa-audit': 'Security audit report covering access controls, data protection, and privacy compliance measures.',
      'quality-assurance': 'Quality management system performance including metrics, incidents, and corrective actions.',
      'turnaround-time': 'Analysis of laboratory turnaround times by test type and specialty with performance benchmarks.',
      'proficiency-testing': 'External proficiency testing results and performance analysis across all testing areas.',
      'personnel-competency': 'Staff competency assessments, training records, and certification status.',
      'equipment-maintenance': 'Equipment maintenance schedules, calibration records, and performance monitoring.',
      'population-health': 'Population health metrics, disease surveillance, and public health impact analysis.',
      'clinical-outcomes': 'Clinical effectiveness analysis including patient outcomes and test utility assessment.'
    };

    return descriptions[type];
  }

  private async getPersonnelQualifications(period: { start: Date; end: Date }): Promise<any> {
    // Mock implementation - would query Practitioner resources
    return {
      laboratoryDirector: { qualified: true, certifications: ['MD', 'Board Certified Pathologist'] },
      technicalSupervisor: { qualified: true, certifications: ['MT(ASCP)'] },
      testingPersonnel: [
        { name: 'Tech 1', qualified: true, certifications: ['MLT(ASCP)'] },
        { name: 'Tech 2', qualified: true, certifications: ['MT(ASCP)'] }
      ]
    };
  }

  private async getQualityControlData(period: { start: Date; end: Date }): Promise<any> {
    // Mock implementation - would query QC Observation resources
    return {
      dailyQC: { performed: 95, required: 100, compliance: 95 },
      monthlyQC: { performed: 12, required: 12, compliance: 100 },
      calibrationVerification: { performed: 24, required: 24, compliance: 100 }
    };
  }

  private async getProficiencyTestResults(period: { start: Date; end: Date }): Promise<any> {
    // Mock implementation - would query proficiency test results
    return {
      chemistry: { passed: 5, total: 5, score: 100 },
      hematology: { passed: 5, total: 5, score: 100 },
      microbiology: { passed: 4, total: 5, score: 80 }
    };
  }

  private async getPatientTestData(period: { start: Date; end: Date }): Promise<any> {
    // Mock implementation - would query DiagnosticReport resources
    return {
      totalTests: 5000,
      criticalValues: 45,
      criticalValueNotifications: 44,
      amendedReports: 12,
      turnaroundTimeCompliance: 92
    };
  }

  private calculateCLIACompliance(data: any): any {
    // Calculate overall CLIA compliance score
    const scores = [
      data.personnelRecords.laboratoryDirector.qualified ? 100 : 0,
      data.qualityControlData.dailyQC.compliance,
      data.proficiencyTestResults.chemistry.score,
      data.patientTestData.turnaroundTimeCompliance
    ];

    const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    return {
      overallScore,
      status: overallScore >= 90 ? 'compliant' : 'non-compliant',
      criticalDeficiencies: overallScore < 70 ? ['Proficiency testing below threshold'] : [],
      recommendations: overallScore < 90 ? ['Improve quality control procedures'] : []
    };
  }

  private async evaluateCAPChecklist(period: { start: Date; end: Date }): Promise<any> {
    // Mock CAP checklist evaluation
    return [
      { section: 'GEN.20000', requirement: 'Laboratory Director Qualifications', status: 'compliant' },
      { section: 'GEN.30000', requirement: 'Technical Supervisor Qualifications', status: 'compliant' },
      { section: 'GEN.40000', requirement: 'Testing Personnel Qualifications', status: 'compliant' },
      { section: 'QMS.10000', requirement: 'Quality Management System', status: 'compliant' },
      { section: 'PRE.10000', requirement: 'Pre-analytical Systems', status: 'non-compliant' }
    ];
  }

  private summarizeCAPCompliance(checklistItems: any[]): any {
    const compliant = checklistItems.filter(item => item.status === 'compliant').length;
    const total = checklistItems.length;

    return {
      totalItems: total,
      compliantItems: compliant,
      complianceRate: (compliant / total) * 100,
      criticalDeficiencies: checklistItems.filter(item => 
        item.status === 'non-compliant' && item.critical
      ).length
    };
  }

  private generateCAPRecommendations(checklistItems: any[]): string[] {
    const nonCompliant = checklistItems.filter(item => item.status === 'non-compliant');
    return nonCompliant.map(item => `Address ${item.requirement} (${item.section})`);
  }

  private async getAuditEvents(period: { start: Date; end: Date }): Promise<AuditEvent[]> {
    try {
      const searchParams: SearchParams = {
        date: `ge${period.start.toISOString()}&date=le${period.end.toISOString()}`,
        _count: '1000'
      };

      const bundle = await this.medplumService.searchResources<AuditEvent>('AuditEvent', searchParams);
      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Failed to get audit events:', error);
      return [];
    }
  }

  private analyzeAccessLogs(auditEvents: AuditEvent[]): any {
    // Analyze access patterns for HIPAA compliance
    return {
      totalAccesses: auditEvents.length,
      uniqueUsers: new Set(auditEvents.map(event => event.agent?.[0]?.who?.reference)).size,
      unauthorizedAttempts: auditEvents.filter(event => event.outcome === '8').length,
      afterHoursAccess: auditEvents.filter(event => this.isAfterHours(event.recorded)).length
    };
  }

  private identifyPotentialBreaches(auditEvents: AuditEvent[]): any {
    // Identify potential HIPAA breaches
    const suspiciousEvents = auditEvents.filter(event => 
      event.outcome === '8' || // Failure
      event.purposeOfEvent?.some(purpose => purpose.code === 'TREAT') === false
    );

    return {
      potentialBreaches: suspiciousEvents.length,
      events: suspiciousEvents.map(event => ({
        timestamp: event.recorded,
        user: event.agent?.[0]?.who?.reference,
        action: event.type?.code,
        outcome: event.outcome
      }))
    };
  }

  private analyzeUserActivity(auditEvents: AuditEvent[]): any {
    // Analyze user activity patterns
    const userActivity = new Map<string, number>();
    
    auditEvents.forEach(event => {
      const user = event.agent?.[0]?.who?.reference || 'unknown';
      userActivity.set(user, (userActivity.get(user) || 0) + 1);
    });

    return {
      mostActiveUsers: Array.from(userActivity.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      averageActivityPerUser: auditEvents.length / userActivity.size
    };
  }

  private evaluateSystemSecurity(auditEvents: AuditEvent[]): any {
    // Evaluate system security measures
    return {
      encryptionCompliance: 100, // Mock data
      accessControlCompliance: 95,
      auditLogCompleteness: 98,
      dataBackupCompliance: 100
    };
  }

  private auditBusinessAssociates(): any {
    // Audit business associate agreements
    return {
      totalAgreements: 5,
      currentAgreements: 5,
      expiredAgreements: 0,
      pendingRenewals: 1
    };
  }

  private calculateHIPAACompliance(analysis: any): any {
    const scores = [
      analysis.systemSecurity.encryptionCompliance,
      analysis.systemSecurity.accessControlCompliance,
      analysis.systemSecurity.auditLogCompleteness,
      analysis.systemSecurity.dataBackupCompliance
    ];

    const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    return {
      overallScore,
      status: overallScore >= 95 ? 'compliant' : 'non-compliant',
      riskLevel: overallScore >= 95 ? 'low' : overallScore >= 85 ? 'medium' : 'high'
    };
  }

  private generateHIPAARecommendations(analysis: any): string[] {
    const recommendations = [];
    
    if (analysis.accessLogs.unauthorizedAttempts > 0) {
      recommendations.push('Review and strengthen access controls');
    }
    
    if (analysis.dataBreaches.potentialBreaches > 0) {
      recommendations.push('Investigate potential security breaches');
    }
    
    return recommendations;
  }

  private async getQualityAssuranceMetrics(period: { start: Date; end: Date }): Promise<QualityAssuranceMetric[]> {
    // Mock QA metrics - would query actual QA data
    return [
      {
        category: 'Pre-analytical',
        metric: 'Specimen Rejection Rate',
        value: 1.2,
        target: 2.0,
        unit: '%',
        status: 'pass',
        trend: 'improving',
        lastUpdated: new Date()
      },
      {
        category: 'Analytical',
        metric: 'QC Failure Rate',
        value: 0.5,
        target: 1.0,
        unit: '%',
        status: 'pass',
        trend: 'stable',
        lastUpdated: new Date()
      }
    ];
  }

  private analyzeQualityTrends(metrics: QualityAssuranceMetric[]): any {
    return {
      improving: metrics.filter(m => m.trend === 'improving').length,
      declining: metrics.filter(m => m.trend === 'declining').length,
      stable: metrics.filter(m => m.trend === 'stable').length
    };
  }

  private async getQualityIncidents(period: { start: Date; end: Date }): Promise<any[]> {
    // Mock quality incidents
    return [
      {
        id: 'QI-001',
        date: new Date(),
        category: 'Equipment Failure',
        severity: 'High',
        description: 'Analyzer malfunction causing test delays',
        status: 'Resolved'
      }
    ];
  }

  private async getCorrectiveActions(period: { start: Date; end: Date }): Promise<any[]> {
    // Mock corrective actions
    return [
      {
        id: 'CA-001',
        incident: 'QI-001',
        action: 'Implemented preventive maintenance schedule',
        responsible: 'Lab Manager',
        dueDate: new Date(),
        status: 'Completed'
      }
    ];
  }

  private generateQARecommendations(metrics: QualityAssuranceMetric[]): string[] {
    const recommendations = [];
    
    metrics.forEach(metric => {
      if (metric.status === 'fail') {
        recommendations.push(`Improve ${metric.metric} - currently ${metric.value}${metric.unit}, target ${metric.target}${metric.unit}`);
      }
    });
    
    return recommendations;
  }

  private async getPopulationHealthMetrics(period: { start: Date; end: Date }): Promise<PopulationHealthMetric[]> {
    // Mock population health data
    return [
      {
        population: 'Adult Screening',
        testType: 'Cervical Cancer Screening',
        totalTests: 1500,
        positiveResults: 45,
        positivityRate: 3.0,
        ageGroups: {
          '21-30': 500,
          '31-40': 600,
          '41-50': 400
        },
        geographicDistribution: {
          'Urban': 1000,
          'Suburban': 400,
          'Rural': 100
        },
        trends: [
          { period: 'Q1', value: 2.8 },
          { period: 'Q2', value: 3.2 },
          { period: 'Q3', value: 3.0 }
        ]
      }
    ];
  }

  private analyzePopulationDemographics(metrics: PopulationHealthMetric[]): any {
    // Analyze population demographics
    return {
      totalPopulation: metrics.reduce((sum, m) => sum + m.totalTests, 0),
      ageDistribution: this.aggregateAgeGroups(metrics),
      geographicDistribution: this.aggregateGeographicData(metrics)
    };
  }

  private analyzeDiseasePrevalence(metrics: PopulationHealthMetric[]): any {
    return metrics.map(metric => ({
      condition: metric.testType,
      prevalence: metric.positivityRate,
      totalCases: metric.positiveResults,
      trend: this.calculateTrend(metric.trends)
    }));
  }

  private evaluateScreeningPrograms(metrics: PopulationHealthMetric[]): any {
    return {
      totalPrograms: metrics.length,
      effectiveness: metrics.map(m => ({
        program: m.testType,
        participation: m.totalTests,
        detectionRate: m.positivityRate
      }))
    };
  }

  private analyzeHealthOutcomes(metrics: PopulationHealthMetric[]): any {
    // Mock health outcomes analysis
    return {
      earlyDetection: 85,
      treatmentSuccess: 92,
      followUpCompliance: 78
    };
  }

  private generatePopulationHealthRecommendations(metrics: PopulationHealthMetric[]): string[] {
    const recommendations = [];
    
    metrics.forEach(metric => {
      if (metric.positivityRate > 5.0) {
        recommendations.push(`Increase screening frequency for ${metric.testType} - positivity rate is ${metric.positivityRate}%`);
      }
    });
    
    return recommendations;
  }

  private async getClinicalOutcomes(period: { start: Date; end: Date }): Promise<ClinicalOutcome[]> {
    // Mock clinical outcomes data
    return [
      {
        condition: 'Cervical Dysplasia',
        totalCases: 45,
        earlyDetection: 38,
        treatmentResponse: 42,
        followUpCompliance: 35,
        outcomes: {
          improved: 35,
          stable: 7,
          declined: 3
        }
      }
    ];
  }

  private analyzeTestEffectiveness(outcomes: ClinicalOutcome[]): any {
    return outcomes.map(outcome => ({
      condition: outcome.condition,
      detectionRate: (outcome.earlyDetection / outcome.totalCases) * 100,
      treatmentResponseRate: (outcome.treatmentResponse / outcome.totalCases) * 100
    }));
  }

  private analyzePatientImpact(outcomes: ClinicalOutcome[]): any {
    const totalCases = outcomes.reduce((sum, o) => sum + o.totalCases, 0);
    const totalImproved = outcomes.reduce((sum, o) => sum + o.outcomes.improved, 0);
    
    return {
      totalPatients: totalCases,
      improvedOutcomes: totalImproved,
      improvementRate: (totalImproved / totalCases) * 100
    };
  }

  private analyzeCostEffectiveness(outcomes: ClinicalOutcome[]): any {
    // Mock cost-effectiveness analysis
    return {
      costPerCase: 150,
      costPerQALY: 25000,
      netBenefit: 500000
    };
  }

  private generateClinicalRecommendations(outcomes: ClinicalOutcome[]): string[] {
    const recommendations = [];
    
    outcomes.forEach(outcome => {
      const followUpRate = (outcome.followUpCompliance / outcome.totalCases) * 100;
      if (followUpRate < 80) {
        recommendations.push(`Improve follow-up compliance for ${outcome.condition} - currently ${followUpRate.toFixed(1)}%`);
      }
    });
    
    return recommendations;
  }

  private generateReportSummary(data: any, type: ComplianceReportType): ComplianceSummary {
    // Generate summary based on report type and data
    let totalItems = 0;
    let compliantItems = 0;
    let criticalFindings = 0;
    let recommendations: string[] = [];

    switch (type) {
      case 'clia-compliance':
        totalItems = 10; // Mock total CLIA requirements
        compliantItems = data.compliance?.overallScore >= 90 ? 9 : 7;
        criticalFindings = data.compliance?.criticalDeficiencies?.length || 0;
        recommendations = data.compliance?.recommendations || [];
        break;
      case 'cap-inspection':
        totalItems = data.checklistItems?.length || 0;
        compliantItems = data.summary?.compliantItems || 0;
        criticalFindings = data.summary?.criticalDeficiencies || 0;
        recommendations = data.recommendations || [];
        break;
      // Add other cases as needed
    }

    return {
      totalItems,
      compliantItems,
      nonCompliantItems: totalItems - compliantItems,
      complianceRate: totalItems > 0 ? (compliantItems / totalItems) * 100 : 0,
      criticalFindings,
      recommendations
    };
  }

  private isAfterHours(timestamp?: string): boolean {
    if (!timestamp) return false;
    
    const date = new Date(timestamp);
    const hour = date.getHours();
    return hour < 7 || hour > 18; // Before 7 AM or after 6 PM
  }

  private aggregateAgeGroups(metrics: PopulationHealthMetric[]): Record<string, number> {
    const aggregated: Record<string, number> = {};
    
    metrics.forEach(metric => {
      Object.entries(metric.ageGroups).forEach(([age, count]) => {
        aggregated[age] = (aggregated[age] || 0) + count;
      });
    });
    
    return aggregated;
  }

  private aggregateGeographicData(metrics: PopulationHealthMetric[]): Record<string, number> {
    const aggregated: Record<string, number> = {};
    
    metrics.forEach(metric => {
      Object.entries(metric.geographicDistribution).forEach(([location, count]) => {
        aggregated[location] = (aggregated[location] || 0) + count;
      });
    });
    
    return aggregated;
  }

  private calculateTrend(trends: Array<{period: string, value: number}>): 'increasing' | 'decreasing' | 'stable' {
    if (trends.length < 2) return 'stable';
    
    const first = trends[0].value;
    const last = trends[trends.length - 1].value;
    const change = ((last - first) / first) * 100;
    
    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  private generateReportId(): string {
    return `compliance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}