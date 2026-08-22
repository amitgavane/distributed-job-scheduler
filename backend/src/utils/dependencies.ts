import { ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export async function validateNoDependencyCycle(
  jobId: string,
  dependsOnIds: string[]
): Promise<void> {
  if (dependsOnIds.length === 0) return;

  if (dependsOnIds.includes(jobId)) {
    throw new ValidationError('Job cannot depend on itself');
  }

  const visited = new Set<string>();
  const stack = [...dependsOnIds];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === jobId) {
      throw new ValidationError('Dependency cycle detected');
    }
    if (visited.has(current)) continue;
    visited.add(current);

    const upstream = await prisma.jobDependency.findMany({
      where: { jobId: current },
      select: { dependsOnJobId: true },
    });

    for (const dep of upstream) {
      stack.push(dep.dependsOnJobId);
    }
  }
}

export async function validateDependencyJobsExist(
  queueId: string,
  dependsOnIds: string[]
): Promise<void> {
  if (dependsOnIds.length === 0) return;

  const jobs = await prisma.job.findMany({
    where: { id: { in: dependsOnIds } },
    select: { id: true, queueId: true },
  });

  if (jobs.length !== dependsOnIds.length) {
    throw new ValidationError('One or more dependency jobs not found');
  }

  const wrongQueue = jobs.find((j) => j.queueId !== queueId);
  if (wrongQueue) {
    throw new ValidationError('Dependency jobs must be in the same queue');
  }
}
