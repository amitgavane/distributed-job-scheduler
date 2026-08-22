import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { getSystemMetrics, getThroughputHistory } from '../services/metrics.service';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const metrics = await getSystemMetrics();
    res.json(metrics);
  })
);

router.get(
  '/throughput',
  asyncHandler(async (req, res) => {
    const hours = parseInt(String(req.query.hours || '24'), 10);
    const history = await getThroughputHistory(hours);
    res.json(history);
  })
);

export default router;
