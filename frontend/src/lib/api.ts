const API_BASE = import.meta.env.VITE_API_URL || 'https://distributed-job-scheduler-backend-1q2g.onrender.com/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const liveApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    ),

  register: (email: string, password: string, name: string) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  getOrganizations: () => request<Organization[]>('/auth/organizations'),

  getProjects: (organizationId: string) =>
    request<Project[]>(`/projects?organizationId=${organizationId}`),

  getProject: (projectId: string) => request<ProjectDetail>(`/projects/${projectId}`),

  createProject: (data: { organizationId: string; name: string; description?: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  createQueue: (data: CreateQueueInput) =>
    request<Queue>('/queues', { method: 'POST', body: JSON.stringify(data) }),

  pauseQueue: (queueId: string) =>
    request<Queue>(`/queues/${queueId}/pause`, { method: 'POST' }),

  resumeQueue: (queueId: string) =>
    request<Queue>(`/queues/${queueId}/resume`, { method: 'POST' }),

  getQueueStats: (queueId: string) => request<QueueStats>(`/queues/${queueId}/stats`),

  getJobs: (queueId: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ queueId, ...params });
    return request<Paginated<Job>>(`/jobs?${qs}`);
  },

  getJob: (jobId: string) => request<JobDetail>(`/jobs/${jobId}`),

  createJob: (type: string, data: Record<string, unknown>) =>
    request<Job>(`/jobs/${type}`, { method: 'POST', body: JSON.stringify(data) }),

  retryJob: (jobId: string) =>
    request<Job>(`/jobs/${jobId}/retry`, { method: 'POST' }),

  cancelJob: (jobId: string) =>
    request<Job>(`/jobs/${jobId}/cancel`, { method: 'POST' }),

  getDeadLetter: (queueId: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ queueId, ...params });
    return request<Paginated<DeadLetterEntry>>(`/jobs/dead-letter?${qs}`);
  },

  // --- NEW PHASE 6 INTEGRATION ---
  bulkRetryDeadLetter: (queueId: string) =>
    request<{ count: number }>('/jobs/dlq/replay', {
      method: 'POST',
      body: JSON.stringify({ queueId }),
    }),
  // -------------------------------

  getWorkers: () => request<Worker[]>('/workers'),

  getMetrics: () => request<MetricsSnapshot>('/metrics'),

  getThroughput: (hours = 24) =>
    request<ThroughputPoint[]>(`/metrics/throughput?hours=${hours}`),

  getRetryPolicies: () => request<RetryPolicy[]>('/queues/retry-policies'),

  updateQueue: (queueId: string, data: Partial<CreateQueueInput & { shardKey?: string }>) =>
    request<Queue>(`/queues/${queueId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getWorker: (workerId: string) => request<WorkerDetail>(`/workers/${workerId}`),

  getEvents: (limit = 50) => request<SystemEvent[]>(`/events?limit=${limit}`),

  inviteMember: (orgId: string, email: string, role: string) =>
    request('/auth/organizations/' + orgId + '/members', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  getOrgMembers: (orgId: string) =>
    request<OrgMember[]>(`/auth/organizations/${orgId}/members`),
};

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
  _count: { projects: number; members: number };
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  _count: { queues: number };
}

export interface ProjectDetail extends Project {
  queues: Queue[];
}

export interface Queue {
  id: string;
  name: string;
  description?: string;
  priority: number;
  concurrency: number;
  status: string;
  rateLimitPerMin?: number;
  shardKey?: string;
  retryPolicy?: RetryPolicy;
  _count?: { jobs: number };
}

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: string;
  maxAttempts: number;
  baseDelayMs: number;
}

export interface CreateQueueInput {
  projectId: string;
  name: string;
  description?: string;
  priority?: number;
  concurrency?: number;
  retryPolicyId?: string;
  rateLimitPerMin?: number;
  shardKey?: string;
}

export interface OrgMember {
  id: string;
  role: string;
  user: { id: string; email: string; name: string };
  createdAt: string;
}

export interface Job {
  id: string;
  queueId: string;
  type: string;
  status: string;
  handler: string;
  payload: Record<string, unknown>;
  priority: number;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  lastError?: string;
  claimedBy?: { id: string; hostname: string };
  _count?: { executions: number; logs: number };
}

export interface JobDetail extends Job {
  executions: JobExecution[];
  logs: JobLog[];
  deadLetter?: DeadLetterEntry;
}

export interface JobExecution {
  id: string;
  attempt: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  workerId?: string;
}

export interface JobLog {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DeadLetterEntry {
  id: string;
  jobId: string;
  handler: string;
  lastError: string;
  failureSummary?: string;
  totalAttempts: number;
  failedAt: string;
}

export interface Worker {
  id: string;
  hostname: string;
  status: string;
  concurrency: number;
  activeJobs: number;
  shardKey?: string;
  lastSeenAt: string;
  startedAt: string;
}

export interface WorkerDetail extends Worker {
  heartbeats: { id: string; activeJobs: number; memoryMb?: number; createdAt: string }[];
  executions: { id: string; attempt: number; status: string; startedAt: string; durationMs?: number }[];
}

export interface SystemEvent {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface QueueStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  deadLetter: number;
  throughputPerMinute: number;
  avgDurationMs: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  totalJobs: number;
  activeWorkers: number;
  jobsPerMinute: number;
  successRate: number;
  avgLatencyMs: number;
  queueHealth: Record<string, QueueStats>;
}

export interface ThroughputPoint {
  hour: string;
  completed: number;
  failed: number;
  avgDurationMs: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export { ApiError };

import { IS_DEMO } from './isDemo';
import { demoApi } from './api.demo';

export const api = IS_DEMO ? demoApi : liveApi;