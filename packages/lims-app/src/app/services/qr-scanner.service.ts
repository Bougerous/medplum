import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { QRCodeData } from '../types/fhir-types';
import { SpecimenService } from './specimen.service';
import { ErrorHandlingService } from './error-handling.service';
import { NotificationService } from './notification.service';

export interface ScanResult {
  data: string;
  timestamp: Date;
  isValid: boolean;
  parsedData?: QRCodeData;
  error?: string;
}

export interface ScannerConfig {
  facingMode: 'user' | 'environment';
  width: number;
  height: number;
  fps: number;
  qrbox?: { width: number; height: number };
  aspectRatio?: number;
}

@Injectable({
  providedIn: 'root'
})
export class QrScannerService {
  private isScanning$ = new BehaviorSubject<boolean>(false);
  private scanResults$ = new Subject<ScanResult>();
  private currentStream: MediaStream | null = null;
  private scannerElement: HTMLVideoElement | null = null;

  constructor(
    private specimenService: SpecimenService,
    private errorHandlingService: ErrorHandlingService,
    private notificationService: NotificationService
  ) {}

  /**
   * Get scanning status observable
   */
  getIsScanning(): Observable<boolean> {
    return this.isScanning$.asObservable();
  }

  /**
   * Get scan results observable
   */
  getScanResults(): Observable<ScanResult> {
    return this.scanResults$.asObservable();
  }

