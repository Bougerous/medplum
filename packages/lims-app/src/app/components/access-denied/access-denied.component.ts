import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RoleService } from '../../services/role.service';
import { AuditService } from '../../services/audit.service';
import { UserProfile } from '../../types/fhir-types';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="access-denied-container">
      <div class="access-denied-content">
        <div class="error-icon">
          <i class="material-icons">block</i>
        </div>
        
        <h1>Access Denied</h1>
        
        <div class="error-message">
          <p>You don't have permission to access this resource.</p>
          <p *ngIf="attemptedResource" class="attempted-resource">
            Attempted to access: <code>{{ attemptedResource }}</code>
          </p>
        </div>
        
        <div class="user-info" *ngIf="currentUser">
          <h3>Current User Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>Name:</label>
              <span>{{ getUserName() }}</span>
            </div>
            <div class="info-item">
              <label>Roles:</label>
              <span>{{ getUserRoles() }}</span>
            </div>
            <div class="info-item">
              <label>Project:</label>
              <span>{{ getProjectName() }}</span>
            </div>
          </div>
        </div>
        
        <div class="required-permissions" *ngIf="requiredPermissions.length > 0">
          <h3>Required Permissions</h3>
          <ul>
            <li *ngFor="let permission of requiredPermissions">{{ permission }}</li>
          </ul>
        </div>
        
        <div class="actions">
          <button (click)="goBack()" class="btn btn-secondary">
            <i class="material-icons">arrow_back</i>
            Go Back
          </button>
          
          <button (click)="goToDashboard()" class="btn btn-primary">
            <i class="material-icons">dashboard</i>
            Go to Dashboard
          </button>
          
          <button (click)="requestAccess()" class="btn btn-outline">
            <i class="material-icons">email</i>
            Request Access
          </button>
        </div>
        
        <div class="help-section">
          <h3>Need Help?</h3>
          <p>If you believe you should have access to this resource, please contact your system administrator.</p>
          <div class="contact-info">
            <p><strong>IT Support:</strong> support@lims.local</p>
            <p><strong>Phone:</strong> (555) 123-4567</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .access-denied-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 2rem;
    }

    .access-denied-content {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      padding: 3rem;
      max-width: 600px;
      width: 100%;
      text-align: center;
    }

    .error-icon {
      margin-bottom: 2rem;
    }

    .error-icon i {
      font-size: 4rem;
      color: #e74c3c;
    }

    h1 {
      color: #2c3e50;
      margin-bottom: 1.5rem;
      font-size: 2.5rem;
      font-weight: 300;
    }

    .error-message {
      margin-bottom: 2rem;
      color: #7f8c8d;
    }

    .error-message p {
      margin-bottom: 0.5rem;
    }

    .attempted-resource {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 6px;
      border-left: 4px solid #e74c3c;
      text-align: left;
      margin-top: 1rem;
    }

    .attempted-resource code {
      background: #e9ecef;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      color: #e74c3c;
    }

    .user-info, .required-permissions, .help-section {
      margin: 2rem 0;
      text-align: left;
    }

    .user-info h3, .required-permissions h3, .help-section h3 {
      color: #2c3e50;
      margin-bottom: 1rem;
      font-size: 1.25rem;
    }

    .info-grid {
      display: grid;
      gap: 0.75rem;
    }

    .info-item {
      display: flex;
      align-items: center;
    }

    .info-item label {
      font-weight: 600;
      color: #34495e;
      min-width: 80px;
      margin-right: 1rem;
    }

    .info-item span {
      color: #7f8c8d;
    }

    .required-permissions ul {
      list-style: none;
      padding: 0;
    }

    .required-permissions li {
      background: #f8f9fa;
      padding: 0.5rem 1rem;
      margin-bottom: 0.5rem;
      border-radius: 4px;
      border-left: 3px solid #3498db;
    }

    .actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin: 2rem 0;
      flex-wrap: wrap;
    }

    .btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .btn-primary {
      background: #3498db;
      color: white;
    }

    .btn-primary:hover {
      background: #2980b9;
    }

    .btn-secondary {
      background: #95a5a6;
      color: white;
    }

    .btn-secondary:hover {
      background: #7f8c8d;
    }

    .btn-outline {
      background: transparent;
      color: #3498db;
      border: 2px solid #3498db;
    }

    .btn-outline:hover {
      background: #3498db;
      color: white;
    }

    .help-section {
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 6px;
      border-left: 4px solid #3498db;
    }

    .contact-info {
      margin-top: 1rem;
    }

    .contact-info p {
      margin: 0.25rem 0;
      color: #7f8c8d;
    }

    @media (max-width: 768px) {
      .access-denied-container {
        padding: 1rem;
      }

      .access-denied-content {
        padding: 2rem;
      }

      .actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
        justify-content: center;
      }
    }
  `]
})
export class AccessDeniedComponent implements OnInit {
  currentUser: UserProfile | null = null;
  attemptedResource: string | null = null;
  requiredPermissions: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private roleService: RoleService,
    private auditService: AuditService
  ) {}

  ngOnInit(): void {
    // Get current user
    this.authService.getCurrentUser().subscribe(user => {
      this.currentUser = user;
    });

    // Get attempted resource from query params
    this.route.queryParams.subscribe(params => {
      this.attemptedResource = params['resource'] || params['attemptedUrl'];
      
      if (params['permissions']) {
        this.requiredPermissions = params['permissions'].split(',');
      }
    });

    // Log access denied event
    this.logAccessDeniedEvent();
  }

  private async logAccessDeniedEvent(): Promise<void> {
    await this.auditService.logAuthorizationEvent(
      'access-denied',
      undefined,
      undefined,
      {
        attemptedResource: this.attemptedResource,
        requiredPermissions: this.requiredPermissions,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      }
    );
  }

  getUserName(): string {
    if (!this.currentUser?.practitioner.name?.[0]) {
      return 'Unknown User';
    }
    
    const name = this.currentUser.practitioner.name[0];
    return `${name.given?.[0] || ''} ${name.family || ''}`.trim();
  }

  getUserRoles(): string {
    if (!this.currentUser?.roles) {
      return 'No roles assigned';
    }
    
    return this.currentUser.roles
      .map(role => this.roleService.getRoleDisplayName(role))
      .join(', ');
  }

  getProjectName(): string {
    if (!this.currentUser?.projectMembership?.project?.display) {
      return 'No project assigned';
    }
    
    return this.currentUser.projectMembership.project.display;
  }

  goBack(): void {
    window.history.back();
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  async requestAccess(): Promise<void> {
    // In a real implementation, this would send an access request
    // For now, we'll just show a message
    alert('Access request functionality would be implemented here. Please contact your administrator.');
    
    // Log access request event
    await this.auditService.logSecurityEvent({
      type: 'system-access' as any,
      action: 'access-request',
      userId: this.currentUser?.practitioner.id,
      outcome: 'success',
      details: {
        requestedResource: this.attemptedResource,
        requiredPermissions: this.requiredPermissions
      }
    });
  }
}