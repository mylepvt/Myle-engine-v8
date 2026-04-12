# Deep multi-perspective audit — full stack (vl2)

**Scope:** Security, reliability, architecture, data, tests, CI/CD, UX/product (summary), performance, a11y/i18n, ops.  
**Companion:** Shell/thin route inventory → [`AUDIT_SHELL_THIN_FULL.md`](./AUDIT_SHELL_THIN_FULL.md). Priority fixes → [`GAP_PRIORITY_P0_P1.md`](./GAP_PRIORITY_P0_P1.md).

---

## 1. Architecture & entry points

| Topic | Finding |
|--------|---------|
| **Production API** | [`backend/main.py`](../backend/main.py) — FastAPI + CORS from **`settings.cors_origin_list`**, lifespan DB dispose, **`register_exception_handlers`**, middleware chain (**request id**, **auth rate limit**, **access log**), SPA fallback when **`FRONTEND_DIST`** set. |
| **Alternate app module** | [`backend/app/main.py`](../backend/app/main.py) — **shim** that imports the real **`main:app`** (same CORS + middleware). Safe to run **`uvicorn app.main:app`** from `backend/`. |
| **Docker** | **Root** [`Dockerfile`](../Dockerfile): Node build + Python, **`alembic upgrade`** on start, **`uvicorn main:app`**. **[`backend/Dockerfile`](../backend/Dockerfile):** API-only. **[`docker-compose.yml`](../docker-compose.yml):** split **frontend (5173)** + **backend (8000)** — matches **cookie auth + CORS** list for dev. |
| **Frontend** | Vite + React 19, **`BrowserRouter`**, TanStack Query (**default `staleTime` 30s**, **retry 1**), lazy **`DashboardNestedPage`**. |

---

## 2. Security

| Topic | Finding |
|--------|---------|
| **Auth model** | **HTTP-only cookies** + JWT (`MYLE_ACCESS_COOKIE`); refresh flow; **`require_auth_user`** on protected routes. **No CSRF tokens** — unlike legacy Flask CSRF; mitigated by **SameSite** (default **lax**), **CORS allowlist** in real app, not cookie for random sites. Cross-site SPA + API needs **`AUTH_COOKIE_SAMESITE=none`** + **`SESSION_COOKIE_SECURE=true`** (validated in settings). |
| **Secrets** | **`SECRET_KEY`** for JWT; dev default in settings — **must** override in prod (`render.yaml` generates). |
| **Dev login** | **`AUTH_DEV_LOGIN_ENABLED`** — must be **false** in prod (Blueprint sets). |
| **Rate limiting** | **`AuthRateLimitMiddleware`** on login/refresh/dev-login paths; tests can disable via **`AUTH_LOGIN_RATE_LIMIT_PER_MINUTE=0`**. |
| **CORS** | Production uses **explicit origins** — not `*` (unlike `app/main.py`). |
| **Uploads** | Payment proof uses **`UploadFile`** — ensure **`python-multipart`** available wherever API runs (often pulled in via FastAPI stack; pin explicitly if deploy ever strips deps). |
| **Headers** | No global **CSP / X-Frame-Options / HSTS** in FastAPI app — typically added at **CDN/reverse proxy**; worth documenting for production hardening. |
| **SQL** | Async SQLAlchemy + parameterized queries — **ORM-first**; good baseline vs injection. |

---

## 3. Data & persistence

| Topic | Finding |
|--------|---------|
| **Migrations** | **22** Alembic versions under [`backend/alembic/versions/`](../backend/alembic/versions/). |
| **Drift detection** | **`GET /health/migrations`** — compares DB revision to Alembic heads. |
| **Legacy import** | [`backend/scripts/import_legacy_sqlite.py`](../backend/scripts/import_legacy_sqlite.py) + mapping docs — operational path for cutover. |
| **SQLite in tests** | [`tests/conftest.py`](../tests/conftest.py) in-memory SQLite + `get_db` override — fast but **not identical** to Postgres behaviour (edge cases possible). |

---

## 4. Backend API surface

| Topic | Finding |
|--------|---------|
| **Routers** | Broad coverage: auth, leads, workboard, team, wallet, system, analytics, execution, finance surfaces, other, settings, pipeline, payments, gate-assistant, realtime WebSocket, etc. |
| **Pipeline HTTP tests** | [`tests/test_api_v1_pipeline.py`](../tests/test_api_v1_pipeline.py) — auth, view/metrics/statuses, **no** double `/pipeline/pipeline/` path (404). Rules still in [`test_pipeline_legacy_port.py`](../tests/test_pipeline_legacy_port.py). |
| **Errors** | Central **`register_exception_handlers`** — stable JSON errors (verify shape in tests). |
| **OpenAPI** | [`scripts/export_openapi.py`](../scripts/export_openapi.py) + **`npm run generate-api-types`** — contract can drift if export not run after API changes. |

