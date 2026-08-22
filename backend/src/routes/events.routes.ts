import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { listRecentEvents } from '../services/events.service';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = parseInt(String(req.query.limit || '50'), 10);
    const type = req.query.type ? String(req.query.type) : undefined;
    const events = await listRecentEvents(limit, type);
    res.json(events);
  })
);

export default router;
