import { prisma } from '../lib/prisma';
import { getQueueStats } from './queue.service';
import { getRedis } from '../lib/redis';

export async function getSystemMetrics() {
  const client = getRedis();
  const cacheKey = 'metrics:system';

  if (client) {
    const cached = await client.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const oneHourAgo = new Date(Date.now() - 3_600_000);

  const [
    totalJobs,
    activeWorkers,
    recentCompleted,
    recentFailed,
    recentExecutions,
    queues,
  ] = await Promise.all([
    prisma.job.count(),
    prisma.worker.count({ where: { status: 'ONLINE' } }),
    prisma.job.count({
      where: { status: 'COMPLETED', completedAt: { gte: oneMinuteAgo } },
    }),
    prisma.job.count({
      where: {
        status: { in: ['FAILED', 'DEAD_LETTER'] },
        updatedAt: { gte: oneHourAgo },
      },
    }),
    prisma.jobExecution.findMany({
      where: { completedAt: { gte: oneHourAgo }, durationMs: { not: null } },
      select: { durationMs: true, status: true },
    }),
    prisma.queue.findMany({ select: { id: true, name: true } }),
  ]);

  const durations = recentExecutions
    .filter((e) => e.status === 'COMPLETED' && e.durationMs)
    .map((e) => e.durationMs!);

  const successCount = recentExecutions.filter((e) => e.status === 'COMPLETED').length;
  const totalRecent = recentExecutions.length;

  const queueHealth: Record<string, Awaited<ReturnType<typeof getQueueStats>>> = {};
  for (const queue of queues) {
    queueHealth[queue.name] = await getQueueStats(queue.id);
  }

  const result = {
    timestamp: new Date().toISOString(),
    totalJobs,
    activeWorkers,
    jobsPerMinute: recentCompleted,
    successRate: totalRecent > 0 ? Math.round((successCount / totalRecent) * 100) : 100,
    avgLatencyMs:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    recentFailed,
    queueHealth,
  };

  if (client) {
    await client.set(cacheKey, JSON.stringify(result), 'EX', 15);
  }

  return result;
}

function hourBucketKey(date: Date): string {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

export async function getThroughputHistory(hours = 24) {
  const client = getRedis();
  const cacheKey = `metrics:throughput:${hours}`;

  if (client) {
    const cached = await client.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const slotCount = Math.max(1, Math.min(hours, 168));
  const now = new Date();

  const slotKeys: string[] = [];
  for (let i = slotCount - 1; i >= 0; i--) {
    slotKeys.push(hourBucketKey(new Date(now.getTime() - i * 3_600_000)));
  }

  const since = new Date(slotKeys[0]!);
  const buckets = new Map(
    slotKeys.map((hour) => [hour, { completed: 0, failed: 0, totalDuration: 0 }])
  );

  const executions = await prisma.jobExecution.findMany({
    where: { startedAt: { gte: since } },
    select: { startedAt: true, status: true, durationMs: true },
    orderBy: { startedAt: 'asc' },
  });

  for (const exec of executions) {
    const key = hourBucketKey(exec.startedAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (exec.status === 'COMPLETED') {
      bucket.completed++;
      bucket.totalDuration += exec.durationMs ?? 0;
    } else if (exec.status === 'FAILED') {
      bucket.failed++;
    }
  }

  const result = slotKeys.map((hour) => {
    const data = buckets.get(hour)!;
    return {
      hour,
      completed: data.completed,
      failed: data.failed,
      avgDurationMs: data.completed > 0 ? Math.round(data.totalDuration / data.completed) : 0,
    };
  });

  if (client) {
    await client.set(cacheKey, JSON.stringify(result), 'EX', 60);
  }

  return result;
}