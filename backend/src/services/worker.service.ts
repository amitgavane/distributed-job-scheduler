import { JobStatus, WorkerStatus } from '@codity/shared';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config';
import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { acquireLock, checkRateLimit, releaseLock } from '../lib/redis';
import { checkDependencies } from './job.service';
import { publishEvent } from './events.service';

export async function registerWorker(
  hostname: string,
  concurrency: number,
  shardKey?: string
) {
  const secret = crypto.randomBytes(32).toString('hex');
  const secretHash = await bcrypt.hash(secret, 10);

  const worker = await prisma.worker.create({
    data: { hostname, concurrency, status: WorkerStatus.ONLINE, secretHash, shardKey },
  });

  await publishEvent('worker:registered', { workerId: worker.id, hostname, shardKey });

  return { ...worker, secret };
}

export async function sendHeartbeat(
  workerId: string,
  activeJobs: number,
  cpuUsage?: number,
  memoryMb?: number
) {
  await prisma.$transaction([
    prisma.worker.update({
      where: { id: workerId },
      data: { lastSeenAt: new Date(), activeJobs, status: WorkerStatus.ONLINE },
    }),
    prisma.workerHeartbeat.create({
      data: { workerId, activeJobs, cpuUsage, memoryMb },
    }),
  ]);
}

export async function drainWorker(workerId: string) {
  return prisma.worker.update({
    where: { id: workerId },
    data: { status: WorkerStatus.DRAINING },
  });
}

export async function markStaleWorkersOffline() {
  const threshold = new Date(Date.now() - config.workerStaleThresholdMs);
  const result = await prisma.worker.updateMany({
    where: {
      status: WorkerStatus.ONLINE,
      lastSeenAt: { lt: threshold },
    },
    data: { status: WorkerStatus.OFFLINE },
  });
  return result.count;
}

export async function releaseStaleClaims() {
  const threshold = new Date(Date.now() - config.jobClaimTimeoutMs);
  const stale = await prisma.job.findMany({
    where: {
      status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] },
      claimedAt: { lt: threshold },
    },
    select: { id: true, attempt: true },
  });

  for (const job of stale) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.QUEUED,
        claimedById: null,
        claimedAt: null,
      },
    });
    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'WARN',
        message: 'claim timed out, back in queue',
      },
    });
  }

  return stale.length;
}

export async function claimJobs(workerId: string, maxJobs: number) {
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker || worker.status === WorkerStatus.OFFLINE) {
    return [];
  }

  const availableSlots = Math.min(
    maxJobs,
    worker.concurrency - worker.activeJobs
  );
  if (availableSlots <= 0) return [];

  const claimed: Awaited<ReturnType<typeof prisma.job.findUnique>>[] = [];

  for (let i = 0; i < availableSlots; i++) {
    const job = await claimNextJob(workerId, worker.shardKey);
    if (!job) break;
    claimed.push(job);
  }

  if (claimed.length > 0) {
    await prisma.worker.update({
      where: { id: workerId },
      data: { activeJobs: { increment: claimed.length } },
    });
  }

  return claimed.filter(Boolean);
}

async function claimNextJob(workerId: string, workerShardKey?: string | null) {
  return prisma.$transaction(async (tx) => {
    const queueWhere: Prisma.QueueWhereInput = { status: 'ACTIVE' };
    if (workerShardKey) {
      queueWhere.OR = [{ shardKey: workerShardKey }, { shardKey: null }];
    }

    const activeQueues = await tx.queue.findMany({
      where: queueWhere,
      select: { id: true, concurrency: true, rateLimitPerMin: true, shardKey: true },
    });

    const queueIds = activeQueues.map((q) => q.id);
    if (queueIds.length === 0) return null;

    // prisma can't do SKIP LOCKED
    const candidates = await tx.$queryRaw<
      { id: string; queue_id: string }[]
    >`
      SELECT j.id, j.queue_id
      FROM jobs j
      INNER JOIN queues q ON q.id = j.queue_id
      WHERE j.status = 'QUEUED'
        AND j.queue_id = ANY(${queueIds}::text[])
        AND q.status = 'ACTIVE'
        AND (j.scheduled_at IS NULL OR j.scheduled_at <= NOW())
      ORDER BY j.priority DESC, j.created_at ASC
      LIMIT 10
      FOR UPDATE OF j SKIP LOCKED
    `;

    for (const candidate of candidates) {
      const queue = activeQueues.find((q) => q.id === candidate.queue_id);
      if (!queue) continue;

      const runningCount = await tx.job.count({
        where: {
          queueId: queue.id,
          status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] },
        },
      });
      if (runningCount >= queue.concurrency) continue;

      if (queue.rateLimitPerMin) {
        const { allowed } = await checkRateLimit(
          `queue:${queue.id}`,
          queue.rateLimitPerMin,
          60_000
        );
        if (!allowed) continue;
      }

      const depsOk = await checkDependencies(candidate.id);
      if (!depsOk) continue;

      const claimLock = await acquireLock(`job-claim:${candidate.id}`, 30_000);
      if (!claimLock) continue;

      try {
      const job = await tx.job.update({
        where: { id: candidate.id },
        data: {
          status: JobStatus.CLAIMED,
          claimedById: workerId,
          claimedAt: new Date(),
        },
        include: { queue: { include: { retryPolicy: true } } },
      });

      await tx.jobExecution.create({
        data: {
          jobId: job.id,
          workerId,
          attempt: job.attempt + 1,
          status: JobStatus.CLAIMED,
        },
      });

      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: 'INFO',
          message: `claimed by ${workerId}`,
        },
      });

      await publishEvent('job:claimed', { jobId: job.id, queueId: job.queueId, workerId });
      return job;
      } finally {
        if (claimLock) await releaseLock(`job-claim:${candidate.id}`, claimLock);
      }
    }

    return null;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

