import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MedplumService } from '../medplum.service';
import { Basic } from '@medplum/fhirtypes';

export interface UserPreferences {
  userId: string;
  dashboard?: DashboardPreferences;
  ui?: UIPreferences;
  notifications?: NotificationPreferences;
  accessibility?: AccessibilityPreferences;
  lastUpdated: string;
}

export interface DashboardPreferences {
  layout?: Record<string, unknown>;
  hiddenWidgets?: string[];
  widgetConfigurations?: { [widgetId: string]: Record<string, unknown> };
  refreshInterval?: number;
  compactMode?: boolean;
  theme?: string;
  customizations?: Record<string, unknown>;
}

export interface UIPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: '12h' | '24h';
  density?: 'compact' | 'comfortable' | 'spacious';
  sidebarCollapsed?: boolean;
  showTooltips?: boolean;
}

export interface NotificationPreferences {
  email?: boolean;
  push?: boolean;
  sms?: boolean;
  criticalResults?: boolean;
  orderUpdates?: boolean;
  systemAlerts?: boolean;
  billingReminders?: boolean;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

export interface AccessibilityPreferences {
  highContrast?: boolean;
  largeText?: boolean;
  reducedMotion?: boolean;
  screenReader?: boolean;
  keyboardNavigation?: boolean;
  colorBlindSupport?: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

@Injectable({
  providedIn: 'root'
})
export class UserPreferencesService {
  private medplumService = inject(MedplumService);

  private preferencesCache = new Map<string, UserPreferences>();
  private preferencesSubject = new BehaviorSubject<UserPreferences | null>(null);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() { }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    // Check cache first
    const cachedPreferences = this.preferencesCache.get(userId);
    if (cachedPreferences) {
      return cachedPreferences;
    }

    try {
      // Load from FHIR resources
      const preferences = await this.loadPreferencesFromFHIR(userId);

      // Cache the preferences
      this.preferencesCache.set(userId, preferences);
      this.preferencesSubject.next(preferences);

      return preferences;
    } catch (error) {
      console.error('Failed to load user preferences:', error);

      // Return default preferences
      const defaultPreferences = this.getDefaultPreferences(userId);
      this.preferencesCache.set(userId, defaultPreferences);
      return defaultPreferences;
    }
  }

  /**
   * Save user preferences
   */
  async saveUserPreferences<T extends keyof UserPreferences>(
    userId: string,
    category: T,
    preferences: UserPreferences[T]
  ): Promise<void> {
    try {
      // Get current preferences
      const currentPreferences = await this.getUserPreferences(userId);

      // Update specific category
      const updatedPreferences: UserPreferences = {
        ...currentPreferences,
        [category]: preferences,
        lastUpdated: new Date().toISOString()
      };

      // Save to FHIR
      await this.savePreferencesToFHIR(userId, updatedPreferences);

      // Update cache
      this.preferencesCache.set(userId, updatedPreferences);
      this.preferencesSubject.next(updatedPreferences);

    } catch (error) {
      console.error('Failed to save user preferences:', error);
      throw error;
    }
  }

  /**
   * Clear user preferences for specific category
   */
  async clearUserPreferences(userId: string, category?: keyof UserPreferences): Promise<void> {
    try {
      if (category) {
        // Clear specific category
        const currentPreferences = await this.getUserPreferences(userId);
        const updatedPreferences: UserPreferences = {
          ...currentPreferences,
          [category]: undefined,
          lastUpdated: new Date().toISOString()
        };

        await this.savePreferencesToFHIR(userId, updatedPreferences);
        this.preferencesCache.set(userId, updatedPreferences);
        this.preferencesSubject.next(updatedPreferences);
      } else {
        // Clear all preferences
        const defaultPreferences = this.getDefaultPreferences(userId);
        await this.savePreferencesToFHIR(userId, defaultPreferences);
        this.preferencesCache.set(userId, defaultPreferences);
        this.preferencesSubject.next(defaultPreferences);
      }
    } catch (error) {
      console.error('Failed to clear user preferences:', error);
      throw error;
    }
  }

  /**
   * Get user preferences as observable
   */
  getUserPreferences$(userId: string): Observable<UserPreferences | null> {
    // Load preferences if not already loaded
    this.getUserPreferences(userId);
    return this.preferencesSubject.asObservable();
  }

  /**
   * Update dashboard widget configuration
   */
  async updateWidgetConfiguration(
    userId: string,
    widgetId: string,
    configuration: Record<string, unknown>
  ): Promise<void> {
    const preferences = await this.getUserPreferences(userId);

    if (!preferences.dashboard) {
      preferences.dashboard = {};
    }

    if (!preferences.dashboard.widgetConfigurations) {
      preferences.dashboard.widgetConfigurations = {};
    }

    preferences.dashboard.widgetConfigurations[widgetId] = configuration;

    await this.saveUserPreferences(userId, 'dashboard', preferences.dashboard);
  }

