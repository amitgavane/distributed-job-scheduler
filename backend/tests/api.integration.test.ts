import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';
import { JobStatus } from '@codity/shared';
import { promoteScheduledJobs } from '../src/services/job.service';

const app = createApp();
const runIntegration = process.env.SKIP_INTEGRATION !== 'true';

describe.skipIf(!runIntegration)('API integration', () => {
  const suffix = Date.now();
  const adminEmail = `admin-${suffix}@test.local`;
  const viewerEmail = `viewer-${suffix}@test.local`;
  let adminToken = '';
  let viewerToken = '';
  let orgId = '';
  let projectId = '';
  let queueId = '';
  let workerId = '';
  let workerSecret = '';

  async function resetWorkerSlots() {
    if (!workerId || !queueId) return;
    await prisma.job.updateMany({
      where: {
        queueId,
        status: { in: ['CLAIMED', 'RUNNING'] },
      },
      data: {
        status: 'QUEUED',
        claimedById: null,
        claimedAt: null,
        startedAt: null,
      },
    });
    await prisma.worker.update({
      where: { id: workerId },
      data: { activeJobs: 0 },
    });
  }

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      email: adminEmail,
      password: 'password12345',
      name: 'Test Admin',
    });

    const login = await request(app).post('/api/auth/login').send({
      email: adminEmail,
      password: 'password12345',
    });
    adminToken = login.body.token;

    const org = await request(app)
      .post('/api/auth/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Org ${suffix}`, slug: `org-${suffix}` });
    orgId = org.body.id;

    const project = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: orgId, name: 'test-project' });
    projectId = project.body.id;

    const queue = await request(app)
      .post('/api/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId, name: 'test-queue', concurrency: 2, priority: 5 });
    queueId = queue.body.id;

    await request(app).post('/api/auth/register').send({
      email: viewerEmail,
      password: 'password12345',
      name: 'Test Viewer',
    });

    await request(app)
      .post(`/api/auth/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: viewerEmail, role: 'VIEWER' });

    const viewerLogin = await request(app).post('/api/auth/login').send({
      email: viewerEmail,
      password: 'password12345',
    });
    viewerToken = viewerLogin.body.token;

    const worker = await request(app)
      .post('/api/workers/register')
      .set('X-Worker-Registration-Key', config.workerRegistrationKey)
      .send({ hostname: `test-worker-${suffix}`, concurrency: 3 });
    workerId = worker.body.id;
    workerSecret = worker.body.secret;
  });

  afterAll(async () => {
    if (queueId) {
      await prisma.deadLetterEntry.deleteMany({ where: { queueId } });
      await prisma.scheduledJob.deleteMany({ where: { queueId } });
      await prisma.jobExecution.deleteMany({ where: { job: { queueId } } });
      await prisma.jobLog.deleteMany({ where: { job: { queueId } } });
      await prisma.jobDependency.deleteMany({ where: { job: { queueId } } });
      await prisma.job.deleteMany({ where: { queueId } });
      await prisma.queue.deleteMany({ where: { id: queueId } });
    }
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (orgId) {
      await prisma.organizationMember.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    if (workerId) {
      await prisma.workerHeartbeat.deleteMany({ where: { workerId } });
      await prisma.worker.deleteMany({ where: { id: workerId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, viewerEmail] } } });
    await prisma.$disconnect();
  });

  it('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('creates and lists immediate jobs', async () => {
    const created = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { message: 'hi' } });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe(JobStatus.QUEUED);

    const list = await request(app)
      .get(`/api/jobs?queueId=${queueId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((j: { id: string }) => j.id === created.body.id)).toBe(true);
  });

  it('creates delayed jobs with scheduled_jobs row', async () => {
    const created = await request(app)
      .post('/api/jobs/delayed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { n: 1 }, delayMs: 60_000 });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe(JobStatus.SCHEDULED);

    const row = await prisma.scheduledJob.findUnique({ where: { jobId: created.body.id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('PENDING');
    expect(row?.recurring).toBe(false);
  });

  it('creates scheduled jobs for a future time', async () => {
    const scheduledAt = new Date(Date.now() + 3600_000).toISOString();
    const created = await request(app)
      .post('/api/jobs/scheduled')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'sleep', payload: { durationMs: 10 }, scheduledAt });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe(JobStatus.SCHEDULED);

    const row = await prisma.scheduledJob.findUnique({ where: { jobId: created.body.id } });
    expect(row?.cronExpression).toBeNull();
  });

  it('creates recurring jobs with cron expression', async () => {
    const created = await request(app)
      .post('/api/jobs/recurring')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { tick: true }, cronExpression: '*/10 * * * *' });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('RECURRING');

    const row = await prisma.scheduledJob.findUnique({ where: { jobId: created.body.id } });
    expect(row?.recurring).toBe(true);
    expect(row?.cronExpression).toBe('*/10 * * * *');
  });

  it('creates batch jobs with child items', async () => {
    const created = await request(app)
      .post('/api/jobs/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        queueId,
        handler: 'echo',
        items: [{ a: 1 }, { a: 2 }, { a: 3 }],
      });
    expect(created.status).toBe(201);
    expect(created.body.childJobs).toHaveLength(3);
    expect(created.body.parentJob.type).toBe('BATCH');
  });

  it('returns the same job for duplicate idempotency keys', async () => {
    const key = `idem-${suffix}`;
    const first = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { v: 1 }, idempotencyKey: key });
    const second = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { v: 2 }, idempotencyKey: key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.payload).toEqual(first.body.payload);
  });

  it('promotes due scheduled jobs to queued', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const job = await request(app)
      .post('/api/jobs/scheduled')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        queueId,
        handler: 'echo',
        payload: { due: true },
        scheduledAt: future,
      });
    expect(job.body.status).toBe(JobStatus.SCHEDULED);

    await prisma.scheduledJob.update({
      where: { jobId: job.body.id },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });

    const result = await promoteScheduledJobs();
    expect(result.scheduled).toBeGreaterThanOrEqual(1);

    const updated = await prisma.job.findUnique({ where: { id: job.body.id } });
    expect(updated?.status).toBe(JobStatus.QUEUED);
  });

  it('blocks claiming jobs until dependencies complete', async () => {
    const prereq = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { step: 1 }, priority: 9999 });

    const dependent = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        queueId,
        handler: 'echo',
        payload: { step: 2 },
        dependsOn: [prereq.body.id],
        priority: 9998,
      });
    expect(dependent.status).toBe(201);

    const blockedClaim = await request(app)
      .post(`/api/workers/${workerId}/claim`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ maxJobs: 1 });

    const claimedDependent = blockedClaim.body.find(
      (j: { id: string }) => j.id === dependent.body.id
    );
    expect(claimedDependent).toBeUndefined();

    const claimedPrereq = blockedClaim.body.find(
      (j: { id: string }) => j.id === prereq.body.id
    );
    expect(claimedPrereq).toBeDefined();

    await request(app)
      .post(`/api/workers/${workerId}/jobs/${prereq.body.id}/start`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret);
    await request(app)
      .post(`/api/workers/${workerId}/jobs/${prereq.body.id}/complete`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ result: { ok: true }, durationMs: 5 });

    const afterClaim = await request(app)
      .post(`/api/workers/${workerId}/claim`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ maxJobs: 5 });

    const nowClaimed = afterClaim.body.find(
      (j: { id: string }) => j.id === dependent.body.id
    );
    expect(nowClaimed).toBeDefined();

    await request(app)
      .post(`/api/workers/${workerId}/jobs/${dependent.body.id}/start`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret);
    await request(app)
      .post(`/api/workers/${workerId}/jobs/${dependent.body.id}/complete`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ result: { ok: true }, durationMs: 5 });
  });

  it('enforces RBAC for viewers creating jobs', async () => {
    const res = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ queueId, handler: 'echo', payload: {} });
    expect(res.status).toBe(403);
  });

  it('claims and completes a job via worker API', async () => {
    await resetWorkerSlots();

    const job = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'echo', payload: { n: 1 }, priority: 99999 });

    const claimed = await request(app)
      .post(`/api/workers/${workerId}/claim`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ maxJobs: 1 });
    expect(claimed.status).toBe(200);
    expect(claimed.body.length).toBeGreaterThanOrEqual(1);

    const jobId = claimed.body.find((j: { id: string }) => j.id === job.body.id)?.id || claimed.body[0].id;

    await request(app)
      .post(`/api/workers/${workerId}/jobs/${jobId}/start`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret);

    const completed = await request(app)
      .post(`/api/workers/${workerId}/jobs/${jobId}/complete`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ result: { ok: true }, durationMs: 10 });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe(JobStatus.COMPLETED);
  });

  it('moves exhausted failures to dead letter with failure summary', async () => {
    await resetWorkerSlots();

    const job = await request(app)
      .post('/api/jobs/immediate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ queueId, handler: 'fail', payload: {}, maxAttempts: 1, priority: 9999 });

    const claim = await request(app)
      .post(`/api/workers/${workerId}/claim`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ maxJobs: 10 });

    const target = claim.body.find((j: { id: string }) => j.id === job.body.id);
    expect(target).toBeDefined();

    await request(app)
      .post(`/api/workers/${workerId}/jobs/${target.id}/start`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret);

    await request(app)
      .post(`/api/workers/${workerId}/jobs/${target.id}/fail`)
      .set('X-Worker-Id', workerId)
      .set('X-Worker-Secret', workerSecret)
      .send({ error: 'simulated permanent failure' });

    const updated = await prisma.job.findUnique({ where: { id: job.body.id } });
    expect(updated?.status).toBe(JobStatus.DEAD_LETTER);

    const dlq = await request(app)
      .get(`/api/jobs/dead-letter?queueId=${queueId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dlq.status).toBe(200);
    const entry = dlq.body.data.find((e: { jobId: string }) => e.jobId === job.body.id);
    expect(entry).toBeDefined();
    expect(entry.failureSummary).toBeTruthy();
  });

  it('rejects worker claim without secret', async () => {
    const res = await request(app)
      .post(`/api/workers/${workerId}/claim`)
      .set('X-Worker-Id', workerId)
      .send({ maxJobs: 1 });
    expect(res.status).toBe(401);
  });

  it('lists organization members', async () => {
    const res = await request(app)
      .get(`/api/auth/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});
