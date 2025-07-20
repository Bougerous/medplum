import { Injectable } from '@angular/core';
import { MedplumService } from '../medplum.service';
import { DashboardWidget, UserRole } from '../types/fhir-types';
import { Basic } from '@medplum/fhirtypes';

export interface DashboardConfiguration {
  id: string;
  name: string;
  roles: UserRole[];
  widgets: DashboardWidget[];
  layout: DashboardLayout;
  allowCustomization: boolean;
  refreshInterval: number;
  theme: string;
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  margin: number;
  containerPadding: number;
  compactType: 'vertical' | 'horizontal' | null;
  preventCollision: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardConfigurationService {

  private readonly defaultConfigurations: Record<UserRole, DashboardConfiguration> = {
    'admin': {
      id: 'admin-dashboard',
      name: 'Administrator Dashboard',
      roles: ['admin'],
      widgets: [
        {
          id: 'system-overview',
          type: 'system-overview',
          title: 'System Overview',
          config: { showAllMetrics: true },
          roles: ['admin'],
          position: { x: 0, y: 0, width: 12, height: 3 }
        },
        {
          id: 'user-activity',
          type: 'user-activity',
          title: 'User Activity',
          config: { limit: 20 },
          roles: ['admin'],
          position: { x: 0, y: 3, width: 6, height: 4 }
        },
        {
          id: 'system-alerts',
          type: 'system-alerts',
          title: 'System Alerts',
          config: { severity: 'all' },
          roles: ['admin'],
          position: { x: 6, y: 3, width: 6, height: 4 }
        },
        {
          id: 'analytics-summary',
          type: 'analytics',
          title: 'Analytics Summary',
          config: { metric: 'all', period: 'month' },
          roles: ['admin'],
          position: { x: 0, y: 7, width: 12, height: 4 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: true,
      refreshInterval: 30000,
      theme: 'admin'
    },
    'lab-manager': {
      id: 'lab-manager-dashboard',
      name: 'Laboratory Manager Dashboard',
      roles: ['lab-manager'],
      widgets: [
        {
          id: 'lab-overview',
          type: 'lab-overview',
          title: 'Laboratory Overview',
          config: { showKPIs: true },
          roles: ['lab-manager'],
          position: { x: 0, y: 0, width: 12, height: 3 }
        },
        {
          id: 'specimen-queue',
          type: 'specimen-queue',
          title: 'Specimen Queue',
          config: { limit: 15, showPriority: true },
          roles: ['lab-manager'],
          position: { x: 0, y: 3, width: 6, height: 4 }
        },
        {
          id: 'pending-reports',
          type: 'pending-reports',
          title: 'Pending Reports',
          config: { limit: 15, showOverdue: true },
          roles: ['lab-manager'],
          position: { x: 6, y: 3, width: 6, height: 4 }
        },
        {
          id: 'turnaround-time',
          type: 'analytics',
          title: 'Turnaround Time',
          config: { metric: 'turnaround-time', period: 'week' },
          roles: ['lab-manager'],
          position: { x: 0, y: 7, width: 4, height: 3 }
        },
        {
          id: 'quality-metrics',
          type: 'analytics',
          title: 'Quality Metrics',
          config: { metric: 'quality', period: 'month' },
          roles: ['lab-manager'],
          position: { x: 4, y: 7, width: 4, height: 3 }
        },
        {
          id: 'staff-productivity',
          type: 'analytics',
          title: 'Staff Productivity',
          config: { metric: 'productivity', period: 'week' },
          roles: ['lab-manager'],
          position: { x: 8, y: 7, width: 4, height: 3 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: true,
      refreshInterval: 15000,
      theme: 'manager'
    },
    'pathologist': {
      id: 'pathologist-dashboard',
      name: 'Pathologist Dashboard',
      roles: ['pathologist'],
      widgets: [
        {
          id: 'pending-reports',
          type: 'pending-reports',
          title: 'Pending Reports',
          config: { limit: 20, assignedToMe: true },
          roles: ['pathologist'],
          position: { x: 0, y: 0, width: 8, height: 5 }
        },
        {
          id: 'urgent-cases',
          type: 'urgent-cases',
          title: 'Urgent Cases',
          config: { priority: 'stat' },
          roles: ['pathologist'],
          position: { x: 8, y: 0, width: 4, height: 5 }
        },
        {
          id: 'wsi-queue',
          type: 'wsi-queue',
          title: 'WSI Review Queue',
          config: { limit: 10 },
          roles: ['pathologist'],
          position: { x: 0, y: 5, width: 6, height: 4 }
        },
        {
          id: 'case-analytics',
          type: 'analytics',
          title: 'Case Analytics',
          config: { metric: 'cases', period: 'month' },
          roles: ['pathologist'],
          position: { x: 6, y: 5, width: 6, height: 4 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: true,
      refreshInterval: 10000,
      theme: 'pathologist'
    },
    'lab-technician': {
      id: 'lab-technician-dashboard',
      name: 'Laboratory Technician Dashboard',
      roles: ['lab-technician'],
      widgets: [
        {
          id: 'my-workqueue',
          type: 'specimen-queue',
          title: 'My Work Queue',
          config: { limit: 15, assignedToMe: true },
          roles: ['lab-technician'],
          position: { x: 0, y: 0, width: 8, height: 5 }
        },
        {
          id: 'urgent-specimens',
          type: 'urgent-specimens',
          title: 'Urgent Specimens',
          config: { priority: 'stat' },
          roles: ['lab-technician'],
          position: { x: 8, y: 0, width: 4, height: 5 }
        },
        {
          id: 'qc-reminders',
          type: 'qc-reminders',
          title: 'QC Reminders',
          config: { showOverdue: true },
          roles: ['lab-technician'],
          position: { x: 0, y: 5, width: 6, height: 3 }
        },
        {
          id: 'equipment-status',
          type: 'equipment-status',
          title: 'Equipment Status',
          config: { showAlerts: true },
          roles: ['lab-technician'],
          position: { x: 6, y: 5, width: 6, height: 3 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: false,
      refreshInterval: 5000,
      theme: 'technician'
    },
    'billing-staff': {
      id: 'billing-dashboard',
      name: 'Billing Staff Dashboard',
      roles: ['billing-staff'],
      widgets: [
        {
          id: 'billing-summary',
          type: 'billing-summary',
          title: 'Billing Summary',
          config: { period: 'month', showTrends: true },
          roles: ['billing-staff'],
          position: { x: 0, y: 0, width: 6, height: 4 }
        },
        {
          id: 'pending-claims',
          type: 'pending-claims',
          title: 'Pending Claims',
          config: { limit: 20, showOverdue: true },
          roles: ['billing-staff'],
          position: { x: 6, y: 0, width: 6, height: 4 }
        },
        {
          id: 'payment-reconciliation',
          type: 'payment-reconciliation',
          title: 'Payment Reconciliation',
          config: { limit: 15 },
          roles: ['billing-staff'],
          position: { x: 0, y: 4, width: 8, height: 4 }
        },
        {
          id: 'revenue-analytics',
          type: 'analytics',
          title: 'Revenue Analytics',
          config: { metric: 'revenue', period: 'month' },
          roles: ['billing-staff'],
          position: { x: 8, y: 4, width: 4, height: 4 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: true,
      refreshInterval: 30000,
      theme: 'billing'
    },
    'provider': {
      id: 'provider-dashboard',
      name: 'Healthcare Provider Dashboard',
      roles: ['provider'],
      widgets: [
        {
          id: 'my-orders',
          type: 'provider-orders',
          title: 'My Orders',
          config: { limit: 15, showStatus: true },
          roles: ['provider'],
          position: { x: 0, y: 0, width: 8, height: 5 }
        },
        {
          id: 'critical-results',
          type: 'critical-results',
          title: 'Critical Results',
          config: { requiresNotification: true },
          roles: ['provider'],
          position: { x: 8, y: 0, width: 4, height: 5 }
        },
        {
          id: 'patient-results',
          type: 'patient-results',
          title: 'Recent Results',
          config: { limit: 10, myPatientsOnly: true },
          roles: ['provider'],
          position: { x: 0, y: 5, width: 12, height: 4 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: false,
      refreshInterval: 15000,
      theme: 'provider'
    },
    'patient': {
      id: 'patient-dashboard',
      name: 'Patient Dashboard',
      roles: ['patient'],
      widgets: [
        {
          id: 'my-results',
          type: 'patient-results',
          title: 'My Test Results',
          config: { limit: 10, showTrends: true },
          roles: ['patient'],
          position: { x: 0, y: 0, width: 8, height: 6 }
        },
        {
          id: 'upcoming-appointments',
          type: 'appointments',
          title: 'Upcoming Appointments',
          config: { limit: 5 },
          roles: ['patient'],
          position: { x: 8, y: 0, width: 4, height: 6 }
        },
        {
          id: 'billing-summary',
          type: 'patient-billing',
          title: 'Billing Summary',
          config: { showOutstanding: true },
          roles: ['patient'],
          position: { x: 0, y: 6, width: 12, height: 3 }
        }
      ],
      layout: {
        columns: 12,
        rowHeight: 60,
        margin: 10,
        containerPadding: 10,
        compactType: 'vertical',
        preventCollision: false
      },
      allowCustomization: false,
      refreshInterval: 60000,
      theme: 'patient'
    }
  };

  constructor(private medplumService: MedplumService) { }

  /**
   * Get dashboard configuration for specific roles
   */
  async getConfigurationForRoles(roles: UserRole[]): Promise<DashboardConfiguration> {
    try {
      // Try to load custom configuration from FHIR resources first
      const customConfig = await this.loadCustomConfiguration(roles);
      if (customConfig) {
        return customConfig;
      }
    } catch (error) {
      console.warn('Failed to load custom dashboard configuration:', error);
    }

    // Fall back to default configuration
    return this.getDefaultConfigurationForRoles(roles);
  }

  /**
   * Get default dashboard configuration for roles
   */
  async getDefaultConfigurationForRoles(roles: UserRole[]): Promise<DashboardConfiguration> {
    // Use the highest priority role for configuration
    const priorityOrder: UserRole[] = ['admin', 'lab-manager', 'pathologist', 'billing-staff', 'lab-technician', 'provider', 'patient'];

    for (const role of priorityOrder) {
      if (roles.includes(role)) {
        return this.defaultConfigurations[role];
      }
    }

    // Default fallback
    return this.defaultConfigurations['lab-technician'];
  }

  /**
   * Save custom dashboard configuration
   */
  async saveConfiguration(userId: string, config: DashboardConfiguration): Promise<void> {
    try {
      // Save as a custom FHIR resource or extension
      const configResource: Basic = {
        resourceType: 'Basic',
        id: `dashboard-config-${userId}`,
        code: {
          coding: [{
            system: 'http://lims.local/dashboard',
            code: 'dashboard-configuration'
          }]
        },
        subject: {
          reference: `Practitioner/${userId}`
        },
        extension: [{
          url: 'http://lims.local/dashboard/configuration',
          valueString: JSON.stringify(config)
        }]
      };

      await this.medplumService.createResource(configResource);
    } catch (error) {
      console.error('Failed to save dashboard configuration:', error);
      throw error;
    }
  }

  /**
   * Load custom dashboard configuration from FHIR resources
   */
  private async loadCustomConfiguration(_roles: UserRole[]): Promise<DashboardConfiguration | null> {
    try {
      // Search for custom dashboard configurations
      const bundle = await this.medplumService.searchResources('Basic', {
        code: 'http://lims.local/dashboard|dashboard-configuration'
      });

      if (bundle.entry && bundle.entry.length > 0) {
        const configResource = bundle.entry[0].resource as Basic;
        const configExtension = configResource?.extension?.find(
          ext => ext.url === 'http://lims.local/dashboard/configuration'
        );

        if (configExtension?.valueString) {
          return JSON.parse(configExtension.valueString);
        }
      }
    } catch (error) {
      console.warn('Failed to load custom configuration:', error);
    }

    return null;
  }

  /**
   * Get available widget types for roles
   */
  getAvailableWidgetTypes(roles: UserRole[]): string[] {
    const allWidgetTypes = new Set<string>();

    roles.forEach(role => {
      const config = this.defaultConfigurations[role];
      if (config) {
        config.widgets.forEach(widget => {
          allWidgetTypes.add(widget.type);
        });
      }
    });

    return Array.from(allWidgetTypes);
  }

  /**
   * Validate dashboard configuration
   */
  validateConfiguration(config: DashboardConfiguration): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.id) {
      errors.push('Configuration ID is required');
    }

    if (!config.name) {
      errors.push('Configuration name is required');
    }

    if (!config.roles || config.roles.length === 0) {
      errors.push('At least one role is required');
    }

    if (!config.widgets || config.widgets.length === 0) {
      errors.push('At least one widget is required');
    }

    // Validate widget positions don't overlap
    const positions = config.widgets.map(w => w.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (this.positionsOverlap(positions[i], positions[j])) {
          errors.push(`Widget positions overlap: ${config.widgets[i].id} and ${config.widgets[j].id}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if two widget positions overlap
   */
  private positionsOverlap(pos1: { x: number; y: number; width: number; height: number }, pos2: { x: number; y: number; width: number; height: number }): boolean {
    return !(pos1.x + pos1.width <= pos2.x ||
      pos2.x + pos2.width <= pos1.x ||
      pos1.y + pos1.height <= pos2.y ||
      pos2.y + pos2.height <= pos1.y);
  }
}
