import type {
  DeadLetterEntry,
  Job,
  JobDetail,
  MetricsSnapshot,
  Organization,
  OrgMember,
  Project,
  ProjectDetail,
  Queue,
  QueueStats,
  RetryPolicy,
  SystemEvent,
  ThroughputPoint,
  Worker,
  WorkerDetail,
} from '../lib/api';
import {
  buildDemoDlq,
  buildDemoEvents,
  buildDemoJobs,
  buildJobDetail,
  type DlqWithQueue,
} from './generate-fixtures';

export const DEMO_ORG_ID = 'demo-org-acme';
export const DEMO_PROJECT_MAIN = 'demo-proj-main';
export const DEMO_PROJECT_BILLING = 'demo-proj-billing';
export const DEMO_PROJECT_ANALYTICS = 'demo-proj-analytics';

export const DEMO_USER = {
  id: 'demo-user-athul',
  email: 'admin@test.local',
  name: 'Athul S',
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

export const DEMO_RETRY_POLICIES: RetryPolicy[] = [
  { id: 'demo-policy-1', name: 'Default Exponential', strategy: 'EXPONENTIAL', maxAttempts: 3, baseDelayMs: 5000 },
  { id: 'demo-policy-2', name: 'Fixed Retry', strategy: 'FIXED', maxAttempts: 5, baseDelayMs: 10000 },
  { id: 'demo-policy-3', name: 'Linear Backoff', strategy: 'LINEAR', maxAttempts: 4, baseDelayMs: 3000 },
];

export const DEMO_QUEUE_IDS = {
  default: 'demo-q-default',
  priority: 'demo-q-priority',
  emails: 'demo-q-emails',
  webhooks: 'demo-q-webhooks',
  imports: 'demo-q-imports',
  invoicing: 'demo-q-invoicing',
  dunning: 'demo-q-dunning',
  stripe: 'demo-q-stripe',
  etl: 'demo-q-etl',
  reports: 'demo-q-reports',
} as const;

export const DEMO_QUEUES: Record<string, Queue[]> = {
  [DEMO_PROJECT_MAIN]: [
    {
      id: DEMO_QUEUE_IDS.default,
      name: 'default',
      description: 'General background work',
      priority: 10,
      concurrency: 5,
      status: 'ACTIVE',
      rateLimitPerMin: 120,
      retryPolicy: DEMO_RETRY_POLICIES[0],
      _count: { jobs: 52 },
    },
    {
      id: DEMO_QUEUE_IDS.priority,
      name: 'priority',
      description: 'User-facing latency sensitive jobs',
      priority: 100,
      concurrency: 3,
      status: 'ACTIVE',
      retryPolicy: DEMO_RETRY_POLICIES[1],
      _count: { jobs: 21 },
    },
    {
      id: DEMO_QUEUE_IDS.emails,
      name: 'emails',
      description: 'Transactional email delivery',
      priority: 50,
      concurrency: 10,
      status: 'ACTIVE',
      rateLimitPerMin: 200,
      shardKey: 'notifications',
      retryPolicy: DEMO_RETRY_POLICIES[2],
      _count: { jobs: 63 },
    },
    {
      id: DEMO_QUEUE_IDS.webhooks,
      name: 'webhooks',
      description: 'Outbound HTTP callbacks to customer endpoints',
      priority: 30,
      concurrency: 8,
      status: 'ACTIVE',
      rateLimitPerMin: 60,
      retryPolicy: DEMO_RETRY_POLICIES[0],
      _count: { jobs: 48 },
    },
    {
      id: DEMO_QUEUE_IDS.imports,
      name: 'imports',
      description: 'CSV / bulk imports — paused during schema migration',
      priority: 5,
      concurrency: 2,
      status: 'PAUSED',
      retryPolicy: DEMO_RETRY_POLICIES[0],
      _count: { jobs: 14 },
    },
  ],
  [DEMO_PROJECT_BILLING]: [
    {
      id: DEMO_QUEUE_IDS.invoicing,
      name: 'invoicing',
      description: 'Monthly invoice generation',
      priority: 40,
      concurrency: 4,
      status: 'ACTIVE',
      retryPolicy: DEMO_RETRY_POLICIES[0],
      _count: { jobs: 29 },
    },
    {
      id: DEMO_QUEUE_IDS.dunning,
      name: 'dunning',
      description: 'Failed payment reminders',
      priority: 60,
      concurrency: 6,
      status: 'ACTIVE',
      shardKey: 'notifications',
      retryPolicy: DEMO_RETRY_POLICIES[1],
      _count: { jobs: 23 },
    },
    {
      id: DEMO_QUEUE_IDS.stripe,
      name: 'stripe-events',
      description: 'Stripe webhook ingestion (checkout, invoice, dispute)',
      priority: 90,
      concurrency: 12,
      status: 'ACTIVE',
      rateLimitPerMin: 300,
      shardKey: 'payments',
      retryPolicy: DEMO_RETRY_POLICIES[1],
      _count: { jobs: 44 },
    },
  ],
  [DEMO_PROJECT_ANALYTICS]: [
    {
      id: DEMO_QUEUE_IDS.etl,
      name: 'etl',
      description: 'Nightly warehouse sync — BigQuery export',
      priority: 20,
      concurrency: 3,
      status: 'ACTIVE',
      retryPolicy: DEMO_RETRY_POLICIES[2],
      _count: { jobs: 25 },
    },
    {
      id: DEMO_QUEUE_IDS.reports,
      name: 'reports',
      description: 'Cohort & retention PDF reports',
      priority: 35,
      concurrency: 4,
      status: 'ACTIVE',
      retryPolicy: DEMO_RETRY_POLICIES[0],
      _count: { jobs: 18 },
    },
  ],
};

export const DEMO_QUEUE_STATS: Record<string, QueueStats> = {
  [DEMO_QUEUE_IDS.default]: { queued: 4, running: 2, completed: 44, failed: 1, deadLetter: 1, throughputPerMinute: 4, avgDurationMs: 380 },
  [DEMO_QUEUE_IDS.priority]: { queued: 3, running: 0, completed: 17, failed: 0, deadLetter: 0, throughputPerMinute: 2, avgDurationMs: 290 },
  [DEMO_QUEUE_IDS.emails]: { queued: 4, running: 0, completed: 56, failed: 2, deadLetter: 1, throughputPerMinute: 18, avgDurationMs: 505 },
  [DEMO_QUEUE_IDS.webhooks]: { queued: 2, running: 1, completed: 40, failed: 2, deadLetter: 2, throughputPerMinute: 12, avgDurationMs: 820 },
  [DEMO_QUEUE_IDS.imports]: { queued: 0, running: 0, completed: 14, failed: 0, deadLetter: 0, throughputPerMinute: 0, avgDurationMs: 1200 },
  [DEMO_QUEUE_IDS.invoicing]: { queued: 1, running: 0, completed: 27, failed: 0, deadLetter: 0, throughputPerMinute: 3, avgDurationMs: 310 },
  [DEMO_QUEUE_IDS.dunning]: { queued: 0, running: 0, completed: 21, failed: 1, deadLetter: 1, throughputPerMinute: 6, avgDurationMs: 1100 },
  [DEMO_QUEUE_IDS.stripe]: { queued: 1, running: 1, completed: 39, failed: 1, deadLetter: 1, throughputPerMinute: 24, avgDurationMs: 640 },
  [DEMO_QUEUE_IDS.etl]: { queued: 1, running: 0, completed: 22, failed: 0, deadLetter: 1, throughputPerMinute: 2, avgDurationMs: 2400 },
  [DEMO_QUEUE_IDS.reports]: { queued: 2, running: 0, completed: 14, failed: 0, deadLetter: 1, throughputPerMinute: 1, avgDurationMs: 1800 },
};

export const DEMO_ORGANIZATIONS: Organization[] = [
  {
    id: DEMO_ORG_ID,
    name: 'Acme Corp',
    slug: 'acme',
    role: 'OWNER',
    _count: { projects: 3, members: 5 },
  },
];

export const DEMO_PROJECTS: Project[] = [
  { id: DEMO_PROJECT_MAIN, name: 'main-app', description: 'Main product app', _count: { queues: 5 } },
  { id: DEMO_PROJECT_BILLING, name: 'billing-service', description: 'Invoices, dunning, Stripe webhooks', _count: { queues: 3 } },
  { id: DEMO_PROJECT_ANALYTICS, name: 'analytics-pipeline', description: 'ETL and nightly reports', _count: { queues: 2 } },
];

export const DEMO_MEMBERS: OrgMember[] = [
  { id: 'demo-m-1', role: 'OWNER', user: { id: 'demo-user-athul', email: 'admin@test.local', name: 'Athul S' }, createdAt: hoursAgo(720) },
  { id: 'demo-m-2', role: 'ADMIN', user: { id: 'demo-m-2-u', email: 'sarah@acme.io', name: 'RA2311047010117' }, createdAt: hoursAgo(500) },
  { id: 'demo-m-3', role: 'MEMBER', user: { id: 'demo-m-3-u', email: 'james@acme.io', name: 'BTechAI' }, createdAt: hoursAgo(300) },
  { id: 'demo-m-4', role: 'MEMBER', user: { id: 'demo-m-4-u', email: 'as2227@srmist.edu.in', name: 'as2227@srmist.edu.in' }, createdAt: hoursAgo(200) },
  { id: 'demo-m-5', role: 'VIEWER', user: { id: 'demo-m-5-u', email: 'contact.athuls@gmail.com', name: 'contact.athuls@gmail.com' }, createdAt: hoursAgo(100) },
];

export const DEMO_WORKERS: Worker[] = [
  { id: 'demo-w-1', hostname: 'worker-prod-01', status: 'ONLINE', concurrency: 8, activeJobs: 2, shardKey: undefined, lastSeenAt: minsAgo(1), startedAt: hoursAgo(72) },
  { id: 'demo-w-2', hostname: 'worker-prod-02', status: 'ONLINE', concurrency: 8, activeJobs: 1, shardKey: 'notifications', lastSeenAt: minsAgo(1), startedAt: hoursAgo(72) },
  { id: 'demo-w-3', hostname: 'worker-prod-03', status: 'ONLINE', concurrency: 6, activeJobs: 3, shardKey: 'payments', lastSeenAt: minsAgo(2), startedAt: hoursAgo(48) },
  { id: 'demo-w-4', hostname: 'worker-staging-01', status: 'ONLINE', concurrency: 4, activeJobs: 0, lastSeenAt: minsAgo(3), startedAt: hoursAgo(24) },
  { id: 'demo-w-5', hostname: 'worker-staging-02', status: 'DRAINING', concurrency: 4, activeJobs: 0, shardKey: 'notifications', lastSeenAt: minsAgo(8), startedAt: hoursAgo(12) },
  { id: 'demo-w-6', hostname: 'worker-legacy-01', status: 'OFFLINE', concurrency: 2, activeJobs: 0, lastSeenAt: hoursAgo(6), startedAt: hoursAgo(168) },
];

const workerDetails: Record<string, WorkerDetail> = Object.fromEntries(
  DEMO_WORKERS.map((w) => [
    w.id,
    {
      ...w,
      heartbeats: Array.from({ length: 8 }, (_, i) => ({
        id: `hb-${w.id}-${i}`,
        activeJobs: Math.max(0, w.activeJobs - Math.floor(i / 2)),
        memoryMb: 180 + i * 12 + (w.id.charCodeAt(7) % 40),
        createdAt: minsAgo(i * 3 + 1),
      })),
      executions: Array.from({ length: 6 }, (_, i) => ({
        id: `ex-${w.id}-${i}`,
        attempt: 1,
        status: i === 5 && w.status === 'OFFLINE' ? 'FAILED' : 'COMPLETED',
        startedAt: minsAgo(15 + i * 4),
        durationMs: 420 + i * 90,
      })),
    },
  ])
);

const QUEUE_NAME_MAP: Record<string, string> = {
  [DEMO_QUEUE_IDS.default]: 'default',
  [DEMO_QUEUE_IDS.priority]: 'priority',
  [DEMO_QUEUE_IDS.emails]: 'emails',
  [DEMO_QUEUE_IDS.webhooks]: 'webhooks',
  [DEMO_QUEUE_IDS.imports]: 'imports',
  [DEMO_QUEUE_IDS.invoicing]: 'invoicing',
  [DEMO_QUEUE_IDS.dunning]: 'dunning',
  [DEMO_QUEUE_IDS.stripe]: 'stripe-events',
  [DEMO_QUEUE_IDS.etl]: 'etl',
  [DEMO_QUEUE_IDS.reports]: 'reports',
};

export const DEMO_JOBS: Job[] = buildDemoJobs({
  default: DEMO_QUEUE_IDS.default,
  priority: DEMO_QUEUE_IDS.priority,
  emails: DEMO_QUEUE_IDS.emails,
  webhooks: DEMO_QUEUE_IDS.webhooks,
  imports: DEMO_QUEUE_IDS.imports,
  invoicing: DEMO_QUEUE_IDS.invoicing,
  dunning: DEMO_QUEUE_IDS.dunning,
  stripe: DEMO_QUEUE_IDS.stripe,
  etl: DEMO_QUEUE_IDS.etl,
  reports: DEMO_QUEUE_IDS.reports,
});

const DEMO_DLQ_WITH_QUEUE: DlqWithQueue[] = buildDemoDlq({
  default: DEMO_QUEUE_IDS.default,
  webhooks: DEMO_QUEUE_IDS.webhooks,
  emails: DEMO_QUEUE_IDS.emails,
  dunning: DEMO_QUEUE_IDS.dunning,
  stripe: DEMO_QUEUE_IDS.stripe,
  etl: DEMO_QUEUE_IDS.etl,
  reports: DEMO_QUEUE_IDS.reports,
});

export const DEMO_DLQ: DeadLetterEntry[] = DEMO_DLQ_WITH_QUEUE.map(({ queueId: _q, ...entry }) => entry);

export const DEMO_DLQ_BY_QUEUE: Record<string, DeadLetterEntry[]> = DEMO_DLQ_WITH_QUEUE.reduce(
  (acc, { queueId, ...entry }) => {
    (acc[queueId] ||= []).push(entry);
    return acc;
  },
  {} as Record<string, DeadLetterEntry[]>
);

export const DEMO_EVENTS: SystemEvent[] = buildDemoEvents(50);

const THROUGHPUT_COMPLETED = [20, 27, 20, 20, 16, 25, 16, 25, 16, 31, 27, 42];
const THROUGHPUT_FAILED = [0, 0, 3, 3, 0, 0, 11, 8, 6, 11, 8, 8];

export const DEMO_THROUGHPUT: ThroughputPoint[] = Array.from({ length: 12 }, (_, i) => ({
  hour: new Date(Date.now() - (11 - i) * 60 * 60 * 1000).toISOString(),
  completed: THROUGHPUT_COMPLETED[i]!,
  failed: THROUGHPUT_FAILED[i]!,
  avgDurationMs: 520 + (i % 4) * 90,
}));

export const DEMO_METRICS: MetricsSnapshot = {
  timestamp: new Date().toISOString(),
  totalJobs: DEMO_JOBS.length,
  activeWorkers: 4,
  jobsPerMinute: 18,
  successRate: 94,
  avgLatencyMs: 640,
  queueHealth: Object.fromEntries(
    Object.entries(DEMO_QUEUE_STATS).map(([id, stats]) => [QUEUE_NAME_MAP[id] || id, stats])
  ),
};

export function getDemoProject(projectId: string): ProjectDetail | null {
  const project = DEMO_PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;
  return { ...project, queues: DEMO_QUEUES[projectId] || [] };
}

export function getDemoJob(jobId: string): JobDetail | null {
  const job = DEMO_JOBS.find((j) => j.id === jobId);
  if (!job) return null;
  return buildJobDetail(job);
}

export function getDemoWorker(workerId: string): WorkerDetail | null {
  return workerDetails[workerId] || null;
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}
