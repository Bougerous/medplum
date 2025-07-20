import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SearchParams, UserRole } from '../types/fhir-types';
import { AuthService } from './auth.service';

export interface DataFilterRule {
  resourceType: string;
  roles: UserRole[];
  filters: SearchParams;
  fieldRestrictions?: string[];
  allowedActions?: ('create' | 'read' | 'update' | 'delete')[];
}

export interface FilteredData<T> {
  data: T[];
  totalCount: number;
  filteredCount: number;
  appliedFilters: string[];
  accessLevel: 'full' | 'restricted' | 'limited';
}

@Injectable({
  providedIn: 'root',
})
export class DataFilterService {
  private readonly dataFilterRules: DataFilterRule[] = [
    // Patient data filtering
    {
      resourceType: 'Patient',
      roles: ['patient'],
      filters: { _id: 'current-user-patient-id' }, // Would be dynamically set
      fieldRestrictions: ['id', 'name', 'birthDate', 'gender', 'contact'],
      allowedActions: ['read'],
    },
    {
      resourceType: 'Patient',
      roles: ['provider'],
      filters: { 'general-practitioner': 'current-user-practitioner-id' },
      fieldRestrictions: undefined, // Full access to assigned patients
      allowedActions: ['read', 'update'],
    },
    {
      resourceType: 'Patient',
      roles: ['lab-technician'],
      filters: {}, // Can see all patients but limited fields
      fieldRestrictions: ['id', 'name', 'birthDate', 'gender', 'identifier'],
      allowedActions: ['read'],
    },
    {
      resourceType: 'Patient',
      roles: ['pathologist', 'lab-manager', 'admin'],
      filters: {}, // Full access
      fieldRestrictions: undefined,
      allowedActions: ['create', 'read', 'update', 'delete'],
    },

    // Specimen data filtering
    {
      resourceType: 'Specimen',
      roles: ['patient'],
      filters: { subject: 'current-user-patient-id' },
      fieldRestrictions: ['id', 'type', 'status', 'receivedTime', 'collection'],
      allowedActions: ['read'],
    },
    {
      resourceType: 'Specimen',
      roles: ['provider'],
      filters: { requester: 'current-user-practitioner-id' },
      fieldRestrictions: undefined,
      allowedActions: ['read'],
    },
    {
      resourceType: 'Specimen',
      roles: ['lab-technician', 'pathologist', 'lab-manager', 'admin'],
      filters: {},
      fieldRestrictions: undefined,
      allowedActions: ['create', 'read', 'update', 'delete'],
    },

    // DiagnosticReport data filtering
    {
      resourceType: 'DiagnosticReport',
      roles: ['patient'],
      filters: {
        subject: 'current-user-patient-id',
        status: 'final,amended', // Only final reports
      },
      fieldRestrictions: [
        'id',
        'status',
        'code',
        'subject',
        'effectiveDateTime',
        'issued',
        'result',
        'conclusion',
      ],
      allowedActions: ['read'],
    },
    {
      resourceType: 'DiagnosticReport',
      roles: ['provider'],
      filters: { performer: 'current-user-practitioner-id' },
      fieldRestrictions: undefined,
      allowedActions: ['read'],
    },
    {
      resourceType: 'DiagnosticReport',
      roles: ['pathologist'],
      filters: { performer: 'current-user-practitioner-id' },
      fieldRestrictions: undefined,
      allowedActions: ['create', 'read', 'update'],
    },
    {
      resourceType: 'DiagnosticReport',
      roles: ['lab-manager', 'admin'],
      filters: {},
      fieldRestrictions: undefined,
      allowedActions: ['create', 'read', 'update', 'delete'],
    },

    // Billing data filtering
    {
      resourceType: 'Claim',
      roles: ['patient'],
      filters: { patient: 'current-user-patient-id' },
      fieldRestrictions: [
        'id',
        'status',
        'patient',
        'created',
        'total',
        'outcome',
      ],
      allowedActions: ['read'],
    },
    {
      resourceType: 'Claim',
      roles: ['billing-staff', 'lab-manager', 'admin'],
      filters: {},
      fieldRestrictions: undefined,
      allowedActions: ['create', 'read', 'update', 'delete'],
    },

    // Audit data filtering
    {
      resourceType: 'AuditEvent',
      roles: ['admin'],
      filters: {},
      fieldRestrictions: undefined,
      allowedActions: ['read'],
    },
    {
      resourceType: 'AuditEvent',
      roles: ['lab-manager'],
      filters: { 'source.site': 'LIMS' }, // Only LIMS-related audit events
      fieldRestrictions: undefined,
      allowedActions: ['read'],
    },
  ];

