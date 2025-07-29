import { Injectable, inject } from '@angular/core';
import { Html5Qrcode, Html5QrcodeScanner, Html5QrcodeScannerState } from 'html5-qrcode';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { QRCodeData } from '../types/fhir-types';
import { ErrorHandlingService } from './error-handling.service';
import { NotificationService } from './notification.service';
import { SpecimenService } from './specimen.service';

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
  disableFlip?: boolean;
  rememberLastUsedCamera?: boolean;
  supportedScanTypes?: Html5QrcodeScanType[];
}

export enum Html5QrcodeScanType {
  SCAN_TYPE_CAMERA = 0,
  SCAN_TYPE_FILE = 1
}

export interface CameraDevice {
  id: string;
  label: string;
}

@Injectable({
  providedIn: 'root'
})
export class QrScannerService {
  private specimenService = inject(SpecimenService);
  private errorHandlingService = inject(ErrorHandlingService);
  private notificationService = inject(NotificationService);

  private isScanning$ = new BehaviorSubject<boolean>(false);
  private scanResults$ = new Subject<ScanResult>();
  private html5QrCode: Html5Qrcode | null = null;
  private html5QrCodeScanner: Html5QrcodeScanner | null = null;
  private currentCameraId: string | null = null;
  private availableCameras: CameraDevice[] = [];

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() { }

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
   * Start QR code scanning with camera
   */
  async startScanning(
    elementId: string,
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
      qrbox: { width: 250, height: 250 },
      disableFlip: false,
      rememberLastUsedCamera: true,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      // Initialize available cameras
      await this.initializeCameras();

      // Select camera based on facing mode preference
      const cameraId = this.selectCamera(finalConfig.facingMode);

      if (!cameraId) {
        throw new Error('No suitable camera found');
      }

      // Initialize Html5Qrcode
      this.html5QrCode = new Html5Qrcode(elementId);

      // Start scanning
      await this.html5QrCode.start(
        cameraId,
        {
          fps: finalConfig.fps,
          qrbox: finalConfig.qrbox,
          aspectRatio: finalConfig.aspectRatio,
          disableFlip: finalConfig.disableFlip
        },
        (decodedText, decodedResult) => {
          this.handleScanSuccess(decodedText, decodedResult);
        },
        (errorMessage) => {
          // Handle scan failure (this is called frequently, so we don't log every failure)
          console.debug('QR scan error:', errorMessage);
        }
      );

      this.currentCameraId = cameraId;
      this.isScanning$.next(true);

    } catch (error) {
      this.errorHandlingService.handleError(error, 'qr-scanner-start');
      throw new Error(`Failed to start camera: ${(error as Error).message}`);
    }
  }

  /**
   * Start QR code scanning with full scanner UI
   */
  async startScannerWithUI(
    elementId: string,
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
      qrbox: { width: 250, height: 250 },
      disableFlip: false,
      rememberLastUsedCamera: true,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA, Html5QrcodeScanType.SCAN_TYPE_FILE]
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      this.html5QrCodeScanner = new Html5QrcodeScanner(
        elementId,
        {
          fps: finalConfig.fps,
          qrbox: finalConfig.qrbox,
          aspectRatio: finalConfig.aspectRatio,
          disableFlip: finalConfig.disableFlip,
          rememberLastUsedCamera: finalConfig.rememberLastUsedCamera,
          supportedScanTypes: finalConfig.supportedScanTypes
        },
        false // verbose logging
      );

      this.html5QrCodeScanner.render(
        (decodedText, decodedResult) => {
          this.handleScanSuccess(decodedText, decodedResult);
        },
        (errorMessage) => {
          console.debug('QR scan error:', errorMessage);
        }
      );

      this.isScanning$.next(true);

    } catch (error) {
      this.errorHandlingService.handleError(error, 'qr-scanner-ui-start');
      throw new Error(`Failed to start scanner UI: ${(error as Error).message}`);
    }
  }

  /**
   * Stop QR code scanning
   */
  async stopScanning(): Promise<void> {
    try {
      if (this.html5QrCode && this.html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
        await this.html5QrCode.stop();
        this.html5QrCode.clear();
        this.html5QrCode = null;
      }

      if (this.html5QrCodeScanner) {
        this.html5QrCodeScanner.clear();
        this.html5QrCodeScanner = null;
      }

      this.currentCameraId = null;
      this.isScanning$.next(false);

    } catch (error) {
      this.errorHandlingService.handleError(error, 'qr-scanner-stop');
      console.error('Error stopping scanner:', error);
    }
  }

  /**
   * Scan QR code from image file
   */
  async scanFromFile(file: File): Promise<ScanResult> {
    try {
      // Create a temporary Html5Qrcode instance for file scanning
      const tempElementId = `temp-qr-scanner-${Date.now()}`;
      const tempElement = document.createElement('div');
      tempElement.id = tempElementId;
      tempElement.style.display = 'none';
      document.body.appendChild(tempElement);

      const html5QrCode = new Html5Qrcode(tempElementId);

      try {
        const decodedText = await html5QrCode.scanFile(file, true);
        const validation = this.validateQRData(decodedText);

        const scanResult: ScanResult = {
          data: decodedText,
          timestamp: new Date(),
          isValid: validation.isValid,
          parsedData: validation.parsedData,
          error: validation.error
        };

        this.scanResults$.next(scanResult);
        return scanResult;

      } finally {
        html5QrCode.clear();
        document.body.removeChild(tempElement);
      }

    } catch (error) {
      const scanResult: ScanResult = {
        data: '',
        timestamp: new Date(),
        isValid: false,
        error: `Failed to scan QR code from file: ${(error as Error).message}`
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
      // Convert URL to File object for scanning
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'qr-image', { type: blob.type });

      return await this.scanFromFile(file);

    } catch (error) {
      const scanResult: ScanResult = {
        data: '',
        timestamp: new Date(),
        isValid: false,
        error: `Failed to scan QR code from URL: ${(error as Error).message}`
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

    } catch (_error) {
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
    if (!(scanResult.isValid && scanResult.parsedData)) {
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
    } catch (_error) {
      // Fallback: try to access camera directly
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (_cameraError) {
        return false;
      }
    }
  }

  /**
   * Get available cameras
   */
  async getAvailableCameras(): Promise<CameraDevice[]> {
    try {
      await this.initializeCameras();
      return this.availableCameras;
    } catch (error) {
      this.errorHandlingService.handleError(error, 'camera-enumeration');
      return [];
    }
  }

  /**
   * Switch to a different camera
   */
  async switchCamera(cameraId: string): Promise<void> {
    if (!(this.html5QrCode && this.isScanning$.value)) {
      throw new Error('Scanner is not currently running');
    }

    try {
      // Stop current scanning
      await this.html5QrCode.stop();

      // Start with new camera
      await this.html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText, decodedResult) => {
          this.handleScanSuccess(decodedText, decodedResult);
        },
        (errorMessage) => {
          console.debug('QR scan error:', errorMessage);
        }
      );

      this.currentCameraId = cameraId;

    } catch (error) {
      this.errorHandlingService.handleError(error, 'camera-switch');
      throw new Error(`Failed to switch camera: ${(error as Error).message}`);
    }
  }

  /**
   * Get current camera ID
   */
  getCurrentCameraId(): string | null {
    return this.currentCameraId;
  }

  /**
   * Toggle camera between front and back
   */
  async toggleCamera(): Promise<void> {
    const cameras = await this.getAvailableCameras();
    if (cameras.length < 2) {
      throw new Error('Multiple cameras not available');
    }

    const currentIndex = cameras.findIndex(camera => camera.id === this.currentCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];

    await this.switchCamera(nextCamera.id);
  }

  /**
   * Initialize available cameras
   */
  private async initializeCameras(): Promise<void> {
    try {
      const cameras = await Html5Qrcode.getCameras();
      this.availableCameras = cameras.map(camera => ({
        id: camera.id,
        label: camera.label || `Camera ${camera.id}`
      }));
    } catch (error) {
      this.errorHandlingService.handleError(error, 'camera-initialization');
      this.availableCameras = [];
    }
  }

  /**
   * Select appropriate camera based on facing mode
   */
  private selectCamera(facingMode: 'user' | 'environment'): string | null {
    if (this.availableCameras.length === 0) {
      return null;
    }

    // Try to find camera based on label hints
    if (facingMode === 'environment') {
      const backCamera = this.availableCameras.find(camera =>
        camera.label.toLowerCase().includes('back') ||
        camera.label.toLowerCase().includes('rear') ||
        camera.label.toLowerCase().includes('environment')
      );
      if (backCamera) { return backCamera.id; }
    } else {
      const frontCamera = this.availableCameras.find(camera =>
        camera.label.toLowerCase().includes('front') ||
        camera.label.toLowerCase().includes('user') ||
        camera.label.toLowerCase().includes('facing')
      );
      if (frontCamera) { return frontCamera.id; }
    }

    // Fallback to first available camera
    return this.availableCameras[0].id;
  }

  /**
   * Handle successful QR code scan
   */
  private handleScanSuccess(decodedText: string, _decodedResult: any): void {
    const validation = this.validateQRData(decodedText);

    const scanResult: ScanResult = {
      data: decodedText,
      timestamp: new Date(),
      isValid: validation.isValid,
      parsedData: validation.parsedData,
      error: validation.error
    };

    this.scanResults$.next(scanResult);

    // Process specimen if valid
    if (validation.isValid) {
      this.processScannedSpecimen(scanResult);
    }
  }

  /**
   * Check if data is valid QRCodeData structure
   */
  private isValidQRCodeData(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      ((data as any).specimenId || (data as any).accessionNumber) &&
      typeof ((data as any).specimenId || (data as any).accessionNumber) === 'string'
    );
  }

  /**
   * Extract specimen ID from various formats
   */
  private extractSpecimenId(data: string): string {
    // Extract from URL like /specimen/SP20240101001
    const urlMatch = data.match(/\/specimen\/([^/?]+)/);
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

  /**
   * Scan barcode using handheld scanner input
   * This method handles input from USB/Bluetooth barcode scanners
   */
  processBarcodeInput(barcodeData: string): ScanResult {
    const validation = this.validateQRData(barcodeData);

    const scanResult: ScanResult = {
      data: barcodeData,
      timestamp: new Date(),
      isValid: validation.isValid,
      parsedData: validation.parsedData,
      error: validation.error
    };

    this.scanResults$.next(scanResult);

    // Process specimen if valid
    if (validation.isValid) {
      this.processScannedSpecimen(scanResult);
    }

    return scanResult;
  }

  /**
   * Handle damaged or invalid QR codes
   */
  handleDamagedCode(partialData: string): { suggestions: string[]; canRecover: boolean } {
    const suggestions: string[] = [];
    let canRecover = false;

    // Try to recover common specimen ID patterns
    if (partialData.includes('SP') || partialData.match(/\d{8,}/)) {
      // Suggest possible specimen IDs based on partial data
      const numberMatch = partialData.match(/\d+/);
      if (numberMatch) {
        const number = numberMatch[0];
        suggestions.push(`SP${number}`);
        suggestions.push(`SP${number.padStart(8, '0')}`);
        canRecover = true;
      }
    }

    // Try to recover URL patterns
    if (partialData.includes('specimen') || partialData.includes('/')) {
      const pathMatch = partialData.match(/specimen[/]?([A-Za-z0-9]+)/);
      if (pathMatch) {
        suggestions.push(pathMatch[1]);
        canRecover = true;
      }
    }

    return { suggestions, canRecover };
  }

  /**
   * Validate QR code format and checksum (if applicable)
   */
  validateQRCodeFormat(data: string): { isValidFormat: boolean; formatType: string; errors: string[] } {
    const errors: string[] = [];
    let formatType = 'unknown';
    let isValidFormat = false;

    // Check for JSON format
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        formatType = 'json';
        isValidFormat = true;

        // Validate required fields for specimen QR codes
        if (!(parsed.specimenId || parsed.accessionNumber)) {
          errors.push('Missing specimen identifier');
          isValidFormat = false;
        }
      }
    } catch {
      // Not JSON, check other formats
    }

    // Check for URL format
    if (data.startsWith('http') || data.includes('/specimen/')) {
      formatType = 'url';
      isValidFormat = true;

      if (!data.includes('/specimen/')) {
        errors.push('URL does not contain specimen path');
        isValidFormat = false;
      }
    }

    // Check for simple specimen ID format
    if (data.match(/^SP\d{8,}$/)) {
      formatType = 'specimen-id';
      isValidFormat = true;
    }

    if (!isValidFormat && formatType === 'unknown') {
      errors.push('Unrecognized QR code format');
    }

    return { isValidFormat, formatType, errors };
  }

  /**
   * Get scanner statistics and performance metrics
   */
  getScannerStats(): {
    totalScans: number;
    successfulScans: number;
    failedScans: number;
    averageScanTime: number;
    lastScanTime?: Date;
  } {
    // This would be implemented with actual tracking in a production system
    return {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      averageScanTime: 0,
      lastScanTime: undefined
    };
  }
}
