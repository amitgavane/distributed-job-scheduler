import { Router } from 'express';
import { z } from 'zod';
import { QueueStatus } from '@codity/shared';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import {
  createQueue,
  updateQueue,
  pauseQueue,
  resumeQueue,
  getQueueStats,
  createRetryPolicy,
  listRetryPolicies,
} from '../services/queue.service';
import { getQueueWithAccess } from '../utils/permissions';
import { paramId } from '../utils/params';

const router = Router();

router.use(authenticate);

router.get(
  '/retry-policies',
  asyncHandler(async (_req, res) => {
    const policies = await listRetryPolicies();
    res.json(policies);
  })
);

router.post(
  '/retry-policies',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string(),
        strategy: z.enum(['FIXED', 'LINEAR', 'EXPONENTIAL']),
        maxAttempts: z.number().int().min(1).max(20),
        baseDelayMs: z.number().int().min(100),
        maxDelayMs: z.number().int().optional(),
        multiplier: z.number().optional(),
      })
      .parse(req.body);
    const policy = await createRetryPolicy(
      body.name,
      body.strategy,
      body.maxAttempts,
      body.baseDelayMs,
      body.maxDelayMs,
      body.multiplier
    );
    res.status(201).json(policy);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1),
        description: z.string().optional(),
        priority: z.number().int().optional(),
        concurrency: z.number().int().min(1).max(100).optional(),
        retryPolicyId: z.string().uuid().optional(),
        rateLimitPerMin: z.number().int().optional(),
        shardKey: z.string().optional(),
      })
      .parse(req.body);
    const queue = await createQueue(req.user!.userId, body.projectId, body);
    res.status(201).json(queue);
  })
);

router.get(
  '/:queueId',
  asyncHandler(async (req, res) => {
    const queue = await getQueueWithAccess(req.user!.userId, paramId(req.params.queueId));
    res.json(queue);
  })
);

router.patch(
  '/:queueId',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        priority: z.number().int().optional(),
        concurrency: z.number().int().min(1).max(100).optional(),
        retryPolicyId: z.string().uuid().optional(),
        rateLimitPerMin: z.number().int().optional(),
        shardKey: z.string().optional(),
        status: z.nativeEnum(QueueStatus).optional(),
      })
      .parse(req.body);
    const queue = await updateQueue(req.user!.userId, paramId(req.params.queueId), body);
    res.json(queue);
  })
);

router.post(
  '/:queueId/pause',
  asyncHandler(async (req, res) => {
    const queue = await pauseQueue(req.user!.userId, paramId(req.params.queueId));
    res.json(queue);
  })
);

router.post(
  '/:queueId/resume',
  asyncHandler(async (req, res) => {
    const queue = await resumeQueue(req.user!.userId, paramId(req.params.queueId));
    res.json(queue);
  })
);

router.get(
  '/:queueId/stats',
  asyncHandler(async (req, res) => {
    await getQueueWithAccess(req.user!.userId, paramId(req.params.queueId));
    const stats = await getQueueStats(paramId(req.params.queueId));
    res.json(stats);
  })
);

export default router;
