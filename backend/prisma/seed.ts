import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { OrgRole, RetryStrategy, AUTHOR_NAME, AUTHOR_REGISTRATION, AUTHOR_LABEL } from '@codity/shared';
import { generateHeuristicSummary } from '../src/services/failure-analysis.service';

const prisma = new PrismaClient();

const HOURS_AGO = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const MINS_AGO = (m: number) => new Date(Date.now() - m * 60 * 1000);
const MINS_FROM_NOW = (m: number) => new Date(Date.now() + m * 60 * 1000);
const HOURS_FROM_NOW = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);

const CUSTOMER_DOMAINS = ['stripe.com', 'notion.so', 'figma.com', 'linear.app', 'vercel.com', 'supabase.io'];
const EMAIL_SUBJECTS = [
  'Your weekly usage summary',
  'Invoice #{{n}} is ready',
  'Password reset requested',
  'New login from Chrome on Windows',
  'Trial expires in 3 days',
  'Payment received — thank you',
  'Action required: verify billing info',
  'Export complete — download ready',
  'Team invite from James',
  'Scheduled maintenance tonight 2am UTC',
];

const TEAM = [
  { email: 'admin@test.local', name: 'Amit Gavane', role: OrgRole.OWNER },
  { email: 'sarah@acme.io', name: 'Sarah Jenkins', role: OrgRole.ADMIN },
  { email: 'james@acme.io', name: 'James Developer', role: OrgRole.MEMBER },
  { email: 'developer@acme.io', name: 'Test Engineer', role: OrgRole.MEMBER },
  { email: 'viewer@acme.io', name: 'Project Manager', role: OrgRole.VIEWER },
];

const RETIRED_MEMBER_EMAILS = ['priya@acme.io', 'viewer@acme.io'];

const HANDLERS = {
  echo: 'echo',
  sleep: 'sleep',
  fail: 'fail',
  email: 'send_email',
  http: 'http_request',
  data: 'process_data',
  random: 'random_fail',
} as const;

async function clearDemoHistory(projectIds: string[]) {
  const queues = await prisma.queue.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const queueIds = queues.map((q) => q.id);
  if (!queueIds.length) return;

  const jobs = await prisma.job.findMany({
    where: { queueId: { in: queueIds } },
    select: { id: true },
  });
  const jobIds = jobs.map((j) => j.id);

  if (jobIds.length) {
    await prisma.deadLetterEntry.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.scheduledJob.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobDependency.deleteMany({
      where: { OR: [{ jobId: { in: jobIds } }, { dependsOnJobId: { in: jobIds } }] },
    });
    await prisma.jobLog.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobExecution.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  }

  await prisma.workerHeartbeat.deleteMany({});
  await prisma.worker.deleteMany({});
  await prisma.systemEvent.deleteMany({});
}

async function seedUsers(passwordHash: string) {
  const users: Record<string, { id: string; email: string }> = {};

  for (const member of TEAM) {
    const user = await prisma.user.upsert({
      where: { email: member.email },
      update: { name: member.name },
      create: { email: member.email, passwordHash, name: member.name },
      select: { id: true, email: true },
    });
    users[member.email] = user;
  }

  return users;
}

async function seedOrg(users: Record<string, { id: string }>) {
  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: { name: 'Codity' },
    create: { name: 'Codity', slug: 'acme' },
  });

  for (const member of TEAM) {
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: users[member.email].id,
        },
      },
      update: { role: member.role },
      create: {
        organizationId: org.id,
        userId: users[member.email].id,
        role: member.role,
      },
    });
  }

  const teamUserIds = TEAM.map((m) => users[m.email].id);
  await prisma.organizationMember.deleteMany({
    where: { organizationId: org.id, userId: { notIn: teamUserIds } },
  });

  await prisma.organizationMember.deleteMany({
    where: { user: { email: { in: RETIRED_MEMBER_EMAILS } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: RETIRED_MEMBER_EMAILS } } });

  return org;
}