  /**
   * Start QR code scanning
   */
  async startScanning(
    videoElement: HTMLVideoElement,
    config: Partial<ScannerConfig> = {}
  ): Promise<void> {
    if (this.isScanning$.value) {
      console.warn('Scanner is already running');
      return;
    }

    const defaultConfig: ScannerConfig = {
      facingMode: 'environment',
      width: 640,
      height: 480,
      fps: 10,
      qrbox: { width: 250, height: 250 }
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      // Request camera access
      this.currentStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: finalConfig.facingMode,
          width: { ideal: finalConfig.width },
          height: { ideal: finalConfig.height }
        }
      });

      // Set up video element
      this.scannerElement = videoElement;
      videoElement.srcObject = this.currentStream;
      videoElement.play();

      this.isScanning$.next(true);

      // Start scanning loop
      this.startScanningLoop(videoElement, finalConfig);

    } catch (error) {
      this.errorHandlingService.handleError(error, 'qr-scanner-start');
      throw new Error('Failed to start camera: ' + (error as Error).message);
    }
  }

  /**
   * Stop QR code scanning
   */
  stopScanning(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }

    if (this.scannerElement) {
      this.scannerElement.srcObject = null;
      this.scannerElement = null;
    }

    this.isScanning$.next(false);
  }

  /**
   * Scan QR code from image file
   */
  async scanFromFile(file: File): Promise<ScanResult> {
    try {
      const imageUrl = URL.createObjectURL(file);
      const result = await this.decodeQRFromImage(imageUrl);
      URL.revokeObjectURL(imageUrl);
      return result;
    } catch (error) {
      const scanResult: ScanResult = {
        data: '',
        timestamp: new Date(),
        isValid: false,
        error: 'Failed to scan QR code from file: ' + (error as Error).message
      };
      
      this.scanResults$.next(scanResult);
      return scanResult;
    }
  }

  /**
   * Scan QR code from image URL
   */
  async scanFromUrl(imageUrl: string): Promise<ScanResult> {
    try {
      return await this.decodeQRFromImage(imageUrl);
    } catch (error) {
      const scanResult: ScanResult = {
        data: '',
        timestamp: new Date(),
        isValid: false,
        error: 'Failed to scan QR code from URL: ' + (error as Error).message
      };
      
      this.scanResults$.next(scanResult);
      return scanResult;
    }
  }

  /**
   * Validate and parse QR code data
   */
  validateQRData(data: string): { isValid: boolean; parsedData?: QRCodeData; error?: string } {
    try {
      // Try to parse as JSON first (structured data)
      const parsed = JSON.parse(data);
      
      if (this.isValidQRCodeData(parsed)) {
        return {
          isValid: true,
          parsedData: parsed as QRCodeData
        };
      }
      
      // If not valid structured data, check if it's a specimen URL
      if (data.includes('/specimen/') || data.match(/^SP\d+/)) {
        return {
          isValid: true,
          parsedData: {
            specimenId: this.extractSpecimenId(data),
            accessionNumber: this.extractSpecimenId(data),
            patientId: '',
            collectionDate: '',
            url: data
          }
        };
      }

      return {
        isValid: false,
        error: 'QR code does not contain valid specimen data'
      };

    } catch (error) {
      // Not JSON, check if it's a simple specimen identifier or URL
      if (data.match(/^SP\d+/) || data.includes('/specimen/')) {
        return {
          isValid: true,
          parsedData: {
            specimenId: this.extractSpecimenId(data),
            accessionNumber: this.extractSpecimenId(data),
            patientId: '',
            collectionDate: '',
            url: data
          }
        };
      }

      return {
        isValid: false,
        error: 'Invalid QR code format'
      };
    }
  }

  /**
   * Process scanned specimen data
   */
  async processScannedSpecimen(scanResult: ScanResult): Promise<void> {
    if (!scanResult.isValid || !scanResult.parsedData) {
      this.notificationService.showError('Invalid QR Code', 'The scanned QR code does not contain valid specimen data.');
      return;
    }

    try {
      const specimenId = scanResult.parsedData.specimenId || scanResult.parsedData.accessionNumber;
      
      if (!specimenId) {
        throw new Error('No specimen identifier found in QR code');
      }

      // Look up specimen by accession number
      const specimen = await this.specimenService.getSpecimenByAccessionNumber(specimenId);
      
      if (!specimen) {
        this.notificationService.showWarning(
          'Specimen Not Found',
          `No specimen found with accession number: ${specimenId}`
        );
        return;
      }

      this.notificationService.showSuccess(
        'Specimen Found',
        `Successfully located specimen: ${specimenId}`
      );

      // Emit successful scan result
      this.scanResults$.next({
        ...scanResult,
        parsedData: {
          ...scanResult.parsedData,
          specimenId: specimen.id || specimenId
        }
      });

    } catch (error) {
      this.errorHandlingService.handleError(error, 'specimen-lookup');
      this.notificationService.showError(
        'Specimen Lookup Failed',
        'Failed to process scanned specimen. Please try again.'
      );
    }
  }

  /**
   * Check camera permissions
   */
  async checkCameraPermissions(): Promise<boolean> {
    try {
      const permissions = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return permissions.state === 'granted';
    } catch (error) {
      // Fallback: try to access camera directly
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (cameraError) {
        return false;
      }
    }
  }

  /**
   * Get available cameras
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      this.errorHandlingService.handleError(error, 'camera-enumeration');
      return [];
    }
  }

  /**
   * Start scanning loop (simplified implementation)
   */
  private startScanningLoop(videoElement: HTMLVideoElement, config: ScannerConfig): void {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Failed to get canvas context');
    }

    const scanFrame = () => {
      if (!this.isScanning$.value || !videoElement.videoWidth || !videoElement.videoHeight) {
        return;
      }

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      context.drawImage(videoElement, 0, 0);

      // In a real implementation, you would use a QR code detection library here
      // For now, we'll simulate scanning by checking for manual input
      
      setTimeout(scanFrame, 1000 / config.fps);
    };

    videoElement.addEventListener('loadedmetadata', () => {
      scanFrame();
    });
  }

  /**
   * Decode QR code from image (simplified implementation)
   */
  private async decodeQRFromImage(imageUrl: string): Promise<ScanResult> {
    // In a real implementation, you would use a QR code detection library
    // For now, return a mock result
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: 'mock-qr-data',
          timestamp: new Date(),
          isValid: false,
          error: 'QR code detection not implemented'
        });
      }, 1000);
    });
  }

  /**
   * Check if data is valid QRCodeData structure
   */
  private isValidQRCodeData(data: any): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      (data.specimenId || data.accessionNumber) &&
      typeof (data.specimenId || data.accessionNumber) === 'string'
    );
  }

  /**
   * Extract specimen ID from various formats
   */
  private extractSpecimenId(data: string): string {
    // Extract from URL like /specimen/SP20240101001
    const urlMatch = data.match(/\/specimen\/([^\/\?]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Extract specimen ID pattern (SP followed by numbers)
    const idMatch = data.match(/(SP\d+)/);
    if (idMatch) {
      return idMatch[1];
    }

    return data;
  }
}