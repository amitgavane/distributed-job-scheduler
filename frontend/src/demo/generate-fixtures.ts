import type { DeadLetterEntry, Job, JobDetail, JobLog, SystemEvent } from '../lib/api';

const H = {
  echo: 'echo',
  sleep: 'sleep',
  fail: 'fail',
  email: 'send_email',
  http: 'http_request',
  data: 'process_data',
  random: 'random_fail',
} as const;

const DOMAINS = ['stripe.com', 'notion.so', 'figma.com', 'linear.app', 'vercel.com', 'supabase.io'];
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

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

type WorkerRef = { id: string; hostname: string };

const W1: WorkerRef = { id: 'demo-w-1', hostname: 'worker-prod-01' };
const W2: WorkerRef = { id: 'demo-w-2', hostname: 'worker-prod-02' };
const W3: WorkerRef = { id: 'demo-w-3', hostname: 'worker-prod-03' };

function makeJob(
  id: string,
  queueId: string,
  status: string,
  handler: string,
  extra: Partial<Job> = {}
): Job {
  const createdAt = extra.createdAt || minsAgo(30 + (id.length % 40));
  return {
    id,
    queueId,
    type: 'IMMEDIATE',
    status,
    handler,
    payload: { demo: true, handler },
    priority: 10,
    attempt: status === 'FAILED' ? 2 : 1,
    maxAttempts: 3,
    createdAt,
    startedAt: ['RUNNING', 'COMPLETED', 'FAILED', 'CLAIMED'].includes(status) ? minsAgo(28) : undefined,
    completedAt: status === 'COMPLETED' ? minsAgo(27) : undefined,
    durationMs: status === 'COMPLETED' ? 640 : undefined,
    lastError: status === 'FAILED' ? 'ETIMEDOUT: upstream timeout after 30s' : undefined,
    claimedBy: ['RUNNING', 'CLAIMED'].includes(status) ? W1 : undefined,
    _count: { executions: status === 'FAILED' ? 2 : 1, logs: 3 },
    ...extra,
  };
}

function completedHistory(
  queueId: string,
  prefix: string,
  count: number,
  worker: WorkerRef,
  handlerMix: string[]
): Job[] {
  return Array.from({ length: count }, (_, i) => {
    const handler = handlerMix[i % handlerMix.length];
    const hours = 72 - (i % 48) - (i % 7) * 0.1;
    const startedAt = hoursAgo(hours);
    const durationMs = 120 + (i % 9) * 85;
    const payload =
      handler === H.email
        ? { to: `user${i}@customer.io`, subject: EMAIL_SUBJECTS[i % EMAIL_SUBJECTS.length].replace('{{n}}', String(1000 + i)) }
        : handler === H.http
          ? { url: `https://${DOMAINS[i % DOMAINS.length]}/hooks`, method: 'POST' }
          : handler === H.data
            ? { data: Array.from({ length: 3 + (i % 5) }, (_, k) => ({ id: k })) }
            : { ping: i, hour: Math.floor(hours) };

    return makeJob(`${prefix}-hist-${i}`, queueId, 'COMPLETED', handler, {
      type: 'IMMEDIATE',
      priority: i % 5 === 0 ? 50 : 10,
      createdAt: startedAt,
      startedAt,
      completedAt: new Date(new Date(startedAt).getTime() + durationMs).toISOString(),
      durationMs,
      payload,
      claimedBy: worker,
      attempt: 1,
    });
  });
}