async function seedWorkers() {
  const specs = [
    { hostname: 'worker-prod-01', concurrency: 8, shardKey: null, activeJobs: 2, status: 'ONLINE' },
    { hostname: 'worker-prod-02', concurrency: 8, shardKey: 'notifications', activeJobs: 1, status: 'ONLINE' },
    { hostname: 'worker-prod-03', concurrency: 6, shardKey: 'payments', activeJobs: 3, status: 'ONLINE' },
    { hostname: 'worker-staging-01', concurrency: 4, shardKey: null, activeJobs: 0, status: 'ONLINE' },
    { hostname: 'worker-staging-02', concurrency: 4, shardKey: 'notifications', activeJobs: 0, status: 'DRAINING' },
    { hostname: 'worker-legacy-01', concurrency: 2, shardKey: null, activeJobs: 0, status: 'OFFLINE' },
  ];

  const workers = [];
  for (const spec of specs) {
    const startedAt = HOURS_AGO(72);
    const worker = await prisma.worker.create({
      data: {
        hostname: spec.hostname,
        concurrency: spec.concurrency,
        shardKey: spec.shardKey,
        status: spec.status,
        activeJobs: spec.activeJobs,
        metadata: {
          region: spec.hostname.includes('prod') ? 'us-east-1' : 'staging',
          version: '1.4.2',
          ...(spec.hostname === 'worker-prod-01'
            ? { submittedBy: AUTHOR_NAME, registrationNo: AUTHOR_REGISTRATION }
            : {}),
        },
        startedAt,
        lastSeenAt: spec.status === 'OFFLINE' ? HOURS_AGO(6) : MINS_AGO(spec.status === 'DRAINING' ? 8 : 1),
      },
    });

    const heartbeats = [];
    for (let h = 72; h >= 0; h -= 2) {
      heartbeats.push({
        workerId: worker.id,
        activeJobs: Math.floor(Math.random() * spec.concurrency),
        memoryMb: 180 + Math.random() * 120,
        cpuUsage: 10 + Math.random() * 40,
        createdAt: HOURS_AGO(h),
      });
    }
    await prisma.workerHeartbeat.createMany({ data: heartbeats });
    workers.push(worker);
  }

  return workers;
}

async function createCompletedJob(
  queueId: string,
  workerId: string,
  spec: {
    handler: string;
    payload: object;
    hoursAgo: number;
    durationMs: number;
    type?: string;
    priority?: number;
  }
) {
  const startedAt = HOURS_AGO(spec.hoursAgo);
  const completedAt = new Date(startedAt.getTime() + spec.durationMs);

  const job = await prisma.job.create({
    data: {
      queueId,
      type: spec.type || 'IMMEDIATE',
      status: 'COMPLETED',
      handler: spec.handler,
      payload: spec.payload,
      priority: spec.priority ?? 0,
      attempt: 1,
      maxAttempts: 3,
      startedAt,
      completedAt,
      durationMs: spec.durationMs,
      result: { ok: true },
      claimedById: workerId,
      claimedAt: startedAt,
    },
  });

  await prisma.jobExecution.create({
    data: {
      jobId: job.id,
      workerId,
      attempt: 1,
      status: 'COMPLETED',
      startedAt,
      completedAt,
      durationMs: spec.durationMs,
      result: { ok: true },
    },
  });

  await prisma.jobLog.createMany({
    data: [
      { jobId: job.id, level: 'INFO', message: 'claimed by worker', createdAt: startedAt },
      {
        jobId: job.id,
        level: 'INFO',
        message: 'handler finished',
        createdAt: completedAt,
      },
    ],
  });

  return job;
}

async function createDeadLetterJob(
  queueId: string,
  workerId: string,
  spec: { handler: string; payload: object; error: string; hoursAgo: number }
) {
  const failedAt = HOURS_AGO(spec.hoursAgo);
  const summary = generateHeuristicSummary({
    error: spec.error,
    attempts: 3,
    handler: spec.handler,
    recentErrors: [spec.error, spec.error, spec.error],
  });

  const job = await prisma.job.create({
    data: {
      queueId,
      type: 'IMMEDIATE',
      status: 'DEAD_LETTER',
      handler: spec.handler,
      payload: spec.payload,
      attempt: 3,
      maxAttempts: 3,
      lastError: spec.error,
      startedAt: new Date(failedAt.getTime() - 5000),
      completedAt: failedAt,
      durationMs: 4200,
      claimedById: workerId,
    },
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId,
        attempt,
        status: 'FAILED',
        startedAt: new Date(failedAt.getTime() - (4 - attempt) * 60000),
        completedAt: new Date(failedAt.getTime() - (4 - attempt) * 60000 + 3000),
        durationMs: 2800 + attempt * 200,
        error: spec.error,
      },
    });
  }

  await prisma.deadLetterEntry.create({
    data: {
      jobId: job.id,
      queueId,
      handler: spec.handler,
      payload: spec.payload,
      totalAttempts: 3,
      lastError: spec.error,
      failureSummary: summary,
      failedAt,
    },
  });

  return job;
}

