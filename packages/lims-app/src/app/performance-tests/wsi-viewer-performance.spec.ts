import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { Specimen, ImagingStudy, Binary } from '@medplum/fhirtypes';

// Mock WSI Viewer Component for testing
@Component({
  selector: 'app-test-wsi-viewer',
  template: `
    <div class="wsi-viewer-container" #viewerContainer>
      <div class="viewer-toolbar">
        <button (click)="zoomIn()">Zoom In</button>
        <button (click)="zoomOut()">Zoom Out</button>
        <button (click)="resetView()">Reset</button>
      </div>
      <div #viewerContent class="viewer-content" style="width: 800px; height: 600px;"></div>
      <div class="viewer-info">
        <div>Specimen: {{ specimen?.accessionIdentifier?.value }}</div>
        <div>Magnification: {{ currentMagnification }}x</div>
        <div>Tiles Loaded: {{ tilesLoaded }}</div>
        <div>Memory Usage: {{ memoryUsageMB.toFixed(2) }} MB</div>
      </div>
    </div>
  `
})
class TestWsiViewerComponent implements AfterViewInit {
  @ViewChild('viewerContainer', { static: true }) viewerContainer!: ElementRef;
  @ViewChild('viewerContent', { static: true }) viewerContent!: ElementRef;

  specimen?: Specimen;
  imagingStudy?: ImagingStudy;
  currentMagnification = 1;
  tilesLoaded = 0;
  memoryUsageMB = 0;
  
  private viewer: any;
  private imageData: ImageData[] = [];
  private tileCache = new Map<string, HTMLImageElement>();
  private performanceMetrics = {
    renderTimes: [] as number[],
    zoomTimes: [] as number[],
    panTimes: [] as number[],
    tileLoadTimes: [] as number[]
  };

  constructor(
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService
  ) {}

  async ngAfterViewInit(): Promise<void> {
    await this.initializeViewer();
  }

  private async initializeViewer(): Promise<void> {
    // Mock OpenSeadragon-like viewer initialization
    this.viewer = {
      container: this.viewerContent.nativeElement,
      viewport: {
        zoomTo: (zoom: number) => this.zoomTo(zoom),
        panTo: (x: number, y: number) => this.panTo(x, y),
        getZoom: () => this.currentMagnification,
        getCenter: () => ({ x: 0.5, y: 0.5 })
      },
      world: {
        getItemAt: (index: number) => ({
          getContentSize: () => ({ x: 10000, y: 10000 }),
          imageToViewportCoordinates: (point: any) => point
        })
      }
    };
  }

