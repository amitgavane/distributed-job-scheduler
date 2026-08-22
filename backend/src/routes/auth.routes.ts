import { Router } from 'express';
import { z } from 'zod';
import { OrgRole } from '@codity/shared';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import {
  registerUser,
  loginUser,
  createOrganization,
  getUserOrganizations,
  inviteMember,
  listOrgMembers,
} from '../services/auth.service';
import { requireOrgRole } from '../utils/permissions';
import { paramId } from '../utils/params';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const user = await registerUser(body.email, body.password, body.name);
    res.status(201).json(user);
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await loginUser(body.email, body.password);
    res.json(result);
  })
);

router.get(
  '/organizations',
  authenticate,
  asyncHandler(async (req, res) => {
    const orgs = await getUserOrganizations(req.user!.userId);
    res.json(orgs);
  })
);

router.post(
  '/organizations',
  authenticate,
  asyncHandler(async (req, res) => {
    const { name, slug } = z
      .object({ name: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/) })
      .parse(req.body);
    const org = await createOrganization(req.user!.userId, name, slug);
    res.status(201).json(org);
  })
);

router.post(
  '/organizations/:orgId/members',
  authenticate,
  asyncHandler(async (req, res) => {
    const { email, role } = z
      .object({ email: z.string().email(), role: z.nativeEnum(OrgRole) })
      .parse(req.body);
    await requireOrgRole(req.user!.userId, paramId(req.params.orgId), OrgRole.ADMIN);
    const member = await inviteMember(req.user!.userId, paramId(req.params.orgId), email, role);
    res.status(201).json(member);
  })
);

router.get(
  '/organizations/:orgId/members',
  authenticate,
  asyncHandler(async (req, res) => {
    const members = await listOrgMembers(req.user!.userId, paramId(req.params.orgId));
    res.json(members);
  })
);

export default router;