---

## 5. Frontend architecture

| Topic | Finding |
|--------|---------|
| **Routing** | Single **`/dashboard/*`** splat + registry-driven [`DashboardNestedPage`](../frontend/src/pages/DashboardNestedPage.tsx) — good consolidation. |
| **Auth gate** | [`ProtectedRoute`](../frontend/src/components/routing/ProtectedRoute.tsx) uses **`GET /auth/me`** as source of truth. |
| **Errors** | [`DashboardOutletErrorBoundary`](../frontend/src/components/routing/DashboardOutletErrorBoundary.tsx) catches render errors in dashboard outlet. |
| **Realtime** | [`useRealtimeInvalidation`](../frontend/src/hooks/use-realtime-invalidation.ts) — WebSocket **`/api/v1/ws`** for query invalidation; **optional** path if WS unavailable. |
| **API base** | **`VITE_API_URL`** — empty string = **same origin** (Docker/root image); explicit URL for split static + API. |

---

## 6. Testing & quality gates

| Topic | Finding |
|--------|---------|
| **Backend** | **~140+** test functions across [`tests/`](../tests/) (auth, leads, wallet, team, analytics, WS, gate assistant, migrations, etc.). |
| **Frontend** | **Vitest:** mainly [`LoginPage.test.tsx`](../frontend/src/pages/LoginPage.test.tsx), [`ProtectedRoute.test.tsx`](../frontend/src/components/routing/ProtectedRoute.test.tsx) — **narrow** vs app size. |
| **CI** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): **pytest**, **`npm run lint`**, **`npm run test`**, **`npm run build`**. Python deps **pinned inline** in CI — subset of **`requirements.txt`** (e.g. **reportlab/gunicorn** not needed for tests) — OK for CI; **prod image** should use full **`requirements.txt`**. |
| **E2E** | **No** Playwright/Cypress in CI — flows validated manually or via API tests only. |

---

## 7. CI/CD & deploy

| Topic | Finding |
|--------|---------|
| **Render** | [`render.yaml`](../render.yaml) — Postgres + Docker web, **`AUTH_DEV_LOGIN_ENABLED=false`**, secure cookies, **`BACKEND_CORS_ORIGINS`** manual sync. |
| **Branch workflow** | [`sync-to-mylepvt.yml`](../.github/workflows/sync-to-mylepvt.yml) — org-specific mirror; review if still needed. |
| **Dependabot** | **Not** present in repo — no automated dependency PRs. |

---

## 8. Observability & ops

| Topic | Finding |
|--------|---------|
| **Request tracing** | **`X-Request-ID`** middleware + CORS **`expose_headers`**. |
| **Access logs** | JSON lines via **`AccessLogMiddleware`**. |
| **Health** | **`/health`**, **`/health/db`**, **`/health/migrations`**. |

---

## 9. Product / UX completeness (high level)

Not re-listing every shell — see [`AUDIT_SHELL_THIN_FULL.md`](./AUDIT_SHELL_THIN_FULL.md). Additional cross-cutting items:

| Topic | Finding |
|--------|---------|
| **Legacy parity evidence** | [`LEGACY_PARITY_MAPPING.md`](./LEGACY_PARITY_MAPPING.md) Phase 0.1 **empty** — cannot prove “same as old app” row-by-row. |
| **PWA** | Minimal **`sw.js`** — **no** offline precache (documented in checklist). |
| **i18n** | [`frontend/src/lib/i18n.ts`](../frontend/src/lib/i18n.ts) — **English-first** hub; no locale switch product. |

---

## 10. Performance & scale (baseline)

| Topic | Finding |
|--------|---------|
| **Workers** | Docker CMD uses **`WEB_CONCURRENCY`** (default 1) — horizontal scaling via multiple workers/processes on host. |
| **DB** | Async pool; no separate read replicas in app — **single DB** assumption. |
| **Frontend** | Code-split **`DashboardNestedPage`**; no documented bundle budget. |

---

## 11. Accessibility & UX engineering

| Topic | Finding |
|--------|---------|
| **a11y** | Some **`aria-*`** on loading states; **not** a full WCAG audit — forms/pages vary. |
| **Focus / keyboard** | Not systematically verified in this pass. |

---

## 12. Summary — strongest areas vs gaps

**Strong:** Clear **registry-driven IA**, **cookie JWT + refresh**, **middleware** (logging, rate limit, request id), **health/migrations**, **broad API + pytest**, **CI pipeline**, **Docker/Render story**, **ORM usage**.

**Gaps / risks:** **no CSRF** (document threat model for cookie API); **FE test coverage** thin; **no E2E**; **no Dependabot**; **security headers** at app layer; **parity evidence** incomplete; **shell/thin surfaces** (inventory in other doc).

---

*This is a static codebase audit (read-only pass), not a penetration test or load test.*
