from __future__ import annotations

import asyncio

import pytest

from app.api.deps import AuthUser
from app.services import workboard_service
from app.services.workboard_service import WorkboardService


class _RepoStub:
    async def get_workboard_counts(self, *, condition):
        return {}

    async def get_workboard_leads(self, *, condition, limit: int):
        return []

    async def get_stale_leads(self, *, condition, stale_before, limit: int):
        return []

    async def count_leads(self, condition):
        return 0


def test_workboard_service_runs_completed_watch_maintenance(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[object] = []

    async def fake_maintenance(session) -> dict[str, int]:
        calls.append(session)
        return {"auto_archived": 0, "reassigned": 0, "skipped": 0}

    monkeypatch.setattr(workboard_service, "run_completed_watch_pipeline_maintenance", fake_maintenance)

    session = object()
    service = WorkboardService(repository=_RepoStub(), session=session)
    user = AuthUser(user_id=7, role="team", email="team@example.com")

    async def run() -> None:
        await service.get_leads(user=user, limit_per_column=10, max_rows=50)
        await service.get_summary(user=user, stale_hours=24, use_cache=False)
        await service.get_stale(user=user, stale_hours=24, limit=10)

    asyncio.run(run())

    assert calls == [session, session, session]
