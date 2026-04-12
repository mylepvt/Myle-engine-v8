# Phase 5 — Training system

## Goal

Training flows per [`docs/blueprint/10_training.md`](../blueprint/10_training.md): day unlock by calendar (IST), sequence (no skipping), test score, certificate eligibility — backed by real models/APIs when promoting stubs.

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/10_training.md`](../blueprint/10_training.md)
- [`backend/app/api/v1/system.py`](../../backend/app/api/v1/system.py) (training-related routes)
- [`backend/app/core/time_ist.py`](../../backend/app/core/time_ist.py)
- [`frontend/src/config/dashboard-registry.ts`](../../frontend/src/config/dashboard-registry.ts) — `system/training` path
- Legacy: training routes under [`backend/legacy/myle_dashboard_main3/routes/`](../../backend/legacy/myle_dashboard_main3/routes/)

## Paste prompt

**Phase 5 — Training system.**

**Only modify Allowed paths.** Enforce day unlock and sequence; MCQ/test scoring; certificate rules per blueprint. Use IST for calendar boundaries. Do not bypass sequence or allow training_status hacks from client.

## Allowed paths

- `backend/app/api/v1/system.py` (or new `training.py` router + **registration in** `router.py` if product prefers split — both files then)
- `backend/app/api/v1/router.py` (include_router only if new module)
- Training-related `backend/app/models/*.py`, `schemas/*.py`
- `backend/alembic/versions/*.py` for new tables/columns
- `backend/tests/**/test_training*.py`
- `frontend/src/**` — **only if** this phase explicitly includes UI wiring; prefer backend-first

## Forbidden

- Changing lead FSM or pool rules here.
- Stub JSON that pretends training is complete without DB backing (parity lock: no fake “done” for legacy-implemented flows).

## Verify

```bash
cd backend && pytest
cd frontend && npm run lint && npm run test && npm run build
```

(Frontend commands only if FE paths were edited.)

## Lock

- [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) — `system/training` surface.
- [`docs/MYLE_VL2_CHECKLIST.md`](../MYLE_VL2_CHECKLIST.md) when training is truly “full” vs stub.
