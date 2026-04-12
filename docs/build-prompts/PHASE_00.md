# Phase 0 — Core contracts & schema inventory

## Goal

Audit vl2 **database models, enums, and pipeline constants** against [`docs/blueprint/02_database_schema.md`](../blueprint/02_database_schema.md) and [`docs/blueprint/04_lead_pipeline_constants.md`](../blueprint/04_lead_pipeline_constants.md). Produce a **gap list** (ordered follow-ups). Do **not** add business routes or wallet/lead logic unless a gap is proven and scoped to a follow-up PR.

## Preflight (read before editing)

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/02_database_schema.md`](../blueprint/02_database_schema.md), [`04_lead_pipeline_constants.md`](../blueprint/04_lead_pipeline_constants.md)
- [`backend/app/models/`](../../backend/app/models/) (all `*.py`)
- [`backend/app/core/lead_status.py`](../../backend/app/core/lead_status.py), [`pipeline_rules.py`](../../backend/app/core/pipeline_rules.py), [`legacy_status_bridge.py`](../../backend/app/core/legacy_status_bridge.py)
- [`backend/alembic/versions/`](../../backend/alembic/versions/) (recent migrations)
- Legacy reference (read-only): [`backend/legacy/myle_dashboard_main3/`](../../backend/legacy/myle_dashboard_main3/) — `database.py` / schema if present, `helpers` for constants

## Paste prompt

You are working on Myle vl2 (FastAPI + async SQLAlchemy). **Phase 0 — core contracts inventory.**

**Do not modify existing files unless explicitly listed below.** Follow [`docs/blueprint/04_lead_pipeline_constants.md`](../blueprint/04_lead_pipeline_constants.md) and legacy parity rules. No assumptions.

Tasks: (1) Compare blueprint schema to current models + migrations; list gaps with file/migration suggestions. (2) If this phase includes **approved** model/migration edits only, implement those and add tests.

## Allowed paths (edit only if implementing an approved gap in this PR)

- `backend/app/models/**/*.py`
- `backend/app/core/lead_status.py`, `pipeline_rules.py`, `legacy_status_bridge.py` — **constants alignment only** with parity doc / legacy evidence
- `backend/alembic/versions/*.py` (new revision only when schema change is in scope)
- `backend/tests/**/*.py` (tests for new constraints or enums)

## Forbidden

- New routers under `backend/app/api/v1/` except **health is already** on [`backend/main.py`](../../backend/main.py) — do not add duplicate health routes.
- Business logic for leads, wallet, or training in this phase unless explicitly pulled into a separate PR with its own phase prompt.
- Monolithic `backend/app/models.py` — keep package layout.

## Verify

```bash
cd backend && pytest
```

If migrations added: apply locally and confirm `GET /health/db` and `GET /health/migrations` per [`backend/main.py`](../../backend/main.py).

## Lock

- Record findings in [`docs/PHASE_0_SCHEMA_GAP_LIST.md`](../PHASE_0_SCHEMA_GAP_LIST.md) (or update that file’s ordered PR list).
- Update [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) if schema/constants affect claimed behavior (evidence row).
- Tick or add line in [`docs/MYLE_VL2_CHECKLIST.md`](../MYLE_VL2_CHECKLIST.md) if checklist item completed.
