# LIMS Application Testing Guide

This document provides comprehensive information about testing the LIMS application, including unit tests, integration tests, and performance tests.

## Table of Contents

1. [Test Types](#test-types)
2. [Running Tests](#running-tests)
3. [Test Configuration](#test-configuration)
4. [Unit Tests](#unit-tests)
5. [Integration Tests](#integration-tests)
6. [Performance Tests](#performance-tests)
7. [Test Environment Setup](#test-environment-setup)
8. [CI/CD Integration](#cicd-integration)
9. [Troubleshooting](#troubleshooting)

## Test Types

### Unit Tests
- **Location**: `src/app/**/*.spec.ts` (excluding performance and integration test directories)
- **Purpose**: Test individual components, services, and functions in isolation
- **Framework**: Jasmine + Karma
- **Coverage**: Aim for >80% code coverage

### Integration Tests
- **Location**: `src/app/integration-tests/**/*.spec.ts`
- **Purpose**: Test interactions between components and external services
- **Includes**: Medplum API integration, workflow testing, external service integration

### Performance Tests
- **Location**: `src/app/performance-tests/**/*.spec.ts`
- **Purpose**: Validate application performance under various load conditions
- **Includes**: Load testing, database performance, WSI viewer performance

## Running Tests

### Quick Start
```bash
# Run all unit tests
npm run test:unit

# Run integration tests (requires environment setup)
npm run test:integration

# Run performance tests (requires environment setup)
npm run test:performance

# Run all tests
npm run test:all

# Run tests for CI/CD
npm run test:ci
```

### Individual Test Categories
```bash
# Unit tests only
ng test --include='src/app/**/*.spec.ts' --exclude='src/app/performance-tests/**/*.spec.ts' --exclude='src/app/integration-tests/**/*.spec.ts'

# Integration tests only
ng test --include='src/app/integration-tests/**/*.spec.ts'

# Performance tests only
ng test --karma-config=src/test-config/karma.performance.conf.js
```

### Watch Mode
```bash
# Watch unit tests during development
ng test

# Watch specific test file
ng test --include='src/app/services/auth.service.spec.ts'
```

## Test Configuration

### Environment Variables
Set these environment variables for integration and performance tests:

```bash
# Medplum Configuration
export MEDPLUM_TEST_PROJECT_ID="your-test-project-id"
export MEDPLUM_TEST_EMAIL="test@yourdomain.com"
export MEDPLUM_TEST_PASSWORD="your-test-password"

# External Services (for integration tests)
export CANDID_TEST_API_KEY="your-candid-api-key"
export CANDID_TEST_CLIENT_ID="your-candid-client-id"
export STRIPE_TEST_PUBLISHABLE_KEY="pk_test_..."
export STRIPE_TEST_SECRET_KEY="sk_test_..."

# Test Control
export ENABLE_INTEGRATION_TESTS="true"
export ENABLE_PERFORMANCE_TESTS="true"
export TEST_ENV="development" # or "staging", "performance"
```

### Test Environment Configuration
Edit `src/test-config/test-environment.ts` to configure different test environments:

- **Development**: Local testing with mock data
- **Staging**: Integration testing with staging services
- **Performance**: Performance testing with production-like load

## Unit Tests

### Service Tests
Unit tests for all services are located in `src/app/services/*.spec.ts`:

- `auth.service.spec.ts` - Authentication and authorization
- `billing.service.spec.ts` - Billing and payment processing
- `bot.service.spec.ts` - Workflow automation
- `error-handling.service.spec.ts` - Error management
- `retry.service.spec.ts` - Retry logic and resilience

### Key Testing Patterns

#### Service Testing with Mocks
```typescript
describe('AuthService', () => {
  let service: AuthService;
  let mockMedplumService: jasmine.SpyObj<MedplumService>;

  beforeEach(() => {
    const medplumSpy = jasmine.createSpyObj('MedplumService', ['signIn', 'signOut']);
    
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: MedplumService, useValue: medplumSpy }
      ]
    });

    service = TestBed.inject(AuthService);
    mockMedplumService = TestBed.inject(MedplumService) as jasmine.SpyObj<MedplumService>;
  });

  it('should authenticate user', async () => {
    mockMedplumService.signIn.and.returnValue(Promise.resolve({ login: 'test@example.com' }));
    
    const result = await service.login({
      email: 'test@example.com',
      password: 'password'
    });

    expect(result).toBe(true);
    expect(mockMedplumService.signIn).toHaveBeenCalled();
  });
});
```

#### Error Handling Tests
```typescript
it('should handle authentication errors', async () => {
  mockMedplumService.signIn.and.rejectWith(new Error('Invalid credentials'));
  
  const result = await service.login({
    email: 'invalid@example.com',
    password: 'wrongpassword'
  });

  expect(result).toBe(false);
  expect(mockErrorHandlingService.handleError).toHaveBeenCalled();
});
```

## Integration Tests

### Medplum Integration
Tests actual interactions with Medplum FHIR server:

```typescript
describe('Medplum Integration Tests', () => {
  beforeEach(() => {
    if (!INTEGRATION_TEST_CONFIG.enabled) {
      pending('Integration tests are disabled');
    }
  });

  it('should create and read patient', async () => {
    const patient = await medplumService.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Test'], family: 'Patient' }]
    });

    const readPatient = await medplumService.readResource('Patient', patient.id!);
    expect(readPatient.id).toBe(patient.id);
  });
});
```

### Workflow Integration
Tests complete end-to-end workflows:

```typescript
it('should complete histopathology workflow', async () => {
  // Create patient
  const patient = await medplumService.createResource(patientData);
  
  // Create service request
  const serviceRequest = await medplumService.createResource(serviceRequestData);
  
  // Create specimen
  const specimen = await medplumService.createResource(specimenData);
  
  // Create diagnostic report
  const report = await diagnosticReportService.createDiagnosticReport({
    patient,
    serviceRequest,
    specimen,
    observations: [],
    conclusion: 'Test conclusion'
  });

  expect(report.status).toBe('final');
});
```

### External Service Integration
Tests integration with Candid Health and Stripe:

```typescript
it('should submit claim to Candid Health', async () => {
  const submissionResult = await candidHealthService.submitClaim(testClaim);
  
  expect(submissionResult.success).toBe(true);
  expect(submissionResult.candidClaimId).toBeTruthy();
});
```

## Performance Tests

### Load Testing
Tests application performance under concurrent load:

```typescript
describe('Load Testing', () => {
  it('should handle concurrent patient creation', async () => {
    const result = await runLoadTest(
      'Concurrent Patient Creation',
      async () => {
        const patient = await medplumService.createResource(patientData);
        await addTestResource('Patient', patient.id!);
      },
      10, // concurrent users
      30000 // 30 seconds
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.errorRate).toBeLessThan(5);
  });
});
```

### Database Performance
Tests query performance and optimization:

```typescript
it('should perform complex searches efficiently', async () => {
  const result = await runDatabasePerformanceTest(
    'Complex Search Query',
    async () => {
      const startTime = performance.now();
      const patients = await medplumService.searchPatients({
        name: 'Test',
        birthdate: 'ge1980-01-01',
        gender: 'male'
      });
      const executionTime = performance.now() - startTime;
      
      return {
        queryType: 'complex-search',
        executionTime,
        resultCount: patients.length,
        success: true
      };
    }
  );

  expect(result.passed).toBe(true);
  expect(result.averageExecutionTime).toBeLessThan(1500);
});
```

### WSI Viewer Performance
Tests whole slide imaging viewer performance:

```typescript
it('should load images within performance thresholds', async () => {
  await component.loadImage(mockImagingStudy, mockSpecimen);
  const metrics = component.getPerformanceMetrics();

  expect(metrics.averageTileLoadTime).toBeLessThan(300);
  expect(metrics.currentMemoryUsage).toBeLessThan(500);
});
```

## Test Environment Setup

### Local Development
1. Install dependencies: `npm install`
2. Set environment variables (optional for unit tests)
3. Run tests: `npm run test:unit`

### Integration Testing
1. Set up Medplum test project
2. Configure environment variables
3. Enable integration tests: `export ENABLE_INTEGRATION_TESTS="true"`
4. Run tests: `npm run test:integration`

### Performance Testing
1. Set up performance test environment
2. Configure performance thresholds in `test-environment.ts`
3. Enable performance tests: `export ENABLE_PERFORMANCE_TESTS="true"`
4. Run tests: `npm run test:performance`

### Docker Environment
```dockerfile
# Dockerfile.test
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Set test environment
ENV NODE_ENV=test
ENV ENABLE_INTEGRATION_TESTS=true
ENV ENABLE_PERFORMANCE_TESTS=true

# Run tests
CMD ["npm", "run", "test:all"]
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci

  integration-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:integration
        env:
          MEDPLUM_TEST_PROJECT_ID: ${{ secrets.MEDPLUM_TEST_PROJECT_ID }}
          MEDPLUM_TEST_EMAIL: ${{ secrets.MEDPLUM_TEST_EMAIL }}
          MEDPLUM_TEST_PASSWORD: ${{ secrets.MEDPLUM_TEST_PASSWORD }}
          ENABLE_INTEGRATION_TESTS: true

  performance-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:performance
        env:
          TEST_ENV: performance
          ENABLE_PERFORMANCE_TESTS: true
```

### Jenkins Pipeline Example
```groovy
pipeline {
    agent any
    
    stages {
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Unit Tests') {
            steps {
                sh 'npm run test:ci'
            }
            post {
                always {
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'coverage',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                }
            }
        }
        
        stage('Integration Tests') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([
                    string(credentialsId: 'medplum-test-project-id', variable: 'MEDPLUM_TEST_PROJECT_ID'),
                    string(credentialsId: 'medplum-test-email', variable: 'MEDPLUM_TEST_EMAIL'),
                    string(credentialsId: 'medplum-test-password', variable: 'MEDPLUM_TEST_PASSWORD')
                ]) {
                    sh 'ENABLE_INTEGRATION_TESTS=true npm run test:integration'
                }
            }
        }
        
        stage('Performance Tests') {
            when {
                branch 'main'
            }
            steps {
                sh 'TEST_ENV=performance ENABLE_PERFORMANCE_TESTS=true npm run test:performance'
            }
        }
    }
}
```

## Troubleshooting

### Common Issues

#### Tests Timing Out
```bash
# Increase timeout for specific tests
it('should handle long operation', async () => {
  // Test implementation
}, 60000); // 60 second timeout

# Or set global timeout in karma.conf.js
client: {
  jasmine: {
    DEFAULT_TIMEOUT_INTERVAL: 60000
  }
}
```

#### Memory Issues in Performance Tests
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 node_modules/.bin/ng test

# Or in karma configuration
customLaunchers: {
  ChromeHeadlessPerformance: {
    base: 'ChromeHeadless',
    flags: ['--max-old-space-size=4096']
  }
}
```

#### Integration Test Failures
1. Verify environment variables are set correctly
2. Check network connectivity to external services
3. Ensure test data cleanup is working properly
4. Verify API credentials and permissions

#### Performance Test Inconsistencies
1. Run tests on dedicated hardware when possible
2. Close other applications during testing
3. Use consistent test data sizes
4. Account for network latency variations

### Debug Mode
```bash
# Run tests with debug output
ng test --browsers=Chrome --watch=true

# Enable verbose logging
export DEBUG=true
npm run test:integration
```

### Test Data Management
```typescript
// Clean up test resources
afterEach(async () => {
  for (const resource of testResources.reverse()) {
    try {
      await medplumService.deleteResource(resource.type, resource.id);
    } catch (error) {
      console.warn(`Failed to clean up ${resource.type}/${resource.id}:`, error);
    }
  }
});
```

## Best Practices

### Unit Testing
- Mock external dependencies
- Test both success and error scenarios
- Use descriptive test names
- Keep tests focused and isolated
- Aim for high code coverage

### Integration Testing
- Use real services when possible
- Clean up test data after each test
- Test complete workflows
- Verify data consistency
- Handle network failures gracefully

### Performance Testing
- Use consistent test environments
- Monitor system resources
- Set realistic performance thresholds
- Test under various load conditions
- Document performance baselines

### General Testing
- Write tests before implementing features (TDD)
- Keep tests maintainable and readable
- Use page objects for UI testing
- Implement proper error handling
- Regular test maintenance and updates

## Metrics and Reporting

### Coverage Reports
- Unit test coverage: `coverage/index.html`
- Integration test coverage: `coverage/integration/index.html`
- Performance test results: Console output and JSON exports

### Performance Metrics
- Response times (average, p95, p99)
- Throughput (requests per second)
- Error rates
- Memory usage
- Resource utilization

### Continuous Monitoring
- Set up alerts for test failures
- Track performance trends over time
- Monitor test execution times
- Review and update test thresholds regularly