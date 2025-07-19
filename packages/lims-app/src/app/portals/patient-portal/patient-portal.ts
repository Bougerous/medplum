import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  Patient,
  DiagnosticReport,
  Appointment,
  Communication
} from '@medplum/fhirtypes';
import { AuthService } from '../../services/auth.service';
import { MedplumService } from '../../medplum.service';
import { ErrorHandlingService } from '../../services/error-handling.service';
import { NotificationService } from '../../services/notification.service';
import { AuditService } from '../../services/audit.service';
import { UserProfile, LIMSErrorType } from '../../types/fhir-types';

interface PatientPortalData {
  patient: Patient;
  diagnosticReports: DiagnosticReport[];
  upcomingAppointments: Appointment[];
  communications: Communication[];
  hasNewResults: boolean;
  hasUnreadMessages: boolean;
}

@Component({
  selector: 'app-patient-portal',
  templateUrl: './patient-portal.html',
  styleUrls: ['./patient-portal.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TitleCasePipe
  ]
})
export class PatientPortalComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  currentUser: UserProfile | null = null;
  patientData: PatientPortalData | null = null;
  loading = true;
  error: string | null = null;

  // Tab management
  activeTab: 'results' | 'appointments' | 'messages' | 'profile' = 'results';

  // Results filtering
  resultsFilter: 'all' | 'recent' | 'pending' = 'all';

  // Modal management
  showComposeModal = false;
  sendingMessage = false;
  newMessage = {
    subject: '',
    content: ''
  };

  constructor(
    private authService: AuthService,
    private medplumService: MedplumService,
    private errorHandlingService: ErrorHandlingService,
    private notificationService: NotificationService,
    private auditService: AuditService,
    private router: Router
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      // Check if user is authenticated and has patient role
      this.authService.getCurrentUser()
        .pipe(takeUntil(this.destroy$))
        .subscribe(async (user) => {
          if (!user) {
            this.router.navigate(['/login']);
            return;
          }

          if (!user.roles.includes('patient')) {
            this.error = 'Access denied. Patient portal is only available to patients.';
            await this.auditService.logUnauthorizedAccess(
              user.practitioner.id || 'unknown',
              'patient-portal',
              'Attempted to access patient portal without patient role'
            );
            return;
          }

          this.currentUser = user;
          await this.loadPatientData();
        });
    } catch (error) {
      this.handleError('Failed to initialize patient portal', error);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all patient data for the portal
   */
  private async loadPatientData(): Promise<void> {
    if (!this.currentUser?.practitioner.id) {
      return;
    }

    try {
      this.loading = true;
      this.error = null;

      // Find the Patient resource linked to this Practitioner
      const patient = await this.findLinkedPatient(this.currentUser.practitioner.id);
      if (!patient) {
        throw new Error('No patient record found for this user');
      }

      // Load all patient data in parallel
      const [diagnosticReports, appointments, communications] = await Promise.all([
        this.loadDiagnosticReports(patient.id || ''),
        this.loadAppointments(patient.id || ''),
        this.loadCommunications(patient.id || '')
      ]);

      this.patientData = {
        patient,
        diagnosticReports,
        upcomingAppointments: appointments,
        communications,
        hasNewResults: this.checkForNewResults(diagnosticReports),
        hasUnreadMessages: this.checkForUnreadMessages(communications)
      };

      // Log successful access
      await this.auditService.logPatientPortalAccess(
        patient.id || 'unknown',
        'portal-access',
        'Patient accessed portal successfully'
      );

    } catch (error) {
      this.handleError('Failed to load patient data', error);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Find Patient resource linked to the current Practitioner
   */
  private async findLinkedPatient(practitionerId: string): Promise<Patient | null> {
    try {
      // Look for Patient resource with link to this Practitioner
      const bundle = await this.medplumService.searchResources<Patient>(
        'Patient',
        {
          'link': `Practitioner/${practitionerId}`,
          '_count': '1'
        }
      );

      if (bundle.entry && bundle.entry.length > 0) {
        return bundle.entry[0].resource || null;
      }

      // Alternative: Look for Patient with same identifier or email
      const practitioner = this.currentUser?.practitioner;
      if (practitioner.telecom) {
        const email = practitioner.telecom.find(t => t.system === 'email')?.value;
        if (email) {
          const emailBundle = await this.medplumService.searchResources<Patient>(
            'Patient',
            {
              'telecom': email,
              '_count': '1'
            }
          );

          if (emailBundle.entry && emailBundle.entry.length > 0) {
            return emailBundle.entry[0].resource || null;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding linked patient:', error);
      return null;
    }
  }

  /**
   * Load diagnostic reports for the patient
   */
  private async loadDiagnosticReports(patientId: string): Promise<DiagnosticReport[]> {
    try {
      const bundle = await this.medplumService.searchResources<DiagnosticReport>(
        'DiagnosticReport',
        {
          'subject': `Patient/${patientId}`,
          'status': 'final,amended,corrected',
          '_sort': '-issued',
          '_count': '50'
        }
      );

      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error loading diagnostic reports:', error);
      return [];
    }
  }

  /**
   * Load appointments for the patient
   */
  private async loadAppointments(patientId: string): Promise<Appointment[]> {
    try {
      const bundle = await this.medplumService.searchResources<Appointment>(
        'Appointment',
        {
          'actor': `Patient/${patientId}`,
          'status': 'booked,arrived,fulfilled',
          'date': `ge${new Date().toISOString().split('T')[0]}`,
          '_sort': 'date',
          '_count': '20'
        }
      );

      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error loading appointments:', error);
      return [];
    }
  }

  /**
   * Load communications for the patient
   */
  private async loadCommunications(patientId: string): Promise<Communication[]> {
    try {
      const bundle = await this.medplumService.searchResources<Communication>(
        'Communication',
        {
          'subject': `Patient/${patientId}`,
          '_sort': '-sent',
          '_count': '30'
        }
      );

      return bundle.entry?.map(entry => entry.resource!).filter(Boolean) || [];
    } catch (error) {
      console.error('Error loading communications:', error);
      return [];
    }
  }

  /**
   * Check if there are new results since last login
   */
  private checkForNewResults(reports: DiagnosticReport[]): boolean {
    const lastLoginDate = this.getLastLoginDate();
    if (!lastLoginDate) {
      return false;
    }

    return reports.some(report => {
      const issuedDate = report.issued ? new Date(report.issued) : null;
      return issuedDate && issuedDate > lastLoginDate;
    });
  }

  /**
   * Check if there are unread messages
   */
  private checkForUnreadMessages(communications: Communication[]): boolean {
    return communications.some(comm => {
      // Check if communication is marked as unread
      const status = comm.status;
      return status === 'received' || status === 'in-progress';
    });
  }

  /**
   * Get last login date from local storage or session
   */
  private getLastLoginDate(): Date | null {
    const lastLogin = localStorage.getItem('lastPatientLogin');
    return lastLogin ? new Date(lastLogin) : null;
  }

  /**
   * Set active tab
   */
  setActiveTab(tab: 'results' | 'appointments' | 'messages' | 'profile'): void {
    this.activeTab = tab;

    // Log tab access for analytics
    this.auditService.logPatientPortalAccess(
      this.patientData?.patient.id || 'unknown',
      `tab-${tab}`,
      `Patient accessed ${tab} tab`
    );
  }

  /**
   * Filter diagnostic reports
   */
  setResultsFilter(filter: 'all' | 'recent' | 'pending'): void {
    this.resultsFilter = filter;
  }

  /**
   * Get filtered diagnostic reports
   */
  getFilteredReports(): DiagnosticReport[] {
    if (!this.patientData?.diagnosticReports) {
      return [];
    }

    const reports = this.patientData.diagnosticReports;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    switch (this.resultsFilter) {
      case 'recent':
        return reports.filter(report => {
          const issuedDate = report.issued ? new Date(report.issued) : null;
          return issuedDate && issuedDate >= thirtyDaysAgo;
        });
      case 'pending':
        return reports.filter(report =>
          report.status === 'registered' ||
          report.status === 'partial' ||
          report.status === 'preliminary'
        );
      default:
        return reports;
    }
  }

  /**
   * View diagnostic report details
   */
  async viewReport(report: DiagnosticReport): Promise<void> {
    try {
      // Log report access
      await this.auditService.logPatientPortalAccess(
        this.patientData?.patient.id || 'unknown',
        'report-view',
        `Patient viewed diagnostic report ${report.id}`
      );

      // Navigate to report detail view or open modal
      // Implementation depends on your routing structure
      this.router.navigate(['/patient-portal/report', report.id]);
    } catch (error) {
      this.handleError('Failed to view report', error);
    }
  }

  /**
   * Schedule new appointment
   */
  async scheduleAppointment(): Promise<void> {
    try {
      // Navigate to appointment scheduling
      this.router.navigate(['/patient-portal/schedule-appointment']);
    } catch (error) {
      this.handleError('Failed to navigate to appointment scheduling', error);
    }
  }

  /**
   * Send new message
   */
  async sendMessage(subject: string, message: string): Promise<void> {
    if (!this.patientData?.patient.id) {
      return;
    }

    try {
      const communication: Communication = {
        resourceType: 'Communication',
        status: 'completed',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/communication-category',
            code: 'instruction',
            display: 'Instruction'
          }]
        }],
        subject: {
          reference: `Patient/${this.patientData.patient.id}`
        },
        sent: new Date().toISOString(),
        payload: [{
          contentString: message
        }],
        topic: {
          text: subject
        }
      };

      await this.medplumService.createResource(communication);

      this.notificationService.showSuccess('Message Sent', 'Message sent successfully');

      // Reload communications
      const communications = await this.loadCommunications(this.patientData.patient.id);
      this.patientData.communications = communications;
      this.patientData.hasUnreadMessages = this.checkForUnreadMessages(communications);

    } catch (error) {
      this.handleError('Failed to send message', error);
    }
  }

  /**
   * Update patient profile
   */
  async updateProfile(updatedPatient: Partial<Patient>): Promise<void> {
    if (!this.patientData?.patient) {
      return;
    }

    try {
      const patient = { ...this.patientData.patient, ...updatedPatient };
      const updatedResource = await this.medplumService.updateResource(patient);

      this.patientData.patient = updatedResource;
      this.notificationService.showSuccess('Profile Updated', 'Profile updated successfully');

      // Log profile update
      await this.auditService.logPatientPortalAccess(
        patient.id || 'unknown',
        'profile-update',
        'Patient updated their profile'
      );

    } catch (error) {
      this.handleError('Failed to update profile', error);
    }
  }

  /**
   * Logout from patient portal
   */
  async logout(): Promise<void> {
    try {
      // Store last login date
      localStorage.setItem('lastPatientLogin', new Date().toISOString());

      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      this.handleError('Failed to logout', error);
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(message: string, error: unknown): void {
    console.error(message, error);
    this.error = message;

    this.errorHandlingService.handleError({
      type: LIMSErrorType.FHIR_ERROR,
      message,
      details: error,
      timestamp: new Date(),
      userId: this.currentUser?.practitioner.id,
      resourceType: 'PatientPortal'
    });
  }

  /**
   * Refresh portal data
   */
  async refreshData(): Promise<void> {
    if (this.currentUser) {
      await this.loadPatientData();
    }
  }

  /**
   * Get patient display name
   */
  getPatientDisplayName(): string {
    if (!this.patientData?.patient.name || this.patientData.patient.name.length === 0) {
      return 'Patient';
    }

    const name = this.patientData.patient.name[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';

    return `${given} ${family}`.trim() || 'Patient';
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string | undefined): string {
    if (!dateString) {
      return 'N/A';
    }

    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  }

  /**
   * Format datetime for display
   */
  formatDateTime(dateString: string | undefined): string {
    if (!dateString) {
      return 'N/A';
    }

    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  }

  /**
   * Open compose message modal
   */
  composeMessage(): void {
    this.newMessage = { subject: '', content: '' };
    this.showComposeModal = true;
  }

  /**
   * Close compose message modal
   */
  closeComposeModal(): void {
    this.showComposeModal = false;
    this.sendingMessage = false;
    this.newMessage = { subject: '', content: '' };
  }

  /**
   * Submit new message
   */
  async submitMessage(): Promise<void> {
    if (!(this.newMessage.subject.trim() && this.newMessage.content.trim())) {
      return;
    }

    this.sendingMessage = true;

    try {
      await this.sendMessage(this.newMessage.subject, this.newMessage.content);
      this.closeComposeModal();
    } catch (error) {
      this.handleError('Failed to send message', error);
    } finally {
      this.sendingMessage = false;
    }
  }

  /**
   * Edit profile (placeholder for future implementation)
   */
  editProfile(): void {
    // This would open a profile editing modal or navigate to edit page
    this.notificationService.showInfo('Profile Editing', 'Profile editing will be available in a future update');
  }
}