  /**
   * Toggle widget visibility
   */
  async toggleWidgetVisibility(userId: string, widgetId: string): Promise<void> {
    const preferences = await this.getUserPreferences(userId);

    if (!preferences.dashboard) {
      preferences.dashboard = {};
    }

    if (!preferences.dashboard.hiddenWidgets) {
      preferences.dashboard.hiddenWidgets = [];
    }

    const hiddenWidgets = preferences.dashboard.hiddenWidgets;
    const index = hiddenWidgets.indexOf(widgetId);

    if (index > -1) {
      hiddenWidgets.splice(index, 1);
    } else {
      hiddenWidgets.push(widgetId);
    }

    await this.saveUserPreferences(userId, 'dashboard', preferences.dashboard);
  }

  /**
   * Update UI theme
   */
  async updateTheme(userId: string, theme: 'light' | 'dark' | 'auto'): Promise<void> {
    const preferences = await this.getUserPreferences(userId);

    if (!preferences.ui) {
      preferences.ui = {};
    }

    preferences.ui.theme = theme;

    await this.saveUserPreferences(userId, 'ui', preferences.ui);
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    notifications: NotificationPreferences
  ): Promise<void> {
    await this.saveUserPreferences(userId, 'notifications', notifications);
  }

  /**
   * Update accessibility preferences
   */
  async updateAccessibilityPreferences(
    userId: string,
    accessibility: AccessibilityPreferences
  ): Promise<void> {
    await this.saveUserPreferences(userId, 'accessibility', accessibility);
  }

  /**
   * Load preferences from FHIR resources
   */
  private async loadPreferencesFromFHIR(userId: string): Promise<UserPreferences> {
    try {
      const bundle = await this.medplumService.searchResources('Basic', {
        code: 'http://lims.local/preferences|user-preferences',
        subject: `Practitioner/${userId}`
      });

      if (bundle.entry && bundle.entry.length > 0) {
        const preferencesResource = bundle.entry[0].resource as Basic;
        const preferencesExtension = preferencesResource?.extension?.find(
          ext => ext.url === 'http://lims.local/preferences/data'
        );

        if (preferencesExtension?.valueString) {
          const preferences = JSON.parse(preferencesExtension.valueString);
          return {
            ...preferences,
            userId
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load preferences from FHIR:', error);
    }

    return this.getDefaultPreferences(userId);
  }

  /**
   * Save preferences to FHIR resources
   */
  private async savePreferencesToFHIR(userId: string, preferences: UserPreferences): Promise<void> {
    try {
      const preferencesResource: Basic = {
        resourceType: 'Basic',
        id: `user-preferences-${userId}`,
        code: {
          coding: [{
            system: 'http://lims.local/preferences',
            code: 'user-preferences'
          }]
        },
        subject: {
          reference: `Practitioner/${userId}`
        },
        extension: [{
          url: 'http://lims.local/preferences/data',
          valueString: JSON.stringify(preferences)
        }],
        meta: {
          lastUpdated: new Date().toISOString()
        }
      };

      await this.medplumService.createResource(preferencesResource);
    } catch (error) {
      console.error('Failed to save preferences to FHIR:', error);
      throw error;
    }
  }

  /**
   * Get default preferences for a user
   */
  private getDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      dashboard: {
        refreshInterval: 30000,
        compactMode: false,
        theme: 'default',
        hiddenWidgets: [],
        widgetConfigurations: {}
      },
      ui: {
        theme: 'light',
        language: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateFormat: 'MM/dd/yyyy',
        timeFormat: '12h',
        density: 'comfortable',
        sidebarCollapsed: false,
        showTooltips: true
      },
      notifications: {
        email: true,
        push: true,
        sms: false,
        criticalResults: true,
        orderUpdates: true,
        systemAlerts: true,
        billingReminders: true,
        quietHours: {
          enabled: false,
          start: '22:00',
          end: '08:00'
        }
      },
      accessibility: {
        highContrast: false,
        largeText: false,
        reducedMotion: false,
        screenReader: false,
        keyboardNavigation: false,
        colorBlindSupport: 'none'
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Export user preferences
   */
  async exportPreferences(userId: string): Promise<string> {
    const preferences = await this.getUserPreferences(userId);
    return JSON.stringify(preferences, null, 2);
  }

  /**
   * Import user preferences
   */
  async importPreferences(userId: string, preferencesJson: string): Promise<void> {
    try {
      const preferences = JSON.parse(preferencesJson);
      preferences.userId = userId;
      preferences.lastUpdated = new Date().toISOString();

      await this.savePreferencesToFHIR(userId, preferences);
      this.preferencesCache.set(userId, preferences);
      this.preferencesSubject.next(preferences);
    } catch (error) {
      console.error('Failed to import preferences:', error);
      throw new Error('Invalid preferences format');
    }
  }

  /**
   * Clear cache for user
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.preferencesCache.delete(userId);
    } else {
      this.preferencesCache.clear();
    }
  }
}
