# Claude → Cursor handoff — Myle vl2

Last updated: 2026-04-11

## Kya kiya gaya (deploy + stack)

1. **Render / Docker**
   - Monorepo root **`Dockerfile`**: Vite build (`VITE_API_URL` empty = same-origin) + FastAPI + `FRONTEND_DIST`.
   - Optional **`render.yaml`** Blueprint (Postgres + web service).
   - Live URL example: `https://new-myle-community.onrender.com` (exact hostname Render assigns).

2. **Git**
   - Primary dev remote: **`Mylecommunity/Myle-community`** (`origin`) — yahi par feature commits push ho rahe hain.
   - Agar Render **`mylepvt/New-Myle-Community`** use karta hai: wahan bhi **`main` sync** chahiye (HTTPS token push ya collaborator access), **ya** Render repo **`Mylecommunity/Myle-community`** pe switch.

3. **Auth**
   - Cookie JWT: **`myle_access`**, **`myle_refresh`**; `POST /api/v1/auth/login` (seeded users + `myle-dev-login`).
   - Login UX: session verify + query cache reset (`LoginPage`); `ProtectedRoute` = server **`GET /api/v1/auth/me`** source of truth.

4. **Realtime (WebSocket)**
   - **`wss://<host>/api/v1/ws`** — cookie auth (**no** `/ws/{user_id}` in URL).
   - Backend: `realtime_hub.py`, `realtime_ws.py`; mutations call `notify_topics(...)`.
   - Frontend: `useRealtimeInvalidation` in **`DashboardLayout.tsx`**.

## Key paths

| Area | Path |
|------|------|
| WS endpoint | `backend/app/api/v1/realtime_ws.py` |
| Hub / broadcast | `backend/app/core/realtime_hub.py` |
| FE hook | `frontend/src/hooks/use-realtime-invalidation.ts` |
| Hook mount | `frontend/src/components/layout/DashboardLayout.tsx` |
| Settings | `backend/app/core/config.py` |
| Router | `backend/app/api/v1/router.py` |

## Local workflow

```bash
cd "/Users/karanveersingh/myle vl2"
git status
git push origin main
```

**Worktree paths** (e.g. `admiring-moore`) se confuse mat karo — daily edit is repo root par.

## Render checklist (production hygiene)

1. **`SECRET_KEY`**
   - Env name: **`SECRET_KEY`** (32+ random chars). Default dev string production mein unsafe.
2. **`AUTH_DEV_LOGIN_ENABLED`**
   - Production: **`false`**. `POST /api/v1/auth/dev-login` → 404.
   - UI: “Continue (dev role)” button **ab bhi dikh sakta hai**; dabane par error aayega — optional follow-up: env se button hide karna.
3. **`BACKEND_CORS_ORIGINS`**
   - Same-origin deploy: public app URL (no trailing slash), e.g. `https://new-myle-community.onrender.com`.
4. **`DATABASE_URL`**
   - Render Postgres internal URL; container start: `alembic upgrade head` (see root `Dockerfile` `CMD`).
5. **WebSocket verify**
   - Chrome → DevTools → Network → **WS** → `api/v1/ws` → **101 Switching Protocols** after login on dashboard.

## Tests

- Backend: `python -m pytest tests/` (includes `test_api_v1_ws.py`).
- Frontend: `cd frontend && npm run test && npm run build`.

## Roadmap / next

- Production **`SECRET_KEY`** + env audit on Render.
- Real users / admin tooling (beyond seeded `dev-*@myle.local`).
- Multi-instance Render: in-memory `RealtimeHub` **does not** fan-out across replicas → later **Redis pub/sub** (or single replica).
- Optional: hide dev-role login UI when `AUTH_DEV_LOGIN_ENABLED=false`.

## Repo strategy (long-term)

- **Single source of truth:** either always **`Mylecommunity/Myle-community`** + Render connected to it, **or** keep **`mylepvt`** in sync with automated push/CI.
- Avoid zip-upload-only history on production branch; prefer normal **`git push`**.
