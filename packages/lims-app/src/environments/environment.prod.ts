export const environment = {
  production: true,
  medplumBaseUrl: 'https://api.medplum.com/',
  medplumClientId: process.env['MEDPLUM_CLIENT_ID'] || '',
  medplumProjectId: process.env['MEDPLUM_PROJECT_ID'] || '',
  recaptchaSiteKey: process.env['RECAPTCHA_SITE_KEY'] || '',
  enableDebugLogging: false,
  apiTimeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000 // 1 second base delay
};