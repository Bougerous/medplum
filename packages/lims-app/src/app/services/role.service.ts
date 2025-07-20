import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DashboardWidget, UserRole } from '../types/fhir-types';
import { AuthService } from './auth.service';

export interface RolePermissions {
  canAccessPatientData: boolean;
  canAccessSpecimens: boolean;
  canAccessReports: boolean;
  canAccessBilling: boolean;
  canAccessAnalytics: boolean;
  canManageUsers: boolean;
  canManageSystem: boolean;
  canSignReports: boolean;
  canProcessSpecimens: boolean;
  canOrderTests: boolean;
}

export interface NavigationItem {
  id: string;
  label: string;
  route: string;
  icon: string;
  roles: UserRole[];
  children?: NavigationItem[];
}

@Injectable({
  providedIn: 'root'
})
export class RoleService {
  
  private readonly rolePermissions: Record<UserRole, RolePermissions> = {
    'admin': {
      canAccessPatientData: true,
      canAccessSpecimens: true,
      canAccessReports: true,
      canAccessBilling: true,
      canAccessAnalytics: true,
      canManageUsers: true,
      canManageSystem: true,
      canSignReports: true,
      canProcessSpecimens: true,
      canOrderTests: true
    },
    'lab-manager': {
      canAccessPatientData: true,
      canAccessSpecimens: true,
      canAccessReports: true,
      canAccessBilling: true,
      canAccessAnalytics: true,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: true,
      canProcessSpecimens: true,
      canOrderTests: true
    },
    'pathologist': {
      canAccessPatientData: true,
      canAccessSpecimens: true,
      canAccessReports: true,
      canAccessBilling: false,
      canAccessAnalytics: true,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: true,
      canProcessSpecimens: false,
      canOrderTests: false
    },
    'lab-technician': {
      canAccessPatientData: true,
      canAccessSpecimens: true,
      canAccessReports: false,
      canAccessBilling: false,
      canAccessAnalytics: false,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: false,
      canProcessSpecimens: true,
      canOrderTests: false
    },
    'billing-staff': {
      canAccessPatientData: true,
      canAccessSpecimens: false,
      canAccessReports: true,
      canAccessBilling: true,
      canAccessAnalytics: true,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: false,
      canProcessSpecimens: false,
      canOrderTests: false
    },
    'provider': {
      canAccessPatientData: true,
      canAccessSpecimens: false,
      canAccessReports: true,
      canAccessBilling: false,
      canAccessAnalytics: false,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: false,
      canProcessSpecimens: false,
      canOrderTests: true
    },
    'patient': {
      canAccessPatientData: true,
      canAccessSpecimens: false,
      canAccessReports: true,
      canAccessBilling: true,
      canAccessAnalytics: false,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: false,
      canProcessSpecimens: false,
      canOrderTests: false
    }
  };

