import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ViewChild, TemplateRef } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  DiagnosticReport,
  Observation,
  Patient,
  Specimen,
  Practitioner
} from '@medplum/fhirtypes';
import { DiagnosticReportService } from '../../services/diagnostic-report.service';
import { ReportValidationService, ValidationWorkflow, ValidationStep, DigitalSignature } from '../../services/report-validation.service';
import { PdfGenerationService } from '../../services/pdf-generation.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { UserRole } from '../../types/fhir-types';

export interface ReportValidationView {
  report: DiagnosticReport;
  patient?: Patient;
  specimen?: Specimen;
  observations: Observation[];
  workflow?: ValidationWorkflow;
  validationResults?: any[];
  isEditable: boolean;
  canApprove: boolean;
  canReject: boolean;
}

export interface BatchValidationItem {
  reportId: string;
  report: DiagnosticReport;
  selected: boolean;
  status: 'pending' | 'processing' | 'completed' | 'error';
  validationResults?: any[];
}

@Component({
  selector: 'app-report-validation',
  templateUrl: './report-validation.component.html',
  styleUrls: ['./report-validation.component.scss']
})
export class ReportValidationComponent implements OnInit, OnDestroy {
  @Input() reportId?: string;
  @Input() mode: 'single' | 'batch' | 'queue' = 'queue';
  @Output() reportValidated = new EventEmitter<string>();
  @Output() reportRejected = new EventEmitter<string>();

  @ViewChild('signatureModal', { static: false }) signatureModal?: TemplateRef<any>;

  // Form and UI state
  validationForm: FormGroup;
  currentView: ReportValidationView | null = null;
  batchItems: BatchValidationItem[] = [];
  selectedReports: string[] = [];
  
  // Observable data
  pendingReports$: Observable<DiagnosticReport[]>;
  validationWorkflows$: Observable<ValidationWorkflow[]>;
  currentUser$: Observable<Practitioner | null>;
  
  // UI state
  isLoading = false;
  showBatchActions = false;
  showSignatureDialog = false;
  activeTab: 'validation' | 'history' | 'pdf' = 'validation';
  
  // Filters and search
  filterForm: FormGroup;
  searchTerm = '';
  statusFilter = 'all';
  priorityFilter = 'all';
  specialtyFilter = 'all';
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  
  private destroy$ = new Subject<void>();

  constructor(
    private formBuilder: FormBuilder,
    private diagnosticReportService: DiagnosticReportService,
    private validationService: ReportValidationService,
    private pdfService: PdfGenerationService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {
    this.validationForm = this.createValidationForm();
    this.filterForm = this.createFilterForm();
    
    this.pendingReports$ = this.validationService.getPendingReviews();
    this.validationWorkflows$ = this.validationService.getValidationWorkflows();
    this.currentUser$ = this.authService.getCurrentUser$();
  }

  ngOnInit(): void {
    this.initializeComponent();
    this.setupFormSubscriptions();
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    if (this.reportId && this.mode === 'single') {
      this.loadSingleReport(this.reportId);
    }
  }

  private setupFormSubscriptions(): void {
    // Search and filter subscriptions
    this.filterForm.get('searchTerm')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(term => {
        this.searchTerm = term;
        this.applyFilters();
      });

    this.filterForm.get('statusFilter')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.statusFilter = status;
        this.applyFilters();
      });

    this.filterForm.get('priorityFilter')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(priority => {
        this.priorityFilter = priority;
        this.applyFilters();
      });

