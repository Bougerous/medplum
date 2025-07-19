import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { 
  Patient, 
  DiagnosticReport, 
  ServiceRequest,
  Practitioner,
  Subscription,
  Task
} from '@medplum/fhirtypes';
import { AuthService } from '../../services/auth.service';
import { MedplumService } from '../../medplum.service';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService } from '../../services/notification.service';
import { AuditService } from '../../services/audit.service';
import { TestOrderingService } from '../../services/test-ordering.service';
import { UserProfile, LIMSErrorType } from '../../types/fhir-types';

interface ProviderPortalData {
  provider: Practitioner;
  patients: Patient[];
  pendingOrders: ServiceRequest[];
  recentResults: DiagnosticReport[];
  notifications: Task[];
  orderStatistics: OrderStatistics;
}

interface OrderStatistics {
  totalOrders: number;
  pendingOrders: number;
  completedToday: number;
  averageTurnaroundTime: number;
}

interface TestCatalogItem {
  code: string;
  display: string;
  category: string;
}

interface OrderFormData {
  patientId: string;
  testCodes: string[];
  priority: 'routine' | 'urgent' | 'stat';
  clinicalInfo: string;
  specimenType: string;
  collectionDate?: string;
  notes?: string;
}

@Component({
  selector: 'app-provider-portal',
  templateUrl: './provider-portal.html',
  styleUrls: ['./provider-portal.scss']
})
export class ProviderPortalComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];
  
  currentUser: UserProfile | null = null;
  providerData: ProviderPortalData | null = null;
  loading = true;
  error: string | null = null;
  
  // Tab management
  activeTab: 'dashboard' | 'orders' | 'results' | 'patients' | 'notifications' = 'dashboard';
  
  // Order management
  showOrderModal = false;
  orderForm: OrderFormData = this.getEmptyOrderForm();
  submittingOrder = false;
  availableTests: TestCatalogItem[] = [];
  
  // Results filtering
  resultsFilter: 'all' | 'today' | 'week' | 'pending' = 'all';
  
  // Real-time updates
  realTimeUpdatesEnabled = true;
  lastUpdateTime: Date = new Date();
  
  constructor(
    private authService: AuthService,
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private notificationService: NotificationService,
    private auditService: AuditService,
    private testOrderingService: TestOrderingService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // Check if user is authenticated and has provider role
      this.authService.getCurrentUser()
        .pipe(takeUntil(this.destroy$))
        .subscribe(async (user) => {
          if (!user) {
            this.router.navigate(['/login']);
            return;
          }
          
          if (!user.roles.includes('provider')) {
            this.error = 'Access denied. Provider portal is only available to healthcare providers.';
            await this.auditService.logUnauthorizedAccess(
              user.practitioner.id || 'unknown',
              'provider-portal',
              'Attempted to access provider portal without provider role'
            );
            return;
          }
          
          this.currentUser = user;
          await this.loadProviderData();
          
          if (this.realTimeUpdatesEnabled) {
            this.setupRealTimeUpdates();
          }
        });
    } catch (error) {
      this.handleError('Failed to initialize provider portal', error);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up subscriptions
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
  }

  /**
   * Load all provider data for the portal
   */
  private async loadProviderData(): Promise<void> {
    if (!this.currentUser?.practitioner.id) {
      return;
    }

    try {
      this.loading = true;
      this.error = null;

      const providerId = this.currentUser.practitioner.id;

      // Load all provider data in parallel
      const [patients, pendingOrders, recentResults, notifications, availableTests] = await Promise.all([
        this.loadProviderPatients(providerId),
        this.loadPendingOrders(providerId),
        this.loadRecentResults(providerId),
        this.loadNotifications(providerId),
        this.loadAvailableTests()
      ]);

      // Calculate order statistics
      const orderStatistics = await this.calculateOrderStatistics(providerId);

      this.providerData = {
        provider: this.currentUser.practitioner,
        patients,
        pendingOrders,
        recentResults,
        notifications,
        orderStatistics
      };

      this.availableTests = availableTests;
      this.lastUpdateTime = new Date();

      // Log successful access
      await this.auditService.logPatientPortalAccess(
        providerId,
        'portal-access',
        'Provider accessed portal successfully'
      );

    } catch (error) {
      this.handleError('Failed to load provider data', error);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Load patients associated with this provider
   */
  private async loadProviderPatients(providerId: string): Promise<Patient[]> {
    try {
      const bundle = await this.medplumService.searchResources<Patient>(
        'Patient',
        {
          'general-practitioner': `Practitioner/${providerId}`,
          '_sort': 'name',
          '_count': '100'
        }
      );

      return bundle.entry?.map(entry => entry.resource).filter((resource): resource is Patient => Boolean(resource)) || [];
    } catch (error) {
      console.error('Error loading provider patients:', error);
      return [];
    }
  }

  /**
   * Load pending orders for this provider
   */
  private async loadPendingOrders(providerId: string): Promise<ServiceRequest[]> {
    try {
      const bundle = await this.medplumService.searchResources<ServiceRequest>(
        'ServiceRequest',
        {
          'requester': `Practitioner/${providerId}`,
          'status': 'active,on-hold',
          '_sort': '-authored',
          '_count': '50'
        }
      );

      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error loading pending orders:', error);
      return [];
    }
  }

  /**
   * Load recent results for this provider's patients
   */
  private async loadRecentResults(providerId: string): Promise<DiagnosticReport[]> {
    try {
      const bundle = await this.medplumService.searchResources<DiagnosticReport>(
        'DiagnosticReport',
        {
          'performer': `Practitioner/${providerId}`,
          'status': 'final,amended,corrected',
          '_sort': '-issued',
          '_count': '50'
        }
      );

      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error loading recent results:', error);
      return [];
    }
  }

  /**
   * Load notifications/tasks for this provider
   */
  private async loadNotifications(providerId: string): Promise<Task[]> {
    try {
      const bundle = await this.medplumService.searchResources<Task>(
        'Task',
        {
          'owner': `Practitioner/${providerId}`,
          'status': 'requested,received,accepted,in-progress',
          '_sort': '-authored',
          '_count': '20'
        }
      );

      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error loading notifications:', error);
      return [];
    }
  }

  /**
   * Load available tests from the catalog
   */
  private async loadAvailableTests(): Promise<TestCatalogItem[]> {
    try {
      // This would typically load from a test catalog or ActivityDefinition resources
      // For now, return a mock list
      return [
        { code: 'CBC', display: 'Complete Blood Count', category: 'Hematology' },
        { code: 'CMP', display: 'Comprehensive Metabolic Panel', category: 'Chemistry' },
        { code: 'LIPID', display: 'Lipid Panel', category: 'Chemistry' },
        { code: 'TSH', display: 'Thyroid Stimulating Hormone', category: 'Endocrinology' },
        { code: 'HBA1C', display: 'Hemoglobin A1c', category: 'Chemistry' },
        { code: 'PSA', display: 'Prostate Specific Antigen', category: 'Tumor Markers' },
        { code: 'CULTURE', display: 'Bacterial Culture', category: 'Microbiology' },
        { code: 'BIOPSY', display: 'Tissue Biopsy', category: 'Histopathology' }
      ];
    } catch (error) {
      console.error('Error loading available tests:', error);
      return [];
    }
  }

  /**
   * Calculate order statistics for the provider
   */
  private async calculateOrderStatistics(providerId: string): Promise<OrderStatistics> {
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Get all orders for this provider
      const allOrdersBundle = await this.medplumService.searchResources<ServiceRequest>(
        'ServiceRequest',
        {
          'requester': `Practitioner/${providerId}`,
          '_count': '1000'
        }
      );

      const allOrders = allOrdersBundle.entry?.map(entry => entry.resource).filter((resource): resource is ServiceRequest => Boolean(resource)) || [];
      
      // Calculate statistics
      const totalOrders = allOrders.length;
      const pendingOrders = allOrders.filter(order => 
        order.status === 'active' || order.status === 'on-hold'
      ).length;
      
      const completedToday = allOrders.filter(order => {
        if (!order.meta?.lastUpdated) {
          return false;
        }
        const lastUpdated = new Date(order.meta.lastUpdated);
        return lastUpdated >= todayStart && order.status === 'completed';
      }).length;

      // Calculate average turnaround time (simplified)
      const completedOrders = allOrders.filter(order => order.status === 'completed');
      let totalTurnaroundTime = 0;
      let validTurnaroundCount = 0;

      for (const order of completedOrders) {
        if (order.authoredOn && order.meta?.lastUpdated) {
          const authored = new Date(order.authoredOn);
          const completed = new Date(order.meta.lastUpdated);
          const turnaroundHours = (completed.getTime() - authored.getTime()) / (1000 * 60 * 60);
          
          if (turnaroundHours > 0 && turnaroundHours < 720) { // Less than 30 days
            totalTurnaroundTime += turnaroundHours;
            validTurnaroundCount++;
          }
        }
      }

      const averageTurnaroundTime = validTurnaroundCount > 0 
        ? Math.round(totalTurnaroundTime / validTurnaroundCount) 
        : 0;

      return {
        totalOrders,
        pendingOrders,
        completedToday,
        averageTurnaroundTime
      };
    } catch (error) {
      console.error('Error calculating order statistics:', error);
      return {
        totalOrders: 0,
        pendingOrders: 0,
        completedToday: 0,
        averageTurnaroundTime: 0
      };
    }
  }

  /**
   * Setup real-time updates using Medplum subscriptions
   */
  private setupRealTimeUpdates(): void {
    if (!this.currentUser?.practitioner.id) {
      return;
    }

    try {
      const providerId = this.currentUser.practitioner.id;

      // Subscribe to ServiceRequest updates
      const orderSubscription = this.medplumService.createSubscription(
        `ServiceRequest?requester=Practitioner/${providerId}`,
        `${window.location.origin}/provider-portal/webhook`
      );

      // Subscribe to DiagnosticReport updates
      const resultSubscription = this.medplumService.createSubscription(
        `DiagnosticReport?performer=Practitioner/${providerId}`,
        `${window.location.origin}/provider-portal/webhook`
      );

      // In a real implementation, you would handle webhook notifications
      // For now, we'll poll for updates periodically
      const updateInterval = setInterval(async () => {
        if (this.realTimeUpdatesEnabled && this.providerData) {
          await this.refreshData();
        }
      }, 30000); // Update every 30 seconds

      // Store cleanup function
      this.subscriptions.push({
        unsubscribe: () => clearInterval(updateInterval)
      } as Subscription);

    } catch (error) {
      console.error('Failed to setup real-time updates:', error);
    }
  }

  /**
   * Set active tab
   */
  setActiveTab(tab: 'dashboard' | 'orders' | 'results' | 'patients' | 'notifications'): void {
    this.activeTab = tab;
    
    // Log tab access for analytics
    this.auditService.logPatientPortalAccess(
      this.currentUser?.practitioner.id || 'unknown',
      `tab-${tab}`,
      `Provider accessed ${tab} tab`
    );
  }

  /**
   * Open new order modal
   */
  openOrderModal(): void {
    this.orderForm = this.getEmptyOrderForm();
    this.showOrderModal = true;
  }

  /**
   * Close order modal
   */
  closeOrderModal(): void {
    this.showOrderModal = false;
    this.submittingOrder = false;
    this.orderForm = this.getEmptyOrderForm();
  }

  /**
   * Get empty order form
   */
  private getEmptyOrderForm(): OrderFormData {
    return {
      patientId: '',
      testCodes: [],
      priority: 'routine',
      clinicalInfo: '',
      specimenType: '',
      collectionDate: undefined,
      notes: undefined
    };
  }

  /**
   * Submit new order
   */
  async submitOrder(): Promise<void> {
    if (!this.validateOrderForm()) {
      return;
    }

    this.submittingOrder = true;

    try {
      const serviceRequest = await this.testOrderingService.createServiceRequest({
        patientId: this.orderForm.patientId,
        testCodes: this.orderForm.testCodes,
        priority: this.orderForm.priority,
        clinicalInfo: this.orderForm.clinicalInfo,
        specimenType: this.orderForm.specimenType,
        collectionDate: this.orderForm.collectionDate,
        notes: this.orderForm.notes,
        requesterId: this.currentUser?.practitioner.id || ''
      });

      this.notificationService.showSuccess('Order submitted successfully');
      this.closeOrderModal();
      
      // Refresh data to show new order
      await this.refreshData();

      // Log order creation
      await this.auditService.logPatientPortalAccess(
        this.currentUser?.practitioner.id || 'unknown',
        'order-created',
        `Provider created new order: ${serviceRequest.id}`
      );

    } catch (error) {
      this.handleError('Failed to submit order', error);
    } finally {
      this.submittingOrder = false;
    }
  }

  /**
   * Validate order form
   */
  private validateOrderForm(): boolean {
    if (!this.orderForm.patientId) {
      this.notificationService.showError('Please select a patient');
      return false;
    }

    if (this.orderForm.testCodes.length === 0) {
      this.notificationService.showError('Please select at least one test');
      return false;
    }

    if (!this.orderForm.specimenType) {
      this.notificationService.showError('Please specify specimen type');
      return false;
    }

    return true;
  }

  /**
   * Filter results based on selected filter
   */
  setResultsFilter(filter: 'all' | 'today' | 'week' | 'pending'): void {
    this.resultsFilter = filter;
  }

  /**
   * Get filtered results
   */
  getFilteredResults(): DiagnosticReport[] {
    if (!this.providerData?.recentResults) {
      return [];
    }

    const results = this.providerData.recentResults;
    const now = new Date();

    switch (this.resultsFilter) {
      case 'today': {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return results.filter(result => {
          const issuedDate = result.issued ? new Date(result.issued) : null;
          return issuedDate && issuedDate >= todayStart;
        });
      }
      
      case 'week': {
        const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        return results.filter(result => {
          const issuedDate = result.issued ? new Date(result.issued) : null;
          return issuedDate && issuedDate >= weekAgo;
        });
      }
      
      case 'pending':
        return results.filter(result => 
          result.status === 'registered' || 
          result.status === 'partial' ||
          result.status === 'preliminary'
        );
      
      default:
        return results;
    }
  }

  /**
   * View diagnostic report details
   */
  async viewReport(report: DiagnosticReport): Promise<void> {
    try {
      // Log report access
      await this.auditService.logPatientPortalAccess(
        this.currentUser?.practitioner.id || 'unknown',
        'report-view',
        `Provider viewed diagnostic report ${report.id}`
      );

      // Navigate to report detail view
      this.router.navigate(['/provider-portal/report', report.id]);
    } catch (error) {
      this.handleError('Failed to view report', error);
    }
  }

  /**
   * View order details
   */
  async viewOrder(order: ServiceRequest): Promise<void> {
    try {
      // Log order access
      await this.auditService.logPatientPortalAccess(
        this.currentUser?.practitioner.id || 'unknown',
        'order-view',
        `Provider viewed service request ${order.id}`
      );

      // Navigate to order detail view or open modal
      this.router.navigate(['/provider-portal/order', order.id]);
    } catch (error) {
      this.handleError('Failed to view order', error);
    }
  }

  /**
   * View patient details
   */
  async viewPatient(patient: Patient): Promise<void> {
    try {
      // Log patient access
      await this.auditService.logPatientPortalAccess(
        this.currentUser?.practitioner.id || 'unknown',
        'patient-view',
        `Provider viewed patient ${patient.id}`
      );

      // Navigate to patient detail view
      this.router.navigate(['/provider-portal/patient', patient.id]);
    } catch (error) {
      this.handleError('Failed to view patient', error);
    }
  }

  /**
   * Toggle real-time updates
   */
  toggleRealTimeUpdates(): void {
    this.realTimeUpdatesEnabled = !this.realTimeUpdatesEnabled;
    
    if (this.realTimeUpdatesEnabled) {
      this.setupRealTimeUpdates();
      this.notificationService.showSuccess('Real-time updates enabled');
    } else {
      for (const sub of this.subscriptions) {
        sub.unsubscribe();
      }
      this.subscriptions = [];
      this.notificationService.showInfo('Real-time updates disabled');
    }
  }

  /**
   * Refresh portal data
   */
  async refreshData(): Promise<void> {
    if (this.currentUser) {
      await this.loadProviderData();
    }
  }

  /**
   * Logout from provider portal
   */
  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      this.handleError('Failed to logout', error);
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(message: string, error: unknown): void {
    console.error(message, error);
    this.error = message;
    
    this.errorHandlingService.handleError({
      type: LIMSErrorType.FHIR_ERROR,
      message,
      details: error,
      timestamp: new Date(),
      userId: this.currentUser?.practitioner.id,
      resourceType: 'ProviderPortal'
    });
  }

  /**
   * Get provider display name
   */
  getProviderDisplayName(): string {
    if (!this.providerData?.provider.name || this.providerData.provider.name.length === 0) {
      return 'Provider';
    }

    const name = this.providerData.provider.name[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    const prefix = name.prefix?.join(' ') || '';
    
    return `${prefix} ${given} ${family}`.trim() || 'Provider';
  }

  /**
   * Get patient display name
   */
  getPatientDisplayName(patient: Patient): string {
    if (!patient.name || patient.name.length === 0) {
      return 'Unknown Patient';
    }

    const name = patient.name[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    
    return `${given} ${family}`.trim() || 'Unknown Patient';
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string | undefined): string {
    if (!dateString) {
      return 'N/A';
    }
    
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  }

  /**
   * Format datetime for display
   */
  formatDateTime(dateString: string | undefined): string {
    if (!dateString) {
      return 'N/A';
    }
    
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  }

  /**
   * Get status badge class
   */
  getStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'final':
      case 'completed':
        return 'status-final';
      case 'preliminary':
      case 'active':
        return 'status-preliminary';
      case 'amended':
      case 'corrected':
        return 'status-amended';
      case 'cancelled':
      case 'revoked':
        return 'status-cancelled';
      default:
        return 'status-default';
    }
  }

  /**
   * Get priority badge class
   */
  getPriorityClass(priority: string): string {
    switch (priority?.toLowerCase()) {
      case 'stat':
        return 'priority-stat';
      case 'urgent':
        return 'priority-urgent';
      default:
        return 'priority-routine';
    }
  }

  /**
   * Toggle test selection in order form
   */
  toggleTestSelection(testCode: string): void {
    const index = this.orderForm.testCodes.indexOf(testCode);
    if (index > -1) {
      this.orderForm.testCodes.splice(index, 1);
    } else {
      this.orderForm.testCodes.push(testCode);
    }
  }
}