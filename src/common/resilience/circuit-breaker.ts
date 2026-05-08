import { Logger } from '@nestjs/common';

export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker for external API calls.
 *
 * States:
 * - closed: normal operation, requests pass through
 * - open: too many failures, requests rejected immediately
 * - half_open: after cooldown, one test request allowed to check recovery
 *
 * Usage:
 *   const breaker = new CircuitBreaker('meta-api', 10, 60000);
 *   const result = await breaker.execute(() => callMetaApi());
 */
export class CircuitBreaker {
  private failures = 0;
  private successes = 0;
  private state: CircuitState = 'closed';
  private lastFailureTime = 0;
  private readonly logger = new Logger(`CircuitBreaker:${this.name}`);

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number = 10,
    private readonly resetTimeMs: number = 60000,
    private readonly halfOpenSuccessThreshold: number = 3,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeMs) {
        this.state = 'half_open';
        this.successes = 0;
        this.logger.log(`${this.name} circuit breaker: open → half_open (testing)`);
      } else {
        throw new CircuitBreakerOpenError(
          `${this.name} circuit breaker is OPEN (${this.failures} failures, resets in ${Math.round((this.resetTimeMs - (Date.now() - this.lastFailureTime)) / 1000)}s)`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half_open') {
      this.successes++;
      if (this.successes >= this.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
        this.logger.log(`${this.name} circuit breaker: half_open → closed (recovered)`);
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      this.state = 'open';
      this.logger.warn(`${this.name} circuit breaker: half_open → open (test failed)`);
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.logger.warn(`${this.name} circuit breaker: closed → open (${this.failures} consecutive failures)`);
    }
  }

  getState(): CircuitState { return this.state; }
  getFailures(): number { return this.failures; }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
