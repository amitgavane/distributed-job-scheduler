import { describe, it, expect } from 'vitest';
import { getHandler } from '../src/handlers';

describe('Job Handlers', () => {
  it('echo handler returns payload', async () => {
    const handler = getHandler('echo');
    const result = await handler({ message: 'test' }) as Record<string, unknown>;
    expect(result.echoed).toEqual({ message: 'test' });
    expect(result.timestamp).toBeDefined();
  });

  it('sleep handler waits specified duration', async () => {
    const handler = getHandler('sleep');
    const start = Date.now();
    const result = await handler({ durationMs: 100 }) as Record<string, unknown>;
    expect(result.slept).toBe(100);
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });

  it('fail handler throws error', async () => {
    const handler = getHandler('fail');
    await expect(handler({ message: 'boom' })).rejects.toThrow('boom');
  });

  it('unknown handler throws', async () => {
    const handler = getHandler('nonexistent');
    await expect(handler({})).rejects.toThrow('Unknown handler');
  });
});
