import { Injectable } from '@angular/core';
import {
  Attachment,
  Binary,
  DiagnosticReport,
  Observation,
  Patient,
  Practitioner,
  Specimen
} from '@medplum/fhirtypes';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { LIMSErrorType } from '../types/fhir-types';
import { AuditService } from './audit.service';
import { DiagnosticReportService, ReportTemplate } from './diagnostic-report.service';
import { ErrorHandlingService } from './error-handling.service';

// PDF generation library interfaces (would be actual imports in real implementation)
interface PDFDocument {
  fontSize(size: number): PDFDocument;
  font(font: string): PDFDocument;
  text(text: string, x?: number, y?: number, options?: any): PDFDocument;
  moveDown(lines?: number): PDFDocument;
  addPage(): PDFDocument;
  end(): void;
  pipe(stream: any): void;
}

interface PDFKit {
  new(): PDFDocument;
}

// Mock PDFKit for development
declare const PDFDocument: PDFKit;

export interface PDFGenerationOptions {
  template: ReportTemplate;
  includeHeader: boolean;
  includeFooter: boolean;
  includeWatermark: boolean;
  watermarkText?: string;
  fontSize: number;
  fontFamily: string;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
}

export interface PDFMetadata {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  creationDate: Date;
  modificationDate: Date;
  keywords: string[];
}

export interface DocumentVersion {
  version: number;
  binaryId: string;
  createdAt: Date;
  createdBy: string;
  reason: string;
  changes?: string[];
}

export interface PDFGenerationResult {
  binaryId: string;
  url: string;
  size: number;
  checksum: string;
  generationTime: number;
  version: number;
}

