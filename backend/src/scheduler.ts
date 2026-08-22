import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { config } from './config';
import { logger } from './lib/logger';
import { startScheduler, stopScheduler } from './services/scheduler.service';
import { AUTHOR_LABEL } from '@codity/shared';

logger.info('Starting scheduler', { intervalMs: config.schedulerIntervalMs, author: AUTHOR_LABEL });

startScheduler(config.schedulerIntervalMs);

function shutdown() {
  logger.info('Shutting down scheduler...');
  stopScheduler();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
