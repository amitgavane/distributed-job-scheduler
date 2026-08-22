export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export const AUTHOR_NAME = 'Amit Gavane';
export const AUTHOR_REGISTRATION = 'B.Tech IT, SGGS';
export const AUTHOR_LABEL = `${AUTHOR_NAME} · ${AUTHOR_REGISTRATION}`;

export const JOB_CLAIM_TIMEOUT_MS = 60_000;
export const WORKER_STALE_THRESHOLD_MS = 30_000;
export const MAX_RETRY_ATTEMPTS_DEFAULT = 3;
export const DEFAULT_RETRY_DELAY_MS = 5000;

export const HANDLERS = {
  ECHO: 'echo',
  SLEEP: 'sleep',
  FAIL: 'fail',
  RANDOM_FAIL: 'random_fail',
  HTTP_REQUEST: 'http_request',
  SEND_EMAIL: 'send_email',
  PROCESS_DATA: 'process_data',
} as const;

export type HandlerName = (typeof HANDLERS)[keyof typeof HANDLERS];