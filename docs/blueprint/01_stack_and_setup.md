# 01 — Stack & Setup

> Source of truth: `/Users/karanveersingh/Downloads/Myle-Dashboard-main/`

## 1. Original Stack (what the old app actually uses)

| Layer | Tech |
|-------|------|
| Language | Python 3.11+ |
| Web framework | Flask 3.0.3 + server-rendered Jinja templates |
| WSGI server | Gunicorn 21.2.0 (`gunicorn.conf.py`) |
| DB | SQLite (file: `leads.db`), WAL mode |
| Scheduler | APScheduler 3.10.4 (background jobs — daily push reminders, discipline engine) |
| Auth | Flask `session` (signed cookies, 30-day rolling, `SameSite=Lax`) |
| Passwords | `werkzeug.security.generate_password_hash` + legacy bcrypt/plain compat |
| Timezone | pytz, everything forced to `Asia/Kolkata` (UTC+5:30) |
| Files (proofs, PDFs) | `/uploads` on local disk (ephemeral on Render) |
| Push | `pywebpush` + VAPID keys (optional) |
| AI (Maya) | Google Gemini (primary) + Anthropic Claude (fallback) — both optional |
| Deploy | Render.com, one web service (`render.yaml`) |

## 2. Recommended New Stack (rebuild target — same behavior)

You can rebuild on anything — the blueprint is stack-agnostic. Suggested modern pairing:

| Layer | Tech |
|-------|------|
| Backend | FastAPI + SQLAlchemy async + Alembic |
| DB | PostgreSQL 15+ (or keep SQLite for dev) |
| Frontend | React 18 + Vite + TypeScript + React Router + TanStack Query |
| Auth | JWT (access 15min + refresh 30day) OR cookie sessions — doesn't matter as long as role + username are in the context |
| Scheduler | APScheduler / Celery beat / FastAPI BackgroundTasks |
| Files | S3-compatible (Cloudflare R2) — never local disk in prod |
| Deploy | Render / Fly.io / Railway |

**Constraint:** whatever you pick, the business behavior in files 02–20 must be preserved exactly.

## 3. Environment Variables

### Core
```
SECRET_KEY                    # required in prod; session cookie signing; MUST be identical across all workers
DATABASE_URL                  # postgres://... or sqlite:///leads.db
FLASK_ENV=production          # (or your framework equivalent)
```

### Security / cookies
```
SESSION_COOKIE_SECURE=1       # auto-on when RENDER=true or FLASK_ENV=production
FLASK_DEV_SECRET_FALLBACK     # dev only — stable fallback so dev sessions survive restarts
```

### Push notifications (optional)
```
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_CLAIM_EMAIL=mailto:admin@myle.in
```

### Maya AI (optional)
```
GEMINI_API_KEY                # primary
ANTHROPIC_API_KEY             # fallback
```

### SMTP (forgot password)
```
SMTP_HOST
SMTP_PORT=587
SMTP_USER
SMTP_PASS
SMTP_FROM
```

## 4. Project Layout (old Flask app)

```
Myle-Dashboard-main/
├── app.py                  # 6000+ lines — main Flask app, view handlers, startup
├── database.py             # 2530 lines — schema init + migrate_db + seeds
├── helpers.py              # 3929 lines — shared business logic (re-exports rule_engine)
├── auth_context.py         # acting_username / acting_user_id / session refresh
├── reliability.py          # request_id logging
├── execution_enforcement.py# hard invariants checked at startup
├── decorators.py           # @login_required, @admin_required, @role_required
├── routes/
│   ├── auth_routes.py
│   ├── lead_routes.py      (157 KB)
│   ├── lead_pool_routes.py
│   ├── wallet_routes.py
│   ├── enrollment_routes.py
│   ├── training_routes.py
│   ├── report_routes.py
│   ├── team_routes.py
│   ├── approvals_routes.py
│   ├── profile_routes.py
│   ├── tasks_routes.py
│   ├── progression_routes.py
│   ├── day2_test_routes.py
│   ├── ai_routes.py
│   ├── social_routes.py
│   ├── misc_routes.py
│   └── webhook_routes.py
├── services/
│   ├── rule_engine.py      # canonical FSM, statuses, tracks, buckets
│   ├── wallet_ledger.py    # append-only ledger math
│   ├── scoring_service.py  # points + daily_scores + badges
│   ├── hierarchy_lead_sync.py
│   └── day2_certificate_pdf.py
├── templates/              # 90+ Jinja templates (see 20_frontend_pages.md)
├── static/                 # css/js/images
├── uploads/                # payment proofs, PDFs
├── leads.db                # SQLite file (WAL)
└── requirements.txt
```

## 5. Startup Sequence (boot order matters)

On every process start, `app.py` runs — in this order:

1. `init_db()` — create all tables if missing (`database.py`)
2. `migrate_db()` — idempotent ALTER TABLE ADD COLUMN for every new field added over time; also:
   - rebuilds `leads` table if `claimed_at` is still `NOT NULL` (legacy)
   - normalizes `claimed_at=''` → `NULL`
   - backfills `enrolled_at` for pre-existing enrolled leads
   - grandfathers `test_status='passed'` for leads already past Day 2
   - aligns `upline_fbo_id` with resolved parent
3. `seed_users()` — creates default admin (`admin` / `admin123`) if none exists
4. `seed_training_questions()` — inserts default MCQ set if empty
5. `startup_invariant_scan()` — hard asserts on lead ownership invariant (see below)
6. `check_claimed_at_empty_string_invariant()` — logs CRITICAL if any rows still have `claimed_at=''`
7. APScheduler starts (if available):
   - `_auto_expire_pipeline_leads_batch` every 15 min
   - Daily reminder push at 09:00 IST
   - Follow-up discipline sweep every hour
8. Flask routes registered and app serves

**Hard invariant (enforced at boot + every write):**
```
leads.in_pool = 1  OR  leads.assigned_user_id IS NOT NULL
```
Both empty = illegal row. The `CHECK` constraint is on the table; `startup_invariant_scan` double-verifies.

## 6. Local Dev Quickstart

```bash
# Old app
git clone <repo> && cd Myle-Dashboard-main
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SECRET_KEY=dev-local-stable-key
python app.py            # http://localhost:5000
# Login: admin / admin123
```

Tests:
```bash
pytest -q
```

## 7. Acceptance Checklist

- [ ] Single process can boot with empty DB and auto-create schema + seed admin user
- [ ] `leads` table has `CHECK((in_pool=1) OR (assigned_user_id IS NOT NULL AND assigned_user_id != 0))`
- [ ] All timestamps written via `datetime('now','+5 hours','+30 minutes')` (SQLite) or IST-aware Python `datetime` (Postgres)
- [ ] `SECRET_KEY` identical across all workers (no per-worker random fallback in prod)
- [ ] Session cookies: `HttpOnly`, `SameSite=Lax`, `Secure=true` when served over HTTPS, 30-day lifetime
- [ ] `uploads/` path (or S3 bucket) exists and is writable before first request
- [ ] Default admin login works: `admin / admin123`
- [ ] Boot completes even when optional deps (pywebpush, anthropic, gemini, pdfplumber) are missing
