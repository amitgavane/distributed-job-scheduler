import { createServer } from 'http';

import { config } from './config';

import { logger } from './lib/logger';

import { initWebSocket } from './websocket';

import { startScheduler, stopScheduler } from './services/scheduler.service';

import { createApp } from './app';
import { AUTHOR_LABEL } from '@codity/shared';



const app = createApp();

const httpServer = createServer(app);



initWebSocket(httpServer);

if (config.runSchedulerInApi) {
  startScheduler(config.schedulerIntervalMs);
  logger.info('Scheduler running inside API (RUN_SCHEDULER_IN_API=true)');
} else {
  logger.info('Scheduler runs separately — use dev:scheduler');
}



httpServer.listen(config.port, () => {
  logger.info(`API server running on port ${config.port}`, { author: AUTHOR_LABEL });
});



function shutdown() {

  logger.info('Shutting down API server...');

  if (config.runSchedulerInApi) stopScheduler();

  httpServer.close(() => process.exit(0));

}



process.on('SIGTERM', shutdown);

process.on('SIGINT', shutdown);



export { app, httpServer };


