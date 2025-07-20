import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Appointment,
  Bundle,
  Communication,
  DiagnosticReport,
  Patient,
} from '@medplum/fhirtypes';
import { of, } from 'rxjs';
import { MedplumService } from '../../medplum.service';
import { AuditService } from '../../services/audit.service';
import { AuthService } from '../../services/auth.service';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService } from '../../services/notification.service';
import { UserProfile } from '../../types/fhir-types';
import { PatientPortalComponent } from './patient-portal';

describe('PatientPortalComponent', () => {
  let component: PatientPortalComponent;
  let fixture: ComponentFixture<PatientPortalComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockAuditService: jasmine.SpyObj<AuditService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockUserProfile: UserProfile = {
    practitioner: {
      resourceType: 'Practitioner',
      id: 'practitioner-1',
      name: [{ given: ['John'], family: 'Doe' }],
      telecom: [{ system: 'email', value: 'john.doe@example.com' }],
    },
    roles: ['patient'],
  };

  const mockPatient: Patient = {
    resourceType: 'Patient',
    id: 'patient-1',
    name: [{ given: ['John'], family: 'Doe' }],
    birthDate: '1990-01-01',
    gender: 'male',
    telecom: [{ system: 'email', value: 'john.doe@example.com' }],
  };

  const mockDiagnosticReport: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    id: 'report-1',
    status: 'final',
    code: { text: 'Blood Test' },
    subject: { reference: 'Patient/patient-1' },
    issued: '2024-01-15T10:00:00Z',
  };

  const mockAppointment: Appointment = {
    resourceType: 'Appointment',
    id: 'appointment-1',
    status: 'booked',
    start: '2024-02-01T09:00:00Z',
    participant: [
      {
        actor: { display: 'Dr. Smith' },
        status: 'accepted',
      },
    ],
  };

  const mockCommunication: Communication = {
    resourceType: 'Communication',
    id: 'comm-1',
    status: 'completed',
    subject: { reference: 'Patient/patient-1' },
    topic: { text: 'Test Results Available' },
    payload: [{ contentString: 'Your test results are ready for review.' }],
    sent: '2024-01-16T14:30:00Z',
  };

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getCurrentUser',
      'getCurrentUserSync',
    ]);
    const medplumServiceSpy = jasmine.createSpyObj('MedplumService', [
      'searchResources',
      'createResource',
      'updateResource',
    ]);
    const errorHandlingServiceSpy = jasmine.createSpyObj(
      'ErrorHandlingService',
      ['handleError'],
    );
    const notificationServiceSpy = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showInfo',
      'showError',
    ]);
    const auditServiceSpy = jasmine.createSpyObj('AuditService', [
      'logUnauthorizedAccess',
      'logPatientPortalAccess',
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [PatientPortalComponent],
      imports: [FormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: MedplumService, useValue: medplumServiceSpy },
        { provide: ErrorHandlingService, useValue: errorHandlingServiceSpy },
        { provide: NotificationService, useValue: notificationServiceSpy },
        { provide: AuditService, useValue: auditServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientPortalComponent);
    component = fixture.componentInstance;

    mockAuthService = TestBed.inject(
      AuthService,
    ) as jasmine.SpyObj<AuthService>;
    mockMedplumService = TestBed.inject(
      MedplumService,
    ) as jasmine.SpyObj<MedplumService>;
    mockErrorHandlingService = TestBed.inject(
      ErrorHandlingService,
    ) as jasmine.SpyObj<ErrorHandlingService>;
    mockNotificationService = TestBed.inject(
      NotificationService,
    ) as jasmine.SpyObj<NotificationService>;
    mockAuditService = TestBed.inject(
      AuditService,
    ) as jasmine.SpyObj<AuditService>;
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

    it('should show error if user does not have patient role', async () => {
      const userWithoutPatientRole: UserProfile = {
        ...mockUserProfile,
        roles: ['lab-technician'],
      };
      mockAuthService.getCurrentUser.and.returnValue(
        of(userWithoutPatientRole),
      );

      await component.ngOnInit();

      expect(component.error).toContain('Access denied');
      expect(mockAuditService.logUnauthorizedAccess).toHaveBeenCalled();
    });

    it('should load patient data for authenticated patient user', async () => {
      mockAuthService.getCurrentUser.and.returnValue(of(mockUserProfile));

      // Mock patient search
      const patientBundle: Bundle<Patient> = {
        resourceType: 'Bundle',
        entry: [{ resource: mockPatient }],
      };
      mockMedplumService.searchResources.and.returnValues(
        Promise.resolve(patientBundle),
        Promise.resolve({
          resourceType: 'Bundle',
          entry: [{ resource: mockDiagnosticReport }],
        }),
        Promise.resolve({
          resourceType: 'Bundle',
          entry: [{ resource: mockAppointment }],
        }),
        Promise.resolve({
          resourceType: 'Bundle',
          entry: [{ resource: mockCommunication }],
        }),
      );

      await component.ngOnInit();

      expect(component.currentUser).toEqual(mockUserProfile);
      expect(component.patientData).toBeTruthy();
      expect(component.patientData?.patient).toEqual(mockPatient);
      expect(component.loading).toBeFalse();
    });
  });

  describe('tab management', () => {
    beforeEach(() => {
      component.patientData = {
        patient: mockPatient,
        diagnosticReports: [mockDiagnosticReport],
        upcomingAppointments: [mockAppointment],
        communications: [mockCommunication],
        hasNewResults: false,
        hasUnreadMessages: false,
      };
    });

    it('should set active tab', () => {
      component.setActiveTab('appointments');

      expect(component.activeTab).toBe('appointments');
      expect(mockAuditService.logPatientPortalAccess).toHaveBeenCalledWith(
        mockPatient.id!,
        'tab-appointments',
        'Patient accessed appointments tab',
      );
    });

    it('should filter results correctly', () => {
      const recentReport: DiagnosticReport = {
        ...mockDiagnosticReport,
        id: 'recent-report',
        issued: new Date().toISOString(),
      };

      const oldReport: DiagnosticReport = {
        ...mockDiagnosticReport,
        id: 'old-report',
        issued: '2023-01-01T10:00:00Z',
      };

      component.patientData!.diagnosticReports = [recentReport, oldReport];

      component.setResultsFilter('recent');
      const recentResults = component.getFilteredReports();

      expect(recentResults.length).toBe(1);
      expect(recentResults[0].id).toBe('recent-report');
    });
  });

  describe('message functionality', () => {
    beforeEach(() => {
      component.patientData = {
        patient: mockPatient,
        diagnosticReports: [],
        upcomingAppointments: [],
        communications: [],
        hasNewResults: false,
        hasUnreadMessages: false,
      };
    });

    it('should open compose modal', () => {
      component.composeMessage();

      expect(component.showComposeModal).toBeTrue();
      expect(component.newMessage.subject).toBe('');
      expect(component.newMessage.content).toBe('');
    });

    it('should close compose modal', () => {
      component.showComposeModal = true;
      component.newMessage = { subject: 'Test', content: 'Test message' };

      component.closeComposeModal();

      expect(component.showComposeModal).toBeFalse();
      expect(component.newMessage.subject).toBe('');
      expect(component.newMessage.content).toBe('');
    });

    it('should send message successfully', async () => {
      component.newMessage = {
        subject: 'Test Subject',
        content: 'Test Content',
      };
      mockMedplumService.createResource.and.returnValue(
        Promise.resolve(mockCommunication),
      );
      mockMedplumService.searchResources.and.returnValue(
        Promise.resolve({ resourceType: 'Bundle', entry: [] }),
      );

      await component.submitMessage();

      expect(mockMedplumService.createResource).toHaveBeenCalled();
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
        'Message sent successfully',
      );
      expect(component.showComposeModal).toBeFalse();
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

    it('should get patient display name', () => {
      component.patientData = {
        patient: mockPatient,
        diagnosticReports: [],
        upcomingAppointments: [],
        communications: [],
        hasNewResults: false,
        hasUnreadMessages: false,
      };

      const displayName = component.getPatientDisplayName();
      expect(displayName).toBe('John Doe');
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', () => {
      const error = new Error('Test error');

      component.handleError('Test message', error);

      expect(component.error).toBe('Test message');
      expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout and navigate to login', async () => {
      mockAuthService.logout = jasmine
        .createSpy()
        .and.returnValue(Promise.resolve());

      await component.logout();

      expect(mockAuthService.logout).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