async function createFailedExecution(
  queueId: string,
  workerId: string,
  spec: { handler: string; payload: object; error: string; hoursAgo: number }
) {
  const startedAt = HOURS_AGO(spec.hoursAgo);
  const completedAt = new Date(startedAt.getTime() + 2800);

  const job = await prisma.job.create({
    data: {
      queueId,
      type: 'IMMEDIATE',
      status: 'FAILED',
      handler: spec.handler,
      payload: spec.payload,
      attempt: 2,
      maxAttempts: 3,
      lastError: spec.error,
      nextRetryAt: MINS_FROM_NOW(5 + Math.floor(Math.random() * 20)),
      startedAt,
      completedAt,
      durationMs: 2800,
      claimedById: workerId,
    },
  });

  await prisma.jobExecution.createMany({
    data: [
      {
        jobId: job.id,
        workerId,
        attempt: 1,
        status: 'FAILED',
        startedAt: new Date(startedAt.getTime() - 120_000),
        completedAt: new Date(startedAt.getTime() - 117_000),
        durationMs: 3100,
        error: spec.error,
      },
      {
        jobId: job.id,
        workerId,
        attempt: 2,
        status: 'FAILED',
        startedAt,
        completedAt,
        durationMs: 2800,
        error: spec.error,
      },
    ],
  });

  return job;
}

async function seedEvents(count: number, queueNames: Record<string, string>) {
  const types = [
    'job:created',
    'job:completed',
    'job:claimed',
    'job:dead_letter',
    'job:retry_scheduled',
    'worker:registered',
    'scheduler:tick',
    'batch:created',
  ] as const;

  const payloads: Record<string, object> = {
    'job:created': { queue: 'emails', type: 'IMMEDIATE', handler: 'send_email' },
    'job:completed': { queue: 'webhooks', durationMs: 640, worker: 'worker-prod-01' },
    'job:claimed': { queue: 'priority', worker: 'worker-prod-02' },
    'job:dead_letter': { queue: 'webhooks', error: 'ECONNREFUSED' },
    'job:retry_scheduled': { attempt: 2, delayMs: 10000 },
    'worker:registered': { hostname: 'worker-prod-03', shardKey: 'payments' },
    'scheduler:tick': { promoted: 4, staleWorkers: 0, releasedClaims: 1 },
    'batch:created': { parentJobId: 'batch-nightly', count: 12 },
  };

  const events = Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    const hoursBack = (i / count) * 72;
    return {
      type,
      source: type === 'scheduler:tick' ? 'scheduler' : i % 5 === 0 ? 'worker' : 'api',
      payload: {
        ...payloads[type],
        queueName: queueNames[Object.keys(queueNames)[i % Object.keys(queueNames).length]],
        demo: true,
        seq: i,
      },
      createdAt: HOURS_AGO(hoursBack),
    };
  });

  await prisma.systemEvent.createMany({ data: events });
}

async function seedThroughputWave(
  queueId: string,
  workerId: string,
  hours: number,
  jobsPerHour: number
) {
  for (let h = hours; h >= 0; h--) {
    const count = jobsPerHour + Math.floor(Math.random() * 8) - 2;
    for (let j = 0; j < count; j++) {
      const isFail = h < 6 && j % 11 === 0;
      if (isFail) {
        await createFailedExecution(queueId, workerId, {
          handler: HANDLERS.http,
          payload: { url: `https://${CUSTOMER_DOMAINS[j % CUSTOMER_DOMAINS.length]}/hooks`, method: 'POST' },
          error: j % 2 === 0 ? 'ETIMEDOUT: upstream timeout after 30s' : 'HTTP 503 Service Unavailable',
          hoursAgo: h + j * 0.02,
        });
      } else {
        const handler = [HANDLERS.email, HANDLERS.data, HANDLERS.http, HANDLERS.echo][j % 4];
        await createCompletedJob(queueId, workerId, {
          handler,
          payload:
            handler === HANDLERS.email
              ? { to: `user${j}@customer.io`, subject: EMAIL_SUBJECTS[j % EMAIL_SUBJECTS.length].replace('{{n}}', String(1000 + j)) }
              : handler === HANDLERS.http
                ? { url: `https://httpbin.org/status/${j % 3 === 0 ? 200 : 201}`, method: 'POST' }
                : handler === HANDLERS.data
                  ? { data: Array.from({ length: 5 + (j % 10) }, (_, k) => ({ id: k })) }
                  : { ping: j, hour: h },
          hoursAgo: h + j * 0.015,
          durationMs: 120 + Math.floor(Math.random() * 800),
          priority: j % 5 === 0 ? 50 : 10,
        });
      }
    }
  }
}

async function seedRecentActivity(queues: Record<string, string>, workers: string[]) {
  const [w1, w2, w3] = workers;
  // jobs in last ~2 min for jobs/minute stat
  for (let i = 0; i < 12; i++) {
    await createCompletedJob(queues.emails, w2, {
      handler: HANDLERS.email,
      payload: { to: `live${i}@acme.io`, subject: `Live delivery #${i}` },
      hoursAgo: 0.01 + i * 0.003,
      durationMs: 400 + i * 20,
    });
  }

  for (let i = 0; i < 6; i++) {
    await createCompletedJob(queues.webhooks, w1, {
      handler: HANDLERS.http,
      payload: { url: 'https://httpbin.org/post', method: 'POST', event: `order.paid.${i}` },
      hoursAgo: 0.02 + i * 0.005,
      durationMs: 550 + i * 30,
    });
  }

  await createCompletedJob(queues.priority, w3, {
    handler: HANDLERS.echo,
    payload: { alert: 'deploy-canary-ok', commit: 'a3f91c2' },
    hoursAgo: 0.008,
    durationMs: 35,
    priority: 99,
  });
}