  private readonly navigationItems: NavigationItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      route: '/dashboard',
      icon: 'dashboard',
      roles: ['admin', 'lab-manager', 'pathologist', 'lab-technician', 'billing-staff', 'provider', 'patient']
    },
    {
      id: 'patients',
      label: 'Patients',
      route: '/patients',
      icon: 'people',
      roles: ['admin', 'lab-manager', 'pathologist', 'lab-technician', 'billing-staff', 'provider'],
      children: [
        {
          id: 'patient-registration',
          label: 'Registration',
          route: '/patient-registration',
          icon: 'person_add',
          roles: ['admin', 'lab-manager', 'lab-technician']
        },
        {
          id: 'patient-search',
          label: 'Search',
          route: '/patients/search',
          icon: 'search',
          roles: ['admin', 'lab-manager', 'pathologist', 'lab-technician', 'billing-staff', 'provider']
        }
      ]
    },
    {
      id: 'specimens',
      label: 'Specimens',
      route: '/specimens',
      icon: 'science',
      roles: ['admin', 'lab-manager', 'pathologist', 'lab-technician'],
      children: [
        {
          id: 'specimen-accessioning',
          label: 'Accessioning',
          route: '/specimen-accessioning',
          icon: 'assignment',
          roles: ['admin', 'lab-manager', 'lab-technician']
        },
        {
          id: 'specimen-tracking',
          label: 'Tracking',
          route: '/sample-tracking',
          icon: 'track_changes',
          roles: ['admin', 'lab-manager', 'pathologist', 'lab-technician']
        }
      ]
    },
    {
      id: 'orders',
      label: 'Test Orders',
      route: '/orders',
      icon: 'assignment_add',
      roles: ['admin', 'lab-manager', 'provider'],
      children: [
        {
          id: 'test-ordering',
          label: 'Order Tests',
          route: '/test-ordering',
          icon: 'add_task',
          roles: ['admin', 'lab-manager', 'provider']
        },
        {
          id: 'order-management',
          label: 'Manage Orders',
          route: '/orders/manage',
          icon: 'list_alt',
          roles: ['admin', 'lab-manager']
        }
      ]
    },
    {
      id: 'results',
      label: 'Results',
      route: '/results',
      icon: 'assignment_turned_in',
      roles: ['admin', 'lab-manager', 'pathologist', 'provider', 'patient'],
      children: [
        {
          id: 'result-entry',
          label: 'Result Entry',
          route: '/result-entry',
          icon: 'edit',
          roles: ['admin', 'lab-manager', 'pathologist']
        },
        {
          id: 'reports',
          label: 'Reports',
          route: '/reports',
          icon: 'description',
          roles: ['admin', 'lab-manager', 'pathologist', 'provider', 'patient']
        }
      ]
    },
    {
      id: 'billing',
      label: 'Billing',
      route: '/billing',
      icon: 'payment',
      roles: ['admin', 'lab-manager', 'billing-staff', 'patient'],
      children: [
        {
          id: 'billing-dashboard',
          label: 'Billing Dashboard',
          route: '/billing/dashboard',
          icon: 'dashboard',
          roles: ['admin', 'lab-manager', 'billing-staff']
        },
        {
          id: 'claims',
          label: 'Claims',
          route: '/billing/claims',
          icon: 'receipt',
          roles: ['admin', 'lab-manager', 'billing-staff']
        },
        {
          id: 'payments',
          label: 'Payments',
          route: '/billing/payments',
          icon: 'credit_card',
          roles: ['admin', 'lab-manager', 'billing-staff', 'patient']
        }
      ]
    },
    {
      id: 'analytics',
      label: 'Analytics',
      route: '/analytics',
      icon: 'analytics',
      roles: ['admin', 'lab-manager', 'pathologist', 'billing-staff']
    },
    {
      id: 'admin',
      label: 'Administration',
      route: '/admin',
      icon: 'admin_panel_settings',
      roles: ['admin'],
      children: [
        {
          id: 'user-management',
          label: 'User Management',
          route: '/admin/users',
          icon: 'group',
          roles: ['admin']
        },
        {
          id: 'system-settings',
          label: 'System Settings',
          route: '/admin/settings',
          icon: 'settings',
          roles: ['admin']
        }
      ]
    }
  ];

  private readonly dashboardWidgets: DashboardWidget[] = [
    {
      id: 'specimen-queue',
      type: 'specimen-queue',
      title: 'Specimen Queue',
      config: { limit: 10 },
      roles: ['admin', 'lab-manager', 'lab-technician'],
      position: { x: 0, y: 0, width: 6, height: 4 }
    },
    {
      id: 'pending-reports',
      type: 'pending-reports',
      title: 'Pending Reports',
      config: { limit: 10 },
      roles: ['admin', 'lab-manager', 'pathologist'],
      position: { x: 6, y: 0, width: 6, height: 4 }
    },
    {
      id: 'billing-summary',
      type: 'billing-summary',
      title: 'Billing Summary',
      config: { period: 'month' },
      roles: ['admin', 'lab-manager', 'billing-staff'],
      position: { x: 0, y: 4, width: 4, height: 3 }
    },
    {
      id: 'turnaround-time',
      type: 'analytics',
      title: 'Turnaround Time',
      config: { metric: 'turnaround-time', period: 'week' },
      roles: ['admin', 'lab-manager', 'pathologist'],
      position: { x: 4, y: 4, width: 4, height: 3 }
    },
    {
      id: 'specimen-volume',
      type: 'analytics',
      title: 'Specimen Volume',
      config: { metric: 'specimen-volume', period: 'day' },
      roles: ['admin', 'lab-manager'],
      position: { x: 8, y: 4, width: 4, height: 3 }
    },
    {
      id: 'quality-metrics',
      type: 'analytics',
      title: 'Quality Metrics',
      config: { metric: 'quality', period: 'month' },
      roles: ['admin', 'lab-manager', 'pathologist'],
      position: { x: 0, y: 7, width: 6, height: 3 }
    },
    {
      id: 'revenue-analytics',
      type: 'analytics',
      title: 'Revenue Analytics',
      config: { metric: 'revenue', period: 'month' },
      roles: ['admin', 'lab-manager', 'billing-staff'],
      position: { x: 6, y: 7, width: 6, height: 3 }
    },
    {
      id: 'my-results',
      type: 'patient-results',
      title: 'My Results',
      config: { limit: 5 },
      roles: ['patient'],
      position: { x: 0, y: 0, width: 12, height: 6 }
    },
    {
      id: 'my-orders',
      type: 'provider-orders',
      title: 'My Orders',
      config: { limit: 10 },
      roles: ['provider'],
      position: { x: 0, y: 0, width: 12, height: 6 }
    }
  ];

  constructor(private authService: AuthService) {}

  /**
   * Get permissions for current user
   */
  getCurrentUserPermissions(): Observable<RolePermissions> {
    return this.authService.getCurrentUser().pipe(
      map(user => {
        if (!(user?.roles.length)) {
          return this.getDefaultPermissions();
        }
        
        return this.combineRolePermissions(user.roles);
      })
    );
  }

  /**
   * Get permissions for specific roles
   */
  getRolePermissions(roles: UserRole[]): RolePermissions {
    return this.combineRolePermissions(roles);
  }

  /**
   * Combine permissions from multiple roles
   */
  private combineRolePermissions(roles: UserRole[]): RolePermissions {
    const combined: RolePermissions = this.getDefaultPermissions();
    
    for (const role of roles) {
      const rolePerms = this.rolePermissions[role];
      if (rolePerms) {
        // Use OR logic - if any role has permission, user has permission
        Object.keys(combined).forEach(key => {
          const permKey = key as keyof RolePermissions;
          combined[permKey] = combined[permKey] || rolePerms[permKey];
        });
      }
    }
    
    return combined;
  }

  /**
   * Get default (no permissions) state
   */
  private getDefaultPermissions(): RolePermissions {
    return {
      canAccessPatientData: false,
      canAccessSpecimens: false,
      canAccessReports: false,
      canAccessBilling: false,
      canAccessAnalytics: false,
      canManageUsers: false,
      canManageSystem: false,
      canSignReports: false,
      canProcessSpecimens: false,
      canOrderTests: false
    };
  }

  /**
   * Get navigation items for current user
   */
  getNavigationForCurrentUser(): Observable<NavigationItem[]> {
    return this.authService.getCurrentUser().pipe(
      map(user => {
        if (!(user?.roles.length)) {
          return [];
        }
        
        return this.filterNavigationByRoles(this.navigationItems, user.roles);
      })
    );
  }

  /**
   * Filter navigation items by user roles
   */
  private filterNavigationByRoles(items: NavigationItem[], userRoles: UserRole[]): NavigationItem[] {
    return items.filter(item => {
      // Check if user has any of the required roles for this item
      const hasAccess = item.roles.some(role => userRoles.includes(role));
      
      if (hasAccess && item.children) {
        // Filter children recursively
        item.children = this.filterNavigationByRoles(item.children, userRoles);
      }
      
      return hasAccess;
    });
  }

  /**
   * Get dashboard widgets for current user
   */
  getDashboardWidgetsForCurrentUser(): Observable<DashboardWidget[]> {
    return this.authService.getCurrentUser().pipe(
      map(user => {
        if (!(user?.roles.length)) {
          return [];
        }
        
        return this.dashboardWidgets.filter(widget => 
          widget.roles.some(role => user.roles.includes(role))
        );
      })
    );
  }

  /**
   * Check if current user can access specific feature
   */
  canAccessFeature(feature: keyof RolePermissions): Observable<boolean> {
    return this.getCurrentUserPermissions().pipe(
      map(permissions => permissions[feature])
    );
  }

  /**
   * Get role display name
   */
  getRoleDisplayName(role: UserRole): string {
    const displayNames: Record<UserRole, string> = {
      'admin': 'Administrator',
      'lab-manager': 'Laboratory Manager',
      'pathologist': 'Pathologist',
      'lab-technician': 'Laboratory Technician',
      'billing-staff': 'Billing Staff',
      'provider': 'Healthcare Provider',
      'patient': 'Patient'
    };
    
    return displayNames[role] || role;
  }

  /**
   * Get role description
   */
  getRoleDescription(role: UserRole): string {
    const descriptions: Record<UserRole, string> = {
      'admin': 'Full system access and user management capabilities',
      'lab-manager': 'Laboratory operations management and oversight',
      'pathologist': 'Diagnostic interpretation and report signing',
      'lab-technician': 'Specimen processing and testing operations',
      'billing-staff': 'Revenue cycle management and claims processing',
      'provider': 'Test ordering and result viewing for patients',
      'patient': 'Personal health information and result access'
    };
    
    return descriptions[role] || 'Standard user access';
  }

  /**
   * Check if role hierarchy allows access
   */
  hasRoleHierarchyAccess(userRoles: UserRole[], requiredRole: UserRole): boolean {
    // Define role hierarchy (higher roles can access lower role functions)
    const hierarchy: Record<UserRole, number> = {
      'patient': 1,
      'provider': 2,
      'lab-technician': 3,
      'billing-staff': 3,
      'pathologist': 4,
      'lab-manager': 5,
      'admin': 6
    };
    
    const requiredLevel = hierarchy[requiredRole];
    const userMaxLevel = Math.max(...userRoles.map(role => hierarchy[role] || 0));
    
    return userMaxLevel >= requiredLevel;
  }
}