    this.filterForm.get('specialtyFilter')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(specialty => {
        this.specialtyFilter = specialty;
        this.applyFilters();
      });
  }

  private async loadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      
      if (this.mode === 'batch') {
        await this.loadBatchReports();
      } else if (this.mode === 'queue') {
        await this.loadReportQueue();
      }
    } catch (error) {
      this.notificationService.showError('Failed to load reports');
      console.error('Failed to load initial data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Single Report Validation
  private async loadSingleReport(reportId: string): Promise<void> {
    try {
      this.isLoading = true;
      
      const report = await this.diagnosticReportService.getDiagnosticReport(reportId);
      const reportView = await this.createReportView(report);
      
      this.currentView = reportView;
      this.populateValidationForm(reportView);
    } catch (error) {
      this.notificationService.showError('Failed to load report');
      console.error('Failed to load single report:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async createReportView(report: DiagnosticReport): Promise<ReportValidationView> {
    try {
      // Get related resources
      const patientId = report.subject?.reference?.split('/')[1];
      const patient = patientId ? await this.medplumService.readResource<Patient>('Patient', patientId) : undefined;
      
      const specimenId = report.specimen?.[0]?.reference?.split('/')[1];
      const specimen = specimenId ? await this.medplumService.readResource<Specimen>('Specimen', specimenId) : undefined;
      
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

      // Get validation workflow
      const workflows = await this.validationWorkflows$.pipe(takeUntil(this.destroy$)).toPromise();
      const workflow = workflows?.find(w => w.reportId === report.id);

      // Determine user permissions
      const currentUser = await this.currentUser$.pipe(takeUntil(this.destroy$)).toPromise();
      const userRoles = await this.getUserRoles(currentUser);
      
      const isEditable = this.canEditReport(report, userRoles);
      const canApprove = this.canApproveReport(report, userRoles);
      const canReject = this.canRejectReport(report, userRoles);

      return {
        report,
        patient,
        specimen,
        observations,
        workflow,
        isEditable,
        canApprove,
        canReject
      };
    } catch (error) {
      console.error('Failed to create report view:', error);
      throw error;
    }
  }

  // Batch Validation
  private async loadBatchReports(): Promise<void> {
    try {
      const reports = await this.pendingReports$.pipe(takeUntil(this.destroy$)).toPromise();
      
      this.batchItems = (reports || []).map(report => ({
        reportId: report.id!,
        report,
        selected: false,
        status: 'pending'
      }));
      
      this.totalItems = this.batchItems.length;
    } catch (error) {
      console.error('Failed to load batch reports:', error);
      throw error;
    }
  }

  async processBatchValidation(): Promise<void> {
    const selectedItems = this.batchItems.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      this.notificationService.showWarning('Please select reports to validate');
      return;
    }

    try {
      this.isLoading = true;
      
      for (const item of selectedItems) {
        item.status = 'processing';
        
        try {
          // Execute automatic validation
          const validationResults = await this.validationService.executeAutomaticValidation(item.reportId);
          item.validationResults = validationResults;
          
          // Check if validation passed
          const hasErrors = validationResults.some(result => result.severity === 'error' && !result.passed);
          
          if (!hasErrors) {
            // Auto-approve if no errors
            await this.validationService.completeValidationStep(
              item.reportId,
              'auto-validation',
              'completed',
              'Automatic validation passed'
            );
            item.status = 'completed';
          } else {
            item.status = 'error';
          }
        } catch (error) {
          console.error(`Failed to validate report ${item.reportId}:`, error);
          item.status = 'error';
        }
      }
      
      this.notificationService.showSuccess(`Processed ${selectedItems.length} reports`);
    } catch (error) {
      this.notificationService.showError('Batch validation failed');
      console.error('Batch validation error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Report Queue Management
  private async loadReportQueue(): Promise<void> {
    try {
      const reports = await this.pendingReports$.pipe(takeUntil(this.destroy$)).toPromise();
      
      // Apply filters and pagination
      const filteredReports = this.applyReportFilters(reports || []);
      this.totalItems = filteredReports.length;
      
      const startIndex = (this.currentPage - 1) * this.pageSize;
      const endIndex = startIndex + this.pageSize;
      const paginatedReports = filteredReports.slice(startIndex, endIndex);
      
      this.batchItems = paginatedReports.map(report => ({
        reportId: report.id!,
        report,
        selected: false,
        status: 'pending'
      }));
    } catch (error) {
      console.error('Failed to load report queue:', error);
      throw error;
    }
  }

  private applyReportFilters(reports: DiagnosticReport[]): DiagnosticReport[] {
    return reports.filter(report => {
      // Search term filter
      if (this.searchTerm) {
        const searchLower = this.searchTerm.toLowerCase();
        const matchesSearch = 
          report.id?.toLowerCase().includes(searchLower) ||
          report.subject?.display?.toLowerCase().includes(searchLower) ||
          report.code?.text?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Status filter
      if (this.statusFilter !== 'all' && report.status !== this.statusFilter) {
        return false;
      }

      // Priority filter (would need to be stored in extensions)
      if (this.priorityFilter !== 'all') {
        const priority = this.getReportPriority(report);
        if (priority !== this.priorityFilter) return false;
      }

      // Specialty filter
      if (this.specialtyFilter !== 'all') {
        const specialty = this.getReportSpecialty(report);
        if (specialty !== this.specialtyFilter) return false;
      }

      return true;
    });
  }

  // Validation Actions
  async validateReport(reportId: string): Promise<void> {
    try {
      this.isLoading = true;
      
      // Execute automatic validation first
      const validationResults = await this.validationService.executeAutomaticValidation(reportId);
      
      // Check for errors
      const hasErrors = validationResults.some(result => result.severity === 'error' && !result.passed);
      
      if (hasErrors) {
        this.notificationService.showError('Validation failed. Please review errors.');
        return;
      }

      // Move to next validation step
      await this.validationService.completeValidationStep(
        reportId,
        'auto-validation',
        'completed',
        'Automatic validation completed successfully'
      );

      this.notificationService.showSuccess('Report validation completed');
      this.reportValidated.emit(reportId);
      
      // Refresh data
      await this.loadInitialData();
    } catch (error) {
      this.notificationService.showError('Validation failed');
      console.error('Validation error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async approveReport(reportId: string): Promise<void> {
    try {
      // Check if digital signature is required
      const requiresSignature = await this.requiresDigitalSignature(reportId);
      
      if (requiresSignature) {
        this.showSignatureDialog = true;
        return;
      }

      await this.completeApproval(reportId);
    } catch (error) {
      this.notificationService.showError('Failed to approve report');
      console.error('Approval error:', error);
    }
  }

  async rejectReport(reportId: string, reason: string): Promise<void> {
    try {
      this.isLoading = true;
      
      await this.validationService.completeValidationStep(
        reportId,
        'pathologist-review',
        'failed',
        reason
      );

      this.notificationService.showSuccess('Report rejected');
      this.reportRejected.emit(reportId);
      
      // Refresh data
      await this.loadInitialData();
    } catch (error) {
      this.notificationService.showError('Failed to reject report');
      console.error('Rejection error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Digital Signature
  async createDigitalSignature(method: 'password' | 'biometric' | 'token', credentials: any): Promise<void> {
    try {
      if (!this.currentView?.report.id) return;
      
      const signature = await this.validationService.createDigitalSignature(
        this.currentView.report.id,
        method,
        credentials
      );

      await this.completeApproval(this.currentView.report.id, signature);
      this.showSignatureDialog = false;
    } catch (error) {
      this.notificationService.showError('Digital signature failed');
      console.error('Digital signature error:', error);
    }
  }

  private async completeApproval(reportId: string, signature?: DigitalSignature): Promise<void> {
    try {
      this.isLoading = true;
      
      await this.validationService.completeValidationStep(
        reportId,
        'pathologist-review',
        'completed',
        'Report approved by pathologist',
        signature
      );

      // Generate PDF if not already generated
      await this.pdfService.generateReportPDF(reportId);

      this.notificationService.showSuccess('Report approved and finalized');
      this.reportValidated.emit(reportId);
      
      // Refresh data
      await this.loadInitialData();
    } catch (error) {
      this.notificationService.showError('Failed to complete approval');
      console.error('Approval completion error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Amendment and Correction
  async amendReport(reportId: string, amendments: any[]): Promise<void> {
    try {
      this.isLoading = true;
      
      // Create amended version
      const report = await this.diagnosticReportService.getDiagnosticReport(reportId);
      report.status = 'amended';
      
      // Add amendment notes
      if (!report.extension) report.extension = [];
      report.extension.push({
        url: 'http://lims.local/fhir/StructureDefinition/amendments',
        valueString: JSON.stringify(amendments)
      });

      await this.diagnosticReportService.updateDiagnosticReport(report);
      
      // Regenerate PDF
      await this.pdfService.regeneratePDF(reportId, 'Report amended');

      this.notificationService.showSuccess('Report amended successfully');
      
      // Refresh data
      await this.loadInitialData();
    } catch (error) {
      this.notificationService.showError('Failed to amend report');
      console.error('Amendment error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Quality Control
  async performQualityCheck(reportId: string): Promise<void> {
    try {
      this.isLoading = true;
      
      // Perform comprehensive quality checks
      const qualityResults = await this.executeQualityChecks(reportId);
      
      if (qualityResults.hasIssues) {
        this.notificationService.showWarning('Quality issues detected. Please review.');
      } else {
        this.notificationService.showSuccess('Quality check passed');
      }
    } catch (error) {
      this.notificationService.showError('Quality check failed');
      console.error('Quality check error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async executeQualityChecks(reportId: string): Promise<{ hasIssues: boolean; issues: string[] }> {
    // Implement quality check logic
    const issues: string[] = [];
    
    // Check for common issues
    const report = await this.diagnosticReportService.getDiagnosticReport(reportId);
    
    if (!report.conclusion || report.conclusion.trim().length === 0) {
      issues.push('Missing conclusion');
    }
    
    if (!report.result || report.result.length === 0) {
      issues.push('No observations linked');
    }
    
    if (!report.performer || report.performer.length === 0) {
      issues.push('No performer specified');
    }

    return {
      hasIssues: issues.length > 0,
      issues
    };
  }

  // Helper Methods
  private createValidationForm(): FormGroup {
    return this.formBuilder.group({
      validationNotes: [''],
      approvalStatus: ['', Validators.required],
      digitalSignature: this.formBuilder.group({
        method: ['password'],
        password: [''],
        reason: ['']
      }),
      amendments: this.formBuilder.array([])
    });
  }

  private createFilterForm(): FormGroup {
    return this.formBuilder.group({
      searchTerm: [''],
      statusFilter: ['all'],
      priorityFilter: ['all'],
      specialtyFilter: ['all']
    });
  }

  private populateValidationForm(reportView: ReportValidationView): void {
    this.validationForm.patchValue({
      approvalStatus: reportView.report.status
    });
  }

  private async getUserRoles(user: Practitioner | null): Promise<UserRole[]> {
    // Get user roles from auth service
    return ['pathologist']; // Simplified for now
  }

  private canEditReport(report: DiagnosticReport, userRoles: UserRole[]): boolean {
    return report.status === 'preliminary' && 
           (userRoles.includes('pathologist') || userRoles.includes('lab-manager'));
  }

  private canApproveReport(report: DiagnosticReport, userRoles: UserRole[]): boolean {
    return report.status === 'preliminary' && userRoles.includes('pathologist');
  }

  private canRejectReport(report: DiagnosticReport, userRoles: UserRole[]): boolean {
    return report.status === 'preliminary' && userRoles.includes('pathologist');
  }

  private async requiresDigitalSignature(reportId: string): Promise<boolean> {
    // Check if digital signature is required based on report type or policy
    return true; // Simplified - always require signature
  }

  private getReportPriority(report: DiagnosticReport): string {
    // Extract priority from extensions or other fields
    return 'routine'; // Simplified
  }

  private getReportSpecialty(report: DiagnosticReport): string {
    const category = report.category?.[0]?.coding?.[0]?.code;
    switch (category) {
      case 'PAT': return 'histopathology';
      case 'MB': return 'microbiology';
      default: return 'general';
    }
  }

  private applyFilters(): void {
    if (this.mode === 'queue') {
      this.loadReportQueue();
    }
  }

  // UI Event Handlers
  onTabChange(tab: 'validation' | 'history' | 'pdf'): void {
    this.activeTab = tab;
  }

  onSelectAll(selected: boolean): void {
    this.batchItems.forEach(item => item.selected = selected);
    this.showBatchActions = selected;
  }

  onItemSelect(item: BatchValidationItem, selected: boolean): void {
    item.selected = selected;
    this.showBatchActions = this.batchItems.some(item => item.selected);
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadReportQueue();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.loadReportQueue();
  }

  // Getters for template
  get amendmentsFormArray(): FormArray {
    return this.validationForm.get('amendments') as FormArray;
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  get hasSelectedItems(): boolean {
    return this.batchItems.some(item => item.selected);
  }

  get selectedItemsCount(): number {
    return this.batchItems.filter(item => item.selected).length;
  }
}