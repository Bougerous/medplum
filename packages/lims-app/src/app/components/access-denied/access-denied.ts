import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuditService } from '../../services/audit.service';
import { UserProfile } from '../../types/fhir-types';

@Component({
  selector: 'app-access-denied',
  templateUrl: './access-denied.html',
  styleUrls: ['./access-denied.scss']
})
export class AccessDeniedComponent implements OnInit {
  currentUser: UserProfile | null = null;
  attemptedUrl: string = '';
  reason: string = '';
  canRequestAccess: boolean = false;
  contactInfo: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private auditService: AuditService
  ) {}

  async ngOnInit(): Promise<void> {
    // Get current user
    this.authService.getCurrentUser().subscribe(user => {
      this.currentUser = user;
    });

    // Get query parameters
    this.route.queryParams.subscribe(params => {
      this.attemptedUrl = params['url'] || '';
      this.reason = params['reason'] || 'You do not have permission to access this resource.';
    });

    // Determine if user can request access
    this.canRequestAccess = this.currentUser !== null;
    this.contactInfo = 'system-admin@example.com'; // This would come from configuration

    // Log access denied event
    if (this.currentUser) {
      await this.auditService.logAuthorizationEvent(
        'access-denied',
        'Portal',
        undefined,
        {
          userId: this.currentUser.practitioner.id,
          attemptedUrl: this.attemptedUrl,
          reason: this.reason,
          userRoles: this.currentUser.roles
        }
      );
    }
  }

  /**
   * Navigate back to previous page or dashboard
   */
  goBack(): void {
    if (this.currentUser) {
      // Navigate to appropriate dashboard based on user role
      if (this.currentUser.roles.includes('patient')) {
        this.router.navigate(['/patient-portal']);
      } else if (this.currentUser.roles.includes('provider')) {
        this.router.navigate(['/provider-portal']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    } else {
      this.router.navigate(['/login']);
    }
  }

  /**
   * Request access to the resource
   */
  async requestAccess(): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    try {
      // In a real implementation, this would create a request ticket
      // For now, we'll just log the request
      await this.auditService.logSystemAccessEvent(
        'access-request',
        {
          userId: this.currentUser.practitioner.id,
          requestedUrl: this.attemptedUrl,
          reason: 'User requested access to denied resource',
          userRoles: this.currentUser.roles,
          timestamp: new Date().toISOString()
        }
      );

      // Show success message (you'd typically use a notification service)
      alert('Access request submitted. You will be contacted by an administrator.');
      
    } catch (error) {
      console.error('Error submitting access request:', error);
      alert('Failed to submit access request. Please contact support directly.');
    }
  }

  /**
   * Navigate to login page
   */
  login(): void {
    this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.attemptedUrl }
    });
  }

  /**
   * Get appropriate icon based on user status
   */
  getAccessDeniedIcon(): string {
    if (!this.currentUser) {
      return 'icon-lock';
    }
    
    return 'icon-shield-x';
  }

  /**
   * Get appropriate title based on user status
   */
  getAccessDeniedTitle(): string {
    if (!this.currentUser) {
      return 'Authentication Required';
    }
    
    return 'Access Denied';
  }

  /**
   * Get appropriate message based on user status
   */
  getAccessDeniedMessage(): string {
    if (!this.currentUser) {
      return 'You must be logged in to access this resource.';
    }
    
    return this.reason || 'You do not have permission to access this resource.';
  }
}