# Phase 0 — Schema & contract audit (blueprint vs vl2)

**Sources:** [`docs/blueprint/02_database_schema.md`](blueprint/02_database_schema.md), [`04_lead_pipeline_constants.md`](blueprint/04_lead_pipeline_constants.md)  
**Compared to:** [`backend/app/models/`](../backend/app/models/), Alembic `backend/alembic/versions/`, [`backend/app/core/lead_status.py`](../backend/app/core/lead_status.py), [`pipeline_rules.py`](../backend/app/core/pipeline_rules.py)

This is an **ordered gap list** for follow-up PRs. It does not claim full legacy parity until rows exist in [`LEGACY_PARITY_MAPPING.md`](LEGACY_PARITY_MAPPING.md).

---

## Summary

| Area | vl2 state | Blueprint / legacy |
|------|-----------|----------------------|
| **Leads table width** | Narrow ORM model (~15 logical groups); pipeline uses slugs in API | Very wide SQLite schema (50+ columns): `pipeline_stage`, `referred_by`, batch flags, discipline, test tokens, stale worker, … |
| **Status vocabulary** | `Lead.status` uses **vl2 slugs** (`new_lead`, `contacted`, …) via `LEAD_STATUS_SET`; legacy strings bridged in [`legacy_status_bridge.py`](../backend/app/core/legacy_status_bridge.py) | Human-readable strings (`New Lead`, `Paid ₹196`, …) in [`pipeline_rules.STATUS_TO_STAGE`](../backend/app/core/pipeline_rules.py) |
| **Users** | `users`: `fbo_id`, `email`, `role`, `hashed_password`, `upline_user_id`, optional `username` | Blueprint: `username` UNIQUE NOT NULL, `status` pending/approved/rejected, phone, training flags, discipline, points, … |
| **Wallet** | `wallet_ledger_entries` with **`idempotency_key` UNIQUE** | Matches append-only intent |
| **Constraints** | Postgres migrations; dev tests use SQLite in-memory | Legacy CHECK on pool vs `assigned_user_id` — enforce in app/migration as vl2 evolves |

---

## Ordered follow-ups (PR-sized)

1. **P0-A — Users (auth parity)**  
   Add columns + migrations for: `account_status` (pending/approved/rejected), `phone` (unique where set), `training_required`, `training_status`, `access_blocked`, `discipline_status`, display fields as in blueprint — **only** when implementing [`03_roles_and_auth.md`](blueprint/03_roles_and_auth.md) flows.  
   *Refs:* [`PHASE_1_AUTH_GAP_MAP.md`](PHASE_1_AUTH_GAP_MAP.md)

2. **P0-B — Leads (pipeline parity)**  
   Extend `Lead` + migrations for missing business columns needed for workboard/pool/discipline: e.g. `pipeline_stage` (if not derived only in API), `referred_by`, batch `d1_*`/`d2_*`, `no_response_attempt_count`, `claimed_at`, pool pricing alignment (`pool_price_cents` vs legacy `pool_price` ₹).  
   Coordinate with **no** duplicate truth: either column or computed, not both unsynchronized.

3. **P0-C — Indexes**  
   Add partial/indexes from blueprint (`idx_leads_*`) when query plans justify — after profiling `GET /leads`, workboard, pool.

4. **P0-D — Tables not modeled in vl2 yet**  
   Blueprint lists: `daily_reports`, `training_progress`, `training_questions`, `targets`, `daily_scores`, `point_history`, `app_settings`, `password_reset_tokens`, `bonus_videos`, etc.  
   Track each as a **separate** migration + model PR when the corresponding **phase prompt** (5–7) is active.

5. **P0-E — Constants**  
   [`pipeline_rules.py`](../backend/app/core/pipeline_rules.py) already mirrors legacy `TEAM_*`, `STATUS_FLOW_ORDER`, `STATUS_TO_STAGE`. Any change requires parity matrix + evidence.

---

## Non-goals for Phase 0

- Rewriting vl2 to SQLite string timestamps — Postgres `timestamptz` is intentional.
- Creating monolithic `models.py` — forbidden by repo layout.

**Next step:** run Phase 1 prompt ([`build-prompts/PHASE_01.md`](build-prompts/PHASE_01.md)) when starting auth gap-fill.
