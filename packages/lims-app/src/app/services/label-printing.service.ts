import { Injectable, inject } from '@angular/core';
import * as QRCode from 'qrcode';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { Patient, ServiceRequest, Specimen } from '../types/fhir-types';
import { ErrorHandlingService } from './error-handling.service';
import { NotificationService } from './notification.service';

export interface LabelTemplate {
  id: string;
  name: string;
  description: string;
  specimenTypes: string[];
  dimensions: {
    width: number;
    height: number;
    unit: 'mm' | 'in';
  };
  elements: LabelElement[];
  qrCodeConfig: QRCodeConfig;
  printSettings: PrintSettings;
}

export interface LabelElement {
  id: string;
  type: 'text' | 'qrcode' | 'barcode' | 'image' | 'line' | 'rectangle';
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  content?: string;
  dataSource?: string; // Field path like 'specimen.accessionIdentifier.value'
  style: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: 'normal' | 'bold';
    color?: string;
    backgroundColor?: string;
    border?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
}

export interface QRCodeConfig {
  size: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  margin: number;
  color: {
    dark: string;
    light: string;
  };
}

export interface PrintSettings {
  copies: number;
  printer?: string;
  paperSize: string;
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface LabelData {
  specimen: Specimen;
  patient?: Patient;
  serviceRequest?: ServiceRequest;
  accessionNumber: string;
  qrCodeData: string;
  collectionDate: Date;
  additionalData?: { [key: string]: any };
}

export interface PrintJob {
  id: string;
  templateId: string;
  labelData: LabelData[];
  status: 'pending' | 'printing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  printSettings: PrintSettings;
}

export interface PrinterInfo {
  id: string;
  name: string;
  type: 'thermal' | 'inkjet' | 'laser';
  status: 'online' | 'offline' | 'error';
  capabilities: {
    maxWidth: number;
    maxHeight: number;
    supportedSizes: string[];
    colorSupport: boolean;
  };
}

export interface LabelInventory {
  templateId: string;
  totalPrinted: number;
  lastPrintDate?: Date;
  averagePerDay: number;
  estimatedRemaining?: number;
  lowStockThreshold: number;
  reorderPoint: number;
}

@Injectable({
  providedIn: 'root'
})
export class LabelPrintingService {
  private medplumService = inject(MedplumService);
  private errorHandlingService = inject(ErrorHandlingService);
  private notificationService = inject(NotificationService);

  private templates$ = new BehaviorSubject<LabelTemplate[]>([]);
  private printJobs$ = new BehaviorSubject<PrintJob[]>([]);
  private printers$ = new BehaviorSubject<PrinterInfo[]>([]);
  private inventory$ = new BehaviorSubject<Map<string, LabelInventory>>(new Map());
  private printJobUpdates$ = new Subject<PrintJob>();

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {
    this.initializeDefaultTemplates();
    this.initializePrinters();
  }

  /**
   * Get available label templates
   */
  getTemplates(): Observable<LabelTemplate[]> {
    return this.templates$.asObservable();
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): LabelTemplate | undefined {
    return this.templates$.value.find(t => t.id === templateId);
  }

  /**
   * Get templates for specific specimen type
   */
  getTemplatesForSpecimenType(specimenType: string): LabelTemplate[] {
    return this.templates$.value.filter(template => 
      template.specimenTypes.includes(specimenType) || 
      template.specimenTypes.includes('*')
    );
  }

  /**
   * Create new label template
   */
  async createTemplate(template: Omit<LabelTemplate, 'id'>): Promise<LabelTemplate> {
    const newTemplate: LabelTemplate = {
      ...template,
      id: this.generateTemplateId()
    };

    const currentTemplates = this.templates$.value;
    this.templates$.next([...currentTemplates, newTemplate]);

    // In a real implementation, this would be saved to the backend
    await this.saveTemplateToBackend(newTemplate);

    return newTemplate;
  }

