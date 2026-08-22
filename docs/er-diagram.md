# Database schema

> **Athul S** · Registration No. **RA2311047010117**

Schema overview for the assignment write-up. UUIDs everywhere for primary keys.

## ER diagram

```mermaid
erDiagram
    User ||--o{ OrganizationMember : "belongs to"
    Organization ||--o{ OrganizationMember : "has members"
    Organization ||--o{ Project : "owns"
    User ||--o{ Project : "creates"
    Project ||--o{ Queue : "has"
    Queue }o--o| RetryPolicy : "uses"
    Queue ||--o{ Job : "contains"
    Job ||--o{ JobExecution : "has attempts"
    Job ||--o{ JobLog : "has logs"
    Job ||--o| DeadLetterEntry : "may have"
    Job ||--o| ScheduledJob : "may have"
    Job ||--o{ JobDependency : "depends on"
    Job ||--o{ Job : "batch parent/child"
    Worker ||--o{ Job : "claims"
    Worker ||--o{ JobExecution : "executes"
    Worker ||--o{ WorkerHeartbeat : "sends"

    User {
        uuid id PK
        string email UK
        string password_hash
        string name
        timestamp created_at
        timestamp updated_at
    }

    Organization {
        uuid id PK
        string name
        string slug UK
        timestamp created_at
        timestamp updated_at
    }

    OrganizationMember {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string role
        timestamp created_at
    }

    Project {
        uuid id PK
        uuid organization_id FK
        string name
        string description
        uuid created_by_id FK
        timestamp created_at
        timestamp updated_at
    }

    Queue {
        uuid id PK
        uuid project_id FK
        string name
        int priority
        int concurrency
        string status
        uuid retry_policy_id FK
        int rate_limit_per_min
        string shard_key
        timestamp created_at
        timestamp updated_at
    }

    RetryPolicy {
        uuid id PK
        string name
        string strategy
        int max_attempts
        int base_delay_ms
        int max_delay_ms
        float multiplier
        timestamp created_at
    }

    Job {
        uuid id PK
        uuid queue_id FK
        string type
        string status
        int priority
        string handler
        json payload
        string idempotency_key
        timestamp scheduled_at
        string cron_expression
        uuid parent_job_id FK
        int batch_index
        int attempt
        int max_attempts
        timestamp next_retry_at
        uuid claimed_by_id FK
        timestamp claimed_at
        timestamp started_at
        timestamp completed_at
        int duration_ms
        json result
        string last_error
        timestamp created_at
        timestamp updated_at
    }

    JobDependency {
        uuid id PK
        uuid job_id FK
        uuid depends_on_job_id FK
    }

    ScheduledJob {
        uuid id PK
        uuid job_id FK UK
        uuid queue_id FK
        timestamp scheduled_at
        string cron_expression
        boolean recurring
        string status
        timestamp fired_at
        timestamp created_at
    }

    JobExecution {
        uuid id PK
        uuid job_id FK
        uuid worker_id FK
        int attempt
        string status
        timestamp started_at
        timestamp completed_at
        int duration_ms
        json result
        string error
        timestamp created_at
    }

    JobLog {
        uuid id PK
        uuid job_id FK
        string level
        string message
        json metadata
        timestamp created_at
    }

    DeadLetterEntry {
        uuid id PK
        uuid job_id FK UK
        uuid queue_id
        string handler
        json payload
        int total_attempts
        string last_error
        string failure_summary
        timestamp failed_at
    }

    Worker {
        uuid id PK
        string hostname
        string status
        int concurrency
        int active_jobs
        json metadata
        timestamp started_at
        timestamp last_seen_at
    }

    WorkerHeartbeat {
        uuid id PK
        uuid worker_id FK
        int active_jobs
        float cpu_usage
        float memory_mb
        timestamp created_at
    }
```

## Keys & relationships

UUID primary keys on everything. Main FK chains:

- User ↔ Organization via `organization_members` (with role column)
- Organization → Project → Queue → Job
- Job → JobExecution, JobLog (cascade delete with job)
- Worker → Job (nullable `claimed_by_id`), WorkerHeartbeat

Deleting a project cascades to its queues and jobs. Retry policies are shared — deleting one would break queues pointing at it, so those FKs are nullable without cascade.

## Indexes worth mentioning

The claim query needs `(queue_id, status, priority, scheduled_at)` on jobs — that's the hot path.

Other useful ones:
- `(status, next_retry_at)` and `(status, scheduled_at)` for the scheduler loop
- `(queue_id, idempotency_key)` unique — duplicate submit protection
- `(job_id, created_at)` on logs for pulling history
- `(worker_id, created_at)` on heartbeats

## Why tables are split this way

- **scheduled_jobs** — one row per delayed/scheduled/recurring template; scheduler promotes from here instead of scanning all jobs
- **retry_policies** — reused across queues, didn't want the same config copy-pasted
- **job_executions** — one row per attempt, so retry history isn't lost when the job row updates
- **job_logs** — append-only, kept separate so logs don't slow down job updates
- **dead_letter_entries** — copied handler/payload/error so DLQ queries don't join back to jobs
- **worker_heartbeats** — time series, didn't want to overwrite a single timestamp on the worker row

A few denormalized fields on purpose: `active_jobs` on workers (avoid count query on every claim), `duration_ms` on jobs (dashboard doesn't need to join executions for every list).

## Performance notes

Claim uses `SKIP LOCKED` + index scan, should be fine until you're doing serious volume. List endpoints are paginated. Payloads are jsonb. Metrics queries filter by time range to keep scans bounded.

