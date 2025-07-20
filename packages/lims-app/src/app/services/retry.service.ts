import { Injectable } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { finalize, mergeMap, retryWhen, tap } from 'rxjs/operators';

// import { environment } from '../../environments/environment';

// Temporary mock environment for development
const environment = {
  retryAttempts: 3,
  retryDelay: 1000,
  enableDebugLogging: true
};

export interface RetryConfig {
  maxRetries?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: any) => boolean;
}

@Injectable({
  providedIn: 'root'
})
export class RetryService {
  private readonly defaultConfig: Required<RetryConfig> = {
    maxRetries: environment.retryAttempts,
    backoffMs: environment.retryDelay,
    maxBackoffMs: 30000, // 30 seconds max
    backoffMultiplier: 2,
    retryCondition: (error: any) => this.shouldRetry(error)
  };

  /**
   * Execute a promise-based operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config?: RetryConfig
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: Error;
    let attempt = 0;

    while (attempt <= finalConfig.maxRetries) {
      try {
        if (environment.enableDebugLogging && attempt > 0) {
          console.log(`Retry attempt ${attempt} for operation`);
        }

        const result = await operation();
        
        if (attempt > 0 && environment.enableDebugLogging) {
          console.log(`Operation succeeded after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (environment.enableDebugLogging) {
          console.warn(`Operation failed on attempt ${attempt + 1}:`, error);
        }

        // Check if we should retry this error
        if (!finalConfig.retryCondition(error)) {
          if (environment.enableDebugLogging) {
            console.log('Error is not retryable, throwing immediately');
          }
          throw lastError;
        }

        // If this was the last attempt, throw the error
        if (attempt === finalConfig.maxRetries) {
          if (environment.enableDebugLogging) {
            console.error(`All ${finalConfig.maxRetries + 1} attempts failed`);
          }
          throw lastError;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, finalConfig);
        
        if (environment.enableDebugLogging) {
          console.log(`Waiting ${delay}ms before retry attempt ${attempt + 1}`);
        }
        
        await this.delay(delay);
        attempt++;
      }
    }

    throw lastError!;
  }

  /**
   * Create an RxJS retry operator with exponential backoff
   */
  retryWithBackoff<T>(config?: RetryConfig) {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    return (source: Observable<T>) =>
      source.pipe(
        retryWhen(errors =>
          errors.pipe(
            tap(error => {
              if (environment.enableDebugLogging) {
                console.warn('Observable operation failed:', error);
              }
            }),
            mergeMap((error, index) => {
              const attempt = index + 1;
              
              // Check if we should retry this error
              if (!finalConfig.retryCondition(error)) {
                if (environment.enableDebugLogging) {
                  console.log('Error is not retryable, throwing immediately');
                }
                return throwError(() => error);
              }
              
              // If we've exceeded max retries, throw the error
              if (attempt > finalConfig.maxRetries) {
                if (environment.enableDebugLogging) {
                  console.error(`All ${finalConfig.maxRetries + 1} attempts failed`);
                }
                return throwError(() => error);
              }
              
              // Calculate delay and retry
              const delay = this.calculateDelay(attempt - 1, finalConfig);
              
              if (environment.enableDebugLogging) {
                console.log(`Retrying in ${delay}ms (attempt ${attempt})`);
              }
              
              return timer(delay);
            }),
            finalize(() => {
              if (environment.enableDebugLogging) {
                console.log('Retry sequence completed');
              }
            })
          )
        )
      );
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: Required<RetryConfig>): number {
    // Exponential backoff: delay = baseDelay * (multiplier ^ attempt)
    const exponentialDelay = config.backoffMs * config.backoffMultiplier ** attempt;
    
    // Add jitter (random factor) to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    
    // Apply maximum backoff limit
    const finalDelay = Math.min(exponentialDelay + jitter, config.maxBackoffMs);
    
    return Math.floor(finalDelay);
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetry(error: any): boolean {
    // Don't retry client errors (4xx) except for specific cases
    if (error?.status >= 400 && error?.status < 500) {
      // Retry on rate limiting (429) and request timeout (408)
      return error.status === 429 || error.status === 408;
    }
    
    // Retry on server errors (5xx)
    if (error?.status >= 500) {
      return true;
    }
    
    // Retry on network errors
    if (error?.name === 'NetworkError' || 
        error?.message?.includes('network') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('connection')) {
      return true;
    }
    
    // Don't retry authentication/authorization errors
    if (error?.status === 401 || error?.status === 403) {
      return false;
    }
    
    // Don't retry validation errors
    if (error?.status === 400 || error?.status === 422) {
      return false;
    }
    
    // Default to not retrying unknown errors
    return false;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry configuration for specific scenarios
   */
  static createConfig(scenario: 'network' | 'api' | 'critical' | 'background'): RetryConfig {
    switch (scenario) {
      case 'network':
        return {
          maxRetries: 5,
          backoffMs: 1000,
          maxBackoffMs: 10000,
          backoffMultiplier: 2
        };
      
      case 'api':
        return {
          maxRetries: 3,
          backoffMs: 500,
          maxBackoffMs: 5000,
          backoffMultiplier: 1.5
        };
      
      case 'critical':
        return {
          maxRetries: 10,
          backoffMs: 2000,
          maxBackoffMs: 60000,
          backoffMultiplier: 2
        };
      
      case 'background':
        return {
          maxRetries: 2,
          backoffMs: 5000,
          maxBackoffMs: 30000,
          backoffMultiplier: 3
        };
      
      default:
        return {};
    }
  }
}