  /**
   * Update existing template
   */
  async updateTemplate(templateId: string, updates: Partial<LabelTemplate>): Promise<LabelTemplate> {
    const currentTemplates = this.templates$.value;
    const templateIndex = currentTemplates.findIndex(t => t.id === templateId);
    
    if (templateIndex === -1) {
      throw new Error(`Template ${templateId} not found`);
    }

    const updatedTemplate = { ...currentTemplates[templateIndex], ...updates };
    currentTemplates[templateIndex] = updatedTemplate;
    
    this.templates$.next([...currentTemplates]);
    await this.saveTemplateToBackend(updatedTemplate);

    return updatedTemplate;
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const currentTemplates = this.templates$.value;
    const filteredTemplates = currentTemplates.filter(t => t.id !== templateId);
    
    this.templates$.next(filteredTemplates);
    await this.deleteTemplateFromBackend(templateId);
  }

  /**
   * Generate label data from specimen
   */
  async generateLabelData(specimenId: string): Promise<LabelData> {
    try {
      const specimen = await this.medplumService.readResource<Specimen>('Specimen', specimenId);
      
      // Get patient data
      let patient: Patient | undefined;
      if (specimen.subject?.reference) {
        const patientId = specimen.subject.reference.replace('Patient/', '');
        patient = await this.medplumService.readResource<Patient>('Patient', patientId);
      }

      // Get service request data
      let serviceRequest: ServiceRequest | undefined;
      if (specimen.request?.[0]?.reference) {
        const requestId = specimen.request[0].reference.replace('ServiceRequest/', '');
        serviceRequest = await this.medplumService.readResource<ServiceRequest>('ServiceRequest', requestId);
      }

      // Generate QR code data
      const accessionNumber = specimen.accessionIdentifier?.value || specimen.id || '';
      const qrCodeData = this.generateQRCodeData(specimen, patient);

      const labelData: LabelData = {
        specimen,
        patient,
        serviceRequest,
        accessionNumber,
        qrCodeData,
        collectionDate: specimen.collection?.collectedDateTime ? 
          new Date(specimen.collection.collectedDateTime) : new Date(),
        additionalData: {
          specimenType: specimen.type?.text || 'Unknown',
          containerType: specimen.container?.[0]?.type?.text || 'Unknown',
          priority: serviceRequest?.priority || 'routine'
        }
      };

      return labelData;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'label-data-generation');
      throw error;
    }
  }

