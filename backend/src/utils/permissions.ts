import { OrgRole } from '@codity/shared';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../lib/errors';

const ROLE_HIERARCHY: Record<string, number> = {
  [OrgRole.VIEWER]: 1,
  [OrgRole.MEMBER]: 2,
  [OrgRole.ADMIN]: 3,
  [OrgRole.OWNER]: 4,
};

export async function getOrgMembership(userId: string, organizationId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership) throw new ForbiddenError('Not a member of this organization');
  return membership;
}

export async function requireOrgRole(
  userId: string,
  organizationId: string,
  minRole: OrgRole
): Promise<void> {
  const membership = await getOrgMembership(userId, organizationId);
  if (ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[minRole]) {
    throw new ForbiddenError(`Requires ${minRole} role or higher`);
  }
}

export async function getProjectWithAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { organization: true },
  });
  if (!project) throw new NotFoundError('Project');
  await getOrgMembership(userId, project.organizationId);
  return project;
}

export async function getQueueWithAccess(userId: string, queueId: string) {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { project: true, retryPolicy: true },
  });
  if (!queue) throw new NotFoundError('Queue');
  await getOrgMembership(userId, queue.project.organizationId);
  return queue;
}

export async function getQueueWithRole(
  userId: string,
  queueId: string,
  minRole: OrgRole = OrgRole.VIEWER
) {
  const queue = await getQueueWithAccess(userId, queueId);
  await requireOrgRole(userId, queue.project.organizationId, minRole);
  return queue;
}

export async function getJobWithRole(userId: string, jobId: string, minRole: OrgRole) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { queue: { include: { project: true } } },
  });
  if (!job) throw new NotFoundError('Job');
  await requireOrgRole(userId, job.queue.project.organizationId, minRole);
  return job;
}
