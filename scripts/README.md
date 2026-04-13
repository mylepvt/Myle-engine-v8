# Repo-root `scripts/`

Small **operators’ helpers** and **test subsets**. Heavy migration / import logic lives under **`backend/scripts/`** (run from `backend/` with the same `DATABASE_URL` as the API).

## Testing & safety (Phase 7)

| Script | Purpose |
|--------|---------|
| **`verify_phase7.sh`** | Pytest: **auth** (`login`, `me`, `refresh`, `dev-login`, rate limit) + **leads flow** (`leads`, `workboard`, `follow-ups`, `retarget`) + **wallet**. |
| **`verify_wave_a.sh`** | Narrower Wave A smoke (leads subset + gate assistant + meta + `auth/me`). |
| **`verify_full_stack.sh`** | **All checks in one go:** Wave A + Phase 7 + full `pytest` + frontend **lint / Vitest / build** + **`npm audit --audit-level=high`** + **`pip-audit`** on `backend/requirements.txt` + **Playwright** smoke (`frontend/e2e/`). |

```bash
bash scripts/verify_phase7.sh
bash scripts/verify_full_stack.sh
```

Full suite: `python3 -m pytest` from repo root (see `requirements-dev.txt` / CI). CI also runs **`npm audit`**, **`pip-audit`**, and **`npm run test:e2e`** (see `.github/workflows/ci.yml`).

## Migrations

| Script | Purpose |
|--------|---------|
| **`run_alembic_upgrade.sh`** | `alembic upgrade head` from **`backend/`** (uses **`DATABASE_URL`**). |

Production Docker images already run migrations on start; this is for local/staging shells.

## Other

| Script | Purpose |
|--------|---------|
| **`export_openapi.py`** | Writes **`frontend/openapi.json`** for TS type generation (`npm run generate-api-types` in `frontend/`). |

## Data migration & fixes (`backend/scripts/`)

| Script | Purpose |
|--------|---------|
| **`import_legacy_sqlite.py`** | Flask **`leads.db`** → vl2 Postgres (users, leads, wallet, activity). |
| **`legacy_sqlite_inspect.py`** | Read-only SQLite inspection. |
| **`create_user.py`** | Bootstrap a user (bcrypt; parity with `POST /api/v1/auth/login`). |

Details: **`backend/README.md`** · mapping **`legacy/LEGACY_TO_VL2_MAPPING.md`**.

For **one-off data fixes**, add a small script next to those (same env, async session pattern as `import_legacy_sqlite.py`), run against a backup first, and document the revision in the PR.

## Legacy monolith `scripts/` (reference only)

The old Flask dashboard’s **`scripts/`** (SQLite backfills, hierarchy SQL, Playwright/Chrome flows) are preserved verbatim under **`backend/legacy/myle_dashboard_main3/scripts/`** with an index in **`backend/legacy/myle_dashboard_main3/scripts/README.md`**. They are **not** runnable against vl2 without the monolith app and its schema.

## Legacy monolith `services/` (reference only)

The five monolith service modules (**`rule_engine`**, **`wallet_ledger`**, **`scoring_service`**, **`hierarchy_lead_sync`**, **`day2_certificate_pdf`**) are snapshotted under **`backend/legacy/myle_dashboard_main3/services/`** — see **`backend/legacy/myle_dashboard_main3/services/README.md`** and the mapping table in **`backend/legacy/myle_dashboard_main3/README.md`**.

## Legacy monolith `setup_vps.sh` (reference only)

**`backend/legacy/myle_dashboard_main3/setup_vps.sh`** — original **Flask + gunicorn `wsgi:application`** Hostinger/VPS bootstrap (clone **`Myle-Dashboard`**, nginx, systemd). vl2 uses **Docker + Render** (root **`render.yaml`**, **`Dockerfile`**) or your own container host; do not run the legacy script unchanged on **myle vl2**.

## Legacy monolith `static/` and `templates/` (reference only)

Verbatim **Bootstrap / PWA / JS/CSS** and **Jinja2** pages from the monolith live under **`backend/legacy/myle_dashboard_main3/static/`** and **`backend/legacy/myle_dashboard_main3/templates/`** (see each folder’s **`README.md`**). vl2 UI is the **Vite + React** app under **`frontend/`**.

## Legacy monolith training / tutorial docs (reference only)

- **`backend/legacy/myle_dashboard_main3/TRAINING_FIX_SUMMARY.md`** — training UI + DB notes from the Flask app.
- **`backend/legacy/myle_dashboard_main3/TUTORIAL_SETUP.md`** — external FFmpeg/Playwright tutorial generator setup (paths point at old “Team dashboard” layout).

See **`backend/legacy/myle_dashboard_main3/README.md`** for vl2 mapping.

## Legacy monolith `docs/` (reference only)

**`backend/legacy/myle_dashboard_main3/docs/`** — design, audits, pipeline notes, and live verification docs from **Myle-Dashboard-main-3** (index: **`docs/README.md`** there). vl2’s active documentation is the repo-root **`docs/`** folder (**FastAPI + Vite** stack).
