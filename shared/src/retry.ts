import { RetryStrategy } from './types';

export interface RetryConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  multiplier?: number;
}

export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  const { strategy, baseDelayMs, maxDelayMs = 300_000, multiplier = 2 } = config;

  let delay: number;

  switch (strategy) {
    case RetryStrategy.FIXED:
      delay = baseDelayMs;
      break;
    case RetryStrategy.LINEAR:
      delay = baseDelayMs * attempt;
      break;
    case RetryStrategy.EXPONENTIAL:
      delay = baseDelayMs * Math.pow(multiplier, attempt - 1);
      break;
    default:
      delay = baseDelayMs;
  }

  return Math.min(delay, maxDelayMs);
}

export function shouldRetry(attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts;
}
