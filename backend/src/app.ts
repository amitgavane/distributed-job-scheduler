import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { AUTHOR_NAME, AUTHOR_REGISTRATION } from '@codity/shared';

import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/projects.routes';
import queueRoutes from './routes/queues.routes';
import jobRoutes from './routes/jobs.routes';
import workerRoutes from './routes/workers.routes';
import metricsRoutes from './routes/metrics.routes';
import eventsRoutes from './routes/events.routes';

export function createApp() {
  const app = express();

  
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));
  
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Bad Request', message: 'Malformed JSON payload' });
    }
    next();
  });

  
  app.use((_req, res, next) => {
    res.setHeader('X-Engineer', AUTHOR_NAME);
    res.setHeader('X-Engineer-Profile', AUTHOR_REGISTRATION);
    next();
  });

  
  const isProd = config.nodeEnv === 'production';
  
  const authLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    max: isProd ? 30 : 100, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts, please try again later.' },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: parseInt(process.env.RATE_LIMIT_MAX || (isProd ? '1000' : '5000'), 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'API rate limit exceeded.' },
    
    skip: (req) => req.path.startsWith('/api/workers'),
  });
  app.use(apiLimiter);

  
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      engineer: AUTHOR_NAME,
      profile: AUTHOR_REGISTRATION,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/queues', queueRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/workers', workerRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/events', eventsRoutes);

  app.use(errorHandler);

  return app;
}