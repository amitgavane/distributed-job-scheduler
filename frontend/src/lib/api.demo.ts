import {
  ApiError,
  type DeadLetterEntry,
  type Job,
  type JobDetail,
  type MetricsSnapshot,
  type Organization,
  type OrgMember,
  type Project,
  type ProjectDetail,
  type QueueStats,
  type RetryPolicy,
  type SystemEvent,
  type ThroughputPoint,
  type Worker,
  type WorkerDetail,
  type Paginated,
} from './api';
import { DEMO_READONLY_MESSAGE } from './isDemo';
import { buildDemoEvents } from '../demo/generate-fixtures';
import {
  DEMO_DLQ_BY_QUEUE,
  DEMO_JOBS,
  DEMO_MEMBERS,
  DEMO_METRICS,
  DEMO_ORGANIZATIONS,
  DEMO_PROJECTS,
  DEMO_QUEUE_STATS,
  DEMO_RETRY_POLICIES,
  DEMO_THROUGHPUT,
  DEMO_USER,
  DEMO_WORKERS,
  getDemoJob,
  getDemoProject,
  getDemoWorker,
  paginate,
} from '../demo/fixtures';

function readonly(): never {
  throw new ApiError(403, DEMO_READONLY_MESSAGE);
}

function parsePage(params?: Record<string, string>) {
  return Math.max(1, parseInt(params?.page || '1', 10));
}

function parseLimit(params?: Record<string, string>, fallback = 20) {
  return Math.max(1, parseInt(params?.limit || String(fallback), 10));
}

export const demoApi = {
  login: async (_email: string, _password: string) => ({
    token: 'demo-token-visual-mode',
    user: DEMO_USER,
  }),

  register: async () => readonly(),

  getOrganizations: async (): Promise<Organization[]> => DEMO_ORGANIZATIONS,

  getProjects: async (_organizationId: string): Promise<Project[]> => DEMO_PROJECTS,

  getProject: async (projectId: string): Promise<ProjectDetail> => {
    const project = getDemoProject(projectId);
    if (!project) throw new ApiError(404, 'Project not found');
    return project;
  },

  createProject: async () => readonly(),

  createQueue: async () => readonly(),

  pauseQueue: async () => readonly(),

  resumeQueue: async () => readonly(),

  getQueueStats: async (queueId: string): Promise<QueueStats> =>
    DEMO_QUEUE_STATS[queueId] || {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      throughputPerMinute: 0,
      avgDurationMs: 0,
    },

  getJobs: async (queueId: string, params?: Record<string, string>): Promise<Paginated<Job>> => {
    let items = DEMO_JOBS.filter((j) => j.queueId === queueId);
    if (params?.status) items = items.filter((j) => j.status === params.status);
    return paginate(items, parsePage(params), parseLimit(params));
  },

  getJob: async (jobId: string): Promise<JobDetail> => {
    const job = getDemoJob(jobId);
    if (!job) throw new ApiError(404, 'Job not found');
    return job;
  },

  createJob: async () => readonly(),

  retryJob: async () => readonly(),

  cancelJob: async () => readonly(),

  getDeadLetter: async (
    queueId: string,
    params?: Record<string, string>
  ): Promise<Paginated<DeadLetterEntry>> => {
    const items = DEMO_DLQ_BY_QUEUE[queueId] || [];
    return paginate(items, parsePage(params), parseLimit(params, 10));
  },

  // --- NEW PHASE 6 FIX ---
  bulkRetryDeadLetter: async () => readonly(),
  // -----------------------

  getWorkers: async (): Promise<Worker[]> => DEMO_WORKERS,

  getMetrics: async (): Promise<MetricsSnapshot> => DEMO_METRICS,

  getThroughput: async (_hours = 24): Promise<ThroughputPoint[]> => DEMO_THROUGHPUT,

  getRetryPolicies: async (): Promise<RetryPolicy[]> => DEMO_RETRY_POLICIES,

  updateQueue: async () => readonly(),

  getWorker: async (workerId: string): Promise<WorkerDetail> => {
    const worker = getDemoWorker(workerId);
    if (!worker) throw new ApiError(404, 'Worker not found');
    return worker;
  },

  getEvents: async (limit = 50): Promise<SystemEvent[]> => buildDemoEvents(limit),

  inviteMember: async () => readonly(),

  getOrgMembers: async (_orgId: string): Promise<OrgMember[]> => DEMO_MEMBERS,
};

export type DemoApi = typeof demoApi;