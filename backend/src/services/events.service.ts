import { emitJobEvent } from '../websocket';
import { prisma } from '../lib/prisma';

export async function publishEvent(
  type: string,
  payload: Record<string, unknown>,
  source = 'api'
): Promise<void> {
  await prisma.systemEvent.create({
    data: { type, source, payload: payload as object },
  });

  emitJobEvent(type, payload);
}

export async function listRecentEvents(limit = 50, type?: string) {
  return prisma.systemEvent.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
