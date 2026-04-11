# Myle-Dashboard-main-3 (reference)

- `auth_context.py` — Flask session helpers (`acting_user_id`, `refresh_session_user`).  
  **vl2 equivalent:** `app/core/auth_context.py` + `POST /api/v1/auth/sync-identity` + JWT cookies (`app/core/auth_cookies.py`).

- `helpers.py` — Shared constants and pure helpers from the old monolith (IST timezone, pipeline/status rules, discipline/metrics SQL, lead enrichment, admin decision helpers, etc.). Imports `services.*` from that repo; **not runnable** from this tree — read next to the original app for context.  
  **vl2 port (stateless surface):** `app/core/pipeline_rules.py` (ex-`services/rule_engine`), `app/core/pipeline_legacy.py` (constants + team/₹196/call-tag helpers), `app/core/time_ist.py`, `app/core/row_utils.py`, `app/core/legacy_status_bridge.py`, facade `app/core/legacy_helpers.py`. DB-heavy metrics/discipline from `helpers.py` are **not** ported — add under `app/services/` when product needs them.
