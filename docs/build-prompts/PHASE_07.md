# Phase 7 — Admin + intelligence

## Goal

Promote **admin-only** and **feature-flagged** surfaces: approvals dashboards, at-risk / stale leads, org insights, leaderboard/settings stubs — **without** rewriting core FSM, wallet, or lead schema. Respect `GET /api/v1/meta` → `features.intelligence` (and related flags).

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) — stub vs full inventory
- [`docs/PARITY_ROLLOUT_PLAN.md`](../PARITY_ROLLOUT_PLAN.md) — Wave B/C/D
- [`backend/app/api/v1/execution.py`](../../backend/app/api/v1/execution.py), [`meta.py`](../../backend/app/api/v1/meta.py)
- [`backend/app/api/v1/settings_pages.py`](../../backend/app/api/v1/settings_pages.py), [`other_pages.py`](../../backend/app/api/v1/other_pages.py), [`finance_surfaces.py`](../../backend/app/api/v1/finance_surfaces.py)
- [`backend/app/services/execution_enforcement.py`](../../backend/app/services/execution_enforcement.py), [`shell_insights.py`](../../backend/app/services/shell_insights.py)
- [`frontend/src/config/dashboard-registry.ts`](../../frontend/src/config/dashboard-registry.ts) — Intelligence + stub paths
- Legacy: admin / intelligence routes if any

## Paste prompt

**Phase 7 — Admin tools + intelligence (read-heavy, low coupling).**

**Only modify Allowed paths.** Add insights, lists, and dashboards per parity doc. Do **not** change core lead update or wallet transaction semantics here — call existing services. Gate intelligence UI on `features.intelligence` from meta.

## Allowed paths

- `backend/app/api/v1/execution.py`, `meta.py`, `settings_pages.py`, `other_pages.py`, `finance_surfaces.py`, `team.py` (admin-only extensions only)
- `backend/app/services/execution_enforcement.py`, `shell_insights.py`, `gate_assistant.py` (as needed)
- `backend/app/schemas/*.py` for new response shapes
- `backend/tests/**/test_execution*.py`, `test_meta*.py`
- `frontend/src/**` — **only** when wiring admin/intelligence pages; keep registry as single source of truth

## Forbidden

- “Shortcut” edits to `pipeline_rules.py` or `leads.py` to fake intelligence — use real queries or documented stubs.
- Enabling third-party AI or webhooks — product meta is JSON bootstrap only ([`myle-backend-api.mdc`](../../.cursor/rules/myle-backend-api.mdc)).

## Verify

```bash
cd backend && pytest
cd frontend && npm run lint && npm run test && npm run build
```

(Feature FE only if touched.)

## Lock

- Each promoted route: row in [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) with evidence or `stub` until verified.
- Intelligence nav remains behind feature flag until product enables `FEATURE_INTELLIGENCE`.
