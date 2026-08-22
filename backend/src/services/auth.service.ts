import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OrgRole } from '@codity/shared';
import { config } from '../config';
import { ConflictError, UnauthorizedError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { AuthPayload } from '../middleware/auth';

export async function registerUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const payload: AuthPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

export async function createOrganization(userId: string, name: string, slug: string) {
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) throw new ConflictError('Organization slug already taken');

  return prisma.organization.create({
    data: {
      name,
      slug,
      members: { create: { userId, role: OrgRole.OWNER } },
    },
    include: { members: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
}

export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        include: {
          _count: { select: { projects: true, members: true } },
        },
      },
    },
  });

  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }));
}

export async function inviteMember(
  inviterId: string,
  organizationId: string,
  email: string,
  role: OrgRole
) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ValidationError('User not found with that email');

  const existing = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
  });
  if (existing) throw new ConflictError('User is already a member');

  return prisma.organizationMember.create({
    data: { organizationId, userId: user.id, role },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
}

export async function listOrgMembers(userId: string, organizationId: string) {
  await prisma.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId, userId } },
  });

  return prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}