export function buildDemoJobs(queues: Record<string, string>): Job[] {
  const {
    default: qDefault,
    priority: qPriority,
    emails: qEmails,
    webhooks: qWebhooks,
    imports: qImports,
    invoicing: qInvoicing,
    dunning: qDunning,
    stripe: qStripe,
    etl: qEtl,
    reports: qReports,
  } = queues;

  const jobs: Job[] = [
    makeJob('job-default-running', qDefault, 'RUNNING', H.data, {
      priority: 20,
      payload: { data: Array.from({ length: 200 }, (_, i) => ({ i })) },
      startedAt: minsAgo(2),
      claimedBy: W1,
      type: 'IMMEDIATE',
    }),
    makeJob('job-default-q1', qDefault, 'QUEUED', H.echo, { priority: 15, payload: { message: 'queued export' } }),
    makeJob('job-default-q2', qDefault, 'QUEUED', H.sleep, { priority: 5, payload: { durationMs: 3000 } }),
    makeJob('job-default-q3', qDefault, 'QUEUED', H.data, { priority: 12, payload: { sync: 'crm-contacts', rows: 4200 } }),
    makeJob('job-default-failed', qDefault, 'FAILED', H.random, {
      priority: 0,
      attempt: 2,
      lastError: 'Random failure triggered',
      payload: { failRate: 0.8 },
    }),
    makeJob('job-default-scheduled', qDefault, 'SCHEDULED', H.email, {
      type: 'DELAYED',
      priority: 20,
      payload: { to: 'reminder@user.io', subject: 'Trial ending' },
      startedAt: undefined,
    }),

    makeJob('job-priority-q1', qPriority, 'QUEUED', H.email, {
      priority: 95,
      payload: { to: 'vip@client.com', subject: 'Priority alert' },
    }),
    makeJob('job-priority-q2', qPriority, 'QUEUED', H.echo, {
      priority: 88,
      payload: { incident: 'P2', runbook: 'rollback-api' },
    }),
    makeJob('job-priority-scheduled', qPriority, 'SCHEDULED', H.echo, {
      type: 'SCHEDULED',
      priority: 80,
      payload: { cron: 'backup' },
    }),

    makeJob('job-emails-q1', qEmails, 'QUEUED', H.email, { priority: 10, payload: { to: 'batch@list.io', subject: 'Newsletter #14' } }),
    makeJob('job-emails-q2', qEmails, 'QUEUED', H.email, { priority: 8, payload: { to: 'onboarding@trial.io', subject: 'Day 3 tips' } }),
    makeJob('job-emails-q3', qEmails, 'QUEUED', H.email, { priority: 45, payload: { to: 'ops@acme.io', subject: 'Queue depth warning' } }),

    makeJob('job-webhooks-claimed', qWebhooks, 'CLAIMED', H.http, {
      priority: 30,
      claimedBy: W1,
      payload: { url: 'https://httpbin.org/post' },
    }),
    makeJob('job-webhooks-q1', qWebhooks, 'QUEUED', H.http, {
      priority: 25,
      payload: { url: 'https://partner.api/sync', event: 'user.updated' },
    }),
    makeJob('job-webhooks-failed', qWebhooks, 'FAILED', H.http, {
      priority: 15,
      attempt: 1,
      maxAttempts: 5,
      lastError: 'ETIMEDOUT',
      payload: { url: 'https://slow.partner.dev/hook' },
    }),
    makeJob('job-webhooks-cancelled', qWebhooks, 'CANCELLED', H.http, {
      priority: 0,
      payload: { url: 'https://deprecated.endpoint/hook' },
    }),

    makeJob('job-stripe-q1', qStripe, 'QUEUED', H.data, {
      priority: 70,
      payload: { event: 'invoice.paid', customer: 'cus_Nx8k2' },
    }),
    makeJob('job-stripe-running', qStripe, 'RUNNING', H.data, {
      priority: 85,
      maxAttempts: 5,
      claimedBy: W3,
      startedAt: minsAgo(3),
      payload: { event: 'charge.dispute.created' },
    }),

    makeJob('job-etl-q1', qEtl, 'QUEUED', H.data, {
      priority: 18,
      payload: { table: 'events', partition: '2026-07-03' },
    }),
    makeJob('job-reports-q1', qReports, 'QUEUED', H.data, {
      priority: 22,
      payload: { report: 'weekly-retention', format: 'pdf' },
    }),
    makeJob('job-reports-cron', qReports, 'SCHEDULED', H.data, {
      type: 'RECURRING',
      priority: 40,
      payload: { report: 'dau-wau' },
    }),
    makeJob('job-invoicing-cron', qInvoicing, 'SCHEDULED', H.data, {
      type: 'RECURRING',
      priority: 50,
      payload: { report: 'mrr' },
    }),
    makeJob('job-emails-cron', qEmails, 'SCHEDULED', H.email, {
      type: 'RECURRING',
      priority: 30,
      payload: { campaign: 'digest' },
    }),

    makeJob('job-batch-parent', qDefault, 'RUNNING', H.data, {
      type: 'BATCH',
      priority: 25,
      startedAt: minsAgo(10),
      payload: { batchSize: 12, label: 'nightly CRM sync', source: 'salesforce' },
    }),
    makeJob('job-dependent', qDefault, 'QUEUED', H.data, {
      priority: 40,
      payload: { step: 'load', report: 'daily_summary' },
    }),
  ];

  for (let i = 0; i < 12; i++) {
    const status = i < 8 ? 'COMPLETED' : i < 10 ? 'QUEUED' : 'FAILED';
    jobs.push(
      makeJob(`job-batch-child-${i}`, qDefault, status, H.data, {
        type: 'BATCH',
        priority: 25,
        payload: { chunk: i, records: 250, object: 'Contact' },
        ...(status === 'COMPLETED'
          ? {
              startedAt: minsAgo(9 - i * 0.3),
              completedAt: minsAgo(8.5 - i * 0.3),
              durationMs: 180 + i * 40,
              claimedBy: W1,
            }
          : status === 'FAILED'
            ? { attempt: 2, lastError: 'Validation failed: missing email on row 41' }
            : {}),
      })
    );
  }

  jobs.push(
    ...completedHistory(qEmails, 'emails', 48, W2, [H.email, H.email, H.data, H.echo]),
    ...completedHistory(qWebhooks, 'webhooks', 38, W1, [H.http, H.http, H.data]),
    ...completedHistory(qStripe, 'stripe', 42, W3, [H.data, H.http, H.email, H.echo]),
    ...completedHistory(qDefault, 'default', 32, W1, [H.echo, H.data, H.sleep, H.http]),
    ...completedHistory(qPriority, 'priority', 18, W2, [H.echo, H.email]),
    ...completedHistory(qDunning, 'dunning', 22, W2, [H.email, H.fail]),
    ...completedHistory(qInvoicing, 'invoicing', 28, W1, [H.data, H.email]),
    ...completedHistory(qEtl, 'etl', 24, W1, [H.data]),
    ...completedHistory(qReports, 'reports', 16, W1, [H.data, H.http]),
    ...completedHistory(qImports, 'imports', 14, W1, [H.data])
  );

  for (let i = 0; i < 12; i++) {
    jobs.push(
      makeJob(`job-live-email-${i}`, qEmails, 'COMPLETED', H.email, {
        priority: 10,
        createdAt: minsAgo(0.5 + i * 0.05),
        startedAt: minsAgo(0.45 + i * 0.05),
        completedAt: minsAgo(0.4 + i * 0.05),
        durationMs: 400 + i * 20,
        payload: { to: `live${i}@acme.io`, subject: `Live delivery #${i}` },
        claimedBy: W2,
      })
    );
  }

  for (let i = 0; i < 6; i++) {
    jobs.push(
      makeJob(`job-live-webhook-${i}`, qWebhooks, 'COMPLETED', H.http, {
        createdAt: minsAgo(0.6 + i * 0.08),
        startedAt: minsAgo(0.55 + i * 0.08),
        completedAt: minsAgo(0.5 + i * 0.08),
        durationMs: 550 + i * 30,
        payload: { url: 'https://httpbin.org/post', method: 'POST', event: `order.paid.${i}` },
        claimedBy: W1,
      })
    );
  }

  return jobs;
}

