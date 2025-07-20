import { TestBed } from '@angular/core/testing';
import {
  Bundle, 
  Patient,
  Specimen
} from '@medplum/fhirtypes';
import { MedplumService } from '../medplum.service';
import { AuthService } from '../services/auth.service';
import { ErrorHandlingService } from '../services/error-handling.service';
import { RetryService } from '../services/retry.service';

// Database performance test configuration
const DB_PERFORMANCE_CONFIG = {
  enabled: false, // Set to true when running database performance tests
  baseUrl: 'https://api.medplum.com/',
  testProjectId: 'test-project-id',
  testCredentials: {
    email: 'test@example.com',
    password: 'test-password'
  },
  thresholds: {
    singleQueryMaxTime: 500, // 500ms
    bulkQueryMaxTime: 2000, // 2 seconds
    complexQueryMaxTime: 1500, // 1.5 seconds
    batchOperationMaxTime: 3000, // 3 seconds
    maxConcurrentQueries: 20,
    minThroughputPerSecond: 10
  },
  testDataSizes: {
    small: 100,
    medium: 1000,
    large: 5000
  }
};

interface QueryPerformanceMetrics {
  queryType: string;
  executionTime: number;
  resultCount: number;
  success: boolean;
  error?: string;
}

interface DatabasePerformanceResult {
  testName: string;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  p95ExecutionTime: number;
  throughputPerSecond: number;
  passed: boolean;
  metrics: QueryPerformanceMetrics[];
}

