# API reference

> **Athul S** · Registration No. **RA2311047010117**

Base: `http://localhost:3001/api`

Auth header for user routes: `Authorization: Bearer <token>`

Worker routes use `X-Worker-Id` + `X-Worker-Secret`. Registration uses `X-Worker-Registration-Key`.

---

## Auth

| Method | Path | Body |
|--------|------|------|
| POST | `/auth/register` | `{ email, password, name }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/auth/organizations` | — |
| POST | `/auth/organizations` | `{ name, slug }` |
| POST | `/auth/organizations/:orgId/members` | `{ email, role }` — admin+ |
| GET | `/auth/organizations/:orgId/members` | list members |

Roles: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`

---

## Projects

| Method | Path | Notes |
|--------|------|-------|
| GET | `/projects?organizationId=` | list |
| POST | `/projects` | `{ organizationId, name, description? }` |
| GET | `/projects/:id` | includes queues |
| DELETE | `/projects/:id` | admin+ only |

---

## Queues

| Method | Path | Notes |
|--------|------|-------|
| POST | `/queues` | create — see body below |
| GET | `/queues/:id` | |
| PATCH | `/queues/:id` | update config |
| POST | `/queues/:id/pause` | |
| POST | `/queues/:id/resume` | |
| GET | `/queues/:id/stats` | counts + throughput |
| GET | `/queues/retry-policies` | |
| POST | `/queues/retry-policies` | `{ name, strategy, maxAttempts, baseDelayMs, ... }` |

Create queue body:
```json
{
  "projectId": "uuid",
  "name": "emails",
  "concurrency": 5,
  "priority": 10,
  "retryPolicyId": "uuid",
  "rateLimitPerMin": 100
}
```

---

## Jobs

| Method | Path | Notes |
|--------|------|-------|
| POST | `/jobs/immediate` | `{ queueId, handler, payload?, idempotencyKey?, dependsOn? }` |
| POST | `/jobs/delayed` | + `delayMs` |
| POST | `/jobs/scheduled` | + `scheduledAt` (ISO) |
| POST | `/jobs/recurring` | + `cronExpression` |
| POST | `/jobs/batch` | `{ queueId, handler, items: [...] }` |
| GET | `/jobs?queueId=&status=&page=&limit=` | paginated |
| GET | `/jobs/:id` | full detail + logs + executions |
| POST | `/jobs/:id/retry` | re-queue failed/dlq job |
| POST | `/jobs/:id/cancel` | |
| GET | `/jobs/dead-letter?queueId=&page=&limit=` | paginated DLQ |

Handlers shipped in the worker: `echo`, `sleep`, `fail`, `random_fail`, `http_request`, `send_email`, `process_data`

---

## Events

| Method | Path | Notes |
|--------|------|-------|
| GET | `/events?limit=50` | recent system events (audit feed) |

---

## Workers

| Method | Path | Notes |
|--------|------|-------|
| POST | `/workers/register` | `{ hostname, concurrency, shardKey? }` → `{ id, secret, ... }` — needs registration key header |
| POST | `/workers/:id/heartbeat` | `{ activeJobs, cpuUsage?, memoryMb? }` |
| POST | `/workers/:id/claim` | `{ maxJobs }` → array of jobs |
| POST | `/workers/:id/jobs/:jobId/start` | |
| POST | `/workers/:id/jobs/:jobId/complete` | `{ result?, durationMs? }` |
| POST | `/workers/:id/jobs/:jobId/fail` | `{ error, durationMs? }` |
| POST | `/workers/:id/jobs/:jobId/logs` | `{ level, message, metadata? }` |
| POST | `/workers/:id/drain` | graceful shutdown |
| GET | `/workers` | list (needs user auth) |
| GET | `/workers/:id` | detail + recent heartbeats |

---

## Metrics

| Method | Path |
|--------|------|
| GET | `/metrics` |
| GET | `/metrics/throughput?hours=24` |

---

## WebSocket events

Connect to `http://localhost:3001` (Socket.IO).

Subscribe: `subscribe:queue`, `subscribe:project`

Events: `job:created`, `job:claimed`, `job:started`, `job:completed`, `job:retry_scheduled`, `job:dead_letter`, `job:retried`, `job:cancelled`, `worker:registered`, `scheduler:tick`

---

## Errors

JSON shape: `{ error, message, details?, statusCode }`

Common codes: 400 validation, 401 auth, 403 role, 404 not found, 409 duplicate

List endpoints return `{ data: [], pagination: { page, limit, total, totalPages } }`
