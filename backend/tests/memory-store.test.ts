import { describe, it, expect } from 'vitest';
import {
  acquireMemoryLock,
  releaseMemoryLock,
  checkMemoryRateLimit,
} from '../src/lib/memory-store';

describe('In-memory lock/rate limit fallback', () => {
  it('allows one lock holder at a time', () => {
    const first = acquireMemoryLock('test-lock', 5000);
    const second = acquireMemoryLock('test-lock', 5000);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    if (first) releaseMemoryLock('test-lock', first);
  });

  it('enforces rate limits per window', () => {
    const key = `rate-${Date.now()}`;
    const first = checkMemoryRateLimit(key, 2, 60_000);
    const second = checkMemoryRateLimit(key, 2, 60_000);
    const third = checkMemoryRateLimit(key, 2, 60_000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });
});
