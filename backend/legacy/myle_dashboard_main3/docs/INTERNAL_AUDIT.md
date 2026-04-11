# Myle Dashboard — Internal audit (engineering)

**Scope:** Flask app wiring, lead/pool writes, SSOT metrics, role gates, stabilization flags.  
**Audience:** Maintainers only. **Not** end-user documentation.  
**Rule:** Favor `get_db()` / `migrate_db()` / app routes — no ad-hoc production SQL (see system lock).

---

## 1) Single source of truth — today metrics

**Function:** `helpers.get_today_metrics(db, day_iso=..., user_ids=None, approved_only=False)`

**Definitions (IST calendar day on stored timestamps):**

| Metric    | Rule |
|-----------|------|
| `claimed` | `claimed_at` non-empty, `date(substr(trim(claimed_at),1,10)) = day_iso`, `in_pool=0`, `deleted_at=''` |
| `enrolled`| `status IN ('Paid ₹196','Mindset Lock')`, same date on `updated_at`, `in_pool=0`, `deleted_at=''` |
| `calls`   | Distinct lead IDs, same `updated_at` day, `LEAD_SQL_CALL_LOGGED` (valid call status) |

**Call sites (verified):**

- `app.py` — `admin_dashboard`: `approved_only=True` for command-center KPI override.
- `app.py` — `team_dashboard`: team card `user_ids=[user_id]`; leader downline block `user_ids=_dl_ids`.
- `routes/report_routes.py` — `leader_team_reports` live summary: `user_ids=member_ids`.

**Parity note:** `approved_only=True` and `user_ids=ALL approved team+leader ids` describe the **same assignee cohort** in normal DBs. The stabilization watch compares both only as a **sanity alert**, not as conflicting definitions.

---

## 2) Feature flags & instant rollback (`app_settings`)

| Key | Default | Effect |
|-----|---------|--------|
| `strict_flow_guard_enabled` | `1` | Forward no-skip guard on `edit_lead` + `update_status` (`helpers.is_valid_forward_status_transition`). Off: `0` / `false` / `off` / `no`. |
| `maintenance_mode` | `0` | `app.before_request`: blocks state-changing requests to claim, lead mutations, wallet recharge POST (see `app.py` `maintenance_mode_guard`). |

**Admin API (stabilization):**

- `GET /admin/stabilization/watch` — watchlist JSON + `metrics_snapshot` + flags.
- `POST /admin/stabilization/toggle` — body/form `key`, `value`; logs `stabilization_toggle`.

**Team claim limits (optional):**

- `team_max_claim_per_day` (default `999`)
- `team_claim_cooldown_minutes` (default `0`)

---

## 3) Lead module — route inventory (`routes/lead_routes.py`)

All below are registered via `register_lead_routes(app)` from `app.py`.

### 3.1 Read / list

| Route | Notes |
|-------|--------|
| `GET /leads` | List + tabs; team filtered `assigned_user_id=self`; leader broader active set. |
| `GET /leads/recycle-bin` | Soft-deleted. |
| `GET /leads/export` | Export (role-gated in handler). |
| `GET /leads/<id>/call-script` | JSON scripts. |
| `GET /leads/<id>/timeline` | Timeline JSON/HTML as implemented. |

### 3.2 Status & pipeline writes (high risk)

| Route | Method | Primary guard summary |
|-------|--------|------------------------|
| `/leads/<id>/edit` | POST | Access: admin any; team assignee + `current_owner` lock; leader assignee **or** downline via `network_user_ids_for_username`. Team `Paid ₹196` requires `payment_proof_path`. `_role_owns_status`, optional strict forward guard, `validate_lead_business_rules`. Team `Paid ₹196` POST may trigger `_team_handoff_to_leader`. |
| `/leads/<id>/status` | POST | Same family as edit for status: `_au_allowed` / team owner lock / leader downline; `TEAM_FORBIDDEN_STATUSES`; team proof for `Paid ₹196`; `_role_owns_status`; strict guard; `_team_handoff_to_leader` after team paid. |
| `/leads/<id>/ready-for-day1` | POST | Team blocked; enrolled check; `_transition_stage`. |
| `/leads/<id>/quick-advance` | POST | Owner-only (non-admin); maps next status; `_role_owns_status` + `validate_lead_business_rules`. |
| `/leads/<id>/stage-advance` | POST | Pipeline advance (validate in handler). |
| `/leads/bulk-action` | POST | Admin vs self scope; team bulk special cases (verify in handler). |
| `/leads/bulk-update` | POST | JSON bulk (validate per row). |

