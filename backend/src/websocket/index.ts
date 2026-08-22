import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config';
import { logger } from '../lib/logger';

let io: Server | null = null;

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket: Socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id });

    socket.on('subscribe:queue', (queueId: string) => {
      socket.join(`queue:${queueId}`);
    });

    socket.on('subscribe:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('disconnect', () => {
      logger.debug('WebSocket client disconnected', { socketId: socket.id });
    });
  });

  return io;
}

export function emitJobEvent(event: string, data: unknown): void {
  if (!io) return;
  io.emit(event, data);

  const payload = data as { queueId?: string };
  if (payload?.queueId) {
    io.to(`queue:${payload.queueId}`).emit(event, data);
  }
}

export function getIO(): Server | null {
  return io;
}
