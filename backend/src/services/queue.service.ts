import { OrgRole, QueueStatus } from '@codity/shared';
import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { getProjectWithAccess, requireOrgRole } from '../utils/permissions';

interface CreateQueueInput {
  name: string;
  description?: string;
  priority?: number;
  concurrency?: number;
  retryPolicyId?: string;
  rateLimitPerMin?: number;
  shardKey?: string;
}

export async function createQueue(
  userId: string,
  projectId: string,
  input: CreateQueueInput
) {
  const project = await getProjectWithAccess(userId, projectId);
  await requireOrgRole(userId, project.organizationId, OrgRole.MEMBER);

  return prisma.queue.create({
    data: {
      projectId,
      name: input.name,
      description: input.description,
      priority: input.priority ?? 0,
      concurrency: input.concurrency ?? 5,
      retryPolicyId: input.retryPolicyId,
      rateLimitPerMin: input.rateLimitPerMin,
      shardKey: input.shardKey,
    },
    include: { retryPolicy: true },
  });
}

export async function updateQueue(
  userId: string,
  queueId: string,
  input: Partial<CreateQueueInput & { status: QueueStatus }>
) {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { project: true },
  });
  if (!queue) throw new NotFoundError('Queue');
  await requireOrgRole(userId, queue.project.organizationId, OrgRole.MEMBER);

  return prisma.queue.update({
    where: { id: queueId },
    data: input,
    include: { retryPolicy: true },
  });
}

export async function pauseQueue(userId: string, queueId: string) {
  return updateQueue(userId, queueId, { status: QueueStatus.PAUSED });
}

export async function resumeQueue(userId: string, queueId: string) {
  return updateQueue(userId, queueId, { status: QueueStatus.ACTIVE });
}

export async function getQueueStats(queueId: string) {
  const [queued, running, completed, failed, deadLetter, recentCompleted] =
    await Promise.all([
      prisma.job.count({ where: { queueId, status: 'QUEUED' } }),
      prisma.job.count({ where: { queueId, status: { in: ['CLAIMED', 'RUNNING'] } } }),
      prisma.job.count({ where: { queueId, status: 'COMPLETED' } }),
      prisma.job.count({ where: { queueId, status: 'FAILED' } }),
      prisma.job.count({ where: { queueId, status: 'DEAD_LETTER' } }),
      prisma.job.findMany({
        where: {
          queueId,
          status: 'COMPLETED',
          completedAt: { gte: new Date(Date.now() - 60_000) },
        },
        select: { durationMs: true },
      }),
    ]);

  const durations = recentCompleted
    .map((j) => j.durationMs)
    .filter((d): d is number => d != null);

  return {
    queued,
    running,
    completed,
    failed,
    deadLetter,
    throughputPerMinute: recentCompleted.length,
    avgDurationMs:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
  };
}

export async function createRetryPolicy(
  name: string,
  strategy: string,
  maxAttempts: number,
  baseDelayMs: number,
  maxDelayMs?: number,
  multiplier?: number
) {
  return prisma.retryPolicy.create({
    data: { name, strategy, maxAttempts, baseDelayMs, maxDelayMs, multiplier },
  });
}

export async function listRetryPolicies() {
  return prisma.retryPolicy.findMany({ orderBy: { name: 'asc' } });
}
