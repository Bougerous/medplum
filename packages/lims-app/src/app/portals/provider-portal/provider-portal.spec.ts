import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ProviderPortalComponent } from './provider-portal';
import { AuthService } from '../../services/auth.service';
import { MedplumService } from '../../medplum.service';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService } from '../../services/notification.service';
import { AuditService } from '../../services/audit.service';
import { TestOrderingService } from '../../services/test-ordering.service';
import { 
  Patient, 
  DiagnosticReport, 
  ServiceRequest,
  Practitioner,
  Task,
  Bundle
} from '@medplum/fhirtypes';
import { UserProfile } from '../../types/fhir-types';

describe('ProviderPortalComponent', () => {
  let component: ProviderPortalComponent;
  let fixture: ComponentFixture<ProviderPortalComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockAuditService: jasmine.SpyObj<AuditService>;
  let mockTestOrderingService: jasmine.SpyObj<TestOrderingService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockUserProfile: UserProfile = {
    practitioner: {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['Dr. Jane'], family: 'Smith', prefix: ['Dr.'] }],
      telecom: [{ system: 'email', value: 'jane.smith@example.com' }]
    },
    roles: ['provider']
  };

  const mockPatient: Patient = {
    resourceType: 'Patient',
    id: 'patient-1',
    name: [{ given: ['John'], family: 'Doe' }],
    birthDate: '1990-01-01',
    gender: 'male'
  };

  const mockServiceRequest: ServiceRequest = {
    resourceType: 'ServiceRequest',
    id: 'order-1',
    status: 'active',
    intent: 'order',
    code: { text: 'Blood Test' },
    subject: { reference: 'Patient/patient-1', display: 'John Doe' },
    requester: { reference: 'Practitioner/practitioner-1' },
    authoredOn: '2024-01-15T10:00:00Z',
    priority: 'routine'
  };

  const mockDiagnosticReport: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    id: 'report-1',
    status: 'final',
    code: { text: 'Blood Test Results' },
    subject: { reference: 'Patient/patient-1', display: 'John Doe' },
    performer: [{ reference: 'Practitioner/practitioner-1' }],
    issued: '2024-01-16T14:30:00Z'
  };

  const mockTask: Task = {
    resourceType: 'Task',
    id: 'task-1',
    status: 'requested',
    intent: 'order',
    description: 'Review lab results',
    owner: { reference: 'Practitioner/practitioner-1' },
    authoredOn: '2024-01-16T09:00:00Z'
  };

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getCurrentUser',
      'getCurrentUserSync',
      'logout'
    ]);
    const medplumServiceSpy = jasmine.createSpyObj('MedplumService', [
      'searchResources',
      'createResource',
      'updateResource',
      'createSubscription'
    ]);
    const errorHandlingServiceSpy = jasmine.createSpyObj('ErrorHandlingService', [
      'handleError'
    ]);
    const notificationServiceSpy = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showInfo',
      'showError'
    ]);
    const auditServiceSpy = jasmine.createSpyObj('AuditService', [
      'logUnauthorizedAccess',
      'logPatientPortalAccess'
    ]);
    const testOrderingServiceSpy = jasmine.createSpyObj('TestOrderingService', [
      'createServiceRequest'
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [ProviderPortalComponent],
      imports: [FormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: MedplumService, useValue: medplumServiceSpy },
        { provide: ErrorHandlingService, useValue: errorHandlingServiceSpy },
        { provide: NotificationService, useValue: notificationServiceSpy },
        { provide: AuditService, useValue: auditServiceSpy },
        { provide: TestOrderingService, useValue: testOrderingServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderPortalComponent);
    component = fixture.componentInstance;
    
    mockAuthService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    mockMedplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
    mockErrorHandlingService = TestBed.inject(ErrorHandlingService) as jasmine.SpyObj<ErrorHandlingService>;
    mockNotificationService = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    mockAuditService = TestBed.inject(AuditService) as jasmine.SpyObj<AuditService>;
    mockTestOrderingService = TestBed.inject(TestOrderingService) as jasmine.SpyObj<TestOrderingService>;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should redirect to login if user is not authenticated', () => {
      mockAuthService.getCurrentUser.and.returnValue(of(null));

      component.ngOnInit();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should show error if user does not have provider role', async () => {
      const userWithoutProviderRole: UserProfile = {
        ...mockUserProfile,
        roles: ['patient']
      };
      mockAuthService.getCurrentUser.and.returnValue(of(userWithoutProviderRole));

      await component.ngOnInit();

      expect(component.error).toContain('Access denied');
      expect(mockAuditService.logUnauthorizedAccess).toHaveBeenCalled();
    });

    it('should load provider data for authenticated provider user', async () => {
      mockAuthService.getCurrentUser.and.returnValue(of(mockUserProfile));
      
      // Mock all search operations
      const patientBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        entry: [{ resource: mockPatient }]
      };
      const orderBundle: Bundle<ServiceRequest> = {
        resourceType: 'Bundle',
        entry: [{ resource: mockServiceRequest }]
      };
      const reportBundle: Bundle<DiagnosticReport> = {
        resourceType: 'Bundle',
        entry: [{ resource: mockDiagnosticReport }]
      };
      const taskBundle: Bundle<Task> = {
        resourceType: 'Bundle',
        entry: [{ resource: mockTask }]
      };

      mockMedplumService.searchResources.and.returnValues(
        Promise.resolve(patientBundle),
        Promise.resolve(orderBundle),
        Promise.resolve(reportBundle),
        Promise.resolve(taskBundle),
        Promise.resolve({ resourceType: 'Bundle', entry: [] }) // For statistics
      );

      await component.ngOnInit();

      expect(component.currentUser).toEqual(mockUserProfile);
      expect(component.providerData).toBeTruthy();
      expect(component.providerData?.provider).toEqual(mockUserProfile.practitioner);
      expect(component.loading).toBeFalse();
    });
  });

  describe('tab management', () => {
    beforeEach(() => {
      component.providerData = {
        provider: mockUserProfile.practitioner,
        patients: [mockPatient],
        pendingOrders: [mockServiceRequest],
        recentResults: [mockDiagnosticReport],
        notifications: [mockTask],
        orderStatistics: {
          totalOrders: 10,
          pendingOrders: 2,
          completedToday: 3,
          averageTurnaroundTime: 24
        }
      };
    });

    it('should set active tab', () => {
      component.setActiveTab('orders');
      
      expect(component.activeTab).toBe('orders');
      expect(mockAuditService.logPatientPortalAccess).toHaveBeenCalledWith(
        mockUserProfile.practitioner.id!,
        'tab-orders',
        'Provider accessed orders tab'
      );
    });

    it('should filter results correctly', () => {
      const todayReport: DiagnosticReport = {
        ...mockDiagnosticReport,
        id: 'today-report',
        issued: new Date().toISOString()
      };
      
      const oldReport: DiagnosticReport = {
        ...mockDiagnosticReport,
        id: 'old-report',
        issued: '2023-01-01T10:00:00Z'
      };

      component.providerData!.recentResults = [todayReport, oldReport];

      component.setResultsFilter('today');
      const todayResults = component.getFilteredResults();
      
      expect(todayResults.length).toBe(1);
      expect(todayResults[0].id).toBe('today-report');
    });
  });

  describe('order management', () => {
    beforeEach(() => {
      component.currentUser = mockUserProfile;
      component.providerData = {
        provider: mockUserProfile.practitioner,
        patients: [mockPatient],
        pendingOrders: [],
        recentResults: [],
        notifications: [],
        orderStatistics: {
          totalOrders: 0,
          pendingOrders: 0,
          completedToday: 0,
          averageTurnaroundTime: 0
        }
      };
      component.availableTests = [
        { code: 'CBC', display: 'Complete Blood Count', category: 'Hematology' }
      ];
    });

    it('should open order modal', () => {
      component.openOrderModal();
      
      expect(component.showOrderModal).toBeTrue();
      expect(component.orderForm.patientId).toBe('');
      expect(component.orderForm.testCodes).toEqual([]);
    });

    it('should close order modal', () => {
      component.showOrderModal = true;
      component.orderForm.patientId = 'test-patient';
      
      component.closeOrderModal();
      
      expect(component.showOrderModal).toBeFalse();
      expect(component.orderForm.patientId).toBe('');
    });

    it('should toggle test selection', () => {
      component.toggleTestSelection('CBC');
      expect(component.orderForm.testCodes).toContain('CBC');
      
      component.toggleTestSelection('CBC');
      expect(component.orderForm.testCodes).not.toContain('CBC');
    });

    it('should submit order successfully', async () => {
      component.orderForm = {
        patientId: 'patient-1',
        testCodes: ['CBC'],
        priority: 'routine',
        clinicalInfo: 'Routine checkup',
        specimenType: 'blood'
      };

      mockTestOrderingService.createServiceRequest.and.returnValue(
        Promise.resolve(mockServiceRequest)
      );
      mockMedplumService.searchResources.and.returnValue(
        Promise.resolve({ resourceType: 'Bundle', entry: [] })
      );

      await component.submitOrder();

      expect(mockTestOrderingService.createServiceRequest).toHaveBeenCalled();
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith('Order submitted successfully');
      expect(component.showOrderModal).toBeFalse();
    });

    it('should validate order form', () => {
      // Test empty form
      component.orderForm = component['getEmptyOrderForm']();
      spyOn(component as any, 'validateOrderForm').and.callThrough();
      
      const isValid = (component as any).validateOrderForm();
      expect(isValid).toBeFalse();
      expect(mockNotificationService.showError).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should format dates correctly', () => {
      const dateString = '2024-01-15T10:30:00Z';
      const formattedDate = component.formatDate(dateString);
      const formattedDateTime = component.formatDateTime(dateString);
      
      expect(formattedDate).toContain('1/15/2024');
      expect(formattedDateTime).toContain('1/15/2024');
    });

    it('should handle invalid dates', () => {
      expect(component.formatDate('invalid-date')).toBe('Invalid Date');
      expect(component.formatDateTime(undefined)).toBe('N/A');
    });

    it('should get provider display name', () => {
      component.providerData = {
        provider: mockUserProfile.practitioner,
        patients: [],
        pendingOrders: [],
        recentResults: [],
        notifications: [],
        orderStatistics: {
          totalOrders: 0,
          pendingOrders: 0,
          completedToday: 0,
          averageTurnaroundTime: 0
        }
      };

      const displayName = component.getProviderDisplayName();
      expect(displayName).toBe('Dr. Dr. Jane Smith');
    });

    it('should get patient display name', () => {
      const displayName = component.getPatientDisplayName(mockPatient);
      expect(displayName).toBe('John Doe');
    });

    it('should get status classes', () => {
      expect(component.getStatusClass('final')).toBe('status-final');
      expect(component.getStatusClass('preliminary')).toBe('status-preliminary');
      expect(component.getStatusClass('unknown')).toBe('status-default');
    });

    it('should get priority classes', () => {
      expect(component.getPriorityClass('stat')).toBe('priority-stat');
      expect(component.getPriorityClass('urgent')).toBe('priority-urgent');
      expect(component.getPriorityClass('routine')).toBe('priority-routine');
    });
  });

  describe('real-time updates', () => {
    it('should toggle real-time updates', () => {
      component.realTimeUpdatesEnabled = false;
      
      component.toggleRealTimeUpdates();
      
      expect(component.realTimeUpdatesEnabled).toBeTrue();
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith('Real-time updates enabled');
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      component.currentUser = mockUserProfile;
    });

    it('should view report', async () => {
      await component.viewReport(mockDiagnosticReport);
      
      expect(mockAuditService.logPatientPortalAccess).toHaveBeenCalledWith(
        mockUserProfile.practitioner.id!,
        'report-view',
        `Provider viewed diagnostic report ${mockDiagnosticReport.id}`
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/provider-portal/report', mockDiagnosticReport.id]);
    });

    it('should view order', async () => {
      await component.viewOrder(mockServiceRequest);
      
      expect(mockAuditService.logPatientPortalAccess).toHaveBeenCalledWith(
        mockUserProfile.practitioner.id!,
        'order-view',
        `Provider viewed service request ${mockServiceRequest.id}`
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/provider-portal/order', mockServiceRequest.id]);
    });

    it('should view patient', async () => {
      await component.viewPatient(mockPatient);
      
      expect(mockAuditService.logPatientPortalAccess).toHaveBeenCalledWith(
        mockUserProfile.practitioner.id!,
        'patient-view',
        `Provider viewed patient ${mockPatient.id}`
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/provider-portal/patient', mockPatient.id]);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', () => {
      const error = new Error('Test error');
      
      component['handleError']('Test message', error);
      
      expect(component.error).toBe('Test message');
      expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout and navigate to login', async () => {
      mockAuthService.logout.and.returnValue(Promise.resolve());
      
      await component.logout();
      
      expect(mockAuthService.logout).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});