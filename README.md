# Distributed Job Scheduler

**Amit Gavane** · B.Tech IT, SGGS Institute of Engineering and Technology, Nanded  
Intern assignment — a production-inspired distributed background job system featuring concurrent workers, resilient retries, atomic database transactions, and a real-time web dashboard.

---

## Where things stand

Full stack runs locally: API, scheduler, worker, Postgres, React dashboard. Seed data is pre-configured so charts and job lists are populated on first login.

**Visual demo (no install):** https://amitgavane.github.io/distributed-job-scheduler/

Static mock UI — same screens, fake data. Banner links back here for the real app.

CI passes on GitHub Actions. Render Blueprint handles production deployment.

---

## Architecture

### Monorepo layout

```mermaid
flowchart LR
    subgraph Monorepo["codity-scheduler monorepo"]
        FE_PKG["frontend/<br/>Dashboard UI<br/>demo mode · api.demo.ts"]
        BE_PKG["backend/<br/>API server · Prisma<br/>scheduler entry · WebSocket"]
        WK_PKG["worker/<br/>poll loop · handlers<br/>api-client"]
        SH_PKG["shared/<br/>JobStatus · RetryStrategy<br/>HANDLERS · AUTHOR_*"]
    end

    FE_PKG --> SH_PKG
    BE_PKG --> SH_PKG
    WK_PKG --> SH_PKG


Visual demo vs full application

    flowchart LR
    subgraph Full["Full application"]
        FE2[React Dashboard]
        API2[Express API]
        WK2[Workers]
        PG2[(Postgres)]
        FE2 --> API2 --> PG2
        WK2 --> API2
    end

    subgraph Demo["Visual demo only"]
        FE3[React Dashboard]
        FIX[fixtures.ts<br/>generate-fixtures.ts]
        FE3 --> FIX
    end


System overview

    flowchart TB
    subgraph Client["Client layer"]
        FE["React Dashboard<br/>Vite · Tailwind · Recharts"]
        DEMO["Visual demo<br/>static · GitHub Pages"]
    end

    subgraph API["API layer — backend/"]
        EXPRESS["Express REST API<br/>/api/auth · projects · queues<br/>jobs · workers · metrics · events"]
        WS["Socket.IO"]
        AUTH["JWT auth + RBAC"]
        SERVICES["Services<br/>auth · project · queue · job<br/>worker · metrics · events"]
    end

    subgraph SchedulerProc["Scheduler — backend/src/scheduler.ts"]
        SCH["Tick ~5s<br/>promote scheduled · retry failed<br/>stale workers · release claims"]
        LEADER["Redis leader lock"]
    end

    subgraph WorkerLayer["Worker — worker/"]
        W1["Worker instance(s)"]
        HANDLERS["Handlers<br/>echo · sleep · send_email<br/>http_request · process_data"]
        POLL["Poll → claim → start<br/>→ complete / fail"]
    end

    subgraph Data["Data layer"]
        PG[("PostgreSQL")]
        RD[("Redis — optional")]
    end

    subgraph Shared["shared/"]
        TYPES["Types · retry math"]
    end

    FE -->|"REST + JWT"| EXPRESS
    FE -->|"WebSocket"| WS
    DEMO -.->|"mock fixtures"| DEMO

    EXPRESS --> AUTH --> SERVICES --> PG
    EXPRESS --> WS --> FE
    SCH --> PG
    SCH --> LEADER --> RD
    SERVICES --> RD

    W1 --> POLL --> HANDLERS
    W1 -->|"worker secret auth"| EXPRESS
    SERVICES --> WS
    SCH --> SERVICES

    EXPRESS --- TYPES
    W1 --- TYPES


Job lifecycle

    stateDiagram-v2
    [*] --> SCHEDULED : delayed / scheduled / cron
    SCHEDULED --> QUEUED : scheduler promotes
    [*] --> QUEUED : immediate / batch child

    QUEUED --> CLAIMED : worker claim<br/>FOR UPDATE SKIP LOCKED
    CLAIMED --> RUNNING : worker start
    RUNNING --> COMPLETED : success
    RUNNING --> FAILED : error

    FAILED --> QUEUED : retry after backoff
    FAILED --> DEAD_LETTER : max attempts exceeded

    QUEUED --> CANCELLED : user cancel
    COMPLETED --> [*]
    DEAD_LETTER --> [*]
    CANCELLED --> [*]


End-to-end job flow

    sequenceDiagram
    actor User
    participant FE as Dashboard
    participant API as Express API
    participant PG as PostgreSQL
    participant WS as Socket.IO
    participant SCH as Scheduler
    participant W as Worker

    User->>FE: Create immediate job
    FE->>API: POST /api/jobs/immediate (JWT)
    API->>PG: INSERT job status=QUEUED
    API->>WS: emit job:created
    WS->>FE: live refresh

    loop Poll every ~1s
        W->>API: POST /workers/:id/claim (secret)
        API->>PG: SKIP LOCKED claim
        API-->>W: claimed jobs
    end

    W->>API: POST .../start
    API->>PG: status=RUNNING
    W->>W: run handler
    W->>API: POST .../complete or .../fail
    API->>PG: COMPLETED / FAILED / DLQ
    API->>WS: emit job:completed
    WS->>FE: dashboard updates

    loop Every 5s
        SCH->>PG: promote scheduled, retry failed
        SCH->>WS: emit scheduler:tick
    end



Domain model (Postgres)

    erDiagram
    User ||--o{ OrganizationMember : has
    Organization ||--o{ OrganizationMember : has
    Organization ||--o{ Project : owns
    User ||--o{ Project : creates
    Project ||--o{ Queue : has
    Queue ||--o{ Job : contains
    Queue }o--|| RetryPolicy : uses
    Job ||--o{ JobExecution : runs
    Job ||--o{ JobLog : logs
    Job ||--o{ JobDependency : depends_on
    Job ||--o| ScheduledJob : scheduled
    Job ||--o| DeadLetterEntry : may_become
    Worker ||--o{ JobExecution : executes
    Worker ||--o{ WorkerHeartbeat : sends
    Job }o--o| Job : parent_batch

    User {
        uuid id
        string email
        string passwordHash
    }
    Organization {
        uuid id
        string slug
    }
    Project {
        uuid id
        string name
    }
    Queue {
        uuid id
        string status
        int concurrency
        string shardKey
    }
    Job {
        uuid id
        string type
        string status
        string handler
    }
    Worker {
        uuid id
        string hostname
        string status
    }


Startup
Needs Node 20+.

1. Install
git clone [https://github.com/amitgavane/distributed-job-scheduler.git](https://github.com/amitgavane/distributed-job-scheduler.git)
cd distributed-job-scheduler
npm install


2. Environment
Root .env and backend/.env should point at local Postgres. Minimum:

DATABASE_URL="postgresql://scheduler:scheduler_secret@localhost:5432 codity_scheduler?schema=public"
JWT_SECRET="change-me-in-production"
WORKER_REGISTRATION_KEY="dev-worker-register-key"
PORT=3001
CORS_ORIGIN="http://localhost:5173"

Redis is optional (REDIS_URL=redis://localhost:6379). Without it, rate limits and scheduler leader lock fall back to in-memory.

3. Database (first time)
npm run db:push -w backend
npm run db:seed -w backend

If the API complains about Prisma client:
npx prisma generate --schema=backend/prisma/schema.prisma

4. Run full applicationOne command — embedded Postgres + API + scheduler + worker + frontend:
npm run start
Service             URL
Dashboard           http://localhost:5173
API                 http://localhost:3001
Health              http://localhost:3001/health

Login: admin@test.local / password123 (all seed users use password123)
Or run processes separately:
npm run dev:db                    # terminal 1 — Postgres
npm run dev -w backend            # terminal 2 — API + WebSocket
npm run dev:scheduler -w backend  # terminal 3 — scheduler
npm run dev -w worker             # terminal 4 — worker
npm run dev -w frontend           # terminal 5 — dashboard

5. Visual demo only (mock data)
npm run dev:demo

Opens http://localhost:5173 — auto-logged in, read-only, no API/worker/DB.


What I built
Authentication, organizations, projects, queues (priority, concurrency, retry policy, pause/resume). Five job types: immediate, delayed, scheduled, recurring, and batch. Workers claim jobs via atomic FOR UPDATE SKIP LOCKED, execute handlers concurrently, send heartbeats, and support graceful shutdowns. Configurable retries with fixed, linear, and exponential backoff; Dead Letter Queue isolation with atomic bulk replay transactions. Includes RBAC, workflow dependencies, idempotency keys, advanced debounced search, Redis metrics caching, WebSocket live feeds, and Vitest integration testing.

Stack: Node, Express, Prisma, PostgreSQL, React, Vite, Tailwind CSS, Socket.IO, Redis, Vitest.


Docs: 
architecture.md

api-documentation.md

deploy-visual-demo.md

deploy-render.md

er-diagram.md

design-decisions.md