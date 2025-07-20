import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { Subject } from 'rxjs';
import { QRCodeData } from '../../types/fhir-types';

export interface QRCodeOptions {
  size: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  backgroundColor: string;
  foregroundColor: string;
  margin: number;
}

@Component({
  selector: 'app-qr-code-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="qr-code-container">
      <div class="qr-code-display" *ngIf="qrCodeDataUrl">
        <img [src]="qrCodeDataUrl" [alt]="'QR Code for ' + (specimenId || 'specimen')" class="qr-code-image">
      </div>
      
      <div class="qr-code-placeholder" *ngIf="!qrCodeDataUrl && !isGenerating">
        <div class="placeholder-text">
          QR Code<br>
          <small>{{ specimenId || 'No Data' }}</small>
        </div>
      </div>
      
      <div class="qr-code-loading" *ngIf="isGenerating">
        <div class="loading-spinner"></div>
        <span>Generating QR Code...</span>
      </div>
      
      <div class="specimen-info" *ngIf="labelData">
        <div class="accession-id">{{ labelData.accessionNumber }}</div>
        <div class="patient-name">{{ labelData.patientName }}</div>
        <div class="collection-date">{{ labelData.collectionDate | date:'short' }}</div>
        <div class="specimen-type">{{ labelData.specimenType }}</div>
      </div>
      
      <div class="qr-actions" *ngIf="qrCodeDataUrl">
        <button 
          type="button" 
          class="btn btn-primary" 
          (click)="printLabel()"
          [disabled]="!canPrint">
          🖨️ Print Label
        </button>
        <button 
          type="button" 
          class="btn btn-secondary" 
          (click)="downloadQRCode()"
          [disabled]="!qrCodeDataUrl">
          💾 Download QR Code
        </button>
        <button 
          type="button" 
          class="btn btn-outline" 
          (click)="regenerateQRCode()"
          [disabled]="isGenerating">
          🔄 Regenerate
        </button>
      </div>
      
      <div class="qr-options" *ngIf="showOptions">
        <h4>QR Code Options</h4>
        <div class="options-grid">
          <div class="option-group">
            <label for="qr-size">Size (px)</label>
            <input 
              id="qr-size"
              type="number" 
              [(ngModel)]="options.size" 
              (change)="onOptionsChange()"
              min="50" 
              max="500" 
              class="form-control">
          </div>
          
          <div class="option-group">
            <label for="error-correction">Error Correction</label>
            <select 
              id="error-correction"
              [(ngModel)]="options.errorCorrectionLevel" 
              (change)="onOptionsChange()"
              class="form-control">
              <option value="L">Low (7%)</option>
              <option value="M">Medium (15%)</option>
              <option value="Q">Quartile (25%)</option>
              <option value="H">High (30%)</option>
            </select>
          </div>
          
          <div class="option-group">
            <label for="bg-color">Background Color</label>
            <input 
              id="bg-color"
              type="color" 
              [(ngModel)]="options.backgroundColor" 
              (change)="onOptionsChange()"
              class="form-control color-input">
          </div>
          
          <div class="option-group">
            <label for="fg-color">Foreground Color</label>
            <input 
              id="fg-color"
              type="color" 
              [(ngModel)]="options.foregroundColor" 
              (change)="onOptionsChange()"
              class="form-control color-input">
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./qr-code-generator.component.scss']
})
export class QrCodeGeneratorComponent implements OnInit, OnDestroy {
  @Input() specimenId: string = '';
  @Input() patientName: string = '';
  @Input() collectionDate: Date | string = '';
  @Input() labelData: any | null = null; // Changed to any as SpecimenLabelData is removed
  @Input() qrData: string | QRCodeData = '';
  @Input() showOptions: boolean = false;
  @Input() autoGenerate: boolean = true;

  @Output() qrCodeGenerated = new EventEmitter<string>();
  @Output() labelPrinted = new EventEmitter<void>();
  @Output() qrCodeDownloaded = new EventEmitter<string>();

  // Removed ViewChild('qrCanvas', { static: false }) qrCanvas!: ElementRef<HTMLCanvasElement>;

  qrCodeDataUrl: string = '';
  isGenerating: boolean = false;
  canPrint: boolean = true;

