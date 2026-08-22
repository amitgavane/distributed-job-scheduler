import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  schedulerIntervalMs: parseInt(process.env.SCHEDULER_INTERVAL_MS || '5000', 10),
  runSchedulerInApi: process.env.RUN_SCHEDULER_IN_API === 'true',
  workerStaleThresholdMs: parseInt(process.env.WORKER_STALE_THRESHOLD_MS || '30000', 10),
  jobClaimTimeoutMs: parseInt(process.env.JOB_CLAIM_TIMEOUT_MS || '60000', 10),
  workerRegistrationKey: process.env.WORKER_REGISTRATION_KEY || 'dev-worker-register-key',
};
