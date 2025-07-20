import { TestBed } from '@angular/core/testing';
import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RetryService]
    });
    service = TestBed.inject(RetryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Basic Retry Logic', () => {
    it('should execute operation successfully on first try', async () => {
      const mockOperation = jasmine.createSpy('operation').and.returnValue(Promise.resolve('success'));

      const result = await service.executeWithRetry(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry failed operations', async () => {
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(new Error('First failure')),
          Promise.reject(new Error('Second failure')),
          Promise.resolve('success')
        );

      const result = await service.executeWithRetry(mockOperation, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries exceeded', async () => {
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValue(Promise.reject(new Error('Persistent failure')));

      try {
        await service.executeWithRetry(mockOperation, { maxRetries: 2 });
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Persistent failure');
        expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      }
    });
  });

  describe('Exponential Backoff', () => {
    it('should implement exponential backoff', async () => {
      const startTime = Date.now();
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(new Error('First failure')),
          Promise.reject(new Error('Second failure')),
          Promise.resolve('success')
        );

      await service.executeWithRetry(mockOperation, {
        maxRetries: 2,
        baseDelayMs: 100,
        backoffMultiplier: 2
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should have waited at least 100ms + 200ms = 300ms
      expect(totalTime).toBeGreaterThan(250);
    });

    it('should respect maximum delay', async () => {
      const startTime = Date.now();
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(new Error('First failure')),
          Promise.reject(new Error('Second failure')),
          Promise.resolve('success')
        );

      await service.executeWithRetry(mockOperation, {
        maxRetries: 2,
        baseDelayMs: 1000,
        backoffMultiplier: 10,
        maxDelayMs: 500
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should not exceed 500ms + 500ms = 1000ms (plus some buffer)
      expect(totalTime).toBeLessThan(1200);
    });
  });

  describe('Jitter', () => {
    it('should add jitter to delay when enabled', async () => {
      const delays: number[] = [];
      const originalDelay = service.delay;
      
      spyOn(service as any, 'delay').and.callFake((ms: number) => {
        delays.push(ms);
        return originalDelay.call(service, 10); // Use short delay for testing
      });

      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(new Error('First failure')),
          Promise.reject(new Error('Second failure')),
          Promise.resolve('success')
        );

      await service.executeWithRetry(mockOperation, {
        maxRetries: 2,
        baseDelayMs: 100,
        enableJitter: true
      });

      // With jitter, delays should vary
      expect(delays.length).toBe(2);
      expect(delays[0]).not.toBe(100);
      expect(delays[1]).not.toBe(200);
    });

    it('should not add jitter when disabled', async () => {
      const delays: number[] = [];
      const originalDelay = service.delay;
      
      spyOn(service as any, 'delay').and.callFake((ms: number) => {
        delays.push(ms);
        return originalDelay.call(service, 10); // Use short delay for testing
      });

      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(new Error('First failure')),
          Promise.reject(new Error('Second failure')),
          Promise.resolve('success')
        );

      await service.executeWithRetry(mockOperation, {
        maxRetries: 2,
        baseDelayMs: 100,
        enableJitter: false
      });

      // Without jitter, delays should be exact
      expect(delays).toEqual([100, 200]);
    });
  });

  describe('Retry Conditions', () => {
    it('should retry only retryable errors when condition is specified', async () => {
      const retryableError = new Error('Network timeout');
      const nonRetryableError = new Error('Authentication failed');

      const shouldRetry = (error: Error) => error.message.includes('Network');

      const mockOperation = jasmine.createSpy('operation')
        .and.returnValue(Promise.reject(nonRetryableError));

      try {
        await service.executeWithRetry(mockOperation, {
          maxRetries: 2,
          shouldRetry
        });
        fail('Should have thrown an error');
      } catch (_error) {
        expect(mockOperation).toHaveBeenCalledTimes(1); // Should not retry
      }
    });

    it('should retry retryable errors', async () => {
      const retryableError = new Error('Network timeout');

      const shouldRetry = (error: Error) => error.message.includes('Network');

      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(retryableError),
          Promise.resolve('success')
        );

      const result = await service.executeWithRetry(mockOperation, {
        maxRetries: 2,
        shouldRetry
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout operations that take too long', async () => {
      const mockOperation = jasmine.createSpy('operation').and.callFake(() => {
        return new Promise(resolve => setTimeout(resolve, 200));
      });

      try {
        await service.executeWithRetry(mockOperation, {
          maxRetries: 1,
          timeoutMs: 100
        });
        fail('Should have thrown a timeout error');
      } catch (error) {
        expect((error as Error).message).toContain('timeout');
      }
    });

    it('should not timeout operations that complete in time', async () => {
      const mockOperation = jasmine.createSpy('operation').and.callFake(() => {
        return new Promise(resolve => setTimeout(() => resolve('success'), 50));
      });

      const result = await service.executeWithRetry(mockOperation, {
        maxRetries: 1,
        timeoutMs: 100
      });

      expect(result).toBe('success');
    });
  });

  describe('Predefined Configurations', () => {
    it('should provide API retry configuration', () => {
      const config = RetryService.createConfig('api');

      expect(config.maxRetries).toBe(3);
      expect(config.baseDelayMs).toBe(1000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.enableJitter).toBe(true);
    });

    it('should provide network retry configuration', () => {
      const config = RetryService.createConfig('network');

      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(500);
      expect(config.backoffMultiplier).toBe(1.5);
      expect(config.enableJitter).toBe(true);
    });

    it('should provide database retry configuration', () => {
      const config = RetryService.createConfig('database');

      expect(config.maxRetries).toBe(2);
      expect(config.baseDelayMs).toBe(2000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.enableJitter).toBe(false);
    });

    it('should provide file retry configuration', () => {
      const config = RetryService.createConfig('file');

      expect(config.maxRetries).toBe(3);
      expect(config.baseDelayMs).toBe(100);
      expect(config.backoffMultiplier).toBe(1.2);
      expect(config.enableJitter).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should preserve original error stack trace', async () => {
      const originalError = new Error('Original error');
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValue(Promise.reject(originalError));

      try {
        await service.executeWithRetry(mockOperation, { maxRetries: 1 });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBe(originalError);
        expect(error.stack).toBeTruthy();
      }
    });

    it('should handle synchronous errors', async () => {
      const mockOperation = jasmine.createSpy('operation').and.throwError('Sync error');

      try {
        await service.executeWithRetry(mockOperation, { maxRetries: 1 });
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Sync error');
      }
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track retry statistics', async () => {
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValues(
          Promise.reject(new Error('First failure')),
          Promise.resolve('success')
        );

      await service.executeWithRetry(mockOperation, { maxRetries: 2 });

      const stats = service.getRetryStatistics();
      expect(stats.totalOperations).toBe(1);
      expect(stats.totalRetries).toBe(1);
      expect(stats.successfulOperations).toBe(1);
    });

    it('should track failed operations', async () => {
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValue(Promise.reject(new Error('Persistent failure')));

      try {
        await service.executeWithRetry(mockOperation, { maxRetries: 1 });
      } catch (_error) {
        // Expected to fail
      }

      const stats = service.getRetryStatistics();
      expect(stats.totalOperations).toBe(1);
      expect(stats.totalRetries).toBe(1);
      expect(stats.failedOperations).toBe(1);
    });

    it('should reset statistics', async () => {
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValue(Promise.resolve('success'));

      await service.executeWithRetry(mockOperation);
      service.resetStatistics();

      const stats = service.getRetryStatistics();
      expect(stats.totalOperations).toBe(0);
      expect(stats.totalRetries).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.failedOperations).toBe(0);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should implement circuit breaker when enabled', async () => {
      const mockOperation = jasmine.createSpy('operation')
        .and.returnValue(Promise.reject(new Error('Service unavailable')));

      // Fail multiple operations to trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await service.executeWithRetry(mockOperation, {
            maxRetries: 1,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 3
          });
        } catch (_error) {
          // Expected to fail
        }
      }

      // Next operation should fail immediately due to circuit breaker
      const startTime = Date.now();
      try {
        await service.executeWithRetry(mockOperation, {
          maxRetries: 1,
          enableCircuitBreaker: true,
          circuitBreakerThreshold: 3
        });
        fail('Should have thrown a circuit breaker error');
      } catch (error) {
        const endTime = Date.now();
        expect((error as Error).message).toContain('Circuit breaker');
        expect(endTime - startTime).toBeLessThan(100); // Should fail fast
      }
    });
  });
});