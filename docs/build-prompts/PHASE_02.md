# Phase 2 — Lead engine (FSM)

## Goal

Ensure **all lead status / `call_status` / pipeline updates** go through validated FSM and role rules per [`docs/blueprint/04_lead_pipeline_constants.md`](../blueprint/04_lead_pipeline_constants.md) and [`05_leads_crud.md`](../blueprint/05_leads_crud.md). Team vs leader/admin permissions; status ↔ `pipeline_stage` sync; soft delete / restore rules.

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/04_lead_pipeline_constants.md`](../blueprint/04_lead_pipeline_constants.md), [`05_leads_crud.md`](../blueprint/05_leads_crud.md)
- [`backend/app/api/v1/leads.py`](../../backend/app/api/v1/leads.py)
- [`backend/app/core/pipeline_rules.py`](../../backend/app/core/pipeline_rules.py), [`lead_status.py`](../../backend/app/core/lead_status.py), [`legacy_status_bridge.py`](../../backend/app/core/legacy_status_bridge.py)
- [`backend/app/services/lead_scope.py`](../../backend/app/services/lead_scope.py), [`lead_access.py`](../../backend/app/services/lead_access.py), [`rule_engine.py`](../../backend/app/services/rule_engine.py)
- [`backend/app/models/lead.py`](../../backend/app/models/lead.py), [`backend/app/schemas/leads.py`](../../backend/app/schemas/leads.py)
- Legacy: [`backend/legacy/myle_dashboard_main3/`](../../backend/legacy/myle_dashboard_main3/) — lead routes + `rule_engine` / pipeline helpers

## Paste prompt

**Phase 2 — Lead engine with strict FSM.**

**Modify only Allowed paths.** Reject invalid transitions; enforce team vs leader/admin status permissions; keep `status` and pipeline stage in sync; soft delete and admin restore per blueprint. No pool or wallet logic in this phase unless unavoidable (then cite and split PR).

## Allowed paths

- `backend/app/api/v1/leads.py`
- `backend/app/core/pipeline_rules.py`, `lead_status.py`, `legacy_status_bridge.py`, `row_utils.py` (if needed for mapping)
- `backend/app/services/lead_scope.py`, `lead_access.py`, `rule_engine.py`, `hierarchy_lead_sync.py` (as needed)
- `backend/app/models/lead.py`, `schemas/leads.py`
- `backend/alembic/versions/*.py` (only if lead columns required)
- `backend/tests/**/test_leads*.py`, `test_pipeline*.py`, or new tests under `backend/tests/`

## Forbidden

- Implementing workboard **grouping** UI logic here — API only; workboard is Phase 3.
- Pool claim / wallet debit — Phase 4.
- Frontend/React files unless a separate explicitly scoped FE phase.

## Verify

```bash
cd backend && pytest
```

Add or extend tests for: invalid transition rejected; team blocked from restricted statuses; admin restore; race/idempotency if applicable.

## Lock

- [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) rows for lead update behavior.
- No parity claim without legacy evidence row.
