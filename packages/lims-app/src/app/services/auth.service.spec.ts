import { TestBed } from '@angular/core/testing';
import { AuthService, LoginCredentials, PermissionContext } from './auth.service';
import { MedplumService } from '../medplum.service';
import { ErrorHandlingService } from './error-handling.service';
import { Practitioner, AccessPolicy, ProjectMembership, AuditEvent } from '@medplum/fhirtypes';
import { UserProfile, UserRole, LIMSErrorType } from '../types/fhir-types';

describe('AuthService', () => {
  let service: AuthService;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;
  let mockErrorHandlingService: jasmine.SpyObj<ErrorHandlingService>;

  const mockPractitioner: Practitioner = {
    resourceType: 'Practitioner',
    id: 'test-practitioner',
    name: [{ given: ['John'], family: 'Doe' }],
    identifier: [{ value: 'test@example.com' }]
  };

  const mockAccessPolicy: AccessPolicy = {
    resourceType: 'AccessPolicy',
    id: 'test-policy',
    name: 'lab-technician-policy',
    resource: [
      {
        resourceType: 'Patient'
      },
      {
        resourceType: 'Specimen'
      }
    ]
  };

  const mockProjectMembership: ProjectMembership = {
    resourceType: 'ProjectMembership',
    id: 'test-membership',
    user: { reference: 'Practitioner/test-practitioner' },
    admin: false
  };

  beforeEach(() => {
    const medplumSpy = jasmine.createSpyObj('MedplumService', [
      'signIn', 'signOut', 'getCurrentUser', 'searchResources', 'createResource'
    ]);
    const errorSpy = jasmine.createSpyObj('ErrorHandlingService', ['handleError']);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: MedplumService, useValue: medplumSpy },
        { provide: ErrorHandlingService, useValue: errorSpy }
      ]
    });

    service = TestBed.inject(AuthService);
    mockMedplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
    mockErrorHandlingService = TestBed.inject(ErrorHandlingService) as jasmine.SpyObj<ErrorHandlingService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Authentication', () => {
    it('should login successfully with valid credentials', async () => {
      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'password123'
      };

      mockMedplumService.signIn.and.returnValue(Promise.resolve({ login: 'test@example.com' }));
      mockMedplumService.getCurrentUser.and.returnValue(mockPractitioner);
      mockMedplumService.searchResources.and.returnValue(Promise.resolve({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: mockProjectMembership }]
      }));
      mockMedplumService.createResource.and.returnValue(Promise.resolve({} as AuditEvent));

      const result = await service.login(credentials);

      expect(result).toBe(true);
      expect(mockMedplumService.signIn).toHaveBeenCalledWith(
        credentials.email,
        credentials.password,
        credentials.projectId
      );
    });

    it('should handle login failure', async () => {
      const credentials: LoginCredentials = {
        email: 'invalid@example.com',
        password: 'wrongpassword'
      };

      mockMedplumService.signIn.and.rejectWith(new Error('Authentication failed'));
      mockMedplumService.createResource.and.returnValue(Promise.resolve({} as AuditEvent));

      const result = await service.login(credentials);

      expect(result).toBe(false);
      expect(mockErrorHandlingService.handleError).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: LIMSErrorType.AUTHENTICATION_ERROR,
          message: 'Login failed'
        })
      );
    });

    it('should logout successfully', async () => {
      // Set up authenticated state
      service['currentUser$'].next({
        practitioner: mockPractitioner,
        roles: ['lab-technician'],
        accessPolicies: [mockAccessPolicy]
      } as UserProfile);
      service['isAuthenticated$'].next(true);

      mockMedplumService.signOut.and.returnValue(Promise.resolve());
      mockMedplumService.createResource.and.returnValue(Promise.resolve({} as AuditEvent));

      await service.logout();

      expect(mockMedplumService.signOut).toHaveBeenCalled();
      expect(service.getCurrentUserSync()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should handle logout errors gracefully', async () => {
      service['currentUser$'].next({
        practitioner: mockPractitioner,
        roles: ['lab-technician'],
        accessPolicies: [mockAccessPolicy]
      } as UserProfile);

      mockMedplumService.signOut.and.rejectWith(new Error('Network error'));
      mockMedplumService.createResource.and.returnValue(Promise.resolve({} as AuditEvent));

      await service.logout();

      expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('User Profile Management', () => {
    it('should load complete user profile', async () => {
      mockMedplumService.getCurrentUser.and.returnValue(mockPractitioner);
      mockMedplumService.searchResources.and.callFake((resourceType: string) => {
        if (resourceType === 'ProjectMembership') {
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [{ resource: mockProjectMembership }]
          });
        } else if (resourceType === 'AccessPolicy') {
          return Promise.resolve({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [{ resource: mockAccessPolicy }]
          });
        }
        return Promise.resolve({ resourceType: 'Bundle', type: 'searchset', entry: [] });
      });

      await service['loadUserProfile'](mockPractitioner);

      const currentUser = service.getCurrentUserSync();
      expect(currentUser).toBeTruthy();
      expect(currentUser?.practitioner).toEqual(mockPractitioner);
      expect(currentUser?.roles).toContain('lab-technician');
    });

    it('should determine user roles from access policies', () => {
      const policies: AccessPolicy[] = [
        { ...mockAccessPolicy, name: 'pathologist-policy' },
        { ...mockAccessPolicy, name: 'lab-manager-policy' },
        { ...mockAccessPolicy, name: 'billing-staff-policy' }
      ];

      const roles = service['determineUserRoles'](policies);

      expect(roles).toContain('pathologist');
      expect(roles).toContain('lab-manager');
      expect(roles).toContain('billing-staff');
    });

    it('should assign admin role from project membership', () => {
      const adminMembership: ProjectMembership = {
        ...mockProjectMembership,
        admin: true
      };

      const roles = service['determineUserRoles']([], adminMembership);

      expect(roles).toContain('admin');
    });

    it('should assign default role when no specific roles found', () => {
      const roles = service['determineUserRoles']([]);

      expect(roles).toContain('lab-technician');
    });
  });

  describe('Permission Management', () => {
    beforeEach(() => {
      service['permissions$'].next([mockAccessPolicy]);
    });

    it('should check permissions correctly', () => {
      const context: PermissionContext = {
        resourceType: 'Patient',
        action: 'read'
      };

      const hasPermission = service.hasPermission(context);

      expect(hasPermission).toBe(true);
    });

    it('should deny permission for unauthorized resource', () => {
      const context: PermissionContext = {
        resourceType: 'Organization',
        action: 'read'
      };

      const hasPermission = service.hasPermission(context);

      expect(hasPermission).toBe(false);
    });

    it('should check role-based permissions', () => {
      service['currentUser$'].next({
        practitioner: mockPractitioner,
        roles: ['lab-technician', 'pathologist'],
        accessPolicies: [mockAccessPolicy]
      } as UserProfile);

      expect(service.hasRole('lab-technician')).toBe(true);
      expect(service.hasRole('pathologist')).toBe(true);
      expect(service.hasRole('admin')).toBe(false);
      expect(service.hasRole(['lab-technician', 'admin'])).toBe(true);
    });

    it('should check resource access permissions', () => {
      const canAccess = service.canAccessResource('Patient', 'test-patient');
      expect(canAccess).toBe(true);
    });

    it('should check action permissions', () => {
      const canCreate = service.canPerformAction('Patient', 'create');
      const canRead = service.canPerformAction('Patient', 'read');
      const canUpdate = service.canPerformAction('Patient', 'update');
      const canDelete = service.canPerformAction('Patient', 'delete');

      expect(canCreate).toBe(true);
      expect(canRead).toBe(true);
      expect(canUpdate).toBe(true);
      expect(canDelete).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should refresh session timeout', () => {
      service['isAuthenticated$'].next(true);
      spyOn(service as any, 'startSessionTimeout');

      service.refreshSession();

      expect(service['startSessionTimeout']).toHaveBeenCalled();
    });

    it('should not refresh session when not authenticated', () => {
      service['isAuthenticated$'].next(false);
      spyOn(service as any, 'startSessionTimeout');

      service.refreshSession();

      expect(service['startSessionTimeout']).not.toHaveBeenCalled();
    });

    it('should handle session timeout', (done) => {
      service['isAuthenticated$'].next(true);
      spyOn(service, 'logout').and.returnValue(Promise.resolve());

      // Set a very short timeout for testing
      service['SESSION_TIMEOUT_MS'] = 10;
      service['startSessionTimeout']();

      setTimeout(() => {
        expect(service.logout).toHaveBeenCalled();
        done();
      }, 20);
    });
  });

  describe('Audit Events', () => {
    it('should create audit event for login attempt', async () => {
      mockMedplumService.createResource.and.returnValue(Promise.resolve({} as AuditEvent));

      await service['createAuditEvent']('login-attempt', 'test@example.com');

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'AuditEvent',
          action: 'login-attempt'
        })
      );
    });

    it('should create audit event with error details', async () => {
      mockMedplumService.createResource.and.returnValue(Promise.resolve({} as AuditEvent));
      const error = new Error('Test error');

      await service['createAuditEvent']('login-failure', 'test@example.com', error);

      expect(mockMedplumService.createResource).toHaveBeenCalledWith(
        jasmine.objectContaining({
          resourceType: 'AuditEvent',
          action: 'login-failure',
          outcome: '8',
          outcomeDesc: 'Test error'
        })
      );
    });

    it('should handle audit event creation failures gracefully', async () => {
      mockMedplumService.createResource.and.rejectWith(new Error('Audit failed'));
      spyOn(console, 'error');

      await service['createAuditEvent']('test-action', 'test-user');

      expect(console.error).toHaveBeenCalledWith('Failed to create audit event:', jasmine.any(Error));
    });
  });

  describe('Observable Streams', () => {
    it('should provide current user observable', (done) => {
      const userProfile: UserProfile = {
        practitioner: mockPractitioner,
        roles: ['lab-technician'],
        accessPolicies: [mockAccessPolicy]
      };

      service.getCurrentUser().subscribe(user => {
        if (user) {
          expect(user).toEqual(userProfile);
          done();
        }
      });

      service['currentUser$'].next(userProfile);
    });

    it('should provide authentication status observable', (done) => {
      service.getAuthenticationStatus().subscribe(isAuth => {
        if (isAuth) {
          expect(isAuth).toBe(true);
          done();
        }
      });

      service['isAuthenticated$'].next(true);
    });

    it('should provide permissions observable', (done) => {
      service.getPermissions().subscribe(permissions => {
        if (permissions.length > 0) {
          expect(permissions).toEqual([mockAccessPolicy]);
          done();
        }
      });

      service['permissions$'].next([mockAccessPolicy]);
    });
  });

  describe('Utility Methods', () => {
    it('should get user roles', () => {
      service['currentUser$'].next({
        practitioner: mockPractitioner,
        roles: ['lab-technician', 'pathologist'],
        accessPolicies: [mockAccessPolicy]
      } as UserProfile);

      const roles = service.getUserRoles();

      expect(roles).toEqual(['lab-technician', 'pathologist']);
    });

    it('should return empty roles when no user', () => {
      service['currentUser$'].next(null);

      const roles = service.getUserRoles();

      expect(roles).toEqual([]);
    });

    it('should check authentication status', () => {
      service['isAuthenticated$'].next(true);
      expect(service.isAuthenticated()).toBe(true);

      service['isAuthenticated$'].next(false);
      expect(service.isAuthenticated()).toBe(false);
    });
  });
});