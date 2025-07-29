// Test environment configuration for different test types

export interface TestEnvironment {
  name: string;
  medplum: {
    baseUrl: string;
    projectId: string;
    credentials: {
      email: string;
      password: string;
    };
  };
  external: {
    candidHealth: {
      apiKey: string;
      baseUrl: string;
      clientId: string;
    };
    stripe: {
      publishableKey: string;
      secretKey: string;
      webhookSecret: string;
    };
  };
  performance: {
    enabled: boolean;
    thresholds: {
      responseTime: number;
      throughput: number;
      errorRate: number;
      memoryUsage: number;
    };
  };
}

// Development/Local testing environment
export const DEVELOPMENT_ENV: TestEnvironment = {
  name: 'development',
  medplum: {
    baseUrl: 'https://api.medplum.com/',
    projectId: process.env.MEDPLUM_TEST_PROJECT_ID || 'test-project-id',
    credentials: {
      email: process.env.MEDPLUM_TEST_EMAIL || 'test@example.com',
      password: process.env.MEDPLUM_TEST_PASSWORD || 'test-password'
    }
  },
  external: {
    candidHealth: {
      apiKey: process.env.CANDID_TEST_API_KEY || 'test-candid-key',
      baseUrl: 'https://api.candidhealth.com',
      clientId: process.env.CANDID_TEST_CLIENT_ID || 'test-client-id'
    },
    stripe: {
      publishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY || 'pk_test_...',
      secretKey: process.env.STRIPE_TEST_SECRET_KEY || 'sk_test_...',
      webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET || 'whsec_test_...'
    }
  },
  performance: {
    enabled: false, // Disabled by default for development
    thresholds: {
      responseTime: 2000,  // 2 seconds - lenient for development
      throughput: 5,       // 5 requests/second
      errorRate: 0.1,      // 10% error rate
      memoryUsage: 1000    // 1GB memory usage
    }
  }
};

// Staging environment for integration testing
export const STAGING_ENV: TestEnvironment = {
  name: 'staging',
  medplum: {
    baseUrl: process.env.MEDPLUM_STAGING_URL || 'https://staging-api.medplum.com/',
    projectId: process.env.MEDPLUM_STAGING_PROJECT_ID || 'staging-project-id',
    credentials: {
      email: process.env.MEDPLUM_STAGING_EMAIL || 'staging@example.com',
      password: process.env.MEDPLUM_STAGING_PASSWORD || 'staging-password'
    }
  },
  external: {
    candidHealth: {
      apiKey: process.env.CANDID_STAGING_API_KEY || 'staging-candid-key',
      baseUrl: 'https://staging-api.candidhealth.com',
      clientId: process.env.CANDID_STAGING_CLIENT_ID || 'staging-client-id'
    },
    stripe: {
      publishableKey: process.env.STRIPE_STAGING_PUBLISHABLE_KEY || 'pk_test_staging_...',
      secretKey: process.env.STRIPE_STAGING_SECRET_KEY || 'sk_test_staging_...',
      webhookSecret: process.env.STRIPE_STAGING_WEBHOOK_SECRET || 'whsec_staging_...'
    }
  },
  performance: {
    enabled: true, // Enabled for staging performance validation
    thresholds: {
      responseTime: 1000,  // 1 second
      throughput: 10,      // 10 requests/second
      errorRate: 0.05,     // 5% error rate
      memoryUsage: 500     // 500MB memory usage
    }
  }
};

// Production-like environment for performance testing
export const PERFORMANCE_ENV: TestEnvironment = {
  name: 'performance',
  medplum: {
    baseUrl: process.env.MEDPLUM_PERF_URL || 'https://perf-api.medplum.com/',
    projectId: process.env.MEDPLUM_PERF_PROJECT_ID || 'perf-project-id',
    credentials: {
      email: process.env.MEDPLUM_PERF_EMAIL || 'perf@example.com',
      password: process.env.MEDPLUM_PERF_PASSWORD || 'perf-password'
    }
  },
  external: {
    candidHealth: {
      apiKey: process.env.CANDID_PERF_API_KEY || 'perf-candid-key',
      baseUrl: 'https://api.candidhealth.com',
      clientId: process.env.CANDID_PERF_CLIENT_ID || 'perf-client-id'
    },
    stripe: {
      publishableKey: process.env.STRIPE_PERF_PUBLISHABLE_KEY || 'pk_test_perf_...',
      secretKey: process.env.STRIPE_PERF_SECRET_KEY || 'sk_test_perf_...',
      webhookSecret: process.env.STRIPE_PERF_WEBHOOK_SECRET || 'whsec_perf_...'
    }
  },
  performance: {
    enabled: true, // Always enabled for performance environment
    thresholds: {
      responseTime: 500,   // 500ms - strict for performance testing
      throughput: 20,      // 20 requests/second
      errorRate: 0.02,     // 2% error rate
      memoryUsage: 300     // 300MB memory usage
    }
  }
};

