import {
  JobStatus,
  JobType,
  RetryStrategy,
  calculateRetryDelay,
  shouldRetry,
} from '@codity/shared';
import cronParser from 'cron-parser';
import { OrgRole } from '@codity/shared';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { getQueueWithRole, getJobWithRole } from '../utils/permissions';
import { validateNoDependencyCycle, validateDependencyJobsExist } from '../utils/dependencies';
import { parsePagination, paginatedResponse } from '../utils/pagination';
import { publishEvent } from './events.service';
import { generateFailureSummary } from './failure-analysis.service';

interface CreateJobInput {
  handler: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  scheduledAt?: Date;
  cronExpression?: string;
  dependsOn?: string[];
  maxAttempts?: number;
}

export async function createImmediateJob(
  userId: string,
  queueId: string,
  input: CreateJobInput
) {
  const queue = await getQueueWithRole(userId, queueId, OrgRole.MEMBER);
  return createJob(queue, JobType.IMMEDIATE, { ...input, status: JobStatus.QUEUED });
}

export async function createDelayedJob(
  userId: string,
  queueId: string,
  input: CreateJobInput & { delayMs: number }
) {
  const queue = await getQueueWithRole(userId, queueId, OrgRole.MEMBER);
  const scheduledAt = new Date(Date.now() + input.delayMs);
  return createJob(queue, JobType.DELAYED, {
    ...input,
    scheduledAt,
    status: JobStatus.SCHEDULED,
  });
}

export async function createScheduledJob(
  userId: string,
  queueId: string,
  input: CreateJobInput & { scheduledAt: Date }
) {
  const queue = await getQueueWithRole(userId, queueId, OrgRole.MEMBER);
  const status =
    input.scheduledAt <= new Date() ? JobStatus.QUEUED : JobStatus.SCHEDULED;
  return createJob(queue, JobType.SCHEDULED, { ...input, status });
}

export async function createRecurringJob(
  userId: string,
  queueId: string,
  input: CreateJobInput & { cronExpression: string }
) {
  const queue = await getQueueWithRole(userId, queueId, OrgRole.MEMBER);
  try {
    cronParser.parseExpression(input.cronExpression);
  } catch {
    throw new ValidationError('Invalid cron expression');
  }

  const interval = cronParser.parseExpression(input.cronExpression);
  const nextRun = interval.next().toDate();

  return createJob(queue, JobType.RECURRING, {
    ...input,
    scheduledAt: nextRun,
    status: JobStatus.SCHEDULED,
  });
}

export async function createBatchJobs(
  userId: string,
  queueId: string,
  input: { handler: string; items: Record<string, unknown>[]; priority?: number }
) {
  const queue = await getQueueWithRole(userId, queueId, OrgRole.MEMBER);

  const parentJob = await prisma.job.create({
    data: {
      queueId,
      type: JobType.BATCH,
      status: JobStatus.RUNNING,
      handler: input.handler,
      payload: { batchSize: input.items.length },
      priority: input.priority ?? 0,
      maxAttempts: queue.retryPolicy?.maxAttempts ?? 3,
    },
  });

  const childJobs = await Promise.all(
    input.items.map((item, index) =>
      prisma.job.create({
        data: {
          queueId,
          type: JobType.BATCH,
          status: JobStatus.QUEUED,
          handler: input.handler,
          payload: item as object,
          priority: input.priority ?? 0,
          parentJobId: parentJob.id,
          batchIndex: index,
          maxAttempts: queue.retryPolicy?.maxAttempts ?? 3,
        },
      })
    )
  );

  await publishEvent('batch:created', { parentJobId: parentJob.id, count: childJobs.length });
  return { parentJob, childJobs };
}

