import { promoteScheduledJobs } from './job.service';
import { markStaleWorkersOffline, releaseStaleClaims } from './worker.service';
import { acquireLock, releaseLock } from '../lib/redis';
import { publishEvent } from './events.service';
import { logger } from '../lib/logger';

let intervalId: ReturnType<typeof setInterval> | null = null;
const LOCK_KEY = 'scheduler:leader';
const LOCK_TTL_MS = 15_000;

export function startScheduler(intervalMs: number): void {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    const token = await acquireLock(LOCK_KEY, LOCK_TTL_MS);
    if (!token) return;

    try {
      const promoted = await promoteScheduledJobs();
      const staleWorkers = await markStaleWorkersOffline();
      const releasedClaims = await releaseStaleClaims();

      if (promoted.scheduled > 0 || promoted.retries > 0 || staleWorkers > 0 || releasedClaims > 0) {
        await publishEvent('scheduler:tick', {
          promoted,
          staleWorkers,
          releasedClaims,
        });
        logger.debug('Scheduler tick', { promoted, staleWorkers, releasedClaims });
      }
    } catch (err) {
      logger.error('Scheduler error', { error: (err as Error).message });
    } finally {
      await releaseLock(LOCK_KEY, token);
    }
  }, intervalMs);

  logger.info('Scheduler started', { intervalMs });
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
