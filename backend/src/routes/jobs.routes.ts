import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import {
  createImmediateJob,
  createDelayedJob,
  createScheduledJob,
  createRecurringJob,
  createBatchJobs,
  listJobs,
  getJob,
  retryJob,
  cancelJob,
  listDeadLetter,
  bulkRetryDeadLetter, 
} from '../services/job.service';
import { paramId } from '../utils/params';

const router = Router();

router.use(authenticate);

const jobBodySchema = z.object({
  handler: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  priority: z.number().int().optional(),
  maxAttempts: z.number().int().min(1).optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
});

router.post(
  '/immediate',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ queueId: z.string().uuid() })
      .merge(jobBodySchema)
      .parse(req.body);
    const { queueId, ...input } = body;
    const job = await createImmediateJob(req.user!.userId, queueId, input);
    res.status(201).json(job);
  })
);

router.post(
  '/delayed',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ queueId: z.string().uuid(), delayMs: z.number().int().min(0) })
      .merge(jobBodySchema)
      .parse(req.body);
    const { queueId, ...input } = body;
    const job = await createDelayedJob(req.user!.userId, queueId, input);
    res.status(201).json(job);
  })
);

router.post(
  '/scheduled',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        queueId: z.string().uuid(),
        scheduledAt: z.string().datetime(),
      })
      .merge(jobBodySchema)
      .parse(req.body);
    const { queueId, scheduledAt, ...input } = body;
    const job = await createScheduledJob(req.user!.userId, queueId, {
      ...input,
      scheduledAt: new Date(scheduledAt),
    });
    res.status(201).json(job);
  })
);

router.post(
  '/recurring',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ queueId: z.string().uuid(), cronExpression: z.string() })
      .merge(jobBodySchema)
      .parse(req.body);
    const { queueId, ...input } = body;
    const job = await createRecurringJob(req.user!.userId, queueId, input);
    res.status(201).json(job);
  })
);

router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        queueId: z.string().uuid(),
        handler: z.string(),
        items: z.array(z.record(z.unknown())).min(1),
        priority: z.number().int().optional(),
      })
      .parse(req.body);
    const result = await createBatchJobs(req.user!.userId, body.queueId, body);
    res.status(201).json(result);
  })
);


router.get(
  '/',
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      queueId: z.string().uuid({ message: 'Invalid queue ID format' }),
      page: z.string().optional(),
      limit: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
    });

    const safeQuery = querySchema.parse(req.query);
    const result = await listJobs(req.user!.userId, safeQuery.queueId, safeQuery);
    res.json(result);
  })
);


router.post(
  '/dlq/replay',
  asyncHandler(async (req, res) => {
    const body = z.object({ queueId: z.string().uuid() }).parse(req.body);
    const result = await bulkRetryDeadLetter(req.user!.userId, body.queueId);
    res.json(result);
  })
);
// -------------------------

router.get(
  '/dead-letter',
  asyncHandler(async (req, res) => {
    const queueId = req.query.queueId as string;
    if (!queueId) {
      res.status(400).json({ error: 'queueId query param required' });
      return;
    }
    const result = await listDeadLetter(req.user!.userId, queueId, req.query as Record<string, unknown>);
    res.json(result);
  })
);

router.get(
  '/:jobId',
  asyncHandler(async (req, res) => {
    const job = await getJob(req.user!.userId, paramId(req.params.jobId));
    res.json(job);
  })
);

router.post(
  '/:jobId/retry',
  asyncHandler(async (req, res) => {
    const job = await retryJob(req.user!.userId, paramId(req.params.jobId));
    res.json(job);
  })
);

router.post(
  '/:jobId/cancel',
  asyncHandler(async (req, res) => {
    const job = await cancelJob(req.user!.userId, paramId(req.params.jobId));
    res.json(job);
  })
);

export default router;