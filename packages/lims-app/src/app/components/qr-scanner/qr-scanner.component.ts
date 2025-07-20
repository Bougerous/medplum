import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, EventEmitter, inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { NotificationService } from '../../services/notification.service';
import { CameraDevice, QrScannerService, ScannerConfig, ScanResult } from '../../services/qr-scanner.service';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="qr-scanner-container">
      <div class="scanner-header">
        <h3>QR Code Scanner</h3>
        <div class="scanner-controls">
          <button 
            type="button" 
            class="btn btn-primary" 
            (click)="startScanning()"
            [disabled]="isScanning || !cameraPermission">
            📷 Start Scanning
          </button>
          <button 
            type="button" 
            class="btn btn-secondary" 
            (click)="stopScanning()"
            [disabled]="!isScanning">
            ⏹️ Stop
          </button>
          <button 
            type="button" 
            class="btn btn-outline" 
            (click)="switchCamera()"
            [disabled]="!isScanning || availableCameras.length <= 1">
            🔄 Switch Camera
          </button>
        </div>
      </div>

      <!-- Camera Permission Request -->
      <div class="permission-request" *ngIf="!cameraPermission && !permissionChecked">
        <div class="permission-icon">📷</div>
        <h4>Camera Access Required</h4>
        <p>Please allow camera access to scan QR codes</p>
        <button type="button" class="btn btn-primary" (click)="requestCameraPermission()">
          Allow Camera Access
        </button>
      </div>

      <!-- Camera Denied -->
      <div class="permission-denied" *ngIf="!cameraPermission && permissionChecked">
        <div class="permission-icon">🚫</div>
        <h4>Camera Access Denied</h4>
        <p>Camera access is required to scan QR codes. Please enable camera permissions in your browser settings.</p>
        <button type="button" class="btn btn-secondary" (click)="requestCameraPermission()">
          Try Again
        </button>
      </div>

      <!-- Scanner View -->
      <div class="scanner-view" *ngIf="cameraPermission">
        <div class="video-container">
          <video 
            #videoElement 
            class="scanner-video"
            [class.scanning]="isScanning"
            autoplay 
            muted 
            playsinline>
          </video>
          
          <div class="scanner-overlay" *ngIf="isScanning">
            <div class="scan-frame">
              <div class="corner top-left"></div>
              <div class="corner top-right"></div>
              <div class="corner bottom-left"></div>
              <div class="corner bottom-right"></div>
            </div>
            <div class="scan-instruction">
              Position QR code within the frame
            </div>
          </div>
          
          <div class="scanner-status" *ngIf="isScanning">
            <div class="status-indicator scanning">
              <div class="pulse"></div>
              Scanning...
            </div>
          </div>
        </div>

        <!-- File Upload Alternative -->
        <div class="file-upload-section">
          <h4>Or Upload QR Code Image</h4>
          <div class="file-upload">
            <input 
              #fileInput 
              type="file" 
              accept="image/*" 
              (change)="onFileSelected($event)"
              class="file-input">
            <button 
              type="button" 
              class="btn btn-outline" 
              (click)="fileInput.click()">
              📁 Choose Image File
            </button>
          </div>
        </div>
      </div>

      <!-- Scan Results -->
      <div class="scan-results" *ngIf="lastScanResult">
        <h4>Scan Result</h4>
        <div class="result-card" [class.success]="lastScanResult.isValid" [class.error]="!lastScanResult.isValid">
          <div class="result-status">
            <span class="status-icon">{{ lastScanResult.isValid ? '✅' : '❌' }}</span>
            <span class="status-text">{{ lastScanResult.isValid ? 'Valid QR Code' : 'Invalid QR Code' }}</span>
          </div>
          
          <div class="result-data" *ngIf="lastScanResult.isValid && lastScanResult.parsedData">
            <div class="data-item">
              <strong>Specimen ID:</strong> {{ lastScanResult.parsedData.specimenId || lastScanResult.parsedData.accessionNumber }}
            </div>
            <div class="data-item" *ngIf="lastScanResult.parsedData.patientId">
              <strong>Patient ID:</strong> {{ lastScanResult.parsedData.patientId }}
            </div>
            <div class="data-item" *ngIf="lastScanResult.parsedData.collectionDate">
              <strong>Collection Date:</strong> {{ lastScanResult.parsedData.collectionDate | date:'short' }}
            </div>
          </div>
          
          <div class="result-error" *ngIf="!lastScanResult.isValid && lastScanResult.error">
            <strong>Error:</strong> {{ lastScanResult.error }}
          </div>
          
          <div class="result-actions" *ngIf="lastScanResult.isValid">
            <button 
              type="button" 
              class="btn btn-primary" 
              (click)="processResult()">
              Process Specimen
            </button>
            <button 
              type="button" 
              class="btn btn-secondary" 
              (click)="clearResult()">
              Clear
            </button>
          </div>
        </div>
      </div>

      <!-- Scanner Settings -->
      <div class="scanner-settings" *ngIf="showSettings">
        <h4>Scanner Settings</h4>
        <div class="settings-grid">
          <div class="setting-group">
            <label for="camera-select">Camera</label>
            <select 
              id="camera-select" 
              [(ngModel)]="selectedCameraId" 
              (change)="onCameraChange()"
              class="form-control">
              <option value="">Default Camera</option>
              <option *ngFor="let camera of availableCameras" [value]="camera.id">
                {{ camera.label || 'Camera ' + (availableCameras.indexOf(camera) + 1) }}
              </option>
            </select>
          </div>
          
          <div class="setting-group">
            <label for="resolution">Resolution</label>
            <select 
              id="resolution" 
              [(ngModel)]="scannerConfig.width" 
              (change)="onConfigChange()"
              class="form-control">
              <option [value]="320">320x240</option>
              <option [value]="640">640x480</option>
              <option [value]="1280">1280x720</option>
            </select>
          </div>
          
          <div class="setting-group">
            <label for="fps">Frame Rate</label>
            <select 
              id="fps" 
              [(ngModel)]="scannerConfig.fps" 
              (change)="onConfigChange()"
              class="form-control">
              <option [value]="5">5 FPS</option>
              <option [value]="10">10 FPS</option>
              <option [value]="15">15 FPS</option>
              <option [value]="30">30 FPS</option>
            </select>
          </div>
        </div>
      </div>

      <div class="scanner-footer">
        <button 
          type="button" 
          class="btn btn-link" 
          (click)="showSettings = !showSettings">
          {{ showSettings ? 'Hide' : 'Show' }} Settings
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./qr-scanner.component.scss']
})
export class QrScannerComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  @Input() autoProcess: boolean = true;
  @Output() scanResult = new EventEmitter<ScanResult>();
  @Output() specimenFound = new EventEmitter<any>();

  isScanning = false;
  cameraPermission = false;
  permissionChecked = false;
  availableCameras: CameraDevice[] = [];
  selectedCameraId = '';
  lastScanResult: ScanResult | null = null;
  showSettings = false;

  scannerConfig: ScannerConfig = {
    facingMode: 'environment',
    width: 640,
    height: 480,
    fps: 10,
    qrbox: { width: 250, height: 250 }
  };

  private readonly destroy$ = new Subject<void>();
  private readonly qrScannerService = inject(QrScannerService);
  private readonly notificationService = inject(NotificationService);

  ngOnInit(): void {
    void this.checkCameraPermission();
    void this.loadAvailableCameras();
    this.subscribeToScanResults();
  }

  ngOnDestroy(): void {
    this.stopScanning();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check camera permissions
   */
  async checkCameraPermission(): Promise<void> {
    try {
      this.cameraPermission = await this.qrScannerService.checkCameraPermissions();
      this.permissionChecked = true;
    } catch (error) {
      console.error('Error checking camera permissions:', error);
      this.cameraPermission = false;
      this.permissionChecked = true;
    }
  }

  /**
   * Request camera permission
   */
  async requestCameraPermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      this.cameraPermission = true;
      this.loadAvailableCameras();
    } catch (error) {
      console.error('Camera permission denied:', error);
      this.cameraPermission = false;
      this.notificationService.showError(
        'Camera Access Denied',
        'Please enable camera permissions to use the QR scanner.'
      );
    }
    this.permissionChecked = true;
  }

  /**
   * Load available cameras
   */
  async loadAvailableCameras(): Promise<void> {
    try {
      this.availableCameras = await this.qrScannerService.getAvailableCameras();
    } catch (error) {
      console.error('Error loading cameras:', error);
    }
  }

  /**
   * Subscribe to scan results
   */
  private subscribeToScanResults(): void {
    this.qrScannerService.getScanResults()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.lastScanResult = result;
          this.scanResult.emit(result);

          if (result.isValid && this.autoProcess) {
            this.processResult();
          }
        },
        error: (error) => {
          console.error('Scan result error:', error);
        }
      });

    this.qrScannerService.getIsScanning()
      .pipe(takeUntil(this.destroy$))
      .subscribe(isScanning => {
        this.isScanning = isScanning;
      });
  }

  /**
   * Start scanning
   */
  async startScanning(): Promise<void> {
    if (!this.cameraPermission) {
      await this.requestCameraPermission();
      if (!this.cameraPermission) { return; }
    }

    try {
      await this.qrScannerService.startScanning(
        this.videoElement.nativeElement.id || 'qr-scanner-video',
        this.scannerConfig
      );
    } catch (error) {
      console.error('Error starting scanner:', error);
      this.notificationService.showError(
        'Scanner Error',
        'Failed to start QR code scanner. Please try again.'
      );
    }
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    this.qrScannerService.stopScanning();
  }

  /**
   * Switch camera
   */
  async switchCamera(): Promise<void> {
    if (this.availableCameras.length <= 1) { return; }

    const currentIndex = this.availableCameras.findIndex(
      camera => camera.id === this.selectedCameraId
    );
    const nextIndex = (currentIndex + 1) % this.availableCameras.length;
    this.selectedCameraId = this.availableCameras[nextIndex].id;

    if (this.isScanning) {
      this.stopScanning();
      setTimeout(() => this.startScanning(), 500);
    }
  }

  /**
   * Handle camera selection change
   */
  onCameraChange(): void {
    if (this.isScanning) {
      this.stopScanning();
      setTimeout(() => this.startScanning(), 500);
    }
  }

  /**
   * Handle scanner config change
   */
  onConfigChange(): void {
    this.scannerConfig.height = Math.round(this.scannerConfig.width * 0.75);

    if (this.isScanning) {
      this.stopScanning();
      setTimeout(() => this.startScanning(), 500);
    }
  }

  /**
   * Handle file selection for QR code scanning
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) { return; }

    try {
      const result = await this.qrScannerService.scanFromFile(file);
      this.lastScanResult = result;
      this.scanResult.emit(result);

      if (result.isValid && this.autoProcess) {
        this.processResult();
      }
    } catch (error) {
      console.error('Error scanning file:', error);
      this.notificationService.showError(
        'File Scan Error',
        'Failed to scan QR code from file. Please try a different image.'
      );
    }

    // Clear file input
    input.value = '';
  }

  /**
   * Process scan result
   */
  async processResult(): Promise<void> {
    if (!(this.lastScanResult?.isValid)) { return; }

    try {
      await this.qrScannerService.processScannedSpecimen(this.lastScanResult);
      this.specimenFound.emit(this.lastScanResult.parsedData);
    } catch (error) {
      console.error('Error processing scan result:', error);
    }
  }

  /**
   * Clear scan result
   */
  clearResult(): void {
    this.lastScanResult = null;
  }
}
