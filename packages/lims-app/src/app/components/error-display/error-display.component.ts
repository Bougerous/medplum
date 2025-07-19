import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService, Notification } from '../../services/notification.service';
import { LIMSError } from '../../types/fhir-types';

@Component({
  selector: 'app-error-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-display-container">
      <!-- Current Error Display -->
      <div *ngIf="currentError" class="error-banner" [ngClass]="'error-' + currentError.type">
        <div class="error-content">
          <div class="error-icon">⚠️</div>
          <div class="error-details">
            <div class="error-message">{{ currentError.message }}</div>
            <div class="error-timestamp">{{ currentError.timestamp | date:'short' }}</div>
          </div>
          <button class="error-close" (click)="dismissCurrentError()">×</button>
        </div>
      </div>

      <!-- Notifications Display -->
      <div class="notifications-container">
        <div *ngFor="let notification of notifications" 
             class="notification" 
             [ngClass]="'notification-' + notification.type">
          <div class="notification-content">
            <div class="notification-header">
              <span class="notification-title">{{ notification.title }}</span>
              <button class="notification-close" (click)="dismissNotification(notification.id)">×</button>
            </div>
            <div class="notification-message">{{ notification.message }}</div>
            <div *ngIf="notification.actions && notification.actions.length > 0" class="notification-actions">
              <button *ngFor="let action of notification.actions"
                      class="notification-action"
                      [ngClass]="'action-' + (action.style || 'secondary')"
                      (click)="executeAction(action, notification.id)">
                {{ action.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .error-display-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      max-width: 400px;
    }

    .error-banner {
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .error-banner.error-AUTHENTICATION_ERROR {
      background: #fff3cd;
      border-color: #ffeaa7;
    }

    .error-banner.error-NETWORK_ERROR {
      background: #f8d7da;
      border-color: #f5c6cb;
    }

    .error-content {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .error-icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    .error-details {
      flex: 1;
    }

    .error-message {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .error-timestamp {
      font-size: 12px;
      color: #666;
    }

    .error-close {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notifications-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .notification {
      border-radius: 4px;
      padding: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      animation: slideIn 0.3s ease-out;
    }

    .notification-success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
    }

    .notification-error {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
    }

    .notification-warning {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      color: #856404;
    }

    .notification-info {
      background: #d1ecf1;
      border: 1px solid #bee5eb;
      color: #0c5460;
    }

    .notification-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .notification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .notification-title {
      font-weight: 600;
    }

    .notification-close {
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      padding: 0;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notification-message {
      font-size: 14px;
      line-height: 1.4;
    }

    .notification-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .notification-action {
      padding: 4px 12px;
      border-radius: 3px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }

    .action-primary {
      background: #007bff;
      color: white;
    }

    .action-secondary {
      background: #6c757d;
      color: white;
    }

    .action-danger {
      background: #dc3545;
      color: white;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `]
})
export class ErrorDisplayComponent implements OnInit, OnDestroy {
  currentError: LIMSError | null = null;
  notifications: Notification[] = [];
  
  private subscriptions: Subscription[] = [];

  constructor(
    private errorHandlingService: ErrorHandlingService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    // Subscribe to current error
    this.subscriptions.push(
      this.errorHandlingService.getCurrentError$().subscribe(error => {
        this.currentError = error;
      })
    );

    // Subscribe to notifications
    this.subscriptions.push(
      this.notificationService.getNotifications$().subscribe(notifications => {
        this.notifications = notifications;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  dismissCurrentError(): void {
    this.errorHandlingService.clearCurrentError();
  }

  dismissNotification(id: string): void {
    this.notificationService.dismissNotification(id);
  }

  executeAction(action: any, notificationId: string): void {
    action.action();
    this.dismissNotification(notificationId);
  }
}