async function createJob(
  queue: Awaited<ReturnType<typeof getQueueWithRole>>,
  type: JobType,
  input: CreateJobInput & { status: JobStatus; scheduledAt?: Date }
) {
  if (input.idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: {
        queueId_idempotencyKey: {
          queueId: queue.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
  }

  if (input.dependsOn?.length) {
    await validateDependencyJobsExist(queue.id, input.dependsOn);
  }

  const job = await prisma.job.create({
    data: {
      queueId: queue.id,
      type,
      status: input.status,
      handler: input.handler,
      payload: (input.payload ?? {}) as object,
      idempotencyKey: input.idempotencyKey,
      priority: input.priority ?? queue.priority,
      scheduledAt: input.scheduledAt,
      cronExpression: input.cronExpression,
      maxAttempts: input.maxAttempts ?? queue.retryPolicy?.maxAttempts ?? 3,
      dependencies: input.dependsOn?.length
        ? {
            create: input.dependsOn.map((depId) => ({
              dependsOnJobId: depId,
            })),
          }
        : undefined,
    },
    include: { dependencies: true },
  });

  if (input.status === JobStatus.SCHEDULED && input.scheduledAt) {
    await prisma.scheduledJob.create({
      data: {
        jobId: job.id,
        queueId: queue.id,
        scheduledAt: input.scheduledAt,
        cronExpression: input.cronExpression,
        recurring: type === JobType.RECURRING,
      },
    });
  }

  if (input.dependsOn?.length) {
    await validateNoDependencyCycle(job.id, input.dependsOn);
  }

  await prisma.jobLog.create({
    data: {
      jobId: job.id,
      level: 'INFO',
      message: `created (${type})`,
      metadata: { type, status: input.status },
    },
  });

  await publishEvent('job:created', { jobId: job.id, queueId: job.queueId, type, status: input.status });
  return job;
}

export async function listJobs(
  userId: string,
  queueId: string,
  query: Record<string, unknown>
) {
  await getQueueWithRole(userId, queueId, OrgRole.VIEWER);
  const { page, limit, sortBy, sortOrder, skip } = parsePagination(query);

  
  const where: any = { queueId };
  
  if (query.status) where.status = String(query.status);
  if (query.handler) where.handler = String(query.handler);
  if (query.type) where.type = String(query.type);

  
  if (query.search) {
    const search = String(query.search);
    where.OR = [
      
      { handler: { contains: search, mode: 'insensitive' } },
      
      
      ...(search.length === 36 ? [{ id: search }] : [])
    ];
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        claimedBy: { select: { id: true, hostname: true } },
        _count: { select: { executions: true, logs: true } },
      },
    }),
    prisma.job.count({ where }),
  ]);

  return paginatedResponse(jobs, total, page, limit);
}

export async function getJob(userId: string, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      queue: { include: { project: true } },
      claimedBy: true,
      executions: { orderBy: { attempt: 'asc' } },
      logs: { orderBy: { createdAt: 'asc' } },
      dependencies: { include: { dependsOn: { select: { id: true, status: true, handler: true } } } },
      deadLetter: true,
      scheduledJob: true,
      childJobs: true,
      parentJob: true,
    },
  });
  if (!job) throw new NotFoundError('Job');
  await getQueueWithRole(userId, job.queueId, OrgRole.VIEWER);
  return job;
}

export async function retryJob(userId: string, jobId: string) {
  const job = await getJobWithRole(userId, jobId, OrgRole.MEMBER);

  if (!['FAILED', 'DEAD_LETTER'].includes(job.status)) {
    throw new ValidationError('Only failed or dead-letter jobs can be retried');
  }

  const dlq = await prisma.deadLetterEntry.findUnique({ where: { jobId } });

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.QUEUED,
      attempt: 0,
      nextRetryAt: null,
      lastError: null,
      claimedById: null,
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    },
  });

  if (dlq) {
    await prisma.deadLetterEntry.delete({ where: { jobId } });
  }

  await prisma.jobLog.create({
    data: { jobId, level: 'INFO', message: 'manual retry' },
  });

  await publishEvent('job:retried', { jobId, queueId: job.queueId });
  return updated;
}

export async function cancelJob(userId: string, jobId: string) {
  const job = await getJobWithRole(userId, jobId, OrgRole.MEMBER);

  if (['COMPLETED', 'DEAD_LETTER', 'CANCELLED'].includes(job.status)) {
    throw new ValidationError('Job cannot be cancelled in current state');
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.CANCELLED },
  });

  await prisma.scheduledJob.updateMany({
    where: { jobId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });

  await publishEvent('job:cancelled', { jobId, queueId: job.queueId });
  return updated;
}

export async function listDeadLetter(userId: string, queueId: string, query: Record<string, unknown>) {
  await getQueueWithRole(userId, queueId, OrgRole.VIEWER);
  const { page, limit, skip } = parsePagination(query);

  const [entries, total] = await Promise.all([
    prisma.deadLetterEntry.findMany({
      where: { queueId },
      skip,
      take: limit,
      orderBy: { failedAt: 'desc' },
      include: { job: { select: { id: true, handler: true, payload: true } } },
    }),
    prisma.deadLetterEntry.count({ where: { queueId } }),
  ]);

  return paginatedResponse(entries, total, page, limit);
}

