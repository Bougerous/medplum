import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, Observable } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

export interface SessionInfo {
  startTime: Date;
  lastActivity: Date;
  timeoutWarningShown: boolean;
  isActive: boolean;
  remainingTime: number;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService implements OnDestroy {
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly WARNING_TIME_MS = 5 * 60 * 1000; // 5 minutes before timeout
  private readonly ACTIVITY_DEBOUNCE_MS = 1000; // 1 second

  private sessionInfo$ = new BehaviorSubject<SessionInfo>({
    startTime: new Date(),
    lastActivity: new Date(),
    timeoutWarningShown: false,
    isActive: false,
    remainingTime: this.SESSION_TIMEOUT_MS
  });

  private sessionTimer: any;
  private warningTimer: any;
  private activitySubscription: any;

  constructor(
    private authService: AuthService,
    private auditService: AuditService,
    private notificationService: NotificationService
  ) {
    this.initializeSessionTracking();
  }

  /**
   * Initialize session tracking
   */
  private initializeSessionTracking(): void {
    // Track user activity
    this.trackUserActivity();

    // Monitor authentication status
    this.authService.getAuthenticationStatus().subscribe(isAuthenticated => {
      if (isAuthenticated) {
        this.startSession();
      } else {
        this.endSession();
      }
    });
  }

  /**
   * Start a new session
   */
  private startSession(): void {
    const now = new Date();

    this.sessionInfo$.next({
      startTime: now,
      lastActivity: now,
      timeoutWarningShown: false,
      isActive: true,
      remainingTime: this.SESSION_TIMEOUT_MS
    });

    this.startSessionTimer();
    this.auditService.logAuthenticationEvent('login-success');

    console.log('Session started');
  }

  /**
   * End the current session
   */
  private endSession(): void {
    this.clearTimers();

    const currentSession = this.sessionInfo$.value;
    this.sessionInfo$.next({
      ...currentSession,
      isActive: false,
      remainingTime: 0
    });

    console.log('Session ended');
  }

  /**
   * Refresh session activity
   */
  refreshActivity(): void {
    if (!this.sessionInfo$.value.isActive) {
      return;
    }

    const now = new Date();
    const currentSession = this.sessionInfo$.value;

    this.sessionInfo$.next({
      ...currentSession,
      lastActivity: now,
      timeoutWarningShown: false,
      remainingTime: this.SESSION_TIMEOUT_MS
    });

    // Restart session timer
    this.startSessionTimer();
  }

  /**
   * Track user activity events
   */
  private trackUserActivity(): void {
    // Track various user activity events
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    const activity$ = merge(
      ...activityEvents.map(event => fromEvent(document, event))
    );

    this.activitySubscription = activity$.pipe(
      debounceTime(this.ACTIVITY_DEBOUNCE_MS),
      filter(() => this.sessionInfo$.value.isActive)
    ).subscribe(() => {
      this.refreshActivity();
    });
  }

  /**
   * Start session timeout timer
   */
  private startSessionTimer(): void {
    this.clearTimers();

    // Set warning timer
    this.warningTimer = setTimeout(() => {
      this.showTimeoutWarning();
    }, this.SESSION_TIMEOUT_MS - this.WARNING_TIME_MS);

    // Set session timeout timer
    this.sessionTimer = setTimeout(() => {
      this.handleSessionTimeout();
    }, this.SESSION_TIMEOUT_MS);

    // Update remaining time every second
    this.updateRemainingTime();
  }

  /**
   * Update remaining time counter
   */
  private updateRemainingTime(): void {
    const updateInterval = setInterval(() => {
      const currentSession = this.sessionInfo$.value;

      if (!currentSession.isActive) {
        clearInterval(updateInterval);
        return;
      }

      const elapsed = Date.now() - currentSession.lastActivity.getTime();
      const remaining = Math.max(0, this.SESSION_TIMEOUT_MS - elapsed);

      this.sessionInfo$.next({
        ...currentSession,
        remainingTime: remaining
      });

      if (remaining <= 0) {
        clearInterval(updateInterval);
      }
    }, 1000);
  }

  /**
   * Show timeout warning
   */
  private showTimeoutWarning(): void {
    const currentSession = this.sessionInfo$.value;

    if (currentSession.timeoutWarningShown || !currentSession.isActive) {
      return;
    }

    this.sessionInfo$.next({
      ...currentSession,
      timeoutWarningShown: true
    });

    // Show warning notification
    this.notificationService.showWarning(
      'Session Timeout Warning',
      `Your session will expire in ${this.WARNING_TIME_MS / 60000} minutes due to inactivity. Click anywhere to continue.`
    );

    // Log security event
    this.auditService.logAuthenticationEvent('session-timeout');
  }

  /**
   * Handle session timeout
   */
  private async handleSessionTimeout(): Promise<void> {
    console.warn('Session timed out due to inactivity');

    // Log security event
    await this.auditService.logAuthenticationEvent('session-timeout');

    // Show timeout notification
    this.notificationService.showError(
      'Session Expired',
      'Your session has expired due to inactivity. Please log in again.'
    );

    // Sign out user
    await this.authService.logout();
  }

  /**
   * Extend session manually
   */
  extendSession(): void {
    this.refreshActivity();

    this.notificationService.showSuccess(
      'Session Extended',
      'Your session has been extended.'
    );

    // Log security event
    this.auditService.logAuthenticationEvent('login-success');
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  /**
   * Get session information
   */
  getSessionInfo(): Observable<SessionInfo> {
    return this.sessionInfo$.asObservable();
  }

  /**
   * Get current session info synchronously
   */
  getCurrentSessionInfo(): SessionInfo {
    return this.sessionInfo$.value;
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    return this.sessionInfo$.value.isActive;
  }

  /**
   * Get session duration
   */
  getSessionDuration(): number {
    const currentSession = this.sessionInfo$.value;
    return Date.now() - currentSession.startTime.getTime();
  }

  /**
   * Get time since last activity
   */
  getTimeSinceLastActivity(): number {
    const currentSession = this.sessionInfo$.value;
    return Date.now() - currentSession.lastActivity.getTime();
  }

  /**
   * Format remaining time for display
   */
  formatRemainingTime(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Terminate user sessions (for security purposes)
   */
  async terminateUserSessions(userId: string): Promise<void> {
    // In a real implementation, this would terminate all sessions for the user
    // For now, we'll just end the current session if it belongs to the user
    const currentUser = this.authService.getCurrentUserSync();
    if (currentUser && currentUser.practitioner.id === userId) {
      await this.authService.logout();

      // Log forced termination
      await this.auditService.logSecurityAlert(
        'suspicious-activity',
        {
          userId,
          reason: 'Security-forced termination'
        }
      );
    }
  }

  /**
   * Terminate specific session
   */
  async terminateSession(sessionId: string): Promise<void> {
    // In a real implementation, this would terminate a specific session
    // For now, we'll just end the current session
    await this.authService.logout();

    // Log session termination
    await this.auditService.logAuthenticationEvent(
      'session-timeout',
      undefined,
      {
        sessionId,
        reason: 'Forced termination'
      }
    );
  }

  /**
   * Cleanup on service destruction
   */
  ngOnDestroy(): void {
    this.clearTimers();

    if (this.activitySubscription) {
      this.activitySubscription.unsubscribe();
    }
  }
}