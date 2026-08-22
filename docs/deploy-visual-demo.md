# Visual demo mode (static, mock data)

**Author:** Athul S · RA2311047010117

Interactive **read-only** preview of the dashboard — same UI as the real app, with sample data. No backend, worker, or database required.

---

## Run locally

```bash
npm install
npm run dev:demo
```

Open http://localhost:5173 — auto-logged in as **Athul S** (OWNER).

- Mock login (any credentials work after sign-out)
- No WebSocket (frozen metrics)
- Create / retry / invite actions hidden (read-only)

---

## Build static site (GitHub Pages, Vercel, Cloudflare)

```bash
npm run build:demo
```

Output: `frontend/dist/`

### GitHub Pages

1. Push repo to GitHub
2. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**
3. Deploy runs automatically when `frontend/`, `shared/`, or the workflow file changes (README-only pushes won't redeploy)
4. Live URL: `https://<username>.github.io/Codity.AI-Tech_Role-Distributed_Job_Scheduler/`
5. Manual redeploy: **Actions → Deploy visual demo → Run workflow**

Manual build (subpath base is set automatically in CI via `PAGES_BASE`):

```bash
# Linux / macOS / Git Bash
PAGES_BASE=/Codity.AI-Tech_Role-Distributed_Job_Scheduler/ npm run build:demo
cp frontend/dist/index.html frontend/dist/404.html
```

4. Add to submission README:

```markdown
## Visual demo (static)
https://your-username.github.io/Codity.AI-Tech_Role-Distributed_Job_Scheduler/

Mock data, read-only UI preview.

## Full stack application
https://github.com/Athul-S-369/Codity.AI-Tech_Role-Distributed_Job_Scheduler
npm run start
```

---

## How it works

| Flag | `VITE_DEMO_MODE=true` in `.env.demo` |
|------|--------------------------------------|
| API | `frontend/src/lib/api.demo.ts` returns fixtures |
| Data | `frontend/src/demo/fixtures.ts` |
| WebSocket | Disabled in `useWebSocket.ts` |
| Mutations | Hidden via `canMutate = false` in demo mode |

---

## Full application

Clone and run the real distributed stack:

```bash
git clone https://github.com/Athul-S-369/Codity.AI-Tech_Role-Distributed_Job_Scheduler.git
cd Codity.AI-Tech_Role-Distributed_Job_Scheduler
npm install
npm run start
```

Login: `admin@test.local` / `password123`
