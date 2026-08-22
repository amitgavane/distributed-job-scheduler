export enum JobStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED',
  QUEUED = 'QUEUED',
  CLAIMED = 'CLAIMED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
  CANCELLED = 'CANCELLED',
}

export enum JobType {
  IMMEDIATE = 'IMMEDIATE',
  DELAYED = 'DELAYED',
  SCHEDULED = 'SCHEDULED',
  RECURRING = 'RECURRING',
  BATCH = 'BATCH',
}

export enum RetryStrategy {
  FIXED = 'FIXED',
  LINEAR = 'LINEAR',
  EXPONENTIAL = 'EXPONENTIAL',
}

export enum WorkerStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  DRAINING = 'DRAINING',
}

export enum QueueStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}

export enum OrgRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  statusCode: number;
}

export interface JobPayload {
  handler: string;
  data?: Record<string, unknown>;
  idempotencyKey?: string;
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

export interface WorkerInfo {
  id: string;
  hostname: string;
  status: WorkerStatus;
  concurrency: number;
  activeJobs: number;
  lastHeartbeat: string;
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