async function main() {
  console.log(`Seeding database — ${AUTHOR_LABEL}...`);

  const passwordHash = await bcrypt.hash('password123', 12);
  const users = await seedUsers(passwordHash);
  const org = await seedOrg(users);
  const adminId = users['admin@test.local'].id;

  const defaultPolicy = await prisma.retryPolicy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Default Exponential',
      strategy: RetryStrategy.EXPONENTIAL,
      maxAttempts: 3,
      baseDelayMs: 5000,
      maxDelayMs: 300000,
      multiplier: 2,
    },
  });

  const aggressivePolicy = await prisma.retryPolicy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      name: 'Fixed Retry',
      strategy: RetryStrategy.FIXED,
      maxAttempts: 5,
      baseDelayMs: 10000,
    },
  });

  const gentlePolicy = await prisma.retryPolicy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      name: 'Linear Backoff',
      strategy: RetryStrategy.LINEAR,
      maxAttempts: 4,
      baseDelayMs: 3000,
      maxDelayMs: 120000,
      multiplier: 1.5,
    },
  });

  const mainProject = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {
      name: 'main-app',
      description: 'main product app',
    },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      organizationId: org.id,
      name: 'main-app',
      description: 'main product app',
      createdById: adminId,
    },
  });

  const billingProject = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      organizationId: org.id,
      name: 'billing-service',
      description: 'Invoices, dunning emails, Stripe webhooks',
      createdById: users['sarah@acme.io'].id,
    },
  });

  const analyticsProject = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      organizationId: org.id,
      name: 'analytics-pipeline',
      description: 'ETL and nightly reports',
      createdById: users['james@acme.io'].id,
    },
  });

  await clearDemoHistory([mainProject.id, billingProject.id, analyticsProject.id]);

  const defaultQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: mainProject.id, name: 'default' } },
    update: {},
    create: {
      projectId: mainProject.id,
      name: 'default',
      description: 'General background work',
      priority: 10,
      concurrency: 5,
      retryPolicyId: defaultPolicy.id,
      rateLimitPerMin: 120,
    },
  });

  const priorityQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: mainProject.id, name: 'priority' } },
    update: {},
    create: {
      projectId: mainProject.id,
      name: 'priority',
      description: 'User-facing latency sensitive jobs',
      priority: 100,
      concurrency: 3,
      retryPolicyId: aggressivePolicy.id,
    },
  });

  const emailQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: mainProject.id, name: 'emails' } },
    update: {},
    create: {
      projectId: mainProject.id,
      name: 'emails',
      description: 'Transactional email delivery',
      priority: 50,
      concurrency: 10,
      shardKey: 'notifications',
      retryPolicyId: gentlePolicy.id,
      rateLimitPerMin: 200,
    },
  });

  const webhookQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: mainProject.id, name: 'webhooks' } },
    update: {},
    create: {
      projectId: mainProject.id,
      name: 'webhooks',
      description: 'Outbound HTTP callbacks to customer endpoints',
      priority: 30,
      concurrency: 8,
      retryPolicyId: defaultPolicy.id,
      rateLimitPerMin: 60,
    },
  });

  const importsQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: mainProject.id, name: 'imports' } },
    update: { status: 'PAUSED' },
    create: {
      projectId: mainProject.id,
      name: 'imports',
      description: 'CSV / bulk imports — paused during schema migration',
      priority: 5,
      concurrency: 2,
      status: 'PAUSED',
      retryPolicyId: defaultPolicy.id,
    },
  });

  const invoicingQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: billingProject.id, name: 'invoicing' } },
    update: {},
    create: {
      projectId: billingProject.id,
      name: 'invoicing',
      description: 'Monthly invoice generation',
      priority: 40,
      concurrency: 4,
      retryPolicyId: defaultPolicy.id,
    },
  });

  const dunningQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: billingProject.id, name: 'dunning' } },
    update: {},
    create: {
      projectId: billingProject.id,
      name: 'dunning',
      description: 'Failed payment reminders',
      priority: 60,
      concurrency: 6,
      shardKey: 'notifications',
      retryPolicyId: aggressivePolicy.id,
    },
  });

  const stripeWebhooksQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: billingProject.id, name: 'stripe-events' } },
    update: {},
    create: {
      projectId: billingProject.id,
      name: 'stripe-events',
      description: 'Stripe webhook ingestion (checkout, invoice, dispute)',
      priority: 90,
      concurrency: 12,
      shardKey: 'payments',
      retryPolicyId: aggressivePolicy.id,
      rateLimitPerMin: 300,
    },
  });

  const etlQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: analyticsProject.id, name: 'etl' } },
    update: {},
    create: {
      projectId: analyticsProject.id,
      name: 'etl',
      description: 'Nightly warehouse sync — BigQuery export',
      priority: 20,
      concurrency: 3,
      retryPolicyId: gentlePolicy.id,
    },
  });

  const reportsQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: analyticsProject.id, name: 'reports' } },
    update: {},
    create: {
      projectId: analyticsProject.id,
      name: 'reports',
      description: 'Cohort & retention PDF reports',
      priority: 35,
      concurrency: 4,
      retryPolicyId: defaultPolicy.id,
    },
  });

  const workers = await seedWorkers();
  const w1 = workers[0].id;
  const w2 = workers[1].id;
  const w3 = workers[2].id;

  const queueMap = {
    default: defaultQueue.id,
    priority: priorityQueue.id,
    emails: emailQueue.id,
    webhooks: webhookQueue.id,
    invoicing: invoicingQueue.id,
    dunning: dunningQueue.id,
    stripe: stripeWebhooksQueue.id,
    etl: etlQueue.id,
    reports: reportsQueue.id,
  };

  // --- completed history (spread over 3 days for charts) ---
  const completedSpecs = [
    { handler: HANDLERS.email, payload: { to: 'user1@example.com', subject: 'Welcome to Acme' }, hoursAgo: 71, durationMs: 620, queue: emailQueue.id, priority: 10 },
    { handler: HANDLERS.email, payload: { to: 'user2@example.com', subject: 'Password reset' }, hoursAgo: 70, durationMs: 540, queue: emailQueue.id },
    { handler: HANDLERS.email, payload: { to: 'billing@corp.io', subject: 'Invoice #1042' }, hoursAgo: 68, durationMs: 480, queue: emailQueue.id },
    { handler: HANDLERS.http, payload: { url: 'https://httpbin.org/post', method: 'POST' }, hoursAgo: 65, durationMs: 890, queue: webhookQueue.id },
    { handler: HANDLERS.http, payload: { url: 'https://httpbin.org/status/200' }, hoursAgo: 64, durationMs: 720, queue: webhookQueue.id },
    { handler: HANDLERS.data, payload: { data: [{ sku: 'A1' }, { sku: 'B2' }] }, hoursAgo: 60, durationMs: 340, queue: defaultQueue.id },
    { handler: HANDLERS.data, payload: { data: Array.from({ length: 50 }, (_, i) => ({ row: i })) }, hoursAgo: 55, durationMs: 1200, queue: defaultQueue.id },
    { handler: HANDLERS.echo, payload: { check: 'health' }, hoursAgo: 48, durationMs: 45, queue: priorityQueue.id, priority: 90 },
    { handler: HANDLERS.email, payload: { to: 'ops@acme.io', subject: 'Daily digest' }, hoursAgo: 47, durationMs: 510, queue: emailQueue.id },
    { handler: HANDLERS.http, payload: { url: 'https://httpbin.org/delay/1' }, hoursAgo: 44, durationMs: 1400, queue: webhookQueue.id },
    { handler: HANDLERS.data, payload: { data: [{ invoiceId: 'inv_001' }] }, hoursAgo: 40, durationMs: 280, queue: invoicingQueue.id },
    { handler: HANDLERS.email, payload: { to: 'late@customer.com', subject: 'Payment reminder' }, hoursAgo: 36, durationMs: 490, queue: dunningQueue.id },
    { handler: HANDLERS.echo, payload: { message: 'deploy smoke test' }, hoursAgo: 30, durationMs: 38, queue: priorityQueue.id },
    { handler: HANDLERS.email, payload: { to: 'team@acme.io', subject: 'Weekly report' }, hoursAgo: 24, durationMs: 530, queue: emailQueue.id },
    { handler: HANDLERS.http, payload: { url: 'https://httpbin.org/headers' }, hoursAgo: 20, durationMs: 680, queue: webhookQueue.id },
    { handler: HANDLERS.data, payload: { data: [{ metric: 'mrr', value: 12400 }] }, hoursAgo: 18, durationMs: 310, queue: invoicingQueue.id },
    { handler: HANDLERS.email, payload: { to: 'new@signup.io', subject: 'Verify your email' }, hoursAgo: 12, durationMs: 505, queue: emailQueue.id },
    { handler: HANDLERS.echo, payload: { ping: true }, hoursAgo: 8, durationMs: 42, queue: defaultQueue.id },
    { handler: HANDLERS.http, payload: { url: 'https://httpbin.org/uuid' }, hoursAgo: 6, durationMs: 750, queue: webhookQueue.id },
    { handler: HANDLERS.email, payload: { to: 'finance@acme.io', subject: 'March close' }, hoursAgo: 4, durationMs: 495, queue: emailQueue.id },
    { handler: HANDLERS.data, payload: { data: [{ userId: 'u_42', plan: 'pro' }] }, hoursAgo: 3, durationMs: 265, queue: defaultQueue.id },
    { handler: HANDLERS.echo, payload: { region: 'us-east' }, hoursAgo: 2, durationMs: 40, queue: priorityQueue.id },
    { handler: HANDLERS.email, payload: { to: 'alert@acme.io', subject: 'CPU spike resolved' }, hoursAgo: 1.5, durationMs: 520, queue: emailQueue.id },
    { handler: HANDLERS.http, payload: { url: 'https://httpbin.org/ip' }, hoursAgo: 1, durationMs: 690, queue: webhookQueue.id },
    { handler: HANDLERS.data, payload: { data: [{ cohort: 'feb', retained: 0.82 }] }, hoursAgo: 0.5, durationMs: 290, queue: invoicingQueue.id },
  ];

  for (const spec of completedSpecs) {
    await createCompletedJob(spec.queue, spec.queue === emailQueue.id || spec.queue === dunningQueue.id ? w2 : w1, {
      handler: spec.handler,
      payload: spec.payload,
      hoursAgo: spec.hoursAgo,
      durationMs: spec.durationMs,
      priority: spec.priority,
    });
  }

  // bulk completed jobs for throughput chart density
  for (let i = 0; i < 35; i++) {
    const hour = 72 - (i % 48);
    await createCompletedJob(defaultQueue.id, w1, {
      handler: i % 4 === 0 ? HANDLERS.echo : HANDLERS.data,
      payload: i % 4 === 0 ? { tick: i } : { data: [{ batch: i }] },
      hoursAgo: hour + Math.random(),
      durationMs: 80 + Math.floor(Math.random() * 400),
    });
  }

  // dense 24h wave for charts (main + email traffic)
  await seedThroughputWave(emailQueue.id, w2, 24, 6);
  await seedThroughputWave(webhookQueue.id, w1, 24, 4);
  await seedThroughputWave(stripeWebhooksQueue.id, w3, 24, 3);
  await seedThroughputWave(etlQueue.id, w1, 48, 2);

  // recent activity for live metrics
  await seedRecentActivity(queueMap, [w1, w2, w3]);

  // --- active / pending jobs ---
  const runningJob = await prisma.job.create({
    data: {
      queueId: defaultQueue.id,
      type: 'IMMEDIATE',
      status: 'RUNNING',
      handler: HANDLERS.data,
      payload: { data: Array.from({ length: 200 }, (_, i) => ({ i })) },
      priority: 20,
      attempt: 1,
      maxAttempts: 3,
      startedAt: MINS_AGO(2),
      claimedById: w1,
      claimedAt: MINS_AGO(2),
    },
  });
  await prisma.jobExecution.create({
    data: {
      jobId: runningJob.id,
      workerId: w1,
      attempt: 1,
      status: 'RUNNING',
      startedAt: MINS_AGO(2),
    },
  });

  await prisma.job.createMany({
    data: [
      { queueId: defaultQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.echo, payload: { message: 'queued export' }, priority: 15 },
      { queueId: defaultQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.sleep, payload: { durationMs: 3000 }, priority: 5 },
      { queueId: defaultQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.data, payload: { sync: 'crm-contacts', rows: 4200 }, priority: 12 },
      { queueId: priorityQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.email, payload: { to: 'vip@client.com', subject: 'Priority alert' }, priority: 95 },
      { queueId: priorityQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.echo, payload: { incident: 'P2', runbook: 'rollback-api' }, priority: 88 },
      { queueId: emailQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.email, payload: { to: 'batch@list.io', subject: 'Newsletter #14' }, priority: 10 },
      { queueId: emailQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.email, payload: { to: 'onboarding@trial.io', subject: 'Day 3 tips' }, priority: 8 },
      { queueId: emailQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.email, payload: { to: 'ops@acme.io', subject: 'Queue depth warning' }, priority: 45 },
      { queueId: webhookQueue.id, type: 'IMMEDIATE', status: 'CLAIMED', handler: HANDLERS.http, payload: { url: 'https://httpbin.org/post' }, priority: 30, claimedById: w1, claimedAt: MINS_AGO(1), attempt: 1, maxAttempts: 3 },
      { queueId: webhookQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.http, payload: { url: 'https://partner.api/sync', event: 'user.updated' }, priority: 25 },
      { queueId: stripeWebhooksQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.data, payload: { event: 'invoice.paid', customer: 'cus_Nx8k2' }, priority: 70 },
      { queueId: stripeWebhooksQueue.id, type: 'IMMEDIATE', status: 'RUNNING', handler: HANDLERS.data, payload: { event: 'charge.dispute.created' }, priority: 85, claimedById: w3, claimedAt: MINS_AGO(3), startedAt: MINS_AGO(3), attempt: 1, maxAttempts: 5 },
      { queueId: etlQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.data, payload: { table: 'events', partition: '2026-07-03' }, priority: 18 },
      { queueId: reportsQueue.id, type: 'IMMEDIATE', status: 'QUEUED', handler: HANDLERS.data, payload: { report: 'weekly-retention', format: 'pdf' }, priority: 22 },
      { queueId: defaultQueue.id, type: 'DELAYED', status: 'SCHEDULED', handler: HANDLERS.email, payload: { to: 'reminder@user.io', subject: 'Trial ending' }, scheduledAt: MINS_FROM_NOW(45), priority: 20 },
      { queueId: priorityQueue.id, type: 'SCHEDULED', status: 'SCHEDULED', handler: HANDLERS.echo, payload: { cron: 'backup' }, scheduledAt: MINS_FROM_NOW(120), priority: 80 },
      { queueId: invoicingQueue.id, type: 'RECURRING', status: 'SCHEDULED', handler: HANDLERS.data, payload: { report: 'mrr' }, cronExpression: '0 9 1 * *', scheduledAt: MINS_FROM_NOW(1440), priority: 50 },
      { queueId: reportsQueue.id, type: 'RECURRING', status: 'SCHEDULED', handler: HANDLERS.data, payload: { report: 'dau-wau' }, cronExpression: '0 6 * * 1', scheduledAt: HOURS_FROM_NOW(18), priority: 40 },
      { queueId: emailQueue.id, type: 'RECURRING', status: 'SCHEDULED', handler: HANDLERS.email, payload: { campaign: 'digest' }, cronExpression: '0 8 * * *', scheduledAt: HOURS_FROM_NOW(2), priority: 30 },
      { queueId: defaultQueue.id, type: 'IMMEDIATE', status: 'FAILED', handler: HANDLERS.random, payload: { failRate: 0.8 }, attempt: 2, maxAttempts: 3, lastError: 'Random failure triggered', nextRetryAt: MINS_FROM_NOW(3), priority: 0 },
      { queueId: webhookQueue.id, type: 'IMMEDIATE', status: 'FAILED', handler: HANDLERS.http, payload: { url: 'https://slow.partner.dev/hook' }, attempt: 1, maxAttempts: 5, lastError: 'ETIMEDOUT', nextRetryAt: MINS_FROM_NOW(8), priority: 15 },
      { queueId: webhookQueue.id, type: 'IMMEDIATE', status: 'CANCELLED', handler: HANDLERS.http, payload: { url: 'https://deprecated.endpoint/hook' }, priority: 0 },
    ],
  });

  const scheduledRows = await prisma.job.findMany({
    where: {
      status: 'SCHEDULED',
      queueId: {
        in: [
          defaultQueue.id,
          priorityQueue.id,
          invoicingQueue.id,
          reportsQueue.id,
          emailQueue.id,
        ],
      },
    },
  });
  for (const job of scheduledRows) {
    if (!job.scheduledAt) continue;
    await prisma.scheduledJob.create({
      data: {
        jobId: job.id,
        queueId: job.queueId,
        scheduledAt: job.scheduledAt,
        cronExpression: job.cronExpression,
        recurring: job.type === 'RECURRING',
      },
    });
  }

  // batch job with children
  const batchParent = await prisma.job.create({
    data: {
      queueId: defaultQueue.id,
      type: 'BATCH',
      status: 'RUNNING',
      handler: HANDLERS.data,
      payload: { batchSize: 12, label: 'nightly CRM sync', source: 'salesforce' },
      priority: 25,
      maxAttempts: 3,
      startedAt: MINS_AGO(10),
    },
  });

  const batchChildren = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      prisma.job.create({
        data: {
          queueId: defaultQueue.id,
          type: 'BATCH',
          status: i < 8 ? 'COMPLETED' : i < 10 ? 'QUEUED' : 'FAILED',
          handler: HANDLERS.data,
          payload: { chunk: i, records: 250, object: 'Contact' },
          parentJobId: batchParent.id,
          batchIndex: i,
          maxAttempts: 3,
          ...(i < 8
            ? {
                startedAt: MINS_AGO(9 - i * 0.3),
                completedAt: MINS_AGO(8.5 - i * 0.3),
                durationMs: 180 + i * 40,
                result: { processed: 250, failed: 0 },
                claimedById: w1,
              }
            : i >= 10
              ? {
                  attempt: 2,
                  lastError: 'Validation failed: missing email on row 41',
                  nextRetryAt: MINS_FROM_NOW(12),
                }
              : {}),
        },
      })
    )
  );

  // dependency chain: report waits on two completed prerequisites
  const prereq1 = await createCompletedJob(defaultQueue.id, w1, {
    handler: HANDLERS.data,
    payload: { step: 'extract' },
    hoursAgo: 0.3,
    durationMs: 180,
  });
  const prereq2 = await createCompletedJob(defaultQueue.id, w1, {
    handler: HANDLERS.data,
    payload: { step: 'transform' },
    hoursAgo: 0.2,
    durationMs: 220,
  });

  const dependentJob = await prisma.job.create({
    data: {
      queueId: defaultQueue.id,
      type: 'IMMEDIATE',
      status: 'QUEUED',
      handler: HANDLERS.data,
      payload: { step: 'load', report: 'daily_summary' },
      priority: 40,
      maxAttempts: 3,
    },
  });

  await prisma.jobDependency.createMany({
    data: [
      { jobId: dependentJob.id, dependsOnJobId: prereq1.id },
      { jobId: dependentJob.id, dependsOnJobId: prereq2.id },
    ],
  });

  void batchChildren;

  // --- dead letter queue entries ---
  await createDeadLetterJob(webhookQueue.id, w1, {
    handler: HANDLERS.http,
    payload: { url: 'https://customer.api/hooks/billing', method: 'POST' },
    error: 'ECONNREFUSED: connection refused at customer.api:443',
    hoursAgo: 22,
  });

  await createDeadLetterJob(webhookQueue.id, w1, {
    handler: HANDLERS.http,
    payload: { url: 'https://old-saas.io/webhook', method: 'POST' },
    error: 'getaddrinfo ENOTFOUND old-saas.io',
    hoursAgo: 14,
  });

  await createDeadLetterJob(emailQueue.id, w2, {
    handler: HANDLERS.email,
    payload: { to: 'invalid@', subject: 'Bad address test' },
    error: 'Validation failed: invalid email format',
    hoursAgo: 8,
  });

  await createDeadLetterJob(dunningQueue.id, w2, {
    handler: HANDLERS.fail,
    payload: { message: 'Stripe charge permanently declined' },
    error: 'Stripe charge permanently declined',
    hoursAgo: 5,
  });

  await createDeadLetterJob(defaultQueue.id, w1, {
    handler: HANDLERS.random,
    payload: { failRate: 1 },
    error: 'Random failure triggered',
    hoursAgo: 2,
  });

  await createDeadLetterJob(stripeWebhooksQueue.id, w3, {
    handler: HANDLERS.data,
    payload: { event: 'payment_intent.payment_failed', customer: 'cus_8xK2m' },
    error: 'Stripe API 401: expired webhook signing secret',
    hoursAgo: 16,
  });

  await createDeadLetterJob(etlQueue.id, w1, {
    handler: HANDLERS.data,
    payload: { table: 'sessions', partition: '2026-07-01' },
    error: 'ENOMEM: JavaScript heap out of memory during transform',
    hoursAgo: 28,
  });

  await createDeadLetterJob(reportsQueue.id, w1, {
    handler: HANDLERS.http,
    payload: { url: 'https://pdf-service.internal/render', report: 'cohort-q2' },
    error: 'ENOTFOUND pdf-service.internal',
    hoursAgo: 9,
  });

  // retry history jobs
  for (let i = 0; i < 6; i++) {
    await prisma.job.create({
      data: {
        queueId: i % 2 === 0 ? webhookQueue.id : defaultQueue.id,
        type: 'IMMEDIATE',
        status: 'COMPLETED',
        handler: HANDLERS.http,
        payload: { url: 'https://httpbin.org/status/500' },
        attempt: 2,
        maxAttempts: 3,
        lastError: 'HTTP 500 from upstream',
        startedAt: HOURS_AGO(10 + i),
        completedAt: HOURS_AGO(10 + i - 0.1),
        durationMs: 900,
        claimedById: w1,
      },
    });
  }

  await seedEvents(120, {
    default: 'default',
    emails: 'emails',
    webhooks: 'webhooks',
    priority: 'priority',
    stripe: 'stripe-events',
    etl: 'etl',
  });

  const jobCount = await prisma.job.count();
  const dlqCount = await prisma.deadLetterEntry.count();
  const eventCount = await prisma.systemEvent.count();

  await prisma.systemEvent.create({
    data: {
      type: 'system:seeded',
      source: 'seed',
      payload: {
        author: AUTHOR_NAME,
        registrationNo: AUTHOR_REGISTRATION,
        label: AUTHOR_LABEL,
      },
    },
  });

  console.log('');
  console.log(`Seed done. (${AUTHOR_LABEL})`);
  console.log('');
  console.log('Logins (all password: password123):');
  for (const m of TEAM) {
    console.log(`  ${m.role.padEnd(6)} ${m.email}`);
  }
  console.log('');
  console.log(`  ${jobCount} jobs, ${dlqCount} DLQ entries, ${workers.length} workers, 3 projects, 10 queues, ${eventCount} events`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
