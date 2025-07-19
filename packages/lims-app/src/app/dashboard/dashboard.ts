import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';
import { UserProfile, DashboardWidget, UserRole } from '../types/fhir-types';

interface DashboardStats {
  totalPatients: number;
  newPatientsToday: number;
  totalSpecimens: number;
  newSpecimensToday: number;
  pendingResults: number;
  overdue: number;
  todayRevenue: number;
}

interface Activity {
  id: string;
  type: string;
  icon: string;
  description: string;
  timestamp: Date;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: Date;
}

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  icon: string;
  message: string;
  timestamp: Date;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  currentDate = new Date();
  currentUser: UserProfile | null = null;
  dashboardWidgets: DashboardWidget[] = [];
  userRoles: UserRole[] = [];
  
  dashboardStats: DashboardStats = {
    totalPatients: 1247,
    newPatientsToday: 12,
    totalSpecimens: 856,
    newSpecimensToday: 23,
    pendingResults: 47,
    overdue: 3,
    todayRevenue: 15420
  };

  recentActivity: Activity[] = [
    {
      id: '1',
      type: 'patient',
      icon: '👤',
      description: 'New patient registered: John Smith',
      timestamp: new Date(Date.now() - 15 * 60 * 1000) // 15 mins ago
    },
    {
      id: '2',
      type: 'specimen',
      icon: '🧪',
      description: 'Specimen SP20250719023 processed',
      timestamp: new Date(Date.now() - 32 * 60 * 1000) // 32 mins ago
    },
    {
      id: '3',
      type: 'result',
      icon: '📈',
      description: 'CBC results completed for Patient #1245',
      timestamp: new Date(Date.now() - 45 * 60 * 1000) // 45 mins ago
    },
    {
      id: '4',
      type: 'order',
      icon: '📋',
      description: 'New lab order received from Dr. Johnson',
      timestamp: new Date(Date.now() - 67 * 60 * 1000) // 1 hour 7 mins ago
    },
    {
      id: '5',
      type: 'patient',
      icon: '👤',
      description: 'Patient demographics updated: Maria Garcia',
      timestamp: new Date(Date.now() - 89 * 60 * 1000) // 1 hour 29 mins ago
    }
  ];

  pendingTasks: Task[] = [
    {
      id: '1',
      title: 'Critical Results Review',
      description: 'Review and approve 3 critical lab results requiring physician notification',
      priority: 'high',
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    },
    {
      id: '2',
      title: 'Quality Control Check',
      description: 'Perform daily QC verification for hematology analyzer',
      priority: 'medium',
      dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 hours from now
    },
    {
      id: '3',
      title: 'Equipment Maintenance',
      description: 'Schedule maintenance for chemistry analyzer',
      priority: 'low',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day from now
    },
    {
      id: '4',
      title: 'Inventory Review',
      description: 'Check reagent inventory levels and place orders',
      priority: 'medium',
      dueDate: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours from now
    }
  ];

  alerts: Alert[] = [
    {
      id: '1',
      type: 'warning',
      icon: '⚠️',
      message: 'Chemistry analyzer reagent levels low - order required',
      timestamp: new Date(Date.now() - 20 * 60 * 1000)
    },
    {
      id: '2',
      type: 'error',
      icon: '🚨',
      message: 'Network connectivity issue detected - backup system activated',
      timestamp: new Date(Date.now() - 45 * 60 * 1000)
    },
    {
      id: '3',
      type: 'info',
      icon: 'ℹ️',
      message: 'System maintenance scheduled for tonight 11 PM - 1 AM',
      timestamp: new Date(Date.now() - 60 * 60 * 1000)
    }
  ];

  constructor(
    private authService: AuthService,
    private roleService: RoleService
  ) { }

  ngOnInit(): void {
    // Subscribe to current user changes
    this.authService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
        this.userRoles = user?.roles || [];
        this.loadDashboardData();
      });

    // Subscribe to dashboard widgets based on user roles
    this.roleService.getDashboardWidgetsForCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe(widgets => {
        this.dashboardWidgets = widgets;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDashboardData(): void {
    if (!this.currentUser) {
      return;
    }

    // Load role-specific dashboard data
    this.loadRoleSpecificData();
    
    // Simulate loading dashboard data
    // In a real implementation, this would make API calls to get actual data
    console.log('Dashboard data loaded for roles:', this.userRoles);
  }

  private loadRoleSpecificData(): void {
    // Customize data based on user roles
    if (this.hasRole(['lab-technician', 'lab-manager'])) {
      this.loadSpecimenData();
    }
    
    if (this.hasRole(['pathologist', 'lab-manager'])) {
      this.loadReportData();
    }
    
    if (this.hasRole(['billing-staff', 'lab-manager'])) {
      this.loadBillingData();
    }
    
    if (this.hasRole(['admin', 'lab-manager'])) {
      this.loadAnalyticsData();
    }
  }

  private loadSpecimenData(): void {
    // Load specimen-specific data for lab technicians
    this.dashboardStats.totalSpecimens = 856;
    this.dashboardStats.newSpecimensToday = 23;
  }

  private loadReportData(): void {
    // Load report-specific data for pathologists
    this.dashboardStats.pendingResults = 47;
    this.dashboardStats.overdue = 3;
  }

  private loadBillingData(): void {
    // Load billing-specific data for billing staff
    this.dashboardStats.todayRevenue = 15420;
  }

  private loadAnalyticsData(): void {
    // Load analytics data for managers and admins
    // This would include comprehensive metrics
  }

  hasRole(roles: UserRole[]): boolean {
    return roles.some(role => this.userRoles.includes(role));
  }

  getDashboardTitle(): string {
    if (!this.currentUser) {
      return 'Dashboard';
    }

    const primaryRole = this.userRoles[0];
    const roleDisplayName = this.roleService.getRoleDisplayName(primaryRole);
    return `${roleDisplayName} Dashboard`;
  }

  getUserRoleClass(): string {
    if (!this.userRoles.length) {
      return 'default-role';
    }
    
    return `role-${this.userRoles[0].replace('-', '_')}`;
  }

  completeTask(task: Task): void {
    const index = this.pendingTasks.findIndex(t => t.id === task.id);
    if (index > -1) {
      this.pendingTasks.splice(index, 1);
      
      // Add to recent activity
      this.recentActivity.unshift({
        id: Date.now().toString(),
        type: 'task',
        icon: '✅',
        description: `Completed task: ${task.title}`,
        timestamp: new Date()
      });
      
      // Keep only latest 10 activities
      this.recentActivity = this.recentActivity.slice(0, 10);
    }
  }

  dismissAlert(alert: Alert): void {
    const index = this.alerts.findIndex(a => a.id === alert.id);
    if (index > -1) {
      this.alerts.splice(index, 1);
    }
  }
}
