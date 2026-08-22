import os from 'os';
import cluster from 'node:cluster';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ApiClient } from './api-client';
import { getHandler } from './handlers';
import { logger } from './logger';
import { AUTHOR_LABEL } from '@codity/shared';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const CREDENTIALS_FILE = path.resolve(__dirname, '../../.worker-credentials.json');
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '5000', 10);
const MAX_CONCURRENCY = parseInt(process.env.WORKER_MAX_CONCURRENCY || '5', 10);
const SHUTDOWN_TIMEOUT = parseInt(process.env.WORKER_GRACEFUL_SHUTDOWN_MS || '30000', 10);
const REGISTRATION_KEY = process.env.WORKER_REGISTRATION_KEY || 'dev-worker-register-key';

interface WorkerCredentials {
  id: string;
  secret: string;
}

class WorkerService {
  private client!: ApiClient;
  private credentials!: WorkerCredentials;
  private activeJobs = new Map<string, Promise<void>>();
  private running = true;
  private draining = false;

  async start(): Promise<void> {
    this.credentials = await this.ensureCredentials();
    this.client = new ApiClient(this.credentials.id, this.credentials.secret);

    logger.info(`registered ${this.credentials.id} on ${os.hostname()}`, { author: AUTHOR_LABEL });

    this.startHeartbeat();
    this.startPolling();

    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  private async ensureCredentials(): Promise<WorkerCredentials> {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    }

    const hostname = process.env.WORKER_ID || os.hostname();
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/workers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Registration-Key': REGISTRATION_KEY,
      },
      body: JSON.stringify({
        hostname,
        concurrency: MAX_CONCURRENCY,
        shardKey: process.env.WORKER_SHARD_KEY || undefined,
      }),
    });

    if (!res.ok) throw new Error(`Worker registration failed: ${await res.text()}`);
    const data = await res.json() as { id: string; secret: string };
    const creds = { id: data.id, secret: data.secret };
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
    return creds;
  }

  private startHeartbeat(): void {
    setInterval(async () => {
      if (!this.running) return;
      try {
        const mem = process.memoryUsage();
        await this.client.heartbeat(
          this.activeJobs.size,
          undefined,
          Math.round(mem.heapUsed / 1024 / 1024)
        );
      } catch (err) {
        logger.warn(`Heartbeat failed: ${(err as Error).message}`);
      }
    }, HEARTBEAT_INTERVAL);
  }

  private startPolling(): void {
    const poll = async () => {
      if (!this.running) return;

      if (!this.draining) {
        const available = MAX_CONCURRENCY - this.activeJobs.size;
        if (available > 0) {
          try {
            const jobs = await this.client.claim(available);
            for (const job of jobs) {
              const promise = this.executeJob(job);
              this.activeJobs.set(job.id, promise);
              promise.finally(() => this.activeJobs.delete(job.id));
            }
          } catch (err) {
            logger.warn(`Claim failed: ${(err as Error).message}`);
          }
        }
      }

      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
  }

  private async executeJob(job: {
    id: string;
    handler: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const start = Date.now();
    logger.info(`Executing job ${job.id} [${job.handler}]`);

    try {
      await this.client.startJob(job.id);
      await this.client.addLog(job.id, 'INFO', `Starting handler: ${job.handler}`);

      const handler = getHandler(job.handler);
      const result = await handler(job.payload);
      const durationMs = Date.now() - start;

      await this.client.completeJob(job.id, result, durationMs);
      logger.info(`Job ${job.id} completed in ${durationMs}ms`);
    } catch (err) {
      const durationMs = Date.now() - start;
      const error = (err as Error).message;
      logger.error(`Job ${job.id} failed: ${error}`);

      try {
        await this.client.failJob(job.id, error, durationMs);
      } catch (failErr) {
        logger.error(`Failed to report failure: ${(failErr as Error).message}`);
      }
    }
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    logger.info(`shutting down, ${this.activeJobs.size} jobs still running`);

    try {
      await this.client.drain();
    } catch {
      // ignore
    }

    const deadline = Date.now() + SHUTDOWN_TIMEOUT;
    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      await Promise.allSettled([...this.activeJobs.values()]);
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.running = false;
    logger.info('bye');
    process.exit(0);
  }
}

async function startWithRetry(attempts = 8, delayMs = 1500): Promise<void> {
  const worker = new WorkerService();
  for (let i = 1; i <= attempts; i++) {
    try {
      await worker.start();
      return;
    } catch (err) {
      const msg = (err as Error).message;
      if (i === attempts) {
        logger.error(`Worker failed to start: ${msg}`);
        process.exit(1);
      }
      logger.warn(`Worker start attempt ${i}/${attempts} failed (${msg}), retrying...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}


const NUM_WORKERS = process.env.NODE_ENV === 'production' ? os.cpus().length : 2;

if (cluster.isPrimary) {
  logger.info(`Primary cluster manager (PID: ${process.pid}) is running`, { author: AUTHOR_LABEL });
  logger.info(`Forking ${NUM_WORKERS} distinct worker processes to utilize multiple CPU cores...`);

 
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker process ${worker.process.pid} died (Code: ${code}, Signal: ${signal}). Restarting...`);
    cluster.fork();
  });
} else {
  
  startWithRetry();
}
