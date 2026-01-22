/**
 * Epic 08: Clearinghouse Integration - Error Handling and Retry Logic
 *
 * Provides robust retry mechanisms for clearinghouse API calls with
 * exponential backoff, circuit breaker pattern, and error classification.
 */

import { SubmissionStatus } from '@prisma/client';

// ============================================
// Error Types
// ============================================

/**
 * Clearinghouse-specific error class with classification.
 */
export class ClearinghouseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: ErrorCategory,
    public readonly retryable: boolean,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ClearinghouseError';
  }
}

/**
 * Error categories for proper handling.
 */
export type ErrorCategory =
  | 'authentication' // Auth failures (401, invalid credentials)
  | 'authorization' // Permission failures (403)
  | 'validation' // Bad request / validation errors (400)
  | 'not_found' // Resource not found (404)
  | 'rate_limit' // Too many requests (429)
  | 'server_error' // Server errors (500, 502, 503, 504)
  | 'network' // Network/connection errors
  | 'timeout' // Request timeout
  | 'configuration' // Configuration errors
  | 'unknown'; // Unknown errors

/**
 * Classify an error into a category.
 */
export function classifyError(error: unknown): { category: ErrorCategory; retryable: boolean } {
  if (error instanceof ClearinghouseError) {
    return { category: error.category, retryable: error.retryable };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket hang up')
    ) {
      return { category: 'network', retryable: true };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return { category: 'timeout', retryable: true };
    }

    // Auth errors
    if (message.includes('unauthorized') || message.includes('401')) {
      return { category: 'authentication', retryable: false };
    }

    // Rate limit
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) {
      return { category: 'rate_limit', retryable: true };
    }

    // Server errors
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('internal server error')
    ) {
      return { category: 'server_error', retryable: true };
    }
  }

  return { category: 'unknown', retryable: false };
}

// ============================================
// Retry Configuration
// ============================================

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier (exponential factor) */
  backoffMultiplier: number;
  /** Whether to add jitter to delays */
  jitter: boolean;
  /** Categories that should be retried */
  retryableCategories: ErrorCategory[];
  /** Callback for retry events */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableCategories: ['network', 'timeout', 'rate_limit', 'server_error'],
};

/**
 * Calculate delay for a retry attempt with exponential backoff.
 */
export function calculateRetryDelay(
  attempt: number,
  config: Partial<RetryConfig> = {}
): number {
  const { initialDelayMs, maxDelayMs, backoffMultiplier, jitter } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  // Exponential backoff
  let delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);

  // Cap at max delay
  delay = Math.min(delay, maxDelayMs);

  // Add jitter (±25% randomization)
  if (jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= fullConfig.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Check if we should retry
      const { category, retryable } = classifyError(err);
      const shouldRetry =
        retryable &&
        fullConfig.retryableCategories.includes(category) &&
        attempt <= fullConfig.maxRetries;

      if (!shouldRetry) {
        throw new ClearinghouseError(
          err.message,
          category.toUpperCase(),
          category,
          retryable,
          err
        );
      }

      // Calculate and apply delay
      const delay = calculateRetryDelay(attempt, fullConfig);

      // Notify about retry
      if (fullConfig.onRetry) {
        fullConfig.onRetry(attempt, err, delay);
      }

      await sleep(delay);
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

// ============================================
// Circuit Breaker
// ============================================

/**
 * Circuit breaker states.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: number;
  /** Number of successes needed to close circuit from half-open */
  successThreshold: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  successThreshold: 2,
};

/**
 * Circuit breaker implementation.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Check if circuit allows the request.
   */
  canExecute(): boolean {
    this.updateState();
    return this.state !== 'open';
  }

  /**
   * Record a successful operation.
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  /**
   * Record a failed operation.
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new ClearinghouseError(
        'Circuit breaker is open - service temporarily unavailable',
        'CIRCUIT_OPEN',
        'server_error',
        true
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Reset the circuit breaker.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * Update state based on time elapsed.
   */
  private updateState(): void {
    if (this.state === 'open' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime.getTime();
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      }
    }
  }
}

// ============================================
// Error Result Helpers
// ============================================

/**
 * Create an error response for claim submissions.
 */
export function createErrorResponse(
  error: unknown,
  defaultCode = 'UNKNOWN_ERROR'
): {
  success: false;
  status: SubmissionStatus;
  responseCode: string;
  responseMessage: string;
  errors: Array<{ code: string; message: string }>;
} {
  if (error instanceof ClearinghouseError) {
    return {
      success: false,
      status: SubmissionStatus.ERROR,
      responseCode: error.code,
      responseMessage: error.message,
      errors: [{ code: error.code, message: error.message }],
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    status: SubmissionStatus.ERROR,
    responseCode: defaultCode,
    responseMessage: message,
    errors: [{ code: defaultCode, message }],
  };
}

/**
 * Wrap a provider method with retry and circuit breaker.
 */
export function withResilience<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  circuitBreaker: CircuitBreaker,
  retryConfig: Partial<RetryConfig> = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return circuitBreaker.execute(() => withRetry(() => fn(...args), retryConfig));
  };
}
