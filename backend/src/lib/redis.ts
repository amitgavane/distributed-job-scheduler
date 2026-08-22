import Redis from 'ioredis';
import { logger } from './logger';
import {
  acquireMemoryLock,
  releaseMemoryLock,
  checkMemoryRateLimit,
} from './memory-store';

let redis: Redis | null = null;
let redisDisabled = false;
let usingMemoryFallback = false;

export function getRedis(): Redis | null {
  if (redisDisabled || !process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {
      redisDisabled = true;
      usingMemoryFallback = true;
      logger.warn('redis unavailable, using in-memory locks/rate limits (single-instance only)');
    });
    redis.on('connect', () => {
      usingMemoryFallback = false;
    });
  }
  return redis;
}

export function isUsingMemoryFallback(): boolean {
  return usingMemoryFallback || !process.env.REDIS_URL;
}

export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const client = getRedis();
  if (!client) return acquireMemoryLock(key, ttlMs);

  try {
    const token = `${Date.now()}-${Math.random()}`;
    const acquired = await client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    return acquired === 'OK' ? token : null;
  } catch {
    redisDisabled = true;
    usingMemoryFallback = true;
    return acquireMemoryLock(key, ttlMs);
  }
}

export async function releaseLock(key: string, token: string): Promise<void> {
  const client = getRedis();
  if (!client) {
    releaseMemoryLock(key, token);
    return;
  }

  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await client.eval(script, 1, `lock:${key}`, token);
  } catch {
    redisDisabled = true;
    usingMemoryFallback = true;
    releaseMemoryLock(key, token);
  }
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedis();
  if (!client) return checkMemoryRateLimit(key, limit, windowMs);

  try {
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;
    const count = await client.incr(windowKey);
    if (count === 1) await client.pexpire(windowKey, windowMs);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    redisDisabled = true;
    usingMemoryFallback = true;
    return checkMemoryRateLimit(key, limit, windowMs);
  }
}
