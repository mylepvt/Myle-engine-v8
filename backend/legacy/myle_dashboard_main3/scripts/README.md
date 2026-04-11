# Myle-Dashboard-main-3 — `scripts/` (reference snapshot)

Verbatim copy from the legacy monolith repo. These assume **Flask + SQLite** (`DATABASE_PATH`, `database.py`, `helpers.py`, etc.) and are **not** wired to vl2’s FastAPI + Postgres stack unless you port them.

| File | Purpose |
|------|---------|
| `verify_app_flow.py` | Flask `test_client`: `/watch/enrollment`, leader `/working`, temp SQLite DB. |
| `backfill_calls_made.py` | Recompute `daily_scores.calls_made` from `activity_log` (SQLite). |
| `seed_demo_users.py` | Idempotent demo users + optional pool leads / wallet (`werkzeug`, `migrate_db`). |
| `fix_user_hierarchy.sql` | One-shot SQL to normalize upline fields (admin root, team→leader). |
| `print_leader_teams.py` | Read-only: leaders + recursive downline (`helpers._get_network_usernames`). |
| `playwright_claim_flow.py` | Playwright: login → pool → claim (env `PLAYWRIGHT_*`). |
| `live_chrome_full_plan.py` | Headed Chrome E2E plan (seeds DB + admin/team flows). |
| `live_chrome_watch.py` | Smaller live Chrome watch / enrollment checks (see file header). |
| `prod_step1_claim_e2e.py` | Production-style claim E2E step (see file). |
| `chrome_full_claimed_at_realworld.py` | Chrome + real-world `claimed_at` scenario (see file). |

**vl2 direction:** API safety nets → `bash scripts/verify_phase7.sh` from repo root; DB migration → `backend/` Alembic + `backend/scripts/import_legacy_sqlite.py`; hierarchy / scoring parity would be new Postgres-aware scripts under `backend/scripts/` if product needs them.
