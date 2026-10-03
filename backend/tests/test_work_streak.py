"""Work streak: grows only on days the call target is met; milestones pay bonus XP."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import today_ist
from app.db.base import Base
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent
from app.services import work_streak
from app.services.work_streak import bump_work_streak_after_call, current_work_streak

UID = 7901


@pytest.fixture
async def Session(monkeypatch):
    async def target(_session):
        return 2

    monkeypatch.setattr(work_streak, "get_daily_call_target", target)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with S() as s:
        s.add(User(id=UID, fbo_id="f7901", email="s@t", role="team", name="Sam"))
        await s.commit()
    yield S
    await engine.dispose()


async def _call(s, n: int) -> None:
    now = datetime.now(timezone.utc)
    for i in range(n):
        lead = Lead(name=f"L{i}", status="new_lead", created_by_user_id=UID, owner_user_id=UID,
                    assigned_to_user_id=UID, in_pool=False, created_at=now)
        s.add(lead)
        await s.flush()
        s.add(CallEvent(lead_id=lead.id, user_id=UID, outcome="answered", called_at=now))
    await s.flush()


async def test_streak_moves_only_when_target_is_hit(Session):
    async with Session() as s:
        user = await s.get(User, UID)
        await _call(s, 1)
        assert await bump_work_streak_after_call(s, user) is None  # 1/2 calls
        await _call(s, 1)
        assert await bump_work_streak_after_call(s, user) == 1  # target hit
        assert await bump_work_streak_after_call(s, user) is None  # once per day


async def test_continues_from_yesterday_and_breaks_after_a_gap(Session):
    async with Session() as s:
        user = await s.get(User, UID)
        user.work_streak, user.work_streak_date = 2, today_ist() - timedelta(days=1)
        await _call(s, 2)
        assert await bump_work_streak_after_call(s, user) == 3
        assert user.work_streak_best == 3
        bonus = (await s.execute(select(XpEvent).where(XpEvent.action == "streak_3"))).scalar_one()
        assert bonus.xp == 20

        user.work_streak_date = today_ist() - timedelta(days=2)
        assert current_work_streak(user) == 0  # missed a day → broken


async def test_xp_me_exposes_streak_progress(Session):
    from httpx import ASGITransport, AsyncClient

    from app.api.deps import AuthUser, get_db, require_auth_user
    from main import app

    async def _get_db():
        async with Session() as s:
            yield s

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: AuthUser(user_id=UID, role="team", email="s@t")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            body = (await client.get("/api/v1/xp/me")).json()
    finally:
        app.dependency_overrides = saved
    for key in ("streak", "streak_done_today", "best_streak", "calls_today", "call_target"):
        assert key in body