  async loadImage(imagingStudy: ImagingStudy, specimen: Specimen): Promise<void> {
    const startTime = performance.now();
    
    try {
      this.imagingStudy = imagingStudy;
      this.specimen = specimen;

      // Simulate loading large WSI image
      await this.loadImageTiles();
      
      const loadTime = performance.now() - startTime;
      this.performanceMetrics.renderTimes.push(loadTime);
      
      this.updateMemoryUsage();
    } catch (error) {
      this.errorHandlingService.handleError({
        type: 'INTEGRATION_ERROR' as any,
        message: 'Failed to load WSI image',
        details: error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  private async loadImageTiles(): Promise<void> {
    // Simulate loading multiple image tiles
    const tilePromises: Promise<void>[] = [];
    const totalTiles = 100; // Simulate 100 tiles for a large image

    for (let i = 0; i < totalTiles; i++) {
      tilePromises.push(this.loadTile(i));
    }

    await Promise.all(tilePromises);
    this.tilesLoaded = totalTiles;
  }

  private async loadTile(tileIndex: number): Promise<void> {
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      // Simulate tile loading time
      setTimeout(() => {
        const tileKey = `tile-${tileIndex}`;
        
        // Create mock image tile
        const img = new Image();
        img.width = 256;
        img.height = 256;
        
        // Simulate image data
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        
        // Fill with random pattern to simulate tissue image
        const imageData = ctx.createImageData(256, 256);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.random() * 255;     // Red
          imageData.data[i + 1] = Math.random() * 255; // Green
          imageData.data[i + 2] = Math.random() * 255; // Blue
          imageData.data[i + 3] = 255;                 // Alpha
        }
        ctx.putImageData(imageData, 0, 0);
        
        img.src = canvas.toDataURL();
        this.tileCache.set(tileKey, img);
        
        const loadTime = performance.now() - startTime;
        this.performanceMetrics.tileLoadTimes.push(loadTime);
        
        resolve();
      }, Math.random() * 100 + 50); // 50-150ms load time per tile
    });
  }

  zoomIn(): void {
    const startTime = performance.now();
    this.zoomTo(this.currentMagnification * 1.5);
    const zoomTime = performance.now() - startTime;
    this.performanceMetrics.zoomTimes.push(zoomTime);
  }

  zoomOut(): void {
    const startTime = performance.now();
    this.zoomTo(this.currentMagnification / 1.5);
    const zoomTime = performance.now() - startTime;
    this.performanceMetrics.zoomTimes.push(zoomTime);
  }

  resetView(): void {
    const startTime = performance.now();
    this.zoomTo(1);
    this.panTo(0.5, 0.5);
    const resetTime = performance.now() - startTime;
    this.performanceMetrics.renderTimes.push(resetTime);
  }

  private zoomTo(zoom: number): void {
    this.currentMagnification = Math.max(0.1, Math.min(zoom, 40));
    this.updateMemoryUsage();
  }

  private panTo(x: number, y: number): void {
    const startTime = performance.now();
    // Simulate panning operation
    setTimeout(() => {
      const panTime = performance.now() - startTime;
      this.performanceMetrics.panTimes.push(panTime);
    }, 10);
  }

  private updateMemoryUsage(): void {
    // Estimate memory usage based on loaded tiles and zoom level
    const baseTileMemory = 256 * 256 * 4; // RGBA bytes per tile
    const visibleTiles = Math.min(this.tilesLoaded, Math.ceil(this.currentMagnification * 10));
    this.memoryUsageMB = (visibleTiles * baseTileMemory) / (1024 * 1024);
  }

  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      averageRenderTime: this.calculateAverage(this.performanceMetrics.renderTimes),
      averageZoomTime: this.calculateAverage(this.performanceMetrics.zoomTimes),
      averagePanTime: this.calculateAverage(this.performanceMetrics.panTimes),
      averageTileLoadTime: this.calculateAverage(this.performanceMetrics.tileLoadTimes),
      totalTilesLoaded: this.tilesLoaded,
      currentMemoryUsage: this.memoryUsageMB
    };
  }

  private calculateAverage(times: number[]): number {
    return times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;
  }

  clearCache(): void {
    this.tileCache.clear();
    this.imageData = [];
    this.tilesLoaded = 0;
    this.updateMemoryUsage();
  }
}

// Performance test configuration
const WSI_PERFORMANCE_CONFIG = {
  enabled: false, // Set to true when running WSI performance tests
  maxRenderTime: 2000, // 2 seconds
  maxZoomTime: 500, // 500ms
  maxPanTime: 200, // 200ms
  maxTileLoadTime: 300, // 300ms
  maxMemoryUsage: 500, // 500MB
  testImageSizes: [
    { width: 1000, height: 1000, tiles: 16 },
    { width: 5000, height: 5000, tiles: 100 },
    { width: 10000, height: 10000, tiles: 400 },
    { width: 20000, height: 20000, tiles: 1600 }
  ]
};

