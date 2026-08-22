import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    jobDependency: {
      findMany: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import {
  validateNoDependencyCycle,
  validateDependencyJobsExist,
} from '../src/utils/dependencies';

describe('Job dependencies', () => {
  it('rejects self-dependency', async () => {
    await expect(
      validateNoDependencyCycle('job-a', ['job-a'])
    ).rejects.toThrow('cannot depend on itself');
  });

  it('detects direct cycle', async () => {
    vi.mocked(prisma.jobDependency.findMany).mockResolvedValueOnce([
      { dependsOnJobId: 'job-a' },
    ]);

    await expect(
      validateNoDependencyCycle('job-a', ['job-b'])
    ).rejects.toThrow('cycle detected');
  });

  it('allows acyclic dependencies', async () => {
    vi.mocked(prisma.jobDependency.findMany)
      .mockResolvedValueOnce([{ dependsOnJobId: 'job-c' }])
      .mockResolvedValueOnce([]);

    await expect(
      validateNoDependencyCycle('job-a', ['job-b'])
    ).resolves.toBeUndefined();
  });

  it('rejects missing dependency jobs', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValueOnce([{ id: 'job-b', queueId: 'q1' }]);

    await expect(
      validateDependencyJobsExist('q1', ['job-b', 'job-missing'])
    ).rejects.toThrow('not found');
  });

  it('rejects dependencies from another queue', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValueOnce([
      { id: 'job-b', queueId: 'q-other' },
    ]);

    await expect(
      validateDependencyJobsExist('q1', ['job-b'])
    ).rejects.toThrow('same queue');
  });
});