  /**
   * Print labels
   */
  async printLabels(
    templateId: string, 
    labelData: LabelData[], 
    printSettings?: Partial<PrintSettings>
  ): Promise<PrintJob> {
    try {
      const template = this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      const finalPrintSettings: PrintSettings = {
        ...template.printSettings,
        ...printSettings
      };

      const printJob: PrintJob = {
        id: this.generatePrintJobId(),
        templateId,
        labelData,
        status: 'pending',
        createdAt: new Date(),
        printSettings: finalPrintSettings
      };

      // Add to print queue
      const currentJobs = this.printJobs$.value;
      this.printJobs$.next([...currentJobs, printJob]);

      // Start printing process
      this.processPrintJob(printJob);

      return printJob;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'label-printing');
      throw error;
    }
  }

  /**
   * Print single specimen label
   */
  async printSpecimenLabel(
    specimenId: string, 
    templateId?: string,
    printSettings?: Partial<PrintSettings>
  ): Promise<PrintJob> {
    const labelData = await this.generateLabelData(specimenId);
    
    // Auto-select template if not provided
    if (!templateId) {
      const specimenType = labelData.specimen.type?.coding?.[0]?.code || 'unknown';
      const availableTemplates = this.getTemplatesForSpecimenType(specimenType);
      
      if (availableTemplates.length === 0) {
        throw new Error(`No templates available for specimen type: ${specimenType}`);
      }
      
      templateId = availableTemplates[0].id;
    }

    return this.printLabels(templateId, [labelData], printSettings);
  }

  /**
   * Reprint label
   */
  async reprintLabel(originalPrintJobId: string): Promise<PrintJob> {
    const originalJob = this.printJobs$.value.find(job => job.id === originalPrintJobId);
    
    if (!originalJob) {
      throw new Error(`Print job ${originalPrintJobId} not found`);
    }

    return this.printLabels(
      originalJob.templateId, 
      originalJob.labelData, 
      originalJob.printSettings
    );
  }

  /**
   * Get print jobs
   */
  getPrintJobs(): Observable<PrintJob[]> {
    return this.printJobs$.asObservable();
  }

  /**
   * Get print job updates
   */
  getPrintJobUpdates(): Observable<PrintJob> {
    return this.printJobUpdates$.asObservable();
  }

  /**
   * Get available printers
   */
  getPrinters(): Observable<PrinterInfo[]> {
    return this.printers$.asObservable();
  }

  /**
   * Get label inventory
   */
  getInventory(): Observable<Map<string, LabelInventory>> {
    return this.inventory$.asObservable();
  }

  /**
   * Update inventory after printing
   */
  private updateInventory(templateId: string, quantity: number): void {
    const currentInventory = this.inventory$.value;
    const existing = currentInventory.get(templateId);
    
    const updated: LabelInventory = {
      templateId,
      totalPrinted: (existing?.totalPrinted || 0) + quantity,
      lastPrintDate: new Date(),
      averagePerDay: this.calculateAveragePerDay(templateId, quantity),
      lowStockThreshold: existing?.lowStockThreshold || 100,
      reorderPoint: existing?.reorderPoint || 50
    };

    currentInventory.set(templateId, updated);
    this.inventory$.next(new Map(currentInventory));
  }

  /**
   * Generate QR code image
   */
  async generateQRCodeImage(data: string, config?: Partial<QRCodeConfig>): Promise<string> {
    const finalConfig: QRCodeConfig = {
      size: 100,
      errorCorrectionLevel: 'M',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      ...config
    };

    try {
      const qrCodeDataURL = await QRCode.toDataURL(data, {
        width: finalConfig.size,
        errorCorrectionLevel: finalConfig.errorCorrectionLevel,
        margin: finalConfig.margin,
        color: finalConfig.color
      });

      return qrCodeDataURL;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'qr-code-generation');
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Render label to HTML/Canvas
   */
  async renderLabel(template: LabelTemplate, labelData: LabelData): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Set canvas dimensions based on template
      const dpi = 300; // 300 DPI for high quality
      const mmToPx = dpi / 25.4; // Convert mm to pixels
      
      canvas.width = template.dimensions.width * mmToPx;
      canvas.height = template.dimensions.height * mmToPx;

      // Set white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render each element
      for (const element of template.elements) {
        await this.renderLabelElement(ctx, element, labelData, mmToPx);
      }

      return canvas.toDataURL('image/png');

    } catch (error) {
      this.errorHandlingService.handleError(error, 'label-rendering');
      throw error;
    }
  }

  /**
   * Process print job
   */
  private async processPrintJob(printJob: PrintJob): Promise<void> {
    try {
      printJob.status = 'printing';
      this.updatePrintJob(printJob);

      const template = this.getTemplate(printJob.templateId);
      if (!template) {
        throw new Error(`Template ${printJob.templateId} not found`);
      }

      // Generate label images
      const labelImages: string[] = [];
      for (const labelData of printJob.labelData) {
        const labelImage = await this.renderLabel(template, labelData);
        labelImages.push(labelImage);
      }

      // Send to printer (in a real implementation)
      await this.sendToPrinter(labelImages, printJob.printSettings);

      // Update job status
      printJob.status = 'completed';
      printJob.completedAt = new Date();
      this.updatePrintJob(printJob);

      // Update inventory
      this.updateInventory(printJob.templateId, printJob.labelData.length);

      this.notificationService.showSuccess(
        'Labels Printed',
        `Successfully printed ${printJob.labelData.length} label(s)`
      );

    } catch (error) {
      printJob.status = 'failed';
      printJob.error = (error as Error).message;
      this.updatePrintJob(printJob);

      this.errorHandlingService.handleError(error, 'print-job-processing');
      this.notificationService.showError(
        'Print Failed',
        `Failed to print labels: ${(error as Error).message}`
      );
    }
  }

  /**
   * Render individual label element
   */
  private async renderLabelElement(
    ctx: CanvasRenderingContext2D, 
    element: LabelElement, 
    labelData: LabelData,
    mmToPx: number
  ): Promise<void> {
    const x = element.position.x * mmToPx;
    const y = element.position.y * mmToPx;
    const width = element.size.width * mmToPx;
    const height = element.size.height * mmToPx;

    switch (element.type) {
      case 'text':
        await this.renderTextElement(ctx, element, labelData, x, y, width, height);
        break;
      case 'qrcode':
        await this.renderQRCodeElement(ctx, element, labelData, x, y, width, height);
        break;
      case 'barcode':
        await this.renderBarcodeElement(ctx, element, labelData, x, y, width, height);
        break;
      case 'line':
        this.renderLineElement(ctx, element, x, y, width, height);
        break;
      case 'rectangle':
        this.renderRectangleElement(ctx, element, x, y, width, height);
        break;
    }
  }

  /**
   * Render text element
   */
  private async renderTextElement(
    ctx: CanvasRenderingContext2D,
    element: LabelElement,
    labelData: LabelData,
    x: number, y: number, width: number, _height: number
  ): Promise<void> {
    const content = this.resolveElementContent(element, labelData);
    
    ctx.fillStyle = element.style.color || '#000000';
    ctx.font = `${element.style.fontWeight || 'normal'} ${element.style.fontSize || 12}px ${element.style.fontFamily || 'Arial'}`;
    ctx.textAlign = (element.style.textAlign || 'left') as CanvasTextAlign;
    
    const textY = y + (element.style.fontSize || 12);
    ctx.fillText(content, x, textY, width);
  }

  /**
   * Render QR code element
   */
  private async renderQRCodeElement(
    ctx: CanvasRenderingContext2D,
    element: LabelElement,
    labelData: LabelData,
    x: number, y: number, width: number, height: number
  ): Promise<void> {
    const qrData = element.dataSource === 'qrCodeData' ? 
      labelData.qrCodeData : 
      this.resolveElementContent(element, labelData);

    const qrImage = await this.generateQRCodeImage(qrData, { size: Math.min(width, height) });
    
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, x, y, width, height);
    };
    img.src = qrImage;
  }

  /**
   * Render barcode element (simplified)
   */
  private async renderBarcodeElement(
    ctx: CanvasRenderingContext2D,
    element: LabelElement,
    labelData: LabelData,
    x: number, y: number, width: number, height: number
  ): Promise<void> {
    // Simplified barcode rendering - in a real implementation, use a barcode library
    const content = this.resolveElementContent(element, labelData);
    
    ctx.fillStyle = '#000000';
    const barWidth = width / content.length;
    
    for (let i = 0; i < content.length; i++) {
      if (i % 2 === 0) { // Alternate bars
        ctx.fillRect(x + (i * barWidth), y, barWidth, height);
      }
    }
  }

  /**
   * Render line element
   */
  private renderLineElement(
    ctx: CanvasRenderingContext2D,
    element: LabelElement,
    x: number, y: number, width: number, height: number
  ): void {
    ctx.strokeStyle = element.style.color || '#000000';
    ctx.lineWidth = height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
  }

  /**
   * Render rectangle element
   */
  private renderRectangleElement(
    ctx: CanvasRenderingContext2D,
    element: LabelElement,
    x: number, y: number, width: number, height: number
  ): void {
    if (element.style.backgroundColor) {
      ctx.fillStyle = element.style.backgroundColor;
      ctx.fillRect(x, y, width, height);
    }
    
    if (element.style.border) {
      ctx.strokeStyle = element.style.color || '#000000';
      ctx.strokeRect(x, y, width, height);
    }
  }

  /**
   * Resolve element content from data source
   */
  private resolveElementContent(element: LabelElement, labelData: LabelData): string {
    if (element.content) {
      return element.content;
    }

    if (!element.dataSource) {
      return '';
    }

    // Simple path resolution (in a real implementation, use a proper path resolver)
    const pathParts = element.dataSource.split('.');
    let value: any = labelData;

    for (const part of pathParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return '';
      }
    }

    return String(value || '');
  }

  /**
   * Generate QR code data for specimen
   */
  private generateQRCodeData(specimen: Specimen, patient?: Patient): string {
    const qrData = {
      type: 'specimen',
      specimenId: specimen.id,
      accessionNumber: specimen.accessionIdentifier?.value,
      patientId: patient?.id,
      patientName: patient?.name?.[0] ? 
        `${patient.name[0].given?.join(' ')} ${patient.name[0].family}` : undefined,
      collectionDate: specimen.collection?.collectedDateTime,
      url: `${window.location.origin}/specimen/${specimen.accessionIdentifier?.value || specimen.id}`
    };

    return JSON.stringify(qrData);
  }

  /**
   * Send to printer (mock implementation)
   */
  private async sendToPrinter(labelImages: string[], printSettings: PrintSettings): Promise<void> {
    // In a real implementation, this would interface with actual printers
    // For now, we'll simulate the printing process
    
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Printing ${labelImages.length} labels with settings:`, printSettings);
        resolve();
      }, 2000);
    });
  }

  /**
   * Update print job and emit update
   */
  private updatePrintJob(printJob: PrintJob): void {
    const currentJobs = this.printJobs$.value;
    const jobIndex = currentJobs.findIndex(job => job.id === printJob.id);
    
    if (jobIndex !== -1) {
      currentJobs[jobIndex] = printJob;
      this.printJobs$.next([...currentJobs]);
      this.printJobUpdates$.next(printJob);
    }
  }

  /**
   * Initialize default templates
   */
  private initializeDefaultTemplates(): void {
    const defaultTemplates: LabelTemplate[] = [
      {
        id: 'standard-specimen',
        name: 'Standard Specimen Label',
        description: 'Standard label for most specimen types',
        specimenTypes: ['*'],
        dimensions: { width: 50, height: 25, unit: 'mm' },
        elements: [
          {
            id: 'accession-number',
            type: 'text',
            position: { x: 2, y: 2 },
            size: { width: 30, height: 4 },
            dataSource: 'accessionNumber',
            style: { fontSize: 10, fontWeight: 'bold' }
          },
          {
            id: 'patient-name',
            type: 'text',
            position: { x: 2, y: 7 },
            size: { width: 30, height: 3 },
            dataSource: 'patient.name.0.family',
            style: { fontSize: 8 }
          },
          {
            id: 'collection-date',
            type: 'text',
            position: { x: 2, y: 11 },
            size: { width: 30, height: 3 },
            dataSource: 'collectionDate',
            style: { fontSize: 8 }
          },
          {
            id: 'qr-code',
            type: 'qrcode',
            position: { x: 35, y: 2 },
            size: { width: 12, height: 12 },
            dataSource: 'qrCodeData',
            style: {}
          }
        ],
        qrCodeConfig: {
          size: 100,
          errorCorrectionLevel: 'M',
          margin: 1,
          color: { dark: '#000000', light: '#FFFFFF' }
        },
        printSettings: {
          copies: 1,
          paperSize: 'Label',
          orientation: 'portrait',
          margins: { top: 0, right: 0, bottom: 0, left: 0 }
        }
      }
    ];

    this.templates$.next(defaultTemplates);
  }

  /**
   * Initialize printers
   */
  private initializePrinters(): void {
    const defaultPrinters: PrinterInfo[] = [
      {
        id: 'thermal-printer-1',
        name: 'Zebra ZD420',
        type: 'thermal',
        status: 'online',
        capabilities: {
          maxWidth: 104,
          maxHeight: 2000,
          supportedSizes: ['25x12mm', '50x25mm', '75x50mm'],
          colorSupport: false
        }
      }
    ];

    this.printers$.next(defaultPrinters);
  }

  /**
   * Calculate average labels per day
   */
  private calculateAveragePerDay(_templateId: string, newQuantity: number): number {
    // Simplified calculation - in a real implementation, this would use historical data
    return newQuantity;
  }

  /**
   * Save template to backend
   */
  private async saveTemplateToBackend(template: LabelTemplate): Promise<void> {
    // In a real implementation, save to Medplum or other backend
    console.log('Saving template to backend:', template);
  }

  /**
   * Delete template from backend
   */
  private async deleteTemplateFromBackend(templateId: string): Promise<void> {
    // In a real implementation, delete from backend
    console.log('Deleting template from backend:', templateId);
  }

  /**
   * Generate unique template ID
   */
  private generateTemplateId(): string {
    return `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique print job ID
   */
  private generatePrintJobId(): string {
    return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}