import { HANDLERS } from '@codity/shared';

export type JobHandler = (
  payload: Record<string, unknown>
) => Promise<unknown>;

const handlers: Record<string, JobHandler> = {
  [HANDLERS.ECHO]: async (payload) => {
    return { echoed: payload, timestamp: new Date().toISOString() };
  },

  [HANDLERS.SLEEP]: async (payload) => {
    const durationMs = (payload.durationMs as number) || 1000;
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    return { slept: durationMs };
  },

  [HANDLERS.FAIL]: async (payload) => {
    throw new Error((payload.message as string) || 'Intentional failure');
  },

  [HANDLERS.RANDOM_FAIL]: async (payload) => {
    const failRate = (payload.failRate as number) || 0.5;
    if (Math.random() < failRate) {
      throw new Error('Random failure triggered');
    }
    return { success: true };
  },

  [HANDLERS.HTTP_REQUEST]: async (payload) => {
    const url = payload.url as string;
    if (!url) throw new Error('url is required');
    const method = (payload.method as string) || 'GET';
    const res = await fetch(url, { method });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 1000) };
  },

  [HANDLERS.SEND_EMAIL]: async (payload) => {
    await new Promise((r) => setTimeout(r, 500));
    return {
      sent: true,
      to: payload.to,
      subject: payload.subject,
      messageId: `msg-${Date.now()}`,
    };
  },

  [HANDLERS.PROCESS_DATA]: async (payload) => {
    const data = (payload.data as unknown[]) || [];
    const processed = data.map((item, i) => ({ index: i, value: item }));
    await new Promise((r) => setTimeout(r, 200));
    return { processed: processed.length, results: processed };
  },
};

export function getHandler(name: string): JobHandler {
  const handler = handlers[name];
  if (!handler) {
    return async (payload) => {
      throw new Error(`Unknown handler: ${name}. Payload: ${JSON.stringify(payload)}`);
    };
  }
  return handler;
}

export function registerHandler(name: string, handler: JobHandler): void {
  handlers[name] = handler;
}
