const locks = new Map<string, { token: string; expires: number }>();
const rateCounts = new Map<string, { count: number; expires: number }>();

export function acquireMemoryLock(key: string, ttlMs: number): string | null {
  const now = Date.now();
  const existing = locks.get(key);
  if (existing && existing.expires > now) return null;

  const token = `${now}-${Math.random()}`;
  locks.set(key, { token, expires: now + ttlMs });
  return token;
}

export function releaseMemoryLock(key: string, token: string): void {
  const existing = locks.get(key);
  if (existing?.token === token) locks.delete(key);
}

export function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / windowMs)}`;
  const existing = rateCounts.get(windowKey);

  if (!existing || existing.expires <= now) {
    rateCounts.set(windowKey, { count: 1, expires: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
  };
}
