import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authenticateWorker, authenticateWorkerRegistration } from '../middleware/auth';
import {
  registerWorker,
  sendHeartbeat,
  claimJobs,
  startJob,
  completeJob,
  failJob,
  drainWorker,
  listWorkers,
  getWorker,
  addJobLog,
} from '../services/worker.service';
import { paramId } from '../utils/params';

const router = Router();

router.post(
  '/register',
  authenticateWorkerRegistration,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        hostname: z.string(),
        concurrency: z.number().int().min(1).max(50).default(5),
        shardKey: z.string().optional(),
      })
      .parse(req.body);
    const worker = await registerWorker(body.hostname, body.concurrency, body.shardKey);
    res.status(201).json(worker);
  })
);

router.post(
  '/:workerId/heartbeat',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const workerId = req.workerId!;
    const body = z
      .object({
        activeJobs: z.number().int(),
        cpuUsage: z.number().optional(),
        memoryMb: z.number().optional(),
      })
      .parse(req.body);
    await sendHeartbeat(workerId, body.activeJobs, body.cpuUsage, body.memoryMb);
    res.json({ ok: true });
  })
);

router.post(
  '/:workerId/claim',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const workerId = req.workerId!;
    const body = z.object({ maxJobs: z.number().int().min(1).max(20).default(1) }).parse(req.body);
    const jobs = await claimJobs(workerId, body.maxJobs);
    res.json(jobs);
  })
);

router.post(
  '/:workerId/jobs/:jobId/start',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const job = await startJob(paramId(req.params.jobId), req.workerId!);
    res.json(job);
  })
);

router.post(
  '/:workerId/jobs/:jobId/complete',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ result: z.unknown().optional(), durationMs: z.number().int().optional() })
      .parse(req.body);
    const job = await completeJob(
      paramId(req.params.jobId),
      req.workerId!,
      body.result,
      body.durationMs
    );
    res.json(job);
  })
);

router.post(
  '/:workerId/jobs/:jobId/fail',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ error: z.string(), durationMs: z.number().int().optional() })
      .parse(req.body);
    await failJob(paramId(req.params.jobId), req.workerId!, body.error, body.durationMs);
    res.json({ ok: true });
  })
);

router.post(
  '/:workerId/jobs/:jobId/logs',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
        message: z.string(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    const log = await addJobLog(paramId(req.params.jobId), body.level, body.message, body.metadata);
    res.status(201).json(log);
  })
);

router.post(
  '/:workerId/drain',
  authenticateWorker,
  asyncHandler(async (req, res) => {
    const worker = await drainWorker(req.workerId!);
    res.json(worker);
  })
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (_req, res) => {
    const workers = await listWorkers();
    res.json(workers);
  })
);

router.get(
  '/:workerId',
  authenticate,
  asyncHandler(async (req, res) => {
    const worker = await getWorker(paramId(req.params.workerId));
    res.json(worker);
  })
);

export default router;
