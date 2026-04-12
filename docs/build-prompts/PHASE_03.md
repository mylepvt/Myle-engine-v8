# Phase 3 — Workboard engine

## Goal

**Read-only aggregation** for working views: leads grouped by stage/status for the authenticated user’s scope; counts + capped lists; pagination. Match [`docs/blueprint/06_workboard.md`](../blueprint/06_workboard.md). No schema changes unless the blueprint requires new fields **and** Phase 0/2 already aligned.

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/06_workboard.md`](../blueprint/06_workboard.md)
- [`backend/app/api/v1/workboard.py`](../../backend/app/api/v1/workboard.py)
- [`backend/app/services/lead_scope.py`](../../backend/app/services/lead_scope.py)
- [`backend/app/schemas/workboard.py`](../../backend/app/schemas/workboard.py)
- Same lead visibility rules as [`backend/app/api/v1/leads.py`](../../backend/app/api/v1/leads.py)
- Legacy: workboard / working section routes under legacy `routes/`

## Paste prompt

**Phase 3 — Workboard aggregation layer.**

**Only modify Allowed paths.** Return structured JSON for UI: groups by stage, pending calls / videos / follow-ups counts as spec’d in blueprint — using same visibility as `GET /leads`. Optimize queries (avoid unnecessary heavy joins); require pagination params where large datasets apply.

## Allowed paths

- `backend/app/api/v1/workboard.py`
- `backend/app/schemas/workboard.py`
- `backend/app/services/lead_scope.py` (shared helpers only — do not break leads API)
- `backend/tests/**/test_workboard*.py` or new tests under `backend/tests/`

## Forbidden

- Duplicating FSM transition logic — delegate to services/rules used by leads API.
- Changing `Lead` model for workboard convenience unless approved in Phase 0 gap list.
- Building React pages in this phase (FE uses API only).

## Verify

```bash
cd backend && pytest
```

Optional: `curl` / OpenAPI `GET /api/v1/workboard` with auth cookies for each role.

## Lock

- [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) for `work/workboard` surface if claiming parity.
- Frontend registry already points to Workboard page — no marketing drift on copy ([`frontend/src/config/dashboard-registry.ts`](../../frontend/src/config/dashboard-registry.ts)).
