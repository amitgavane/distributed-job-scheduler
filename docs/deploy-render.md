# Deploy on Render (one-click Blueprint)

**Author:** Athul S · RA2311047010117

This repo includes a [`render.yaml`](../render.yaml) blueprint that creates everything automatically:

| Resource | Name |
|----------|------|
| PostgreSQL | `codity-db` |
| Web Service (API) | `codity-api` |
| Background Worker | `codity-worker` |
| Static Site (dashboard) | `codity-frontend` |

---

## Prerequisites

1. Code pushed to GitHub:  
   https://github.com/Athul-S-369/Codity.AI-Tech_Role-Distributed_Job_Scheduler
2. [Render](https://render.com) account (sign up with GitHub)

---

## One-click deploy (Blueprint)

### Step 1 — Open Blueprints

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Blueprint**

### Step 2 — Connect repo

1. Connect your GitHub account if not already
2. Select repo: **Codity.AI-Tech_Role-Distributed_Job_Scheduler**
3. Render detects `render.yaml` automatically
4. Click **Apply**

### Step 3 — Review services

Render shows 4 resources to create:

- `codity-db` (Postgres — free)
- `codity-api` (Web Service — free)
- `codity-worker` (Background Worker — **starter plan**, ~$7/mo; free tier not supported for workers)
- `codity-frontend` (Static Site — free)

Click **Apply** again to start deploying.

### Step 4 — Wait (~10–15 min)

Deploy order:

1. Database becomes available
2. API builds, runs migrations + seed, starts
3. Worker connects to API
4. Frontend builds with API URL baked in

### Step 5 — Open your app

1. Dashboard → **codity-frontend** → copy URL  
   e.g. `https://codity-frontend.onrender.com`
2. Login: `admin@test.local` / `password123`
3. API health: `https://codity-api.onrender.com/health`

---

## Already deployed manually?

If you already created `codity-db` or `codity-api` by hand:

**Option A — Fresh Blueprint (recommended)**  
Delete existing Render services + database, then run Blueprint from scratch.

**Option B — Keep existing API**  
Skip Blueprint. Manually add only:

- **Worker** — build: `npm install && npm run render:build:worker`, start: `npm run start -w worker`
- **Frontend** — static site, build: `npm install && npm run render:build:frontend`

---

## What the blueprint configures automatically

| Variable | How it's set |
|----------|----------------|
| `DATABASE_URL` | Linked from `codity-db` |
| `JWT_SECRET` | Auto-generated |
| `WORKER_REGISTRATION_KEY` | Auto-generated (shared by API + worker) |
| `CORS_ORIGIN` | Frontend URL |
| `API_URL` (worker) | API URL |
| `VITE_WS_URL` (frontend) | API URL |
| `VITE_API_URL` (frontend) | API URL + `/api` (via build script) |
| `RUN_SCHEDULER_IN_API` | `true` |

---

## Free tier notes

- Services sleep after ~15 min idle → first load may take 30–60 sec
- Free Postgres expires after 90 days
- Good enough for internship demo / submission

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blueprint validation error | Ensure `fromGroup` (not `envVarGroups`) links secrets; worker must use `plan: starter` |
| API build fails | Check Logs on `codity-api`; ensure latest code is pushed |
| Worker 401 | Redeploy worker — `WORKER_REGISTRATION_KEY` must match API |
| Blank frontend | Redeploy frontend after API is live |
| Login CORS error | Redeploy API (CORS_ORIGIN links to frontend URL) |
| `/jobs` refresh 404 | Blueprint includes SPA rewrite rules |

---

## Redeploy after code changes

Push to GitHub `main` → Render auto-redeploys all linked services.

Or: Dashboard → service → **Manual Deploy** → **Deploy latest commit**.
