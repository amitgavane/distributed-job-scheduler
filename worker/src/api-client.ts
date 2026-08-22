import { logger } from './logger';

const API_BASE = process.env.API_URL || 'http://localhost:3001';

interface WorkerRecord {
  id: string;
  hostname: string;
  concurrency: number;
}

interface ClaimedJob {
  id: string;
  handler: string;
  payload: Record<string, unknown>;
  queueId: string;
}

export class ApiClient {
  constructor(
    private workerId: string,
    private workerSecret: string
  ) { }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Id': this.workerId,
        'X-Worker-Secret': this.workerSecret,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API ${method} ${path} failed: ${res.status} ${err}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async heartbeat(activeJobs: number, cpuUsage?: number, memoryMb?: number): Promise<void> {
    await this.request('POST', `/api/workers/${this.workerId}/heartbeat`, {
      activeJobs,
      cpuUsage,
      memoryMb,
    });
  }

  async claim(maxJobs: number): Promise<ClaimedJob[]> {
    return this.request('POST', `/api/workers/${this.workerId}/claim`, { maxJobs });
  }

  async startJob(jobId: string): Promise<void> {
    await this.request('POST', `/api/workers/${this.workerId}/jobs/${jobId}/start`);
  }

  async completeJob(jobId: string, result: unknown, durationMs: number): Promise<void> {
    await this.request('POST', `/api/workers/${this.workerId}/jobs/${jobId}/complete`, {
      result,
      durationMs,
    });
  }

  async failJob(jobId: string, error: string, durationMs: number): Promise<void> {
    await this.request('POST', `/api/workers/${this.workerId}/jobs/${jobId}/fail`, {
      error,
      durationMs,
    });
  }

  async addLog(
    jobId: string,
    level: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.request('POST', `/api/workers/${this.workerId}/jobs/${jobId}/logs`, {
      level,
      message,
      metadata,
    });
  }

  async drain(): Promise<void> {
    await this.request('POST', `/api/workers/${this.workerId}/drain`);
  }
}
