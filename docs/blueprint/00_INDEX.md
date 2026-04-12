# Myle Dashboard — Behavior Blueprint

> **Source of truth:** Old Flask Myle Dashboard — mirror under [`backend/legacy/myle_dashboard_main3/`](../../backend/legacy/myle_dashboard_main3/) (`routes/`, `helpers`, `services/`). Stack for vl2: FastAPI + React + Postgres; logic matches legacy where parity is claimed.
> Har file self-contained hai — kisi bhi AI/builder ko ek feature ka file deke wo us feature ko exact same rebuild kar sakta hai.

## How to Use

1. Pehle `01_stack_and_setup.md` + `02_database_schema.md` + `03_roles_and_auth.md` + `04_lead_pipeline_constants.md` pado — ye foundation hai, sab features inhe use karte hain.
2. Phir jo feature chahiye uska file uthao from **Feature files (in repo)** below (`05`–`11`).
3. Har file ke end me **Acceptance Checklist** hai — wo satisfy ho gaya to feature done hai.
4. **Controlled execution** (phased prompts + gates): [`../CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md) and [`../build-prompts/`](../build-prompts/).

## File Map

### Foundation (read first)

| File | Topic |
|------|-------|
| `01_stack_and_setup.md` | Tech stack, env vars, project layout |
| `02_database_schema.md` | All tables, columns, constraints |
| `03_roles_and_auth.md` | admin/leader/team, register, login, session |
| `04_lead_pipeline_constants.md` | Statuses, stages, FSM, call buckets, tracks |

### Feature files (in repo)

| File | Topic |
|------|-------|
| `05_leads_crud.md` | Create/read/update/delete leads, visibility |
| `06_workboard.md` | Working section — team/leader/admin views, batches |
| `07_lead_pool.md` | Shared pool, claim, price, wallet debit |
| `08_enrollment_video.md` | Enroll To share link, `/watch/<token>` public |
| `09_wallet.md` | Ledger, recharge request, admin approve |
| `10_training.md` | 7-day training, test, certificate |
| `11_daily_reports.md` | Submit report, admin view, system cross-check |

### Topics not yet split into `12_`–`20_` markdown files

These are covered by legacy code + parity docs until standalone blueprint files are added. **Do not** treat missing `12_*.md`–`20_*.md` as “no spec” — use these sources:

| Topic | Where to read |
|-------|----------------|
| Team management, approvals, org | [`backend/legacy/myle_dashboard_main3/routes/`](../../backend/legacy/myle_dashboard_main3/routes/) (team/members), [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) |
| Follow-ups | `routes` + follow-up helpers; API: `app/api/v1/follow_ups.py` |
| Scoring, leaderboard, badges | [`backend/app/services/scoring_service.py`](../../backend/app/services/scoring_service.py), legacy `services/` |
| Payment proof (₹196) | Legacy enrollment routes; vl2: team/enrollment surfaces in registry |
| Settings, announcements | [`docs/DASHBOARD_UX_AND_PARITY.md`](../DASHBOARD_UX_AND_PARITY.md), settings routes in legacy |
| Dashboards (home KPIs) | [`docs/DASHBOARD_UX_AND_PARITY.md`](../DASHBOARD_UX_AND_PARITY.md), `.cursor/rules/myle-frontend-dashboard.mdc` |
| Full API map | [`backend/app/api/v1/router.py`](../../backend/app/api/v1/router.py) + per-router modules; compare to legacy route table in legacy README |
| Discipline engine, auto-expire | [`backend/app/core/pipeline_rules.py`](../../backend/app/core/pipeline_rules.py), legacy `rule_engine` |
| Frontend pages | [`frontend/src/config/dashboard-registry.ts`](../../frontend/src/config/dashboard-registry.ts), [`dashboard-nav.ts`](../../frontend/src/config/dashboard-nav.ts) |

When adding `12_team_management.md` … `20_frontend_pages.md`, update this index with links to the new files.

## Key Principles (apply everywhere)

1. **Timezone:** All timestamps in IST (Asia/Kolkata = UTC+5:30). Use `datetime('now', '+5 hours', '+30 minutes')` in SQL, or IST-aware Python datetime (`app/core/time_ist.py` in vl2).
2. **Soft delete:** `deleted_at` — vl2 uses nullable timestamp where migrated; legacy used empty string. Follow [`02_database_schema.md`](02_database_schema.md) + migrations.
3. **Append-only ledger:** Wallet balance = `SUM(amount_cents)`. Never store balance column.
4. **Idempotency:** Wallet credits, status transitions, share-link syncing all use idempotency keys / one-shot flags.
5. **Role gates at API layer, not UI.** UI hides buttons but backend must re-check role.
6. **Lead ownership invariant:** Pool vs assignee rules in [`07_lead_pool.md`](07_lead_pool.md) + models — never leave a lead in an invalid state.
7. **Status ↔ stage sync:** Whenever `status` changes, `pipeline_stage` must update via `STATUS_TO_STAGE` map ([`04_lead_pipeline_constants.md`](04_lead_pipeline_constants.md)).
