# Phase 6 — Reports + scoring

## Goal

Daily reports submission, admin views, system vs user counts, **points** and deduplication: one report per day per user (or defined upsert), no double-scoring per [`docs/blueprint/11_daily_reports.md`](../blueprint/11_daily_reports.md). Cross-check with [`backend/app/services/scoring_service.py`](../../backend/app/services/scoring_service.py) patterns.

## Preflight

- [`docs/CONTROLLED_BUILD_PIPELINE.md`](../CONTROLLED_BUILD_PIPELINE.md)
- [`docs/blueprint/11_daily_reports.md`](../blueprint/11_daily_reports.md)
- [`backend/app/services/scoring_service.py`](../../backend/app/services/scoring_service.py)
- [`backend/app/services/team_reports_metrics.py`](../../backend/app/services/team_reports_metrics.py) if present
- [`backend/app/api/v1/team.py`](../../backend/app/api/v1/team.py), [`finance_surfaces.py`](../../backend/app/api/v1/finance_surfaces.py), [`other_pages.py`](../../backend/app/api/v1/other_pages.py) — stubs to promote
- Legacy: reports routes + scoring in monolith

## Paste prompt

**Phase 6 — Reports + scoring.**

**Only modify Allowed paths.** Auto-calculate system metrics where spec’d; compare to user input; assign points once per rule; handle resubmit safely. Do not trust client numbers for authoritative totals.

## Allowed paths

- New or existing routers under `backend/app/api/v1/` (e.g. extend `team.py`, add `reports.py` + `router.py` include) — **list exact files in PR**
- `backend/app/services/scoring_service.py`, `team_reports_metrics.py`, related services
- `backend/app/models/*.py` for `daily_reports`, `daily_scores`, etc. + migrations
- `backend/app/schemas/*.py` for report DTOs
- `backend/tests/**/test_reports*.py`, `test_scoring*.py`

## Forbidden

- Rewriting wallet ledger (Phase 4) unless fixing a reports↔wallet boundary bug — isolate in commit.
- Changing lead FSM (Phase 2).

## Verify

```bash
cd backend && pytest
```

## Lock

- [`docs/LEGACY_PARITY_MAPPING.md`](../LEGACY_PARITY_MAPPING.md) for `team/reports`, daily report stubs, leaderboard if promoted.
- [`docs/PARITY_ROLLOUT_PLAN.md`](../PARITY_ROLLOUT_PLAN.md) wave B/C alignment.