// Get current test environment based on NODE_ENV or TEST_ENV
export function getCurrentTestEnvironment(): TestEnvironment {
  const envName = process.env.TEST_ENV || process.env.NODE_ENV || 'development';

  switch (envName.toLowerCase()) {
    case 'staging':
      return STAGING_ENV;
    case 'performance':
    case 'perf':
      return PERFORMANCE_ENV;
    default:
      return DEVELOPMENT_ENV;
  }
}

// Test environment utilities
// Test environment utilities
export const TestEnvironmentUtils = {
  /**
   * Check if performance tests should be enabled
   */
  shouldRunPerformanceTests(): boolean {
    const env = getCurrentTestEnvironment();
    return env.performance.enabled || process.env.ENABLE_PERFORMANCE_TESTS === 'true';
  },

  /**
   * Check if integration tests should be enabled
   */
  shouldRunIntegrationTests(): boolean {
    return process.env.ENABLE_INTEGRATION_TESTS === 'true' ||
      process.env.TEST_ENV === 'staging' ||
      process.env.TEST_ENV === 'performance';
  },

  /**
   * Get test timeout based on environment
   */
  getTestTimeout(): number {
    const env = getCurrentTestEnvironment();

    switch (env.name) {
      case 'performance':
        return 120000; // 2 minutes for performance tests
      case 'staging':
        return 60000;  // 1 minute for staging tests
      default:
        return 30000;  // 30 seconds for development tests
    }
  },

  /**
   * Get concurrent user count for load testing
   */
  getConcurrentUsers(): number {
    const env = getCurrentTestEnvironment();

    switch (env.name) {
      case 'performance':
        return 20; // High load for performance testing
      case 'staging':
        return 10; // Medium load for staging
      default:
        return 5;  // Low load for development
    }
  },

  /**
   * Get test data size based on environment
   */
  getTestDataSize(): { small: number; medium: number; large: number } {
    const env = getCurrentTestEnvironment();

    switch (env.name) {
      case 'performance':
        return { small: 100, medium: 1000, large: 10000 };
      case 'staging':
        return { small: 50, medium: 500, large: 2000 };
      default:
        return { small: 10, medium: 100, large: 500 };
    }
  },

  /**
   * Validate environment configuration
   */
  validateEnvironment(): { valid: boolean; errors: string[] } {
    const env = getCurrentTestEnvironment();
    const errors: string[] = [
      ...this.validateMedplumConfig(env),
      ...this.validateExternalServices(env),
    ];

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validate Medplum configuration
   */
  validateMedplumConfig(env: TestEnvironment): string[] {
    const errors: string[] = [];
    if (!env.medplum.baseUrl || env.medplum.baseUrl === 'https://api.medplum.com/') {
      if (env.name !== 'development') {
        errors.push(`Invalid Medplum base URL for ${env.name} environment`);
      }
    }

    if (!env.medplum.projectId || env.medplum.projectId.includes('test-project-id')) {
      if (env.name !== 'development') {
        errors.push(`Invalid Medplum project ID for ${env.name} environment`);
      }
    }

    if (!env.medplum.credentials.email || env.medplum.credentials.email.includes('example.com')) {
      if (env.name !== 'development') {
        errors.push(`Invalid Medplum credentials for ${env.name} environment`);
      }
    }
    return errors;
  },

  /**
   * Validate external service configuration
   */
  validateExternalServices(env: TestEnvironment): string[] {
    const errors: string[] = [];
    if (env.performance.enabled) {
      if (env.external.candidHealth.apiKey.includes('test-') && env.name !== 'development') {
        errors.push(`Invalid Candid Health API key for ${env.name} environment`);
      }

      if (env.external.stripe.secretKey.includes('test_') && env.name === 'performance') {
        errors.push('Using test Stripe keys in performance environment');
      }
    }
    return errors;
  },

  /**
   * Print environment information
   */
  printEnvironmentInfo(): void {
    const env = getCurrentTestEnvironment();
    const validation = TestEnvironmentUtils.validateEnvironment();

    console.log('\n🔧 Test Environment Configuration');
    console.log('=====================================');
    console.log(`Environment: ${env.name}`);
    console.log(`Medplum Base URL: ${env.medplum.baseUrl}`);
    console.log(`Performance Tests: ${env.performance.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`Integration Tests: ${TestEnvironmentUtils.shouldRunIntegrationTests() ? 'Enabled' : 'Disabled'}`);
    console.log(`Test Timeout: ${TestEnvironmentUtils.getTestTimeout()}ms`);
    console.log(`Concurrent Users: ${TestEnvironmentUtils.getConcurrentUsers()}`);

    if (validation.valid) {
      console.log('✅ Environment configuration is valid');
    } else {
      console.log('❌ Environment configuration issues:');
      for (const error of validation.errors) {
        console.log(`   - ${error}`);
      }
    }
    console.log('=====================================');
  }
};

// Export current environment as default
export default getCurrentTestEnvironment();