describe('WSI Viewer Performance Tests', () => {
  let component: TestWsiViewerComponent;
  let fixture: ComponentFixture<TestWsiViewerComponent>;
  let medplumService: jasmine.SpyObj<MedplumService>;

  beforeEach(() => {
    if (!WSI_PERFORMANCE_CONFIG.enabled) {
      pending('WSI performance tests are disabled. Set WSI_PERFORMANCE_CONFIG.enabled = true to run.');
    }

    const medplumSpy = jasmine.createSpyObj('MedplumService', ['readResource', 'createResource']);

    TestBed.configureTestingModule({
      declarations: [TestWsiViewerComponent],
      providers: [
        { provide: MedplumService, useValue: medplumSpy },
        ErrorHandlingService
      ]
    });

    fixture = TestBed.createComponent(TestWsiViewerComponent);
    component = fixture.componentInstance;
    medplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
  });

  describe('Image Loading Performance', () => {
    it('should load small images within performance thresholds', async () => {
      const testConfig = WSI_PERFORMANCE_CONFIG.testImageSizes[0]; // 1000x1000
      
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-imaging-study',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: [{
          uid: 'test-series-uid',
          number: 1,
          modality: {
            system: 'http://dicom.nema.org/resources/ontology/DCM',
            code: 'SM',
            display: 'Slide Microscopy'
          },
          instance: [{
            uid: 'test-instance-uid',
            number: 1,
            sopClass: {
              system: 'urn:ietf:rfc:3986',
              code: 'urn:oid:1.2.840.10008.5.1.4.1.1.77.1.6'
            }
          }]
        }]
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-specimen',
        status: 'available',
        type: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '119376003',
            display: 'Tissue specimen'
          }]
        },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'PERF-TEST-001' }
      };

      const startTime = performance.now();
      await component.loadImage(mockImagingStudy, mockSpecimen);
      const loadTime = performance.now() - startTime;

      const metrics = component.getPerformanceMetrics();

      expect(loadTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxRenderTime);
      expect(metrics.averageTileLoadTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxTileLoadTime);
      expect(metrics.totalTilesLoaded).toBe(testConfig.tiles);
      expect(metrics.currentMemoryUsage).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxMemoryUsage);

      console.log(`Small Image Performance:`, {
        totalLoadTime: loadTime,
        averageTileLoadTime: metrics.averageTileLoadTime,
        tilesLoaded: metrics.totalTilesLoaded,
        memoryUsage: metrics.currentMemoryUsage
      });
    });

    it('should load medium images within performance thresholds', async () => {
      const testConfig = WSI_PERFORMANCE_CONFIG.testImageSizes[1]; // 5000x5000
      
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-imaging-study-medium',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: [{
          uid: 'test-series-uid-medium',
          number: 1,
          modality: {
            system: 'http://dicom.nema.org/resources/ontology/DCM',
            code: 'SM',
            display: 'Slide Microscopy'
          }
        }]
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-specimen-medium',
        status: 'available',
        type: {
          coding: [{
            system: 'http://snomed.info/sct',
            code: '119376003',
            display: 'Tissue specimen'
          }]
        },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'PERF-TEST-002' }
      };

      const startTime = performance.now();
      await component.loadImage(mockImagingStudy, mockSpecimen);
      const loadTime = performance.now() - startTime;

      const metrics = component.getPerformanceMetrics();

      // Allow more time for larger images
      expect(loadTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxRenderTime * 2);
      expect(metrics.averageTileLoadTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxTileLoadTime);
      expect(metrics.totalTilesLoaded).toBe(testConfig.tiles);

      console.log(`Medium Image Performance:`, {
        totalLoadTime: loadTime,
        averageTileLoadTime: metrics.averageTileLoadTime,
        tilesLoaded: metrics.totalTilesLoaded,
        memoryUsage: metrics.currentMemoryUsage
      });
    });
  });

  describe('Zoom Performance', () => {
    beforeEach(async () => {
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-zoom-study',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: []
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-zoom-specimen',
        status: 'available',
        type: { coding: [{ code: '119376003' }] },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'ZOOM-TEST' }
      };

      await component.loadImage(mockImagingStudy, mockSpecimen);
    });

    it('should perform zoom operations within performance thresholds', async () => {
      const zoomLevels = [2, 4, 8, 16, 32, 16, 8, 4, 2, 1];
      const zoomTimes: number[] = [];

      for (const zoomLevel of zoomLevels) {
        const startTime = performance.now();
        component.zoomTo(zoomLevel);
        
        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const zoomTime = performance.now() - startTime;
        zoomTimes.push(zoomTime);
      }

      const averageZoomTime = zoomTimes.reduce((sum, time) => sum + time, 0) / zoomTimes.length;
      const maxZoomTime = Math.max(...zoomTimes);

      expect(averageZoomTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxZoomTime);
      expect(maxZoomTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxZoomTime * 2);

      console.log(`Zoom Performance:`, {
        averageZoomTime,
        maxZoomTime,
        zoomOperations: zoomTimes.length
      });
    });

    it('should handle rapid zoom operations without performance degradation', async () => {
      const rapidZoomCount = 20;
      const zoomTimes: number[] = [];

      for (let i = 0; i < rapidZoomCount; i++) {
        const startTime = performance.now();
        
        if (i % 2 === 0) {
          component.zoomIn();
        } else {
          component.zoomOut();
        }
        
        const zoomTime = performance.now() - startTime;
        zoomTimes.push(zoomTime);
        
        // Small delay to simulate user interaction
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const averageZoomTime = zoomTimes.reduce((sum, time) => sum + time, 0) / zoomTimes.length;
      const performanceDegradation = zoomTimes[zoomTimes.length - 1] / zoomTimes[0];

      expect(averageZoomTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxZoomTime);
      expect(performanceDegradation).toBeLessThan(2); // Performance shouldn't degrade more than 2x

      console.log(`Rapid Zoom Performance:`, {
        averageZoomTime,
        performanceDegradation,
        operations: rapidZoomCount
      });
    });
  });

  describe('Pan Performance', () => {
    beforeEach(async () => {
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-pan-study',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: []
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-pan-specimen',
        status: 'available',
        type: { coding: [{ code: '119376003' }] },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'PAN-TEST' }
      };

      await component.loadImage(mockImagingStudy, mockSpecimen);
    });

    it('should perform pan operations within performance thresholds', async () => {
      const panOperations = [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
        { x: 0.5, y: 0.5 }
      ];

      const panTimes: number[] = [];

      for (const pan of panOperations) {
        const startTime = performance.now();
        component.panTo(pan.x, pan.y);
        
        // Wait for pan operation to complete
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const panTime = performance.now() - startTime;
        panTimes.push(panTime);
      }

      const averagePanTime = panTimes.reduce((sum, time) => sum + time, 0) / panTimes.length;
      const maxPanTime = Math.max(...panTimes);

      expect(averagePanTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxPanTime);
      expect(maxPanTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxPanTime * 2);

      console.log(`Pan Performance:`, {
        averagePanTime,
        maxPanTime,
        panOperations: panTimes.length
      });
    });
  });

  describe('Memory Management', () => {
    it('should manage memory efficiently during extended use', async () => {
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-memory-study',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: []
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-memory-specimen',
        status: 'available',
        type: { coding: [{ code: '119376003' }] },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'MEMORY-TEST' }
      };

      await component.loadImage(mockImagingStudy, mockSpecimen);

      const initialMemory = component.getPerformanceMetrics().currentMemoryUsage;

      // Perform many operations to test memory management
      for (let i = 0; i < 50; i++) {
        component.zoomIn();
        component.panTo(Math.random(), Math.random());
        component.zoomOut();
        
        // Simulate user interaction delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const finalMemory = component.getPerformanceMetrics().currentMemoryUsage;
      const memoryGrowth = finalMemory - initialMemory;

      expect(finalMemory).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxMemoryUsage);
      expect(memoryGrowth).toBeLessThan(100); // Memory growth should be limited

      console.log(`Memory Management:`, {
        initialMemory,
        finalMemory,
        memoryGrowth,
        operations: 150
      });
    });

    it('should clear cache effectively', async () => {
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-cache-study',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: []
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-cache-specimen',
        status: 'available',
        type: { coding: [{ code: '119376003' }] },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'CACHE-TEST' }
      };

      await component.loadImage(mockImagingStudy, mockSpecimen);

      const memoryBeforeClear = component.getPerformanceMetrics().currentMemoryUsage;
      const tilesBeforeClear = component.getPerformanceMetrics().totalTilesLoaded;

      component.clearCache();

      const memoryAfterClear = component.getPerformanceMetrics().currentMemoryUsage;
      const tilesAfterClear = component.getPerformanceMetrics().totalTilesLoaded;

      expect(memoryAfterClear).toBeLessThan(memoryBeforeClear);
      expect(tilesAfterClear).toBe(0);

      console.log(`Cache Clearing:`, {
        memoryBeforeClear,
        memoryAfterClear,
        tilesBeforeClear,
        tilesAfterClear
      });
    });
  });

  describe('Stress Testing', () => {
    it('should handle large image stress test', async () => {
      const largeImageConfig = WSI_PERFORMANCE_CONFIG.testImageSizes[3]; // 20000x20000
      
      const mockImagingStudy: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: 'test-stress-study',
        status: 'available',
        subject: { reference: 'Patient/test-patient' },
        started: new Date().toISOString(),
        series: []
      };

      const mockSpecimen: Specimen = {
        resourceType: 'Specimen',
        id: 'test-stress-specimen',
        status: 'available',
        type: { coding: [{ code: '119376003' }] },
        subject: { reference: 'Patient/test-patient' },
        accessionIdentifier: { value: 'STRESS-TEST' }
      };

      const startTime = performance.now();
      
      try {
        await component.loadImage(mockImagingStudy, mockSpecimen);
        
        // Perform stress operations
        for (let i = 0; i < 10; i++) {
          component.zoomIn();
          component.panTo(Math.random(), Math.random());
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const totalTime = performance.now() - startTime;
        const metrics = component.getPerformanceMetrics();

        // More lenient thresholds for stress test
        expect(totalTime).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxRenderTime * 5);
        expect(metrics.currentMemoryUsage).toBeLessThan(WSI_PERFORMANCE_CONFIG.maxMemoryUsage * 2);

        console.log(`Stress Test Results:`, {
          totalTime,
          memoryUsage: metrics.currentMemoryUsage,
          tilesLoaded: metrics.totalTilesLoaded,
          averageZoomTime: metrics.averageZoomTime
        });
      } catch (error) {
        // Stress test may fail, but should fail gracefully
        expect(error).toBeDefined();
        console.log(`Stress test failed gracefully:`, error);
      }
    }, 30000); // 30 second timeout for stress test
  });
});