**External audit “quick-status-update”:** **No such route** in this repo — status changes go through `/leads/<id>/status` and `/edit`.

### 3.3 Batch / Day training UX

| Route | Access caveat |
|-------|----------------|
| `POST /leads/<lid>/set-batch` | **Non-admin:** `assigned_user_id == acting_user_id` **only**. Leader **cannot** set batch on a pure downline-assigned lead here (possible product gap vs `edit_lead` access). |
| `POST /leads/<id>/batch-toggle` | JSON batch marks + scoring (check handler for leader/downline). |

### 3.4 Contact / metadata

| `mark-called`, `call-result`, `call-status`, `follow-up-time`, `notes`, `payment-proof` | Per-handler `acting_user_id` / role checks; payment proof: non-admin must be assignee. |

### 3.5 Destructive

| `delete`, `restore`, `permanent-delete`, `restore-from-lost` | Role + scope checks in handler. |

---

## 4) Pool & wallet (`routes/wallet_routes.py`)

| Route | Risk notes |
|-------|------------|
| `POST /lead-pool/claim` | `BEGIN IMMEDIATE`; `UPDATE ... WHERE id=? AND in_pool=1` for race safety; team gates; optional cap/cooldown; post-claim wallet vs `SUM(pool_price)` warning log. |
| `POST /wallet/request-recharge` | Maintenance may block. |

**Atomicity note:** `maybe_auto_seed_claim_discipline_start` + `db.commit()` runs **before** claim transaction — settings persist even if claim rolls back (by design risk; documented).

---

## 5) Progression / tests

| Module | Notes |
|--------|--------|
| `routes/progression_routes.py` | `day2_test_submit`: **`total_q == 0` guarded** before `(score/total_q)*100`. |

---

## 6) Legacy / unwired (do not assume production path)

| Artifact | Status |
|----------|--------|
| `routes/dashboard_routes.py` | **`register_dashboard_routes` not called from `app.py`.** Live `/admin` + `/dashboard` live in `app.py`. Header comment is accurate; treat as legacy/unused for production behavior. |

---

## 7) Non-negotiables (ops)

- `claimed_at` must not be empty string — enforced via `database.migrate_db` + invariant check on boot.
- IST: wall-clock strings from `_now_ist()`; calendar filters use `sql_ts_calendar_day` for lead timestamps in SSOT.

---

## 8) Daily verification checklist (5 minutes)

1. **Deploy:** Render build green; no boot `CRITICAL` from `claimed_at` invariant.
2. **Admin `/admin`:** Stabilization Watch loads; flags show expected `S:ON/OFF M:ON/OFF`.
3. **SSOT:** `admin_ssot` vs `aggregate_ssot` in watch JSON both zero or both equal (either is fine; mismatch warrants investigation).
4. **Team:** Claim one test lead → today claimed increments; cannot set Day 1 from team on assigned lead after handoff.
5. **Leader:** Open downline lead `edit` → succeeds if downline assignee; try batch API on downline-only lead if product requires it → document outcome if blocked.

---

## 9) External audit mapping (short)

| External claim | This doc’s verdict |
|----------------|-------------------|
| `/quick-status-update` bypass | **N/A** — route absent; use §3.2. |
| `progression_routes` divide by zero | **Mitigated** — see §5. |
| `approved_only` vs `user_ids` mismatch | **Same cohort** in normal DB — §1. |
| Leader blocked on detail | **`edit_lead` allows downline**; **`set-batch` does not** — §3.3. |
| `add_lead` `_errv` in wrong `except` | **Not found** in current `add_lead` path — re-verify if another branch. |

---

*Last reviewed against repo mainline implementation. Update this file when adding routes or changing `get_today_metrics` semantics.*
