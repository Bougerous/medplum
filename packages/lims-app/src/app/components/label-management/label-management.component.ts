import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { ErrorHandlingService } from '../../services/error-handling.service';
import {
  LabelElement,
  LabelInventory, 
  LabelPrintingService,
  LabelTemplate,
  PrinterInfo,
  PrintJob
} from '../../services/label-printing.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-label-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="label-management-container">
      <!-- Header -->
      <div class="management-header">
        <h2>Label Management</h2>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="createNewTemplate()">
            <i class="icon-plus"></i> New Template
          </button>
          <button class="btn btn-secondary" (click)="viewPrintJobs()">
            <i class="icon-print"></i> Print Jobs
          </button>
          <button class="btn btn-info" (click)="viewInventory()">
            <i class="icon-inventory"></i> Inventory
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs-container">
        <ul class="nav nav-tabs">
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'templates'"
               (click)="setActiveTab('templates')">
              Templates
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'print-jobs'"
               (click)="setActiveTab('print-jobs')">
              Print Jobs
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'inventory'"
               (click)="setActiveTab('inventory')">
              Inventory
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" 
               [class.active]="activeTab === 'printers'"
               (click)="setActiveTab('printers')">
              Printers
            </a>
          </li>
        </ul>
      </div>

      <!-- Templates Tab -->
      <div class="tab-content" *ngIf="activeTab === 'templates'">
        <div class="templates-section">
          <div class="templates-grid">
            <div class="template-card" *ngFor="let template of templates$ | async">
              <div class="template-preview">
                <div class="preview-area" [style.width.px]="getPreviewWidth(template)" 
                     [style.height.px]="getPreviewHeight(template)">
                  <div class="preview-elements">
                    <div *ngFor="let element of template.elements" 
                         class="preview-element"
                         [style.left.px]="getElementX(element, template)"
                         [style.top.px]="getElementY(element, template)"
                         [style.width.px]="getElementWidth(element, template)"
                         [style.height.px]="getElementHeight(element, template)"
                         [attr.data-type]="element.type">
                      <span *ngIf="element.type === 'text'">{{ element.content || element.dataSource }}</span>
                      <div *ngIf="element.type === 'qrcode'" class="qr-placeholder">QR</div>
                      <div *ngIf="element.type === 'barcode'" class="barcode-placeholder">|||||||</div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="template-info">
                <h4>{{ template.name }}</h4>
                <p>{{ template.description }}</p>
                <div class="template-meta">
                  <span class="dimensions">{{ template.dimensions.width }}x{{ template.dimensions.height }}{{ template.dimensions.unit }}</span>
                  <span class="specimen-types">{{ template.specimenTypes.join(', ') }}</span>
                </div>
                <div class="template-actions">
                  <button class="btn btn-sm btn-outline-primary" (click)="editTemplate(template)">
                    Edit
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" (click)="duplicateTemplate(template)">
                    Duplicate
                  </button>
                  <button class="btn btn-sm btn-outline-success" (click)="testPrintTemplate(template)">
                    Test Print
                  </button>
                  <button class="btn btn-sm btn-outline-danger" (click)="deleteTemplate(template.id)">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Print Jobs Tab -->
      <div class="tab-content" *ngIf="activeTab === 'print-jobs'">
        <div class="print-jobs-section">
          <div class="jobs-table-container">
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Template</th>
                  <th>Labels</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let job of printJobs$ | async">
                  <td>{{ job.id }}</td>
                  <td>{{ getTemplateName(job.templateId) }}</td>
                  <td>{{ job.labelData.length }}</td>
                  <td>
                    <span class="status-badge" [attr.data-status]="job.status">
                      {{ job.status }}
                    </span>
                  </td>
                  <td>{{ job.createdAt | date:'short' }}</td>
                  <td>{{ job.completedAt | date:'short' }}</td>
                  <td>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-primary" 
                              (click)="reprintJob(job.id)"
                              [disabled]="job.status !== 'completed'">
                        Reprint
                      </button>
                      <button class="btn btn-outline-info" (click)="viewJobDetails(job)">
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Inventory Tab -->
      <div class="tab-content" *ngIf="activeTab === 'inventory'">
        <div class="inventory-section">
          <div class="inventory-cards">
            <div class="inventory-card" *ngFor="let item of inventoryItems$ | async">
              <div class="inventory-header">
                <h4>{{ getTemplateName(item.templateId) }}</h4>
                <span class="total-printed">{{ item.totalPrinted }} printed</span>
              </div>
              <div class="inventory-stats">
                <div class="stat">
                  <label>Last Print:</label>
                  <span>{{ item.lastPrintDate | date:'short' }}</span>
                </div>
                <div class="stat">
                  <label>Avg/Day:</label>
                  <span>{{ item.averagePerDay }}</span>
                </div>
                <div class="stat" *ngIf="item.estimatedRemaining">
                  <label>Remaining:</label>
                  <span [class.low-stock]="item.estimatedRemaining < item.lowStockThreshold">
                    {{ item.estimatedRemaining }}
                  </span>
                </div>
              </div>
              <div class="inventory-actions">
                <button class="btn btn-sm btn-outline-warning" 
                        *ngIf="isLowStock(item)"
                        (click)="reorderLabels(item.templateId)">
                  Reorder
                </button>
                <button class="btn btn-sm btn-outline-secondary" (click)="updateInventory(item)">
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Printers Tab -->
      <div class="tab-content" *ngIf="activeTab === 'printers'">
        <div class="printers-section">
          <div class="printers-grid">
            <div class="printer-card" *ngFor="let printer of printers$ | async">
              <div class="printer-header">
                <h4>{{ printer.name }}</h4>
                <span class="printer-status" [attr.data-status]="printer.status">
                  {{ printer.status }}
                </span>
              </div>
              <div class="printer-info">
                <div class="info-item">
                  <label>Type:</label>
                  <span>{{ printer.type }}</span>
                </div>
                <div class="info-item">
                  <label>Max Size:</label>
                  <span>{{ printer.capabilities.maxWidth }}x{{ printer.capabilities.maxHeight }}mm</span>
                </div>
                <div class="info-item">
                  <label>Color Support:</label>
                  <span>{{ printer.capabilities.colorSupport ? 'Yes' : 'No' }}</span>
                </div>
                <div class="info-item">
                  <label>Supported Sizes:</label>
                  <span>{{ printer.capabilities.supportedSizes.join(', ') }}</span>
                </div>
              </div>
              <div class="printer-actions">
                <button class="btn btn-sm btn-outline-primary" (click)="testPrinter(printer.id)">
                  Test Print
                </button>
                <button class="btn btn-sm btn-outline-secondary" (click)="configurePrinter(printer.id)">
                  Configure
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Template Editor Modal -->
    <div class="modal" [class.show]="showTemplateEditor" *ngIf="showTemplateEditor">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingTemplate ? 'Edit' : 'Create' }} Template</h5>
            <button type="button" class="btn-close" (click)="closeTemplateEditor()"></button>
          </div>
          <div class="modal-body">
            <form [formGroup]="templateForm" *ngIf="templateForm">
              <div class="row">
                <div class="col-md-4">
                  <!-- Template Properties -->
                  <div class="template-properties">
                    <h6>Template Properties</h6>
                    
                    <div class="mb-3">
                      <label class="form-label">Name</label>
                      <input type="text" class="form-control" formControlName="name" required>
                    </div>
                    
                    <div class="mb-3">
                      <label class="form-label">Description</label>
                      <textarea class="form-control" formControlName="description" rows="2"></textarea>
                    </div>
                    
                    <div class="mb-3">
                      <label class="form-label">Specimen Types</label>
                      <input type="text" class="form-control" formControlName="specimenTypes" 
                             placeholder="*, blood, tissue, etc.">
                    </div>
                    
                    <div class="row">
                      <div class="col-6">
                        <label class="form-label">Width</label>
                        <input type="number" class="form-control" formControlName="width" required>
                      </div>
                      <div class="col-6">
                        <label class="form-label">Height</label>
                        <input type="number" class="form-control" formControlName="height" required>
                      </div>
                    </div>
                    
                    <div class="mb-3">
                      <label class="form-label">Unit</label>
                      <select class="form-control" formControlName="unit">
                        <option value="mm">Millimeters</option>
                        <option value="in">Inches</option>
                      </select>
                    </div>
                  </div>

                  <!-- Element Properties -->
                  <div class="element-properties" *ngIf="selectedElement">
                    <h6>Element Properties</h6>
                    
                    <div class="mb-3">
                      <label class="form-label">Type</label>
                      <select class="form-control" [(ngModel)]="selectedElement.type" [ngModelOptions]="{standalone: true}">
                        <option value="text">Text</option>
                        <option value="qrcode">QR Code</option>
                        <option value="barcode">Barcode</option>
                        <option value="line">Line</option>
                        <option value="rectangle">Rectangle</option>
                      </select>
                    </div>
                    
                    <div class="row">
                      <div class="col-6">
                        <label class="form-label">X Position</label>
                        <input type="number" class="form-control" [(ngModel)]="selectedElement.position.x" [ngModelOptions]="{standalone: true}">
                      </div>
                      <div class="col-6">
                        <label class="form-label">Y Position</label>
                        <input type="number" class="form-control" [(ngModel)]="selectedElement.position.y" [ngModelOptions]="{standalone: true}">
                      </div>
                    </div>
                    
                    <div class="row">
                      <div class="col-6">
                        <label class="form-label">Width</label>
                        <input type="number" class="form-control" [(ngModel)]="selectedElement.size.width" [ngModelOptions]="{standalone: true}">
                      </div>
                      <div class="col-6">
                        <label class="form-label">Height</label>
                        <input type="number" class="form-control" [(ngModel)]="selectedElement.size.height" [ngModelOptions]="{standalone: true}">
                      </div>
                    </div>
                    
                    <div class="mb-3" *ngIf="selectedElement.type === 'text'">
                      <label class="form-label">Content</label>
                      <input type="text" class="form-control" [(ngModel)]="selectedElement.content" [ngModelOptions]="{standalone: true}">
                    </div>
                    
                    <div class="mb-3">
                      <label class="form-label">Data Source</label>
                      <select class="form-control" [(ngModel)]="selectedElement.dataSource" [ngModelOptions]="{standalone: true}">
                        <option value="">None</option>
                        <option value="accessionNumber">Accession Number</option>
                        <option value="patient.name.0.family">Patient Last Name</option>
                        <option value="patient.name.0.given.0">Patient First Name</option>
                        <option value="collectionDate">Collection Date</option>
                        <option value="specimen.type.text">Specimen Type</option>
                        <option value="qrCodeData">QR Code Data</option>
                      </select>
                    </div>
                    
                    <div class="element-actions">
                      <button type="button" class="btn btn-sm btn-outline-danger" (click)="deleteElement()">
                        Delete Element
                      </button>
                    </div>
                  </div>
                </div>
                
                <div class="col-md-8">
                  <!-- Template Designer -->
                  <div class="template-designer">
                    <h6>Template Designer</h6>
                    
                    <div class="designer-toolbar">
                      <button type="button" class="btn btn-sm btn-outline-primary" (click)="addElement('text')">
                        Add Text
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-primary" (click)="addElement('qrcode')">
                        Add QR Code
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-primary" (click)="addElement('barcode')">
                        Add Barcode
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-primary" (click)="addElement('line')">
                        Add Line
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-primary" (click)="addElement('rectangle')">
                        Add Rectangle
                      </button>
                    </div>
                    
                    <div class="design-canvas" 
                         [style.width.px]="getCanvasWidth()" 
                         [style.height.px]="getCanvasHeight()"
                         (click)="deselectElement()">
                      <div *ngFor="let element of currentElements; let i = index" 
                           class="design-element"
                           [class.selected]="selectedElement === element"
                           [style.left.px]="getDesignElementX(element)"
                           [style.top.px]="getDesignElementY(element)"
                           [style.width.px]="getDesignElementWidth(element)"
                           [style.height.px]="getDesignElementHeight(element)"
                           [attr.data-type]="element.type"
                           (click)="selectElement(element, $event)">
                        <span *ngIf="element.type === 'text'">{{ element.content || element.dataSource || 'Text' }}</span>
                        <div *ngIf="element.type === 'qrcode'" class="qr-placeholder">QR</div>
                        <div *ngIf="element.type === 'barcode'" class="barcode-placeholder">|||||||</div>
                        <div *ngIf="element.type === 'line'" class="line-placeholder"></div>
                        <div *ngIf="element.type === 'rectangle'" class="rectangle-placeholder"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeTemplateEditor()">
              Cancel
            </button>
            <button type="button" class="btn btn-primary" (click)="saveTemplate()" [disabled]="!templateForm?.valid">
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./label-management.component.scss']
})
export class LabelManagementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly fb = inject(FormBuilder);
  private readonly labelPrintingService = inject(LabelPrintingService);
  private readonly notificationService = inject(NotificationService);
  private readonly errorHandlingService = inject(ErrorHandlingService);

  // Observables
  templates$!: Observable<LabelTemplate[]>;
  printJobs$!: Observable<PrintJob[]>;
  printers$!: Observable<PrinterInfo[]>;
  inventoryItems$!: Observable<LabelInventory[]>;

  // UI State
  activeTab: 'templates' | 'print-jobs' | 'inventory' | 'printers' = 'templates';
  showTemplateEditor = false;
  editingTemplate: LabelTemplate | null = null;
  selectedElement: LabelElement | null = null;
  currentElements: LabelElement[] = [];

  // Forms
  templateForm: FormGroup | null = null;

  // Constants
  private readonly CANVAS_SCALE = 3; // Scale factor for design canvas

  ngOnInit(): void {
    this.templates$ = this.labelPrintingService.getTemplates();
    this.printJobs$ = this.labelPrintingService.getPrintJobs();
    this.printers$ = this.labelPrintingService.getPrinters();
    this.inventoryItems$ = this.labelPrintingService.getInventory().pipe(
      map(inventoryMap => Array.from(inventoryMap.values()))
    );
    this.setupPrintJobUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupPrintJobUpdates(): void {
    this.labelPrintingService.getPrintJobUpdates()
      .pipe(takeUntil(this.destroy$))
      .subscribe(job => {
        if (job.status === 'completed') {
          this.notificationService.showSuccess(
            'Print Job Completed',
            `Job ${job.id} completed successfully`
          );
        } else if (job.status === 'failed') {
          this.notificationService.showError(
            'Print Job Failed',
            `Job ${job.id} failed: ${job.error}`
          );
        }
      });
  }

  // Tab management
  setActiveTab(tab: 'templates' | 'print-jobs' | 'inventory' | 'printers'): void {
    this.activeTab = tab;
  }

  // Template management
  createNewTemplate(): void {
    this.editingTemplate = null;
    this.selectedElement = null;
    this.currentElements = [];
    this.initializeTemplateForm();
    this.showTemplateEditor = true;
  }

  editTemplate(template: LabelTemplate): void {
    this.editingTemplate = template;
    this.selectedElement = null;
    this.currentElements = [...template.elements];
    this.initializeTemplateForm(template);
    this.showTemplateEditor = true;
  }

  async duplicateTemplate(template: LabelTemplate): Promise<void> {
    try {
      const duplicated = {
        ...template,
        name: `${template.name} (Copy)`,
        id: undefined as any
      };
      duplicated.id = undefined;

      await this.labelPrintingService.createTemplate(duplicated);
      this.notificationService.showSuccess('Template Duplicated', 'Template has been duplicated successfully');
    } catch (error) {
      this.errorHandlingService.handleError(error, 'template-duplication');
    }
  }

  async deleteTemplate(templateId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this template?')) {
      try {
        await this.labelPrintingService.deleteTemplate(templateId);
        this.notificationService.showSuccess('Template Deleted', 'Template has been deleted successfully');
      } catch (error) {
        this.errorHandlingService.handleError(error, 'template-deletion');
      }
    }
  }

  async testPrintTemplate(template: LabelTemplate): Promise<void> {
    try {
      // Create mock label data for testing
      const mockLabelData = {
        specimen: { id: 'TEST-001', accessionIdentifier: { value: 'TEST-001' } } as any,
        patient: { name: [{ given: ['Test'], family: 'Patient' }] } as any,
        accessionNumber: 'TEST-001',
        qrCodeData: JSON.stringify({ test: true }),
        collectionDate: new Date(),
        additionalData: { specimenType: 'Test Sample' }
      };

      await this.labelPrintingService.printLabels(template.id, [mockLabelData]);
      this.notificationService.showSuccess('Test Print Started', 'Test print job has been queued');
    } catch (error) {
      this.errorHandlingService.handleError(error, 'test-print');
    }
  }

  // Template editor
  private initializeTemplateForm(template?: LabelTemplate): void {
    this.templateForm = this.fb.group({
      name: [template?.name || '', Validators.required],
      description: [template?.description || ''],
      specimenTypes: [template?.specimenTypes.join(', ') || '*'],
      width: [template?.dimensions.width || 50, [Validators.required, Validators.min(1)]],
      height: [template?.dimensions.height || 25, [Validators.required, Validators.min(1)]],
      unit: [template?.dimensions.unit || 'mm']
    });
  }

  async saveTemplate(): Promise<void> {
    if (!this.templateForm?.valid) {
      return;
    }

    const formValue = this.templateForm.value;
    const templateData = {
      name: formValue.name,
      description: formValue.description,
      specimenTypes: formValue.specimenTypes.split(',').map((s: string) => s.trim()),
      dimensions: {
        width: formValue.width,
        height: formValue.height,
        unit: formValue.unit
      },
      elements: this.currentElements,
      qrCodeConfig: {
        size: 100,
        errorCorrectionLevel: 'M' as const,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      },
      printSettings: {
        copies: 1,
        paperSize: 'Label',
        orientation: 'portrait' as const,
        margins: { top: 0, right: 0, bottom: 0, left: 0 }
      }
    };

    try {
      if (this.editingTemplate) {
        await this.labelPrintingService.updateTemplate(this.editingTemplate.id, templateData);
        this.notificationService.showSuccess('Template Updated', 'Template has been updated successfully');
      } else {
        await this.labelPrintingService.createTemplate(templateData);
        this.notificationService.showSuccess('Template Created', 'Template has been created successfully');
      }

      this.closeTemplateEditor();
    } catch (error) {
      this.errorHandlingService.handleError(error, 'template-save');
    }
  }

  closeTemplateEditor(): void {
    this.showTemplateEditor = false;
    this.editingTemplate = null;
    this.selectedElement = null;
    this.currentElements = [];
    this.templateForm = null;
  }

  // Element management
  addElement(type: LabelElement['type']): void {
    const newElement: LabelElement = {
      id: `element-${Date.now()}`,
      type,
      position: { x: 5, y: 5 },
      size: { width: 20, height: 5 },
      style: { fontSize: 10, fontFamily: 'Arial' }
    };

    if (type === 'text') {
      newElement.content = 'Sample Text';
    } else if (type === 'qrcode') {
      newElement.size = { width: 10, height: 10 };
      newElement.dataSource = 'qrCodeData';
    } else if (type === 'barcode') {
      newElement.size = { width: 25, height: 5 };
      newElement.dataSource = 'accessionNumber';
    }

    this.currentElements.push(newElement);
    this.selectedElement = newElement;
  }

  selectElement(element: LabelElement, event: Event): void {
    event.stopPropagation();
    this.selectedElement = element;
  }

  deselectElement(): void {
    this.selectedElement = null;
  }

  deleteElement(): void {
    if (this.selectedElement) {
      const index = this.currentElements.indexOf(this.selectedElement);
      if (index > -1) {
        this.currentElements.splice(index, 1);
        this.selectedElement = null;
      }
    }
  }

  // Print job management
  async reprintJob(jobId: string): Promise<void> {
    try {
      await this.labelPrintingService.reprintLabel(jobId);
      this.notificationService.showSuccess('Reprint Started', 'Reprint job has been queued');
    } catch (error) {
      this.errorHandlingService.handleError(error, 'reprint');
    }
  }

  viewJobDetails(job: PrintJob): void {
    // Implementation for viewing job details
    console.log('Job details:', job);
  }

  // Inventory management
  isLowStock(item: LabelInventory): boolean {
    return item.estimatedRemaining !== undefined &&
      item.estimatedRemaining < item.lowStockThreshold;
  }

  reorderLabels(_templateId: string): void {
    // Implementation for reordering labels
    this.notificationService.showInfo('Reorder', 'Reorder functionality would be implemented here');
  }

  updateInventory(item: LabelInventory): void {
    // Implementation for updating inventory
    console.log('Update inventory:', item);
  }

  // Printer management
  testPrinter(_printerId: string): void {
    // Implementation for testing printer
    this.notificationService.showInfo('Test Print', 'Test print sent to printer');
  }

  configurePrinter(printerId: string): void {
    // Implementation for configuring printer
    console.log('Configure printer:', printerId);
  }

  // Utility methods
  getTemplateName(templateId: string): string {
    // This would look up the template name by ID
    return `Template ${templateId}`;
  }

  // Preview calculations
  getPreviewWidth(template: LabelTemplate): number {
    return template.dimensions.width * 2; // Scale for preview
  }

  getPreviewHeight(template: LabelTemplate): number {
    return template.dimensions.height * 2; // Scale for preview
  }

  getElementX(element: LabelElement, _template: LabelTemplate): number {
    return element.position.x * 2; // Scale for preview
  }

  getElementY(element: LabelElement, _template: LabelTemplate): number {
    return element.position.y * 2; // Scale for preview
  }

  getElementWidth(element: LabelElement, _template: LabelTemplate): number {
    return element.size.width * 2; // Scale for preview
  }

  getElementHeight(element: LabelElement, _template: LabelTemplate): number {
    return element.size.height * 2; // Scale for preview
  }

  // Design canvas calculations
  getCanvasWidth(): number {
    if (!this.templateForm) { return 300; }
    return (this.templateForm.get('width')?.value || 50) * this.CANVAS_SCALE;
  }

  getCanvasHeight(): number {
    if (!this.templateForm) { return 150; }
    return (this.templateForm.get('height')?.value || 25) * this.CANVAS_SCALE;
  }

  getDesignElementX(element: LabelElement): number {
    return element.position.x * this.CANVAS_SCALE;
  }

  getDesignElementY(element: LabelElement): number {
    return element.position.y * this.CANVAS_SCALE;
  }

  getDesignElementWidth(element: LabelElement): number {
    return element.size.width * this.CANVAS_SCALE;
  }

  getDesignElementHeight(element: LabelElement): number {
    return element.size.height * this.CANVAS_SCALE;
  }

  // Methods referenced in template
  viewPrintJobs(): void {
    // Implementation for viewing print jobs
    console.log('Viewing print jobs');
  }

  viewInventory(): void {
    // Implementation for viewing inventory
    console.log('Viewing inventory');
  }
}
