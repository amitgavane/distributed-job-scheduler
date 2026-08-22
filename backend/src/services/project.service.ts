import { OrgRole } from '@codity/shared';
import { NotFoundError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { requireOrgRole } from '../utils/permissions';

export async function createProject(
  userId: string,
  organizationId: string,
  name: string,
  description?: string
) {
  await requireOrgRole(userId, organizationId, OrgRole.MEMBER);

  return prisma.project.create({
    data: { organizationId, name, description, createdById: userId },
    include: { _count: { select: { queues: true } } },
  });
}

export async function listProjects(userId: string, organizationId: string) {
  await requireOrgRole(userId, organizationId, OrgRole.VIEWER);

  return prisma.project.findMany({
    where: { organizationId },
    include: { _count: { select: { queues: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProject(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      queues: {
        include: { retryPolicy: true, _count: { select: { jobs: true } } },
      },
      organization: true,
    },
  });
  if (!project) throw new NotFoundError('Project');
  await requireOrgRole(userId, project.organizationId, OrgRole.VIEWER);
  return project;
}

export async function deleteProject(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project');
  await requireOrgRole(userId, project.organizationId, OrgRole.ADMIN);
  await prisma.project.delete({ where: { id: projectId } });
}