export function buildJobDetail(job: Job): JobDetail {
  const logs: JobLog[] = [
    { id: `log-${job.id}-1`, level: 'info', message: `Starting handler ${job.handler}`, createdAt: job.createdAt },
    {
      id: `log-${job.id}-2`,
      level: job.status === 'FAILED' ? 'error' : 'info',
      message: job.lastError || 'handler finished',
      createdAt: job.completedAt || job.startedAt || job.createdAt,
    },
    { id: `log-${job.id}-3`, level: 'info', message: 'claimed by worker', createdAt: job.startedAt || job.createdAt },
  ];

  const executions = [
    {
      id: `exec-${job.id}-1`,
      attempt: 1,
      status: job.status === 'FAILED' && job.attempt > 1 ? 'FAILED' : job.status === 'RUNNING' ? 'RUNNING' : 'COMPLETED',
      startedAt: job.startedAt || job.createdAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      error: job.lastError,
      workerId: job.claimedBy?.id || W1.id,
    },
  ];

  if (job.status === 'FAILED' && job.attempt > 1) {
    executions.push({
      id: `exec-${job.id}-2`,
      attempt: job.attempt,
      status: 'FAILED',
      startedAt: job.startedAt || job.createdAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      error: job.lastError,
      workerId: job.claimedBy?.id || W1.id,
    });
  }

  return {
    ...job,
    executions,
    logs,
    deadLetter:
      job.status === 'FAILED' && job.attempt >= job.maxAttempts
        ? {
            id: `dlq-${job.id}`,
            jobId: job.id,
            handler: job.handler,
            lastError: job.lastError || 'Unknown error',
            failureSummary: 'Exceeded retry budget — moved to dead letter queue for manual review.',
            totalAttempts: job.attempt,
            failedAt: minsAgo(20),
          }
        : undefined,
  };
}

