import { TestBed } from '@angular/core/testing';
import { MedplumService } from '../medplum.service';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { DiagnosticReportService } from '../services/diagnostic-report.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { RetryService } from '../services/retry.service';
import {
  Patient,
  Specimen,
  ServiceRequest,
  DiagnosticReport,
  Observation
} from '@medplum/fhirtypes';

// Performance test configuration
const PERFORMANCE_TEST_CONFIG = {
  enabled: false, // Set to true when running performance tests
  baseUrl: 'https://api.medplum.com/',
  testProjectId: 'test-project-id',
  testCredentials: {
    email: 'test@example.com',
    password: 'test-password'
  },
  loadTest: {
    concurrentUsers: 10,
    testDurationMs: 30000, // 30 seconds
    rampUpTimeMs: 5000, // 5 seconds
    maxResponseTimeMs: 2000, // 2 seconds
    minThroughputPerSecond: 5
  }
};

interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughputPerSecond: number;
  errorRate: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

interface LoadTestResult {
  testName: string;
  duration: number;
  metrics: PerformanceMetrics;
  passed: boolean;
  errors: string[];
}

describe('Load Testing', () => {
  let medplumService: MedplumService;
  let authService: AuthService;
  let billingService: BillingService;
  let diagnosticReportService: DiagnosticReportService;

  // Test resources to clean up
  let testResources: { type: string; id: string }[] = [];

  beforeEach(() => {
    if (!PERFORMANCE_TEST_CONFIG.enabled) {
      pending('Performance tests are disabled. Set PERFORMANCE_TEST_CONFIG.enabled = true to run.');
    }

    TestBed.configureTestingModule({
      providers: [
        MedplumService,
        AuthService,
        BillingService,
        DiagnosticReportService,
        ErrorHandlingService,
        RetryService
      ]
    });

    medplumService = TestBed.inject(MedplumService);
    authService = TestBed.inject(AuthService);
    billingService = TestBed.inject(BillingService);
    diagnosticReportService = TestBed.inject(DiagnosticReportService);

    testResources = [];
  });

  afterEach(async () => {
    if (PERFORMANCE_TEST_CONFIG.enabled) {
      // Clean up test resources
      for (const resource of testResources.reverse()) {
        try {
          await medplumService.deleteResource(resource.type, resource.id);
        } catch (error) {
          console.warn(`Failed to clean up ${resource.type}/${resource.id}:`, error);
        }
      }
    }
  });

  async function addTestResource(type: string, id: string): Promise<void> {
    testResources.push({ type, id });
  }

  async function runLoadTest(
    testName: string,
    testFunction: () => Promise<void>,
    concurrentUsers: number = PERFORMANCE_TEST_CONFIG.loadTest.concurrentUsers,
    durationMs: number = PERFORMANCE_TEST_CONFIG.loadTest.testDurationMs
  ): Promise<LoadTestResult> {
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    const responseTimes: number[] = [];
    const errors: string[] = [];
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;

    // Create concurrent user promises
    const userPromises: Promise<void>[] = [];

    for (let user = 0; user < concurrentUsers; user++) {
      const userPromise = (async () => {
        while (Date.now() < endTime) {
          const requestStart = Date.now();
          totalRequests++;

          try {
            await testFunction();
            const responseTime = Date.now() - requestStart;
            responseTimes.push(responseTime);
            successfulRequests++;

            // Check response time threshold
            if (responseTime > PERFORMANCE_TEST_CONFIG.loadTest.maxResponseTimeMs) {
              errors.push(`Response time ${responseTime}ms exceeded threshold ${PERFORMANCE_TEST_CONFIG.loadTest.maxResponseTimeMs}ms`);
            }
          } catch (error) {
            failedRequests++;
            errors.push(`Request failed: ${(error as Error).message}`);
          }

          // Small delay to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      })();

      userPromises.push(userPromise);

      // Ramp up users gradually
      if (user < concurrentUsers - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, PERFORMANCE_TEST_CONFIG.loadTest.rampUpTimeMs / concurrentUsers)
        );
      }
    }

    // Wait for all users to complete
    await Promise.all(userPromises);

    const actualDuration = Date.now() - startTime;
    const throughputPerSecond = totalRequests / (actualDuration / 1000);

    // Calculate percentiles
    responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    const metrics: PerformanceMetrics = {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0,
      minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      throughputPerSecond,
      errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      p95ResponseTime: responseTimes.length > 0 ? responseTimes[p95Index] : 0,
      p99ResponseTime: responseTimes.length > 0 ? responseTimes[p99Index] : 0
    };

    // Determine if test passed
    const passed = 
      metrics.errorRate < 5 && // Less than 5% error rate
      metrics.averageResponseTime < PERFORMANCE_TEST_CONFIG.loadTest.maxResponseTimeMs &&
      metrics.throughputPerSecond >= PERFORMANCE_TEST_CONFIG.loadTest.minThroughputPerSecond;

    return {
      testName,
      duration: actualDuration,
      metrics,
      passed,
      errors: [...new Set(errors)] // Remove duplicates
    };
  }

  function logLoadTestResults(result: LoadTestResult): void {
    console.log(`\n=== Load Test Results: ${result.testName} ===`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Total Requests: ${result.metrics.totalRequests}`);
    console.log(`Successful Requests: ${result.metrics.successfulRequests}`);
    console.log(`Failed Requests: ${result.metrics.failedRequests}`);
    console.log(`Error Rate: ${result.metrics.errorRate.toFixed(2)}%`);
    console.log(`Average Response Time: ${result.metrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`Min Response Time: ${result.metrics.minResponseTime}ms`);
    console.log(`Max Response Time: ${result.metrics.maxResponseTime}ms`);
    console.log(`P95 Response Time: ${result.metrics.p95ResponseTime}ms`);
    console.log(`P99 Response Time: ${result.metrics.p99ResponseTime}ms`);
    console.log(`Throughput: ${result.metrics.throughputPerSecond.toFixed(2)} requests/second`);
    console.log(`Test Passed: ${result.passed}`);
    
    if (result.errors.length > 0) {
      console.log(`Errors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach(error => console.log(`  - ${error}`));
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }
    console.log('=====================================\n');
  }

  describe('Authentication Load Tests', () => {
    it('should handle concurrent authentication requests', async () => {
      const result = await runLoadTest(
        'Concurrent Authentication',
        async () => {
          await authService.login({
            email: PERFORMANCE_TEST_CONFIG.testCredentials.email,
            password: PERFORMANCE_TEST_CONFIG.testCredentials.password,
            projectId: PERFORMANCE_TEST_CONFIG.testProjectId
          });
          await authService.logout();
        },
        5, // Lower concurrency for auth tests
        15000 // 15 seconds
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(5);
      expect(result.metrics.averageResponseTime).toBeLessThan(PERFORMANCE_TEST_CONFIG.loadTest.maxResponseTimeMs);
    });
  });

  describe('Patient Resource Load Tests', () => {
    beforeEach(async () => {
      await authService.login({
        email: PERFORMANCE_TEST_CONFIG.testCredentials.email,
        password: PERFORMANCE_TEST_CONFIG.testCredentials.password,
        projectId: PERFORMANCE_TEST_CONFIG.testProjectId
      });
    });

    it('should handle concurrent patient creation', async () => {
      let patientCounter = 0;

      const result = await runLoadTest(
        'Concurrent Patient Creation',
        async () => {
          const patientData: Patient = {
            resourceType: 'Patient',
            name: [{ given: ['Load'], family: `Test${++patientCounter}` }],
            birthDate: '1990-01-01',
            identifier: [{
              system: 'http://lims.local/load-test',
              value: `LOAD-TEST-${Date.now()}-${Math.random()}`
            }]
          };

          const patient = await medplumService.createResource(patientData);
          await addTestResource('Patient', patient.id!);
        }
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(10); // Allow slightly higher error rate for creation
    });

    it('should handle concurrent patient searches', async () => {
      // Create some test patients first
      const testPatients: Patient[] = [];
      for (let i = 0; i < 5; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Search'], family: `Test${i}` }],
          birthDate: '1985-01-01'
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }

      const result = await runLoadTest(
        'Concurrent Patient Search',
        async () => {
          await medplumService.searchPatients({
            name: 'Search',
            birthdate: 'ge1980-01-01'
          });
        }
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(5);
    });
  });

  describe('Specimen Workflow Load Tests', () => {
    let testPatients: Patient[] = [];

    beforeEach(async () => {
      await authService.login({
        email: PERFORMANCE_TEST_CONFIG.testCredentials.email,
        password: PERFORMANCE_TEST_CONFIG.testCredentials.password,
        projectId: PERFORMANCE_TEST_CONFIG.testProjectId
      });

      // Create test patients for specimen workflows
      for (let i = 0; i < 3; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Specimen'], family: `Workflow${i}` }],
          birthDate: '1980-01-01'
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }
    });

    it('should handle concurrent specimen creation', async () => {
      let specimenCounter = 0;

      const result = await runLoadTest(
        'Concurrent Specimen Creation',
        async () => {
          const patient = testPatients[specimenCounter % testPatients.length];
          
          const specimenData: Specimen = {
            resourceType: 'Specimen',
            status: 'available',
            type: {
              coding: [{
                system: 'http://snomed.info/sct',
                code: '119376003',
                display: 'Tissue specimen'
              }]
            },
            subject: { reference: `Patient/${patient.id}` },
            accessionIdentifier: {
              system: 'http://lims.local/load-test',
              value: `SPEC-LOAD-${Date.now()}-${++specimenCounter}`
            }
          };

          const specimen = await medplumService.createResource(specimenData);
          await addTestResource('Specimen', specimen.id!);
        }
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(10);
    });

    it('should handle concurrent diagnostic report generation', async () => {
      // Create some specimens first
      const testSpecimens: Specimen[] = [];
      for (const patient of testPatients) {
        const specimen = await medplumService.createResource({
          resourceType: 'Specimen',
          status: 'available',
          type: {
            coding: [{
              system: 'http://snomed.info/sct',
              code: '119376003',
              display: 'Tissue specimen'
            }]
          },
          subject: { reference: `Patient/${patient.id}` },
          accessionIdentifier: {
            value: `DIAG-LOAD-${Date.now()}-${Math.random()}`
          }
        });
        testSpecimens.push(specimen);
        await addTestResource('Specimen', specimen.id!);
      }

      let reportCounter = 0;

      const result = await runLoadTest(
        'Concurrent Diagnostic Report Creation',
        async () => {
          const specimen = testSpecimens[reportCounter % testSpecimens.length];
          const patient = testPatients[reportCounter % testPatients.length];

          const reportData: DiagnosticReport = {
            resourceType: 'DiagnosticReport',
            status: 'final',
            category: [{
              coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
                code: 'LAB',
                display: 'Laboratory'
              }]
            }],
            code: {
              coding: [{
                system: 'http://loinc.org',
                code: '33747-0',
                display: 'Histopathology study'
              }]
            },
            subject: { reference: `Patient/${patient.id}` },
            specimen: [{ reference: `Specimen/${specimen.id}` }],
            effectiveDateTime: new Date().toISOString(),
            issued: new Date().toISOString(),
            conclusion: `Load test diagnostic report ${++reportCounter}`
          };

          const report = await medplumService.createResource(reportData);
          await addTestResource('DiagnosticReport', report.id!);
        },
        8, // Slightly lower concurrency for complex operations
        20000 // 20 seconds
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(15); // Allow higher error rate for complex operations
    });
  });

  describe('Search Performance Tests', () => {
    beforeEach(async () => {
      await authService.login({
        email: PERFORMANCE_TEST_CONFIG.testCredentials.email,
        password: PERFORMANCE_TEST_CONFIG.testCredentials.password,
        projectId: PERFORMANCE_TEST_CONFIG.testProjectId
      });
    });

    it('should handle concurrent complex searches', async () => {
      const searchQueries = [
        { name: 'Load', birthdate: 'ge1980-01-01' },
        { name: 'Test', birthdate: 'le2000-01-01' },
        { family: 'Workflow', gender: 'unknown' },
        { identifier: 'http://lims.local/load-test|LOAD' },
        { _lastUpdated: 'ge2024-01-01' }
      ];

      let queryCounter = 0;

      const result = await runLoadTest(
        'Concurrent Complex Searches',
        async () => {
          const query = searchQueries[queryCounter % searchQueries.length];
          queryCounter++;
          await medplumService.searchPatients(query);
        }
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(5);
      expect(result.metrics.averageResponseTime).toBeLessThan(1000); // Searches should be fast
    });
  });

  describe('Batch Operations Load Tests', () => {
    beforeEach(async () => {
      await authService.login({
        email: PERFORMANCE_TEST_CONFIG.testCredentials.email,
        password: PERFORMANCE_TEST_CONFIG.testCredentials.password,
        projectId: PERFORMANCE_TEST_CONFIG.testProjectId
      });
    });

    it('should handle concurrent batch operations', async () => {
      let batchCounter = 0;

      const result = await runLoadTest(
        'Concurrent Batch Operations',
        async () => {
          const batchBundle = {
            resourceType: 'Bundle' as const,
            type: 'batch' as const,
            entry: [
              {
                request: {
                  method: 'POST' as const,
                  url: 'Patient'
                },
                resource: {
                  resourceType: 'Patient' as const,
                  name: [{ given: ['Batch'], family: `Test${++batchCounter}` }],
                  birthDate: '1990-01-01'
                }
              },
              {
                request: {
                  method: 'POST' as const,
                  url: 'Patient'
                },
                resource: {
                  resourceType: 'Patient' as const,
                  name: [{ given: ['Batch'], family: `Test${++batchCounter}` }],
                  birthDate: '1991-01-01'
                }
              }
            ]
          };

          const result = await medplumService.executeBatch(batchBundle);
          
          // Add created resources for cleanup
          for (const entry of result.entry || []) {
            if (entry.response?.status?.startsWith('201') && entry.response.location) {
              const resourceId = entry.response.location.split('/').pop();
              if (resourceId) {
                await addTestResource('Patient', resourceId);
              }
            }
          }
        },
        5, // Lower concurrency for batch operations
        15000 // 15 seconds
      );

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(result.metrics.errorRate).toBeLessThan(10);
    });
  });

  describe('Memory and Resource Usage Tests', () => {
    it('should not have memory leaks during extended operations', async () => {
      await authService.login({
        email: PERFORMANCE_TEST_CONFIG.testCredentials.email,
        password: PERFORMANCE_TEST_CONFIG.testCredentials.password,
        projectId: PERFORMANCE_TEST_CONFIG.testProjectId
      });

      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      let maxMemory = initialMemory;
      let operationCount = 0;

      const result = await runLoadTest(
        'Memory Usage Test',
        async () => {
          // Perform various operations
          const patient = await medplumService.createResource({
            resourceType: 'Patient',
            name: [{ given: ['Memory'], family: `Test${++operationCount}` }],
            birthDate: '1990-01-01'
          });

          await medplumService.searchPatients({ name: 'Memory' });
          await medplumService.deleteResource('Patient', patient.id!);

          // Track memory usage
          const currentMemory = (performance as any).memory?.usedJSHeapSize || 0;
          maxMemory = Math.max(maxMemory, currentMemory);

          // Force garbage collection periodically (if available)
          if (operationCount % 100 === 0 && (window as any).gc) {
            (window as any).gc();
          }
        },
        3, // Lower concurrency for memory testing
        30000 // 30 seconds
      );

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      console.log(`Memory Usage Analysis:`);
      console.log(`Initial Memory: ${(initialMemory / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Final Memory: ${(finalMemory / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Max Memory: ${(maxMemory / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Memory Growth: ${memoryGrowthMB.toFixed(2)} MB`);
      console.log(`Operations Performed: ${operationCount}`);

      logLoadTestResults(result);
      expect(result.passed).toBe(true);
      expect(memoryGrowthMB).toBeLessThan(50); // Memory growth should be reasonable
    });
  });
});