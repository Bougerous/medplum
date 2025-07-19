// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  medplumBaseUrl: 'https://api.medplum.com/',
  medplumClientId: '', // Set this in your local environment
  medplumProjectId: '', // Set this in your local environment
  recaptchaSiteKey: '', // Set this if using reCAPTCHA
  enableDebugLogging: true,
  apiTimeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000 // 1 second base delay
};