export function buildDemoEvents(limit: number): SystemEvent[] {
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

  const queueNames = ['default', 'emails', 'webhooks', 'priority', 'stripe-events', 'etl'];

  const payloads: Record<string, Record<string, unknown>> = {
    'job:created': { queue: 'emails', type: 'IMMEDIATE', handler: 'send_email' },
    'job:completed': { queue: 'webhooks', durationMs: 640, worker: 'worker-prod-01' },
    'job:claimed': { queue: 'priority', worker: 'worker-prod-02' },
    'job:dead_letter': { queue: 'webhooks', error: 'ECONNREFUSED' },
    'job:retry_scheduled': { attempt: 2, delayMs: 10000 },
    'worker:registered': { hostname: 'worker-prod-03', shardKey: 'payments' },
    'scheduler:tick': { promoted: 4, staleWorkers: 0, releasedClaims: 1 },
    'batch:created': { parentJobId: 'job-batch-parent', count: 12 },
  };

  const events: SystemEvent[] = Array.from({ length: 120 }, (_, i) => {
    const type = types[i % types.length];
    const hoursBack = (i / 120) * 72;
    return {
      id: `ev-${i + 1}`,
      type,
      source: type === 'scheduler:tick' ? 'scheduler' : i % 5 === 0 ? 'worker' : 'api',
      payload: {
        ...payloads[type],
        queueName: queueNames[i % queueNames.length],
        seq: i,
      },
      createdAt: hoursAgo(hoursBack),
    };
  });

  events.unshift({
    id: 'ev-seed',
    type: 'system:seeded',
    source: 'seed',
    payload: { author: 'Athul S', registrationNo: 'RA2311047010117' },
    createdAt: hoursAgo(72),
  });

  return events.slice(0, limit);
}

export type DlqWithQueue = DeadLetterEntry & { queueId: string };

export function buildDemoDlq(queues: Record<string, string>): DlqWithQueue[] {
  const { webhooks, emails, dunning, default: qDefault, stripe, etl, reports } = queues;

  return [
    {
      id: 'demo-dlq-1',
      jobId: 'demo-dlq-j1',
      queueId: webhooks,
      handler: H.http,
      lastError: 'ECONNREFUSED: connection refused at customer.api:443',
      failureSummary: 'Connection refused — customer billing webhook endpoint unreachable.',
      totalAttempts: 3,
      failedAt: hoursAgo(22),
    },
    {
      id: 'demo-dlq-2',
      jobId: 'demo-dlq-j2',
      queueId: webhooks,
      handler: H.http,
      lastError: 'getaddrinfo ENOTFOUND old-saas.io',
      failureSummary: 'DNS lookup failed for deprecated SaaS callback host.',
      totalAttempts: 5,
      failedAt: hoursAgo(14),
    },
    {
      id: 'demo-dlq-3',
      jobId: 'demo-dlq-j3',
      queueId: emails,
      handler: H.email,
      lastError: 'Validation failed: invalid email format',
      failureSummary: 'Mailbox unavailable. Recipient address may be invalid.',
      totalAttempts: 3,
      failedAt: hoursAgo(8),
    },
    {
      id: 'demo-dlq-4',
      jobId: 'demo-dlq-j4',
      queueId: dunning,
      handler: H.fail,
      lastError: 'Stripe charge permanently declined',
      failureSummary: 'Payment permanently declined after dunning sequence exhausted.',
      totalAttempts: 3,
      failedAt: hoursAgo(5),
    },
    {
      id: 'demo-dlq-5',
      jobId: 'demo-dlq-j5',
      queueId: qDefault,
      handler: H.random,
      lastError: 'Random failure triggered',
      failureSummary: 'Handler random_fail exceeded retry budget during chaos test.',
      totalAttempts: 3,
      failedAt: hoursAgo(2),
    },
    {
      id: 'demo-dlq-6',
      jobId: 'demo-dlq-j6',
      queueId: stripe,
      handler: H.data,
      lastError: 'Stripe API 401: expired webhook signing secret',
      failureSummary: 'Auth error. Webhook signing secret may be stale or rotated.',
      totalAttempts: 4,
      failedAt: hoursAgo(16),
    },
    {
      id: 'demo-dlq-7',
      jobId: 'demo-dlq-j7',
      queueId: etl,
      handler: H.data,
      lastError: 'ENOMEM: JavaScript heap out of memory during transform',
      failureSummary: 'Worker ran out of memory processing large partition batch.',
      totalAttempts: 3,
      failedAt: hoursAgo(28),
    },
    {
      id: 'demo-dlq-8',
      jobId: 'demo-dlq-j8',
      queueId: reports,
      handler: H.http,
      lastError: 'ENOTFOUND pdf-service.internal',
      failureSummary: 'Internal PDF render service unreachable from worker subnet.',
      totalAttempts: 5,
      failedAt: hoursAgo(9),
    },
  ];
}
