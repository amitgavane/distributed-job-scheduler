import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { UnauthorizedError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface AuthPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      workerId?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Invalid or expired token'));
      return;
    }
    next(err);
  }
}

export function authenticateWorkerRegistration(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const key = req.headers['x-worker-registration-key'] as string;
  if (!key || key !== config.workerRegistrationKey) {
    next(new UnauthorizedError('Invalid worker registration key'));
    return;
  }
  next();
}

export function authenticateWorker(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  void (async () => {
    try {
      const workerId = req.headers['x-worker-id'] as string;
      const workerSecret = req.headers['x-worker-secret'] as string;

      if (!workerId || !workerSecret) {
        throw new UnauthorizedError('Worker ID and secret required');
      }

      const worker = await prisma.worker.findUnique({ where: { id: workerId } });
      if (!worker || !worker.secretHash) {
        throw new UnauthorizedError('Invalid worker');
      }

      const valid = await bcrypt.compare(workerSecret, worker.secretHash);
      if (!valid) {
        throw new UnauthorizedError('Invalid worker credentials');
      }

      req.workerId = workerId;
      next();
    } catch (err) {
      next(err);
    }
  })();
}