  constructor(private authService: AuthService) {}

  /**
   * Apply data filters based on user roles and permissions
   */
  applyDataFilters<T>(
    resourceType: string,
    data: T[],
    _searchParams?: SearchParams,
  ): Observable<FilteredData<T>> {
    return this.authService.getCurrentUser().pipe(
      map((user) => {
        if (!user) {
          return {
            data: [],
            totalCount: data.length,
            filteredCount: 0,
            appliedFilters: ['no-authentication'],
            accessLevel: 'limited' as const,
          };
        }

        const applicableRules = this.getApplicableRules(
          resourceType,
          user.roles,
        );
        const filteredData = this.filterData(
          data,
          applicableRules,
          user.practitioner.id!,
        );
        const restrictedData = this.applyFieldRestrictions(
          filteredData,
          applicableRules,
        );

        return {
          data: restrictedData,
          totalCount: data.length,
          filteredCount: restrictedData.length,
          appliedFilters: this.getAppliedFilterNames(applicableRules),
          accessLevel: this.determineAccessLevel(applicableRules),
        };
      }),
    );
  }

  /**
   * Get search parameters with applied filters
   */
  getFilteredSearchParams(
    resourceType: string,
    baseParams: SearchParams = {},
  ): Observable<SearchParams> {
    return this.authService.getCurrentUser().pipe(
      map((user) => {
        if (!user) {
          return { ...baseParams, _count: '0' }; // No results for unauthenticated users
        }

        const applicableRules = this.getApplicableRules(
          resourceType,
          user.roles,
        );
        const additionalFilters = this.buildSearchFilters(
          applicableRules,
          user.practitioner.id!,
        );

        return {
          ...baseParams,
          ...additionalFilters,
        };
      }),
    );
  }

  /**
   * Check if user can perform action on resource type
   */
  canPerformAction(
    resourceType: string,
    action: 'create' | 'read' | 'update' | 'delete',
  ): Observable<boolean> {
    return this.authService.getCurrentUser().pipe(
      map((user) => {
        if (!user) {
          return false;
        }

        const applicableRules = this.getApplicableRules(
          resourceType,
          user.roles,
        );
        return applicableRules.some(
          (rule) => rule.allowedActions?.includes(action) ?? false,
        );
      }),
    );
  }

  /**
   * Get allowed fields for resource type based on user roles
   */
  getAllowedFields(resourceType: string): Observable<string[] | undefined> {
    return this.authService.getCurrentUser().pipe(
      map((user) => {
        if (!user) {
          return [];
        }

        const applicableRules = this.getApplicableRules(
          resourceType,
          user.roles,
        );

        // If any rule has no field restrictions, return undefined (full access)
        if (applicableRules.some((rule) => !rule.fieldRestrictions)) {
          return undefined;
        }

        // Combine all allowed fields from applicable rules
        const allowedFields = new Set<string>();
        applicableRules.forEach((rule) => {
          if (rule.fieldRestrictions) {
            rule.fieldRestrictions.forEach((field) => allowedFields.add(field));
          }
        });

        return Array.from(allowedFields);
      }),
    );
  }

  /**
   * Filter data based on compartment access
   */
  filterByCompartment<T extends { id?: string }>(
    data: T[],
    _compartmentType: 'Patient' | 'Practitioner',
    _compartmentId: string,
  ): T[] {
    // This would implement FHIR compartment-based filtering
    // For now, return all data as this requires more complex FHIR logic
    return data;
  }

  /**
   * Apply row-level security based on user context
   */
  applyRowLevelSecurity<T>(resourceType: string, data: T[]): Observable<T[]> {
    return this.authService.getCurrentUser().pipe(
      map((user) => {
        if (!user) {
          return [];
        }

        // Apply row-level security rules based on user context
        return this.filterDataByUserContext(
          data,
          resourceType,
          user.practitioner.id!,
          user.roles,
        );
      }),
    );
  }

  private getApplicableRules(
    resourceType: string,
    userRoles: UserRole[],
  ): DataFilterRule[] {
    return this.dataFilterRules.filter(
      (rule) =>
        rule.resourceType === resourceType &&
        rule.roles.some((role) => userRoles.includes(role)),
    );
  }