describe('Database Performance Tests', () => {
  let medplumService: MedplumService;
  let authService: AuthService;
  let _errorHandlingService: ErrorHandlingService;

  // Test resources to clean up
  let testResources: { type: string; id: string }[] = [];

  beforeEach(() => {
    if (!DB_PERFORMANCE_CONFIG.enabled) {
      pending('Database performance tests are disabled. Set DB_PERFORMANCE_CONFIG.enabled = true to run.');
    }

    TestBed.configureTestingModule({
      providers: [
        MedplumService,
        AuthService,
        ErrorHandlingService,
        RetryService
      ]
    });

    medplumService = TestBed.inject(MedplumService);
    authService = TestBed.inject(AuthService);
    _errorHandlingService = TestBed.inject(ErrorHandlingService);

    testResources = [];
  });

  afterEach(async () => {
    if (DB_PERFORMANCE_CONFIG.enabled) {
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

  async function runDatabasePerformanceTest(
    testName: string,
    queryFunction: () => Promise<QueryPerformanceMetrics>,
    iterations: number = 100
  ): Promise<DatabasePerformanceResult> {
    const startTime = Date.now();
    const metrics: QueryPerformanceMetrics[] = [];
    let successfulQueries = 0;
    let failedQueries = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const metric = await queryFunction();
        metrics.push(metric);
        
        if (metric.success) {
          successfulQueries++;
        } else {
          failedQueries++;
        }
      } catch (error) {
        failedQueries++;
        metrics.push({
          queryType: 'unknown',
          executionTime: 0,
          resultCount: 0,
          success: false,
          error: (error as Error).message
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const executionTimes = metrics.filter(m => m.success).map(m => m.executionTime);
    
    executionTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(executionTimes.length * 0.95);

    const result: DatabasePerformanceResult = {
      testName,
      totalQueries: iterations,
      successfulQueries,
      failedQueries,
      averageExecutionTime: executionTimes.length > 0 ? 
        executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length : 0,
      minExecutionTime: executionTimes.length > 0 ? Math.min(...executionTimes) : 0,
      maxExecutionTime: executionTimes.length > 0 ? Math.max(...executionTimes) : 0,
      p95ExecutionTime: executionTimes.length > 0 ? executionTimes[p95Index] : 0,
      throughputPerSecond: (successfulQueries / totalTime) * 1000,
      passed: false,
      metrics
    };

    // Determine if test passed based on thresholds
    result.passed = 
      result.averageExecutionTime < DB_PERFORMANCE_CONFIG.thresholds.singleQueryMaxTime &&
      result.throughputPerSecond >= DB_PERFORMANCE_CONFIG.thresholds.minThroughputPerSecond &&
      (result.failedQueries / result.totalQueries) < 0.05; // Less than 5% failure rate

    return result;
  }

  function logDatabasePerformanceResults(result: DatabasePerformanceResult): void {
    console.log(`\n=== Database Performance Results: ${result.testName} ===`);
    console.log(`Total Queries: ${result.totalQueries}`);
    console.log(`Successful Queries: ${result.successfulQueries}`);
    console.log(`Failed Queries: ${result.failedQueries}`);
    console.log(`Average Execution Time: ${result.averageExecutionTime.toFixed(2)}ms`);
    console.log(`Min Execution Time: ${result.minExecutionTime}ms`);
    console.log(`Max Execution Time: ${result.maxExecutionTime}ms`);
    console.log(`P95 Execution Time: ${result.p95ExecutionTime}ms`);
    console.log(`Throughput: ${result.throughputPerSecond.toFixed(2)} queries/second`);
    console.log(`Test Passed: ${result.passed}`);
    console.log('================================================\n');
  }

  describe('Basic Query Performance', () => {
    beforeEach(async () => {
      await authService.login({
        email: DB_PERFORMANCE_CONFIG.testCredentials.email,
        password: DB_PERFORMANCE_CONFIG.testCredentials.password,
        projectId: DB_PERFORMANCE_CONFIG.testProjectId
      });
    });

    it('should perform single resource reads efficiently', async () => {
      // Create test patient first
      const testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['DB'], family: 'Performance' }],
        birthDate: '1990-01-01'
      });
      await addTestResource('Patient', testPatient.id!);

      const result = await runDatabasePerformanceTest(
        'Single Resource Read',
        async (): Promise<QueryPerformanceMetrics> => {
          const startTime = performance.now();
          
          try {
            const patient = await medplumService.readResource<Patient>('Patient', testPatient.id!);
            const executionTime = performance.now() - startTime;
            
            return {
              queryType: 'read',
              executionTime,
              resultCount: 1,
              success: !!patient.id
            };
          } catch (error) {
            return {
              queryType: 'read',
              executionTime: performance.now() - startTime,
              resultCount: 0,
              success: false,
              error: (error as Error).message
            };
          }
        },
        50
      );

      logDatabasePerformanceResults(result);
      expect(result.passed).toBe(true);
      expect(result.averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.singleQueryMaxTime);
    });

    it('should perform simple searches efficiently', async () => {
      // Create test data
      const testPatients: Patient[] = [];
      for (let i = 0; i < 10; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Search'], family: `Test${i}` }],
          birthDate: '1985-01-01'
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }

      const result = await runDatabasePerformanceTest(
        'Simple Search Query',
        async (): Promise<QueryPerformanceMetrics> => {
          const startTime = performance.now();
          
          try {
            const patients = await medplumService.searchPatients({
              name: 'Search',
              birthdate: 'ge1980-01-01'
            });
            const executionTime = performance.now() - startTime;
            
            return {
              queryType: 'search',
              executionTime,
              resultCount: patients.length,
              success: true
            };
          } catch (error) {
            return {
              queryType: 'search',
              executionTime: performance.now() - startTime,
              resultCount: 0,
              success: false,
              error: (error as Error).message
            };
          }
        },
        30
      );

      logDatabasePerformanceResults(result);
      expect(result.passed).toBe(true);
      expect(result.averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.singleQueryMaxTime);
    });
  });

  describe('Complex Query Performance', () => {
    beforeEach(async () => {
      await authService.login({
        email: DB_PERFORMANCE_CONFIG.testCredentials.email,
        password: DB_PERFORMANCE_CONFIG.testCredentials.password,
        projectId: DB_PERFORMANCE_CONFIG.testProjectId
      });
    });

    it('should handle complex multi-parameter searches', async () => {
      // Create test data with various attributes
      const testPatients: Patient[] = [];
      for (let i = 0; i < 20; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Complex'], family: `Search${i}` }],
          birthDate: `198${i % 10}-0${(i % 9) + 1}-01`,
          gender: i % 2 === 0 ? 'male' : 'female',
          identifier: [{
            system: 'http://lims.local/patient-id',
            value: `COMPLEX-${i.toString().padStart(3, '0')}`
          }]
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }

      const result = await runDatabasePerformanceTest(
        'Complex Multi-Parameter Search',
        async (): Promise<QueryPerformanceMetrics> => {
          const startTime = performance.now();
          
          try {
            const patients = await medplumService.searchResources<Patient>('Patient', {
              name: 'Complex',
              birthdate: 'ge1980-01-01',
              gender: 'male',
              identifier: 'http://lims.local/patient-id|COMPLEX',
              _sort: 'birthdate',
              _count: '10'
            });
            const executionTime = performance.now() - startTime;
            
            return {
              queryType: 'complex-search',
              executionTime,
              resultCount: patients.entry?.length || 0,
              success: true
            };
          } catch (error) {
            return {
              queryType: 'complex-search',
              executionTime: performance.now() - startTime,
              resultCount: 0,
              success: false,
              error: (error as Error).message
            };
          }
        },
        20
      );

      logDatabasePerformanceResults(result);
      expect(result.passed).toBe(true);
      expect(result.averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.complexQueryMaxTime);
    });

    it('should handle resource relationship queries efficiently', async () => {
      // Create related resources
      const testPatient = await medplumService.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Relationship'], family: 'Test' }],
        birthDate: '1990-01-01'
      });
      await addTestResource('Patient', testPatient.id!);

      const testSpecimens: Specimen[] = [];
      for (let i = 0; i < 5; i++) {
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
          subject: { reference: `Patient/${testPatient.id}` },
          accessionIdentifier: { value: `REL-SPEC-${i}` }
        });
        testSpecimens.push(specimen);
        await addTestResource('Specimen', specimen.id!);
      }

      const result = await runDatabasePerformanceTest(
        'Resource Relationship Query',
        async (): Promise<QueryPerformanceMetrics> => {
          const startTime = performance.now();
          
          try {
            const specimens = await medplumService.searchSpecimens({
              subject: `Patient/${testPatient.id}`,
              status: 'available'
            });
            const executionTime = performance.now() - startTime;
            
            return {
              queryType: 'relationship-search',
              executionTime,
              resultCount: specimens.length,
              success: true
            };
          } catch (error) {
            return {
              queryType: 'relationship-search',
              executionTime: performance.now() - startTime,
              resultCount: 0,
              success: false,
              error: (error as Error).message
            };
          }
        },
        25
      );

      logDatabasePerformanceResults(result);
      expect(result.passed).toBe(true);
      expect(result.averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.complexQueryMaxTime);
    });
  });

  describe('Bulk Operations Performance', () => {
    beforeEach(async () => {
      await authService.login({
        email: DB_PERFORMANCE_CONFIG.testCredentials.email,
        password: DB_PERFORMANCE_CONFIG.testCredentials.password,
        projectId: DB_PERFORMANCE_CONFIG.testProjectId
      });
    });

    it('should handle batch create operations efficiently', async () => {
      const result = await runDatabasePerformanceTest(
        'Batch Create Operations',
        async (): Promise<QueryPerformanceMetrics> => {
          const startTime = performance.now();
          
          try {
            const batchBundle: Bundle = {
              resourceType: 'Bundle',
              type: 'batch',
              entry: []
            };

            // Create batch of 5 patients
            for (let i = 0; i < 5; i++) {
              batchBundle.entry?.push({
                request: {
                  method: 'POST',
                  url: 'Patient'
                },
                resource: {
                  resourceType: 'Patient',
                  name: [{ given: ['Batch'], family: `Create${i}` }],
                  birthDate: '1990-01-01'
                }
              });
            }

            const result = await medplumService.executeBatch(batchBundle);
            const executionTime = performance.now() - startTime;

            // Add created resources for cleanup
            for (const entry of result.entry || []) {
              if (entry.response?.status?.startsWith('201') && entry.response.location) {
                const resourceId = entry.response.location.split('/').pop();
                if (resourceId) {
                  await addTestResource('Patient', resourceId);
                }
              }
            }
            
            return {
              queryType: 'batch-create',
              executionTime,
              resultCount: result.entry?.length || 0,
              success: true
            };
          } catch (error) {
            return {
              queryType: 'batch-create',
              executionTime: performance.now() - startTime,
              resultCount: 0,
              success: false,
              error: (error as Error).message
            };
          }
        },
        10
      );

      logDatabasePerformanceResults(result);
      expect(result.passed).toBe(true);
      expect(result.averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.batchOperationMaxTime);
    });

    it('should handle large result set queries efficiently', async () => {
      // Create larger dataset
      const testPatients: Patient[] = [];
      for (let i = 0; i < 50; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Large'], family: `Dataset${i}` }],
          birthDate: '1985-01-01'
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }

      const result = await runDatabasePerformanceTest(
        'Large Result Set Query',
        async (): Promise<QueryPerformanceMetrics> => {
          const startTime = performance.now();
          
          try {
            const patients = await medplumService.searchResources<Patient>('Patient', {
              name: 'Large',
              _count: '100'
            });
            const executionTime = performance.now() - startTime;
            
            return {
              queryType: 'large-result-set',
              executionTime,
              resultCount: patients.entry?.length || 0,
              success: true
            };
          } catch (error) {
            return {
              queryType: 'large-result-set',
              executionTime: performance.now() - startTime,
              resultCount: 0,
              success: false,
              error: (error as Error).message
            };
          }
        },
        15
      );

      logDatabasePerformanceResults(result);
      expect(result.passed).toBe(true);
      expect(result.averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.bulkQueryMaxTime);
    });
  });

  describe('Concurrent Query Performance', () => {
    beforeEach(async () => {
      await authService.login({
        email: DB_PERFORMANCE_CONFIG.testCredentials.email,
        password: DB_PERFORMANCE_CONFIG.testCredentials.password,
        projectId: DB_PERFORMANCE_CONFIG.testProjectId
      });
    });

    it('should handle concurrent read operations', async () => {
      // Create test patients
      const testPatients: Patient[] = [];
      for (let i = 0; i < 10; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Concurrent'], family: `Read${i}` }],
          birthDate: '1990-01-01'
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }

      const concurrentQueries = 10;
      const startTime = performance.now();
      const queryPromises: Promise<QueryPerformanceMetrics>[] = [];

      for (let i = 0; i < concurrentQueries; i++) {
        const patient = testPatients[i % testPatients.length];
        
        queryPromises.push(
          (async (): Promise<QueryPerformanceMetrics> => {
            const queryStart = performance.now();
            
            try {
              const result = await medplumService.readResource<Patient>('Patient', patient.id!);
              const executionTime = performance.now() - queryStart;
              
              return {
                queryType: 'concurrent-read',
                executionTime,
                resultCount: 1,
                success: !!result.id
              };
            } catch (error) {
              return {
                queryType: 'concurrent-read',
                executionTime: performance.now() - queryStart,
                resultCount: 0,
                success: false,
                error: (error as Error).message
              };
            }
          })()
        );
      }

      const results = await Promise.all(queryPromises);
      const totalTime = performance.now() - startTime;

      const successfulQueries = results.filter(r => r.success).length;
      const averageExecutionTime = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.executionTime, 0) / successfulQueries;

      console.log('\n=== Concurrent Query Performance ===');
      console.log(`Concurrent Queries: ${concurrentQueries}`);
      console.log(`Successful Queries: ${successfulQueries}`);
      console.log(`Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(`Average Execution Time: ${averageExecutionTime.toFixed(2)}ms`);
      console.log(`Throughput: ${(successfulQueries / totalTime * 1000).toFixed(2)} queries/second`);
      console.log('=====================================\n');

      expect(successfulQueries).toBe(concurrentQueries);
      expect(averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.singleQueryMaxTime * 2);
    });

    it('should handle concurrent search operations', async () => {
      // Create test data
      for (let i = 0; i < 20; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Concurrent'], family: `Search${i}` }],
          birthDate: '1985-01-01'
        });
        await addTestResource('Patient', patient.id!);
      }

      const concurrentSearches = 8;
      const searchQueries = [
        { name: 'Concurrent', birthdate: 'ge1980-01-01' },
        { family: 'Search', gender: 'unknown' },
        { name: 'Concurrent', _sort: 'birthdate' },
        { birthdate: 'le2000-01-01', _count: '10' }
      ];

      const startTime = performance.now();
      const searchPromises: Promise<QueryPerformanceMetrics>[] = [];

      for (let i = 0; i < concurrentSearches; i++) {
        const query = searchQueries[i % searchQueries.length];
        
        searchPromises.push(
          (async (): Promise<QueryPerformanceMetrics> => {
            const queryStart = performance.now();
            
            try {
              const results = await medplumService.searchPatients(query);
              const executionTime = performance.now() - queryStart;
              
              return {
                queryType: 'concurrent-search',
                executionTime,
                resultCount: results.length,
                success: true
              };
            } catch (error) {
              return {
                queryType: 'concurrent-search',
                executionTime: performance.now() - queryStart,
                resultCount: 0,
                success: false,
                error: (error as Error).message
              };
            }
          })()
        );
      }

      const results = await Promise.all(searchPromises);
      const totalTime = performance.now() - startTime;

      const successfulQueries = results.filter(r => r.success).length;
      const averageExecutionTime = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.executionTime, 0) / successfulQueries;

      console.log('\n=== Concurrent Search Performance ===');
      console.log(`Concurrent Searches: ${concurrentSearches}`);
      console.log(`Successful Searches: ${successfulQueries}`);
      console.log(`Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(`Average Execution Time: ${averageExecutionTime.toFixed(2)}ms`);
      console.log(`Throughput: ${(successfulQueries / totalTime * 1000).toFixed(2)} searches/second`);
      console.log('======================================\n');

      expect(successfulQueries).toBe(concurrentSearches);
      expect(averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.complexQueryMaxTime);
    });
  });

  describe('Database Stress Testing', () => {
    beforeEach(async () => {
      await authService.login({
        email: DB_PERFORMANCE_CONFIG.testCredentials.email,
        password: DB_PERFORMANCE_CONFIG.testCredentials.password,
        projectId: DB_PERFORMANCE_CONFIG.testProjectId
      });
    });

    it('should handle sustained high query load', async () => {
      // Create test data
      const testPatients: Patient[] = [];
      for (let i = 0; i < 30; i++) {
        const patient = await medplumService.createResource({
          resourceType: 'Patient',
          name: [{ given: ['Stress'], family: `Test${i}` }],
          birthDate: '1990-01-01'
        });
        testPatients.push(patient);
        await addTestResource('Patient', patient.id!);
      }

      const testDuration = 10000; // 10 seconds
      const startTime = Date.now();
      const endTime = startTime + testDuration;
      const queryResults: QueryPerformanceMetrics[] = [];

      while (Date.now() < endTime) {
        const batchPromises: Promise<QueryPerformanceMetrics>[] = [];
        
        // Execute 5 concurrent queries
        for (let i = 0; i < 5; i++) {
          const patient = testPatients[Math.floor(Math.random() * testPatients.length)];
          
          batchPromises.push(
            (async (): Promise<QueryPerformanceMetrics> => {
              const queryStart = performance.now();
              
              try {
                if (Math.random() > 0.5) {
                  // Read operation
                  const result = await medplumService.readResource<Patient>('Patient', patient.id!);
                  return {
                    queryType: 'stress-read',
                    executionTime: performance.now() - queryStart,
                    resultCount: 1,
                    success: !!result.id
                  };
                } else {
                  // Search operation
                  const results = await medplumService.searchPatients({ name: 'Stress' });
                  return {
                    queryType: 'stress-search',
                    executionTime: performance.now() - queryStart,
                    resultCount: results.length,
                    success: true
                  };
                }
              } catch (error) {
                return {
                  queryType: 'stress-query',
                  executionTime: performance.now() - queryStart,
                  resultCount: 0,
                  success: false,
                  error: (error as Error).message
                };
              }
            })()
          );
        }

        const batchResults = await Promise.all(batchPromises);
        queryResults.push(...batchResults);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const actualDuration = Date.now() - startTime;
      const successfulQueries = queryResults.filter(r => r.success).length;
      const failedQueries = queryResults.filter(r => !r.success).length;
      const averageExecutionTime = queryResults
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.executionTime, 0) / successfulQueries;
      const throughput = (successfulQueries / actualDuration) * 1000;

      console.log('\n=== Database Stress Test Results ===');
      console.log(`Test Duration: ${actualDuration}ms`);
      console.log(`Total Queries: ${queryResults.length}`);
      console.log(`Successful Queries: ${successfulQueries}`);
      console.log(`Failed Queries: ${failedQueries}`);
      console.log(`Error Rate: ${((failedQueries / queryResults.length) * 100).toFixed(2)}%`);
      console.log(`Average Execution Time: ${averageExecutionTime.toFixed(2)}ms`);
      console.log(`Throughput: ${throughput.toFixed(2)} queries/second`);
      console.log('====================================\n');

      expect(failedQueries / queryResults.length).toBeLessThan(0.1); // Less than 10% error rate
      expect(averageExecutionTime).toBeLessThan(DB_PERFORMANCE_CONFIG.thresholds.singleQueryMaxTime * 3);
      expect(throughput).toBeGreaterThan(DB_PERFORMANCE_CONFIG.thresholds.minThroughputPerSecond / 2);
    }, 15000); // 15 second timeout
  });
});