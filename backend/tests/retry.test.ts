import { describe, it, expect, vi } from 'vitest';
import {
  RetryStrategy,
  calculateRetryDelay,
  shouldRetry,
} from '@codity/shared';


import { bulkRetryDeadLetter } from '../src/services/job.service';
import { prisma } from '../src/lib/prisma';
import * as eventsService from '../src/services/events.service';
import * as permissions from '../src/utils/permissions';

describe('Retry Logic', () => {
  const baseConfig = {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
    multiplier: 2,
  };

  it('calculates fixed delay', () => {
    const delay = calculateRetryDelay(2, {
      ...baseConfig,
      strategy: RetryStrategy.FIXED,
    });
    expect(delay).toBe(1000);
  });

  it('calculates linear backoff', () => {
    const delay = calculateRetryDelay(3, {
      ...baseConfig,
      strategy: RetryStrategy.LINEAR,
    });
    expect(delay).toBe(3000);
  });

  it('calculates exponential backoff', () => {
    expect(calculateRetryDelay(1, baseConfig)).toBe(1000);
    expect(calculateRetryDelay(2, baseConfig)).toBe(2000);
    expect(calculateRetryDelay(3, baseConfig)).toBe(4000);
  });

  it('respects max delay cap', () => {
    const delay = calculateRetryDelay(10, {
      ...baseConfig,
      maxDelayMs: 5000,
    });
    expect(delay).toBe(5000);
  });

  it('shouldRetry returns true when attempts remain', () => {
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
  });

  it('shouldRetry returns false when max attempts reached', () => {
    expect(shouldRetry(3, 3)).toBe(false);
  });
});


describe('Bulk DLQ Replay Engine (Integration & Transactions)', () => {
  it('successfully processes a bulk replay transaction', async () => {

    const mockQueueId = '00000000-0000-0000-0000-000000000099';
    const mockUserId = 'user-123';
    

    vi.spyOn(permissions, 'getQueueWithRole').mockResolvedValue({ id: mockQueueId } as any);
    

    vi.spyOn(prisma.deadLetterEntry, 'findMany').mockResolvedValue([
      { jobId: 'job-1' },
      { jobId: 'job-2' },
      { jobId: 'job-3' }
    ] as any);

   
    const transactionSpy = vi.spyOn(prisma, '$transaction').mockResolvedValue('transaction-success' as any);
    
   
    const eventSpy = vi.spyOn(eventsService, 'publishEvent').mockResolvedValue(undefined);

    
    const result = await bulkRetryDeadLetter(mockUserId, mockQueueId);

    
    expect(result.count).toBe(3); 
    expect(transactionSpy).toHaveBeenCalledOnce(); 
    expect(eventSpy).toHaveBeenCalledWith('batch:created', expect.any(Object)); 
  });

  it('returns 0 and skips transaction if DLQ is already empty', async () => {
    const mockQueueId = 'empty-queue-123';
    vi.spyOn(permissions, 'getQueueWithRole').mockResolvedValue({ id: mockQueueId } as any);
    
    vi.spyOn(prisma.deadLetterEntry, 'findMany').mockResolvedValue([]);
    const transactionSpy = vi.spyOn(prisma, '$transaction');

    
    const result = await bulkRetryDeadLetter('user-123', mockQueueId);

    
    expect(result.count).toBe(0);
    expect(transactionSpy).not.toHaveBeenCalled(); // Proves we save database resources by exiting early
  });
});