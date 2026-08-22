# Design notes

> **Athul S** · Registration No. **RA2311047010117**



Quick write-up of choices I made and what I'd change with more time.



## Postgres as the queue



Considered Redis Streams / BullMQ but didn't want another moving part for a take-home. Postgres `SKIP LOCKED` is well-documented (Sidekiq Pro uses the same pattern) and keeps job state + history in one place.



Downside: won't hit Kafka-level throughput. Fine for the scale this is aimed at.



## Workers talk to API only



Workers have no DB credentials. All claim/complete logic goes through REST. Extra latency per op but means retry rules and DLQ logic live in one place and I could write a Python worker later without duplicating business logic.



Worker secrets (bcrypt-hashed) plus a registration key prevent random processes from joining the pool.



## Monorepo



`shared/` package for job status enums and retry delay calculation. Stops the worker and API from drifting on status strings. Build order is slightly annoying (`shared` first) but worth it.



## JWT auth + RBAC



Sessions felt like overkill. JWT is easy to test with curl. Role checks live in the service layer, not scattered in routes. VIEWER role makes it easy to demo read-only access without a second login flow.



Downside: can't revoke a token early. Would add a denylist in Redis if this went to prod.



## Scheduler as a separate process

The promotion loop runs in `backend/src/scheduler.ts` (`npm run dev:scheduler -w backend`), not inside the API by default. API only runs the scheduler if `RUN_SCHEDULER_IN_API=true`. Redis leader lock (`scheduler:leader`) still prevents double-promotion when multiple scheduler replicas exist.

## DLQ as its own table



Could've just used `status = DEAD_LETTER` on jobs. Split it out so DLQ listing doesn't scan the full jobs table and I could stash a short failure hint without bloating the job row.



Failure summaries call OpenAI when `OPENAI_API_KEY` is set (`OPENAI_MODEL`, optional `OPENAI_BASE_URL`). Falls back to regex heuristics if the key is missing or the request fails — keeps local dev and CI working without an API key.

## Redis fallback

If Redis is down, locks and per-queue rate limits use an in-memory store (single-instance only). With `REDIS_URL` set (docker-compose or local Redis), distributed locks work across replicas.

## WebSocket + polling



Socket.IO pushes job events to the dashboard. Also poll every 10s because I didn't trust WS to stay connected during dev with hot reload. Project-scoped subscriptions reduce noise.



## Idempotency



`UNIQUE(queue_id, idempotency_key)` on jobs. Submit twice with same key → get the original job back. Scoped per queue not globally.



## Job dependencies



`JobDependency` table with cycle detection on create. Worker claim path skips jobs whose prerequisites aren't `COMPLETED`. Keeps orchestration in the DB without a separate workflow engine.



## Queue sharding



Optional `shardKey` on queues and workers. Claim query filters so a `payments` worker only sees `payments` queue jobs. Simple horizontal split without consistent hashing complexity.



## Event-driven audit



`SystemEvent` rows for job/worker/scheduler events. Gives the dashboard a live feed and a place to hook webhooks later.



## Testing



Unit tests for retry math, dependency validation, worker handlers. Integration tests (supertest + real Postgres) cover auth, RBAC, claim/complete, and DLQ. Skipped automatically if `DATABASE_URL` isn't set.



## Stuff I'd do next

- Testcontainers in CI (GitHub Actions uses Postgres/Redis service containers today)

- API keys for programmatic access

- Prometheus metrics endpoint

- Token refresh + revocation