export async function handleJobFailure(
  jobId: string,
  error: string,
  workerId?: string
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { queue: { include: { retryPolicy: true } } },
  });
  if (!job) return;

  const policy = job.queue.retryPolicy;
  const strategy = (policy?.strategy as RetryStrategy) || RetryStrategy.EXPONENTIAL;
  const maxAttempts = job.maxAttempts;
  const nextAttempt = job.attempt + 1;

  await prisma.jobExecution.updateMany({
    where: { jobId, status: 'RUNNING' },
    data: { status: 'FAILED', completedAt: new Date(), error },
  });

  if (shouldRetry(nextAttempt, maxAttempts)) {
    const delay = calculateRetryDelay(nextAttempt, {
      strategy,
      maxAttempts,
      baseDelayMs: policy?.baseDelayMs ?? 5000,
      maxDelayMs: policy?.maxDelayMs ?? 300_000,
      multiplier: policy?.multiplier ?? 2,
    });

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        attempt: nextAttempt,
        lastError: error,
        nextRetryAt: new Date(Date.now() + delay),
        claimedById: null,
        claimedAt: null,
      },
    });

    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'WARN',
        message: `retry ${nextAttempt}/${maxAttempts} in ${delay}ms`,
        metadata: { error, delay, workerId },
      },
    });

    await publishEvent('job:retry_scheduled', { jobId, queueId: job.queueId, attempt: nextAttempt, delay });
  } else {
    const recentExecs = await prisma.jobExecution.findMany({
      where: { jobId },
      orderBy: { attempt: 'desc' },
      take: 5,
      select: { error: true },
    });
    const recentErrors = recentExecs.map((e) => e.error).filter(Boolean) as string[];

    const failureSummary = await generateFailureSummary({
      error,
      attempts: nextAttempt,
      handler: job.handler,
      recentErrors,
    });

    await prisma.$transaction([
      prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.DEAD_LETTER,
          attempt: nextAttempt,
          lastError: error,
          completedAt: new Date(),
          claimedById: null,
        },
      }),
      prisma.deadLetterEntry.create({
        data: {
          jobId,
          queueId: job.queueId,
          handler: job.handler,
          payload: job.payload as object,
          totalAttempts: nextAttempt,
          lastError: error,
          failureSummary,
        },
      }),
    ]);

    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'ERROR',
        message: `moved to DLQ after ${nextAttempt} attempts`,
        metadata: { error, failureSummary },
      },
    });

    await publishEvent('job:dead_letter', { jobId, queueId: job.queueId, error, failureSummary });
  }
}

export async function promoteScheduledJobs() {
  const now = new Date();

  const due = await prisma.scheduledJob.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
    },
    include: { job: true },
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  });

  let promoted = 0;

  for (const entry of due) {
    if (entry.recurring && entry.cronExpression) {
      try {
        const interval = cronParser.parseExpression(entry.cronExpression);
        const nextRun = interval.next().toDate();

        await prisma.job.create({
          data: {
            queueId: entry.queueId,
            type: JobType.IMMEDIATE,
            status: JobStatus.QUEUED,
            handler: entry.job.handler,
            payload: entry.job.payload as object,
            priority: entry.job.priority,
            maxAttempts: entry.job.maxAttempts,
          },
        });

        await prisma.scheduledJob.update({
          where: { id: entry.id },
          data: { scheduledAt: nextRun },
        });

        promoted++;
      } catch {
        continue;
      }
      continue;
    }

    await prisma.$transaction([
      prisma.job.update({
        where: { id: entry.jobId },
        data: { status: JobStatus.QUEUED },
      }),
      prisma.scheduledJob.update({
        where: { id: entry.id },
        data: { status: 'FIRED', firedAt: now },
      }),
    ]);
    promoted++;
  }

  const retries = await prisma.job.updateMany({
    where: {
      status: JobStatus.FAILED,
      nextRetryAt: { lte: now },
    },
    data: { status: JobStatus.QUEUED, nextRetryAt: null },
  });

  if (promoted > 0 || retries.count > 0) {
    await publishEvent('scheduler:promoted', {
      scheduled: promoted,
      retries: retries.count,
    });
  }

  return { scheduled: promoted, retries: retries.count };
}

export async function checkDependencies(jobId: string): Promise<boolean> {
  const deps = await prisma.jobDependency.findMany({
    where: { jobId },
    include: { dependsOn: { select: { status: true } } },
  });

  if (deps.length === 0) return true;
  return deps.every((d) => d.dependsOn.status === JobStatus.COMPLETED);
}


export async function bulkRetryDeadLetter(userId: string, queueId: string) {
  
  await getQueueWithRole(userId, queueId, OrgRole.MEMBER);

  
  const dlqEntries = await prisma.deadLetterEntry.findMany({
    where: { queueId },
    select: { jobId: true },
  });

  if (dlqEntries.length === 0) return { count: 0 };

  const jobIds = dlqEntries.map((e) => e.jobId);

  
  await prisma.$transaction([
    
    prisma.job.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status: JobStatus.QUEUED,
        attempt: 0,
        nextRetryAt: null,
        lastError: null,
        claimedById: null,
        claimedAt: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
      },
    }),
   
    prisma.deadLetterEntry.deleteMany({
      where: { queueId },
    }),
    
    prisma.jobLog.createMany({
      data: jobIds.map((id) => ({
        jobId: id,
        level: 'INFO',
        message: 'Bulk manual retry initiated by admin',
      })),
    }),
  ]);

  
  await publishEvent('batch:created', { parentJobId: 'dlq-bulk-retry', count: jobIds.length });

  return { count: jobIds.length };
}