  options: QRCodeOptions = {
    size: 200,
    errorCorrectionLevel: 'M',
    backgroundColor: '#ffffff',
    foregroundColor: '#000000',
    margin: 4
  };

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    if (this.autoGenerate && (this.qrData || this.specimenId)) {
      this.generateQRCode();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Generate QR code from provided data
   */
  async generateQRCode(): Promise<void> {
    if (this.isGenerating) { return; }

    const dataToEncode = this.getQRCodeData();
    if (!dataToEncode) {
      console.warn('No data provided for QR code generation');
      return;
    }

    this.isGenerating = true;

    try {
      const qrOptions = {
        errorCorrectionLevel: this.options.errorCorrectionLevel,
        type: 'image/png' as const,
        quality: 0.92,
        margin: this.options.margin,
        color: {
          dark: this.options.foregroundColor,
          light: this.options.backgroundColor
        },
        width: this.options.size
      };

      this.qrCodeDataUrl = await QRCode.toDataURL(dataToEncode, qrOptions);
      this.qrCodeGenerated.emit(this.qrCodeDataUrl);

    } catch (error) {
      console.error('Error generating QR code:', error);
      this.qrCodeDataUrl = '';
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Get the data to encode in QR code
   */
  private getQRCodeData(): string {
    if (typeof this.qrData === 'string' && this.qrData) {
      return this.qrData;
    }

    if (typeof this.qrData === 'object' && this.qrData) {
      return JSON.stringify(this.qrData);
    }

    if (this.labelData) {
      const qrData: QRCodeData = {
        specimenId: this.specimenId,
        accessionNumber: this.labelData.accessionNumber,
        patientId: '', // Would need to be passed in
        collectionDate: this.labelData.collectionDate,
        url: this.labelData.qrCodeUrl
      };
      return JSON.stringify(qrData);
    }

    if (this.specimenId) {
      return `${window.location.origin}/specimen/${this.specimenId}`;
    }

    return '';
  }

  /**
   * Handle options change
   */
  onOptionsChange(): void {
    if (this.autoGenerate) {
      this.generateQRCode();
    }
  }

  /**
   * Regenerate QR code manually
   */
  regenerateQRCode(): void {
    this.generateQRCode();
  }

  /**
   * Print specimen label with QR code
   */
  printLabel(): void {
    if (!this.qrCodeDataUrl) {
      console.warn('No QR code available for printing');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      console.error('Failed to open print window');
      return;
    }

    const labelContent = this.generateLabelHTML();

    printWindow.document.write(`
      <html>
        <head>
          <title>Specimen Label - ${this.labelData?.accessionNumber || this.specimenId}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 20px;
              background: white;
            }
            .label { 
              border: 2px solid #000; 
              padding: 15px; 
              width: 400px; 
              margin: 0 auto;
              background: white;
              page-break-inside: avoid;
            }
            .header {
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 10px;
              margin-bottom: 15px;
              font-weight: bold;
              font-size: 16px;
            }
            .content {
              display: flex;
              gap: 15px;
              align-items: flex-start;
            }
            .qr-section {
              flex-shrink: 0;
            }
            .qr-code {
              width: 100px;
              height: 100px;
              border: 1px solid #ccc;
            }
            .info-section {
              flex: 1;
              font-size: 12px;
              line-height: 1.4;
            }
            .accession-number {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 8px;
              text-align: center;
            }
            .patient-info {
              margin-bottom: 8px;
            }
            .specimen-info {
              color: #666;
              font-size: 11px;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid #ccc;
              font-size: 10px;
              color: #666;
            }
            @media print {
              body { margin: 0; padding: 10px; }
              .label { width: auto; max-width: 400px; }
            }
          </style>
        </head>
        <body>
          ${labelContent}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            };
          </script>
        </body>
      </html>
    `);

    this.labelPrinted.emit();
  }

  /**
   * Generate HTML for label printing
   */
  private generateLabelHTML(): string {
    const accessionNumber = this.labelData?.accessionNumber || this.specimenId;
    const patientName = this.labelData?.patientName || this.patientName || 'Unknown Patient';
    const collectionDate = this.labelData?.collectionDate || this.collectionDate;
    const specimenType = this.labelData?.specimenType || 'Unknown Type';

    return `
      <div class="label">
        <div class="header">Laboratory Specimen</div>
        
        <div class="accession-number">${accessionNumber}</div>
        
        <div class="content">
          <div class="qr-section">
            <img src="${this.qrCodeDataUrl}" alt="QR Code" class="qr-code">
          </div>
          
          <div class="info-section">
            <div class="patient-info">
              <strong>Patient:</strong> ${patientName}<br>
              <strong>Collection:</strong> ${new Date(collectionDate).toLocaleDateString()}<br>
              <strong>Type:</strong> ${specimenType}
            </div>
            
            <div class="specimen-info">
              Scan QR code for specimen details<br>
              Handle with appropriate precautions
            </div>
          </div>
        </div>
        
        <div class="footer">
          Generated: ${new Date().toLocaleString()}
        </div>
      </div>
    `;
  }

  /**
   * Download QR code as image
   */
  downloadQRCode(): void {
    if (!this.qrCodeDataUrl) {
      console.warn('No QR code available for download');
      return;
    }

    const link = document.createElement('a');
    link.download = `qr-code-${this.labelData?.accessionNumber || this.specimenId || 'specimen'}.png`;
    link.href = this.qrCodeDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.qrCodeDownloaded.emit(this.qrCodeDataUrl);
  }

  /**
   * Get QR code as blob for further processing
   */
  async getQRCodeBlob(): Promise<Blob | null> {
    if (!this.qrCodeDataUrl) { return null; }

    try {
      const response = await fetch(this.qrCodeDataUrl);
      return await response.blob();
    } catch (error) {
      console.error('Error converting QR code to blob:', error);
      return null;
    }
  }

  /**
   * Validate QR code data
   */
  validateQRData(): boolean {
    const data = this.getQRCodeData();
    return data.length > 0 && data.length <= 2953; // QR code data limit
  }
}