  private filterData<T>(
    data: T[],
    rules: DataFilterRule[],
    userId: string,
  ): T[] {
    if (rules.length === 0) {
      return [];
    }

    // If any rule has no filters, return all data
    if (rules.some((rule) => Object.keys(rule.filters).length === 0)) {
      return data;
    }

    // Apply filters from all applicable rules (OR logic)
    return data.filter((item) => {
      return rules.some((rule) =>
        this.itemMatchesFilters(item, rule.filters, userId),
      );
    });
  }

  private itemMatchesFilters<T>(
    item: T,
    filters: SearchParams,
    userId: string,
  ): boolean {
    // This is a simplified implementation
    // In a real system, this would need to handle complex FHIR search parameters

    for (const [key, value] of Object.entries(filters)) {
      let filterValue = value as string;

      // Replace dynamic placeholders
      if (filterValue === 'current-user-patient-id') {
        filterValue = userId; // This would need proper patient ID lookup
      } else if (filterValue === 'current-user-practitioner-id') {
        filterValue = userId;
      }

      // Simple field matching (would need more sophisticated logic for real FHIR)
      const itemValue = (item as any)[key];
      if (itemValue !== filterValue) {
        return false;
      }
    }

    return true;
  }

  private applyFieldRestrictions<T>(data: T[], rules: DataFilterRule[]): T[] {
    // If any rule has no field restrictions, return data as-is
    if (rules.some((rule) => !rule.fieldRestrictions)) {
      return data;
    }

    // Get all allowed fields
    const allowedFields = new Set<string>();
    rules.forEach((rule) => {
      if (rule.fieldRestrictions) {
        rule.fieldRestrictions.forEach((field) => allowedFields.add(field));
      }
    });

    // Filter object properties
    return data.map((item) => {
      const filteredItem: any = {};
      Object.keys(item as any).forEach((key) => {
        if (allowedFields.has(key)) {
          filteredItem[key] = (item as any)[key];
        }
      });
      return filteredItem as T;
    });
  }

  private buildSearchFilters(
    rules: DataFilterRule[],
    userId: string,
  ): SearchParams {
    const combinedFilters: SearchParams = {};

    rules.forEach((rule) => {
      Object.entries(rule.filters).forEach(([key, value]) => {
        let filterValue = value as string;

        // Replace dynamic placeholders
        if (filterValue === 'current-user-patient-id') {
          filterValue = userId; // This would need proper patient ID lookup
        } else if (filterValue === 'current-user-practitioner-id') {
          filterValue = userId;
        }

        // Combine filters with OR logic where appropriate
        if (combinedFilters[key]) {
          combinedFilters[key] = `${combinedFilters[key]},${filterValue}`;
        } else {
          combinedFilters[key] = filterValue;
        }
      });
    });

    return combinedFilters;
  }

  private getAppliedFilterNames(rules: DataFilterRule[]): string[] {
    const filterNames: string[] = [];

    rules.forEach((rule) => {
      if (Object.keys(rule.filters).length > 0) {
        filterNames.push(`${rule.resourceType}-${rule.roles.join('-')}-filter`);
      }
      if (rule.fieldRestrictions) {
        filterNames.push(`${rule.resourceType}-field-restriction`);
      }
    });

    return filterNames;
  }

  private determineAccessLevel(
    rules: DataFilterRule[],
  ): 'full' | 'restricted' | 'limited' {
    if (rules.length === 0) {
      return 'limited';
    }

    // Full access if any rule has no restrictions
    if (
      rules.some(
        (rule) =>
          Object.keys(rule.filters).length === 0 &&
          !rule.fieldRestrictions &&
          rule.allowedActions?.length === 4,
      )
    ) {
      return 'full';
    }

    // Limited access if heavily restricted
    if (
      rules.every(
        (rule) => rule.fieldRestrictions && rule.fieldRestrictions.length < 5,
      )
    ) {
      return 'limited';
    }

    return 'restricted';
  }

  private filterDataByUserContext<T>(
    data: T[],
    _resourceType: string,
    _userId: string,
    _userRoles: UserRole[],
  ): T[] {
    // Implement user context-based filtering
    // This would include things like:
    // - Patient compartment access
    // - Practitioner compartment access
    // - Organization-based access
    // - Time-based access restrictions

    return data; // Simplified for now
  }
}
