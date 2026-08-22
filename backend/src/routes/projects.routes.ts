import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import {
  createProject,
  listProjects,
  getProject,
  deleteProject,
} from '../services/project.service';
import { paramId } from '../utils/params';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.query.organizationId as string;
    if (!orgId) {
      res.status(400).json({ error: 'organizationId query param required' });
      return;
    }
    const projects = await listProjects(req.user!.userId, orgId);
    res.json(projects);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(1),
        description: z.string().optional(),
      })
      .parse(req.body);
    const project = await createProject(
      req.user!.userId,
      body.organizationId,
      body.name,
      body.description
    );
    res.status(201).json(project);
  })
);

router.get(
  '/:projectId',
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user!.userId, paramId(req.params.projectId));
    res.json(project);
  })
);

router.delete(
  '/:projectId',
  asyncHandler(async (req, res) => {
    await deleteProject(req.user!.userId, paramId(req.params.projectId));
    res.status(204).send();
  })
);

export default router;