@Injectable({
  providedIn: 'root'
})
export class PdfGenerationService {
  private generationQueue$ = new BehaviorSubject<string[]>([]);
  private documentVersions$ = new BehaviorSubject<Map<string, DocumentVersion[]>>(new Map());

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private auditService: AuditService,
    private diagnosticReportService: DiagnosticReportService
  ) { }

  // Main PDF Generation Method
  async generateReportPDF(
    reportId: string,
    options?: Partial<PDFGenerationOptions>
  ): Promise<PDFGenerationResult> {
    const startTime = Date.now();

    try {
      // Add to generation queue
      this.addToQueue(reportId);

      // Get report and related data
      const report = await this.medplumService.readResource<DiagnosticReport>('DiagnosticReport', reportId);
      const reportData = await this.gatherReportData(report);

      // Get template
      const template = await this.getReportTemplate(report, options?.template);

      // Set default options
      const pdfOptions = this.getDefaultOptions(template, options);

      // Generate PDF content
      const pdfBuffer = await this.createPDFDocument(reportData, pdfOptions);

      // Calculate checksum
      const checksum = await this.calculateChecksum(pdfBuffer);

      // Store as FHIR Binary resource
      const binary = await this.storePDFAsBinary(report, pdfBuffer, checksum);

      // Update DiagnosticReport with presentedForm
      await this.attachPDFToReport(report, binary);

      // Create version record
      await this.createVersionRecord(reportId, binary.id!, 'Generated PDF report');

      const generationTime = Date.now() - startTime;

      // Create audit event
      await this.auditService.logEvent({
        action: 'generate-pdf',
        resourceType: 'DiagnosticReport',
        resourceId: reportId,
        details: {
          binaryId: binary.id,
          generationTime,
          size: pdfBuffer.length,
          checksum
        }
      });

      // Remove from queue
      this.removeFromQueue(reportId);

      return {
        binaryId: binary.id!,
        url: this.getBinaryUrl(binary.id!),
        size: pdfBuffer.length,
        checksum,
        generationTime,
        version: await this.getNextVersionNumber(reportId)
      };
    } catch (error) {
      this.removeFromQueue(reportId);
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to generate PDF report',
        details: error,
        timestamp: new Date(),
        resourceType: 'DiagnosticReport',
        resourceId: reportId
      });
      throw error;
    }
  }

  // Data Gathering
  private async gatherReportData(report: DiagnosticReport): Promise<ReportData> {
    try {
      // Get patient
      const patientId = report.subject?.reference?.split('/')[1];
      const patient = patientId ? await this.medplumService.readResource<Patient>('Patient', patientId) : null;

      // Get specimen
      const specimenId = report.specimen?.[0]?.reference?.split('/')[1];
      const specimen = specimenId ? await this.medplumService.readResource<Specimen>('Specimen', specimenId) : null;

      // Get observations
      const observations: Observation[] = [];
      if (report.result) {
        for (const resultRef of report.result) {
          const obsId = resultRef.reference?.split('/')[1];
          if (obsId) {
            try {
              const observation = await this.medplumService.readResource<Observation>('Observation', obsId);
              observations.push(observation);
            } catch (error) {
              console.warn(`Failed to load observation ${obsId}:`, error);
            }
          }
        }
      }

      // Get performer (pathologist)
      const performerId = report.performer?.[0]?.reference?.split('/')[1];
      const performer = performerId ? await this.medplumService.readResource<Practitioner>('Practitioner', performerId) : null;

      return {
        report,
        patient,
        specimen,
        observations,
        performer
      };
    } catch (error) {
      console.error('Failed to gather report data:', error);
      throw error;
    }
  }

  // PDF Document Creation
  private async createPDFDocument(data: ReportData, options: PDFGenerationOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // In a real implementation, this would use a proper PDF library like PDFKit
        // For now, we'll create a mock PDF buffer
        const mockPDFContent = this.generateMockPDFContent(data, options);
        const buffer = Buffer.from(mockPDFContent, 'utf-8');
        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });
  }

  private generateMockPDFContent(data: ReportData, _options: PDFGenerationOptions): string {
    const { report, patient, specimen, observations, performer } = data;

    let content = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length ${this.calculateContentLength(data)}
>>
stream
BT
/F1 12 Tf
50 750 Td
(DIAGNOSTIC REPORT) Tj
0 -20 Td
(Report ID: ${report.id || 'N/A'}) Tj
0 -20 Td
(Status: ${report.status || 'N/A'}) Tj
0 -20 Td
(Date: ${report.effectiveDateTime || new Date().toISOString()}) Tj
0 -40 Td
(PATIENT INFORMATION) Tj
0 -20 Td
(Name: ${this.getPatientName(patient)}) Tj
0 -20 Td
(DOB: ${patient?.birthDate || 'N/A'}) Tj
0 -20 Td
(Gender: ${patient?.gender || 'N/A'}) Tj
0 -40 Td
(SPECIMEN INFORMATION) Tj
0 -20 Td
(Accession: ${specimen?.accessionIdentifier?.value || 'N/A'}) Tj
0 -20 Td
(Type: ${specimen?.type?.text || 'N/A'}) Tj
0 -20 Td
(Collection Date: ${specimen?.collection?.collectedDateTime || 'N/A'}) Tj
0 -40 Td
(OBSERVATIONS) Tj`;

    // Add observations
    let yOffset = -20;
    observations.forEach((obs, index) => {
      content += `
0 ${yOffset} Td
(${index + 1}. ${obs.code?.text || 'Observation'}: ${this.getObservationValue(obs)}) Tj`;
      yOffset -= 20;
    });

    content += `
0 ${yOffset - 20} Td
(CONCLUSION) Tj
0 -20 Td
(${report.conclusion || 'No conclusion provided'}) Tj
0 -40 Td
(PATHOLOGIST) Tj
0 -20 Td
(${this.getPractitionerName(performer)}) Tj
0 -20 Td
(Date: ${report.issued || new Date().toISOString()}) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000110 00000 n 
0000000251 00000 n 
0000001000 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
1068
%%EOF`;

    return content;
  }

  private calculateContentLength(data: ReportData): number {
    // Simplified content length calculation
    return 800 + (data.observations.length * 50);
  }

  private getPatientName(patient: Patient | null): string {
    if (!patient?.name || patient.name.length === 0) { return 'Unknown Patient'; }
    const name = patient.name[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    return `${given} ${family}`.trim();
  }

  private getPractitionerName(practitioner: Practitioner | null): string {
    if (!practitioner?.name || practitioner.name.length === 0) { return 'Unknown Practitioner'; }
    const name = practitioner.name[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    return `${given} ${family}`.trim();
  }

  private getObservationValue(observation: Observation): string {
    if (observation.valueString) { return observation.valueString; }
    if (observation.valueQuantity) {
      return `${observation.valueQuantity.value} ${observation.valueQuantity.unit || ''}`;
    }
    if (observation.valueCodeableConcept) {
      return observation.valueCodeableConcept.text ||
        observation.valueCodeableConcept.coding?.[0]?.display ||
        'Coded value';
    }
    return 'No value';
  }

  // Binary Storage
  private async storePDFAsBinary(
    report: DiagnosticReport,
    pdfBuffer: Buffer,
    checksum: string
  ): Promise<Binary> {
    try {
      const binary: Binary = {
        resourceType: 'Binary',
        contentType: 'application/pdf',
        data: pdfBuffer.toString('base64'),
        meta: {
          tag: [{
            system: 'http://lims.local/fhir/CodeSystem/document-type',
            code: 'diagnostic-report-pdf',
            display: 'Diagnostic Report PDF'
          }]
        },
        // Note: Binary resource doesn't support extensions in FHIR R4
        // Metadata is stored in the documentVersions$ BehaviorSubject instead
      };

      return await this.medplumService.createResource(binary);
    } catch (error) {
      console.error('Failed to store PDF as Binary:', error);
      throw error;
    }
  }

  private async attachPDFToReport(report: DiagnosticReport, binary: Binary): Promise<void> {
    try {
      const attachment: Attachment = {
        contentType: 'application/pdf',
        url: this.getBinaryUrl(binary.id!),
        title: `Diagnostic Report - ${report.id}`,
        creation: new Date().toISOString(),
        size: binary.data ? Buffer.from(binary.data, 'base64').length : undefined
      };

      if (!report.presentedForm) {
        report.presentedForm = [];
      }

      // Remove any existing PDF attachments
      report.presentedForm = report.presentedForm.filter(
        form => form.contentType !== 'application/pdf'
      );

      // Add new PDF attachment
      report.presentedForm.push(attachment);

      await this.medplumService.updateResource(report);
    } catch (error) {
      console.error('Failed to attach PDF to report:', error);
      throw error;
    }
  }

  // Version Management
  private async createVersionRecord(reportId: string, binaryId: string, reason: string): Promise<void> {
    try {
      const versions = this.documentVersions$.value;
      const reportVersions = versions.get(reportId) || [];

      const newVersion: DocumentVersion = {
        version: reportVersions.length + 1,
        binaryId,
        createdAt: new Date(),
        createdBy: 'current-user', // Would get from auth service
        reason
      };

      reportVersions.push(newVersion);
      versions.set(reportId, reportVersions);
      this.documentVersions$.next(versions);
    } catch (error) {
      console.warn('Failed to create version record:', error);
    }
  }

  private async getNextVersionNumber(reportId: string): Promise<number> {
    const versions = this.documentVersions$.value;
    const reportVersions = versions.get(reportId) || [];
    return reportVersions.length;
  }

  // Regeneration and Updates
  async regeneratePDF(reportId: string, reason: string, options?: Partial<PDFGenerationOptions>): Promise<PDFGenerationResult> {
    try {
      // Archive current version
      await this.archiveCurrentVersion(reportId, reason);

      // Generate new version
      const result = await this.generateReportPDF(reportId, options);

      // Create audit event for regeneration
      await this.auditService.logEvent({
        action: 'regenerate-pdf',
        resourceType: 'DiagnosticReport',
        resourceId: reportId,
        details: {
          reason,
          newBinaryId: result.binaryId,
          version: result.version
        }
      });

      return result;
    } catch (error) {
      this.errorHandlingService.handleError({
        type: LIMSErrorType.WORKFLOW_ERROR,
        message: 'Failed to regenerate PDF',
        details: error,
        timestamp: new Date(),
        resourceType: 'DiagnosticReport',
        resourceId: reportId
      });
      throw error;
    }
  }

  private async archiveCurrentVersion(reportId: string, reason: string): Promise<void> {
    try {
      const report = await this.medplumService.readResource<DiagnosticReport>('DiagnosticReport', reportId);

      if (report.presentedForm) {
        const pdfAttachment = report.presentedForm.find(form => form.contentType === 'application/pdf');
        if (pdfAttachment?.url) {
          // Mark current version as archived
          const versions = this.documentVersions$.value;
          const reportVersions = versions.get(reportId) || [];
          const currentVersion = reportVersions[reportVersions.length - 1];

          if (currentVersion) {
            currentVersion.reason = `Archived: ${reason}`;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to archive current version:', error);
    }
  }

  // Utility Methods
  private async calculateChecksum(buffer: Buffer): Promise<string> {
    // In a real implementation, use proper cryptographic hashing
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private getBinaryUrl(binaryId: string): string {
    // In a real implementation, this would return the actual Medplum Binary URL
    return `https://api.medplum.com/fhir/R4/Binary/${binaryId}`;
  }

  private async getReportTemplate(report: DiagnosticReport, providedTemplate?: ReportTemplate): Promise<ReportTemplate> {
    if (providedTemplate) { return providedTemplate; }

    // Get template based on report category
    const category = report.category?.[0]?.coding?.[0]?.code;
    const templates = await this.diagnosticReportService.getReportTemplates().toPromise();

    const template = templates?.find(t => {
      switch (category) {
        case 'PAT': return t.specialty === 'histopathology';
        case 'MB': return t.specialty === 'microbiology';
        default: return t.specialty === 'general';
      }
    });

    return template || templates?.[0] || this.getDefaultTemplate();
  }

  private getDefaultTemplate(): ReportTemplate {
    return {
      id: 'default',
      name: 'Default Report Template',
      specialty: 'general',
      sections: [],
      requiredObservations: [],
      validationRules: [],
      isActive: true
    };
  }

  private getDefaultOptions(template: ReportTemplate, options?: Partial<PDFGenerationOptions>): PDFGenerationOptions {
    return {
      template,
      includeHeader: true,
      includeFooter: true,
      includeWatermark: false,
      fontSize: 12,
      fontFamily: 'Helvetica',
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50
      },
      pageSize: 'A4',
      orientation: 'portrait',
      ...options
    };
  }

  // Queue Management
  private addToQueue(reportId: string): void {
    const currentQueue = this.generationQueue$.value;
    if (!currentQueue.includes(reportId)) {
      this.generationQueue$.next([...currentQueue, reportId]);
    }
  }

  private removeFromQueue(reportId: string): void {
    const currentQueue = this.generationQueue$.value;
    this.generationQueue$.next(currentQueue.filter(id => id !== reportId));
  }

  // Public Query Methods
  getGenerationQueue(): Observable<string[]> {
    return this.generationQueue$.asObservable();
  }

  getDocumentVersions(reportId: string): Observable<DocumentVersion[]> {
    return this.documentVersions$.pipe(
      map((versions: Map<string, DocumentVersion[]>) => versions.get(reportId) || [])
    );
  }

  async getPDFBinary(reportId: string, version?: number): Promise<Binary | null> {
    try {
      const versions = this.documentVersions$.value.get(reportId) || [];
      const targetVersion = version ? versions.find(v => v.version === version) : versions[versions.length - 1];

      if (!targetVersion) { return null; }

      return await this.medplumService.readResource<Binary>('Binary', targetVersion.binaryId);
    } catch (error) {
      console.error('Failed to get PDF binary:', error);
      return null;
    }
  }
}

// Supporting interfaces
interface ReportData {
  report: DiagnosticReport;
  patient: Patient | null;
  specimen: Specimen | null;
  observations: Observation[];
  performer: Practitioner | null;
}