import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LIMSError } from '../types/fhir-types';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  autoClose?: boolean;
  duration?: number; // milliseconds
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications$ = new BehaviorSubject<Notification[]>([]);
  private notificationCounter = 0;

  constructor() {}

  /**
   * Get observable of current notifications
   */
  getNotifications(): Observable<Notification[]> {
    return this.notifications$.asObservable();
  }

  /**
   * Show a success notification
   */
  showSuccess(title: string, message: string, autoClose = true, duration = 5000): void {
    this.addNotification({
      type: 'success',
      title,
      message,
      autoClose,
      duration
    });
  }

  /**
   * Show an error notification
   */
  showError(title: string, message: string, autoClose = false): void {
    this.addNotification({
      type: 'error',
      title,
      message,
      autoClose
    });
  }

  /**
   * Show a warning notification
   */
  showWarning(title: string, message: string, autoClose = true, duration = 7000): void {
    this.addNotification({
      type: 'warning',
      title,
      message,
      autoClose,
      duration
    });
  }

  /**
   * Show an info notification
   */
  showInfo(title: string, message: string, autoClose = true, duration = 5000): void {
    this.addNotification({
      type: 'info',
      title,
      message,
      autoClose,
      duration
    });
  }

  /**
   * Show a LIMS error as a notification
   */
  showLIMSError(error: LIMSError): void {
    let title = 'Error';
    let type: 'error' | 'warning' = 'error';

    switch (error.type) {
      case 'AUTHENTICATION_ERROR':
        title = 'Authentication Error';
        break;
      case 'AUTHORIZATION_ERROR':
        title = 'Access Denied';
        break;
      case 'VALIDATION_ERROR':
        title = 'Validation Error';
        type = 'warning';
        break;
      case 'NETWORK_ERROR':
        title = 'Network Error';
        break;
      case 'FHIR_ERROR':
        title = 'Data Error';
        break;
      case 'WORKFLOW_ERROR':
        title = 'Workflow Error';
        break;
      case 'INTEGRATION_ERROR':
        title = 'Integration Error';
        break;
    }

    this.addNotification({
      type,
      title,
      message: error.message,
      autoClose: type === 'warning'
    });
  }

  /**
   * Remove a specific notification
   */
  removeNotification(id: string): void {
    const current = this.notifications$.value;
    const updated = current.filter(n => n.id !== id);
    this.notifications$.next(updated);
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications$.next([]);
  }

  /**
   * Add a notification to the list
   */
  private addNotification(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const newNotification: Notification = {
      ...notification,
      id: `notification-${++this.notificationCounter}`,
      timestamp: new Date()
    };

    const current = this.notifications$.value;
    this.notifications$.next([newNotification, ...current]);

    // Auto-remove if specified
    if (notification.autoClose && notification.duration) {
      setTimeout(() => {
        this.removeNotification(newNotification.id);
      }, notification.duration);
    }
  }
}