export async function startJob(jobId: string, workerId: string) {
  const job = await prisma.job.update({
    where: { id: jobId, claimedById: workerId },
    data: { status: JobStatus.RUNNING, startedAt: new Date() },
  });

  await prisma.jobExecution.updateMany({
    where: { jobId, workerId, status: JobStatus.CLAIMED },
    data: { status: JobStatus.RUNNING },
  });

  await publishEvent('job:started', { jobId: job.id, queueId: job.queueId, workerId });
  return job;
}

export async function completeJob(
  jobId: string,
  workerId: string,
  result?: unknown,
  durationMs?: number
) {
  const completedAt = new Date();

  const job = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        result: result as object,
        completedAt,
        durationMs,
      },
    });

    await tx.jobExecution.updateMany({
      where: { jobId, workerId, status: JobStatus.RUNNING },
      data: { status: JobStatus.COMPLETED, completedAt, durationMs, result: result as object },
    });

    await tx.worker.update({
      where: { id: workerId },
      data: { activeJobs: { decrement: 1 } },
    });

    if (updated.parentJobId) {
      const pendingSiblings = await tx.job.count({
        where: {
          parentJobId: updated.parentJobId,
          status: { notIn: [JobStatus.COMPLETED, JobStatus.CANCELLED] },
        },
      });
      if (pendingSiblings === 0) {
        await tx.job.update({
          where: { id: updated.parentJobId },
          data: { status: JobStatus.COMPLETED, completedAt },
        });
      }
    }

    return updated;
  });

  await prisma.jobLog.create({
    data: {
      jobId,
      level: 'INFO',
      message: 'completed',
      metadata: { durationMs },
    },
  });

  await publishEvent('job:completed', { jobId: job.id, queueId: job.queueId, workerId, durationMs });
  return job;
}

export async function failJob(
  jobId: string,
  workerId: string,
  error: string,
  durationMs?: number
) {
  await prisma.jobExecution.updateMany({
    where: { jobId, workerId, status: { in: [JobStatus.RUNNING, JobStatus.CLAIMED] } },
    data: { status: JobStatus.FAILED, completedAt: new Date(), error, durationMs },
  });

  await prisma.worker.update({
    where: { id: workerId },
    data: { activeJobs: { decrement: 1 } },
  });

  const { handleJobFailure } = await import('./job.service');
  await handleJobFailure(jobId, error, workerId);
}

export async function listWorkers() {
  const workers = await prisma.worker.findMany({
    orderBy: { lastSeenAt: 'desc' },
    include: {
      _count: { select: { executions: true, heartbeats: true } },
    },
  });
  return workers.map(({ secretHash, ...w }) => w);
}

export async function getWorker(workerId: string) {
  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    include: {
      heartbeats: { orderBy: { createdAt: 'desc' }, take: 20 },
      executions: { orderBy: { startedAt: 'desc' }, take: 10 },
    },
  });
  if (!worker) throw new NotFoundError('Worker');
  const { secretHash, ...safe } = worker;
  return safe;
}

export async function addJobLog(
  jobId: string,
  level: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  return prisma.jobLog.create({
    data: { jobId, level, message, metadata: metadata as object },
  });
}
