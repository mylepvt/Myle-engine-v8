"""Engagement loop: morning plan / evening recap copy + data, today/week XP leaderboard."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import today_ist
from app.db.base import Base
from app.models.call_event import CallEvent
from app.models.daily_report import DailyReport
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent
from app.services.engagement_digest import (
    EveningRecap,
    MorningPlan,
    build_evening_recaps,
    build_morning_plans,
    evening_recap_message,
    morning_plan_message,
)

ASHA, BINA, ADMIN = 7801, 7802, 7800


def test_morning_copy():
    assert morning_plan_message(MorningPlan(new_leads=12, followups_due=1, streak=6)) == (
        "Your plan for today",
        "12 new leads to call · 1 follow-up due. You're on a 6-day streak — keep it going.",
    )
    assert morning_plan_message(MorningPlan(new_leads=0, followups_due=0, streak=0)) is None


def test_evening_copy():
    title, body = evening_recap_message(
        EveningRecap(calls_today=32, calls_yesterday=24, xp_today=180, rank_today=3,
                     ranked_total=40, report_submitted=False)
    )
    assert title == "Your day so far"
    assert body == ("32 calls today, 8 more than yesterday. You earned 180 XP — #3 of 40 today. "
                    "Submit your daily report before midnight.")
    title, _ = evening_recap_message(
        EveningRecap(calls_today=0, calls_yesterday=5, xp_today=0, rank_today=None,
                     ranked_total=0, report_submitted=True)
    )
    assert title == "Great work today"


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="f07800", email="a@t.myle", role="admin", name="Admin"),
            User(id=ASHA, fbo_id="f07801", email="asha@t.myle", role="team", name="Asha", login_streak=4),
            User(id=BINA, fbo_id="f07802", email="bina@t.myle", role="team", name="Bina"),
        ])
        await s.flush()
        fresh = Lead(name="Fresh", status="new_lead", created_by_user_id=ASHA, owner_user_id=ASHA,
                     assigned_to_user_id=ASHA, in_pool=False, call_count=0)
        called = Lead(name="Called", status="contacted", created_by_user_id=ASHA, owner_user_id=ASHA,
                      assigned_to_user_id=ASHA, in_pool=False, call_count=2)
        s.add_all([fresh, called])
        await s.flush()
        s.add(FollowUp(lead_id=called.id, note="Call back", due_at=now - timedelta(hours=1), created_by_user_id=ASHA))
        s.add_all([
            CallEvent(lead_id=called.id, user_id=ASHA, outcome="answered", called_at=now),
            CallEvent(lead_id=fresh.id, user_id=ASHA, outcome="no_answer", called_at=now),
            XpEvent(user_id=ASHA, action="call_logged", xp=16, created_at=now),
            XpEvent(user_id=BINA, action="report_submitted", xp=25, created_at=now),
            XpEvent(user_id=BINA, action="call_logged", xp=8, created_at=now - timedelta(days=10)),
        ])
        s.add(DailyReport(user_id=BINA, report_date=today_ist(), total_calling=0))
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: AuthUser(user_id=ASHA, role="team", email="asha@t.myle")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session
    app.dependency_overrides = saved
    await engine.dispose()


async def test_digest_data(ctx):
    _client, Session = ctx
    async with Session() as s:
        users = [await s.get(User, ASHA), await s.get(User, BINA)]
        plans = await build_morning_plans(s, users, today_ist())
        recaps = await build_evening_recaps(s, users, today_ist())
    assert plans[ASHA] == MorningPlan(new_leads=1, followups_due=1, streak=4)
    assert recaps[ASHA].calls_today == 2 and recaps[ASHA].report_submitted is False
    assert (recaps[BINA].rank_today, recaps[ASHA].rank_today, recaps[ASHA].ranked_total) == (1, 2, 2)
    assert recaps[BINA].report_submitted is True


async def test_today_leaderboard_counts_only_todays_xp(ctx):
    client, _Session = ctx
    body = (await client.get("/api/v1/xp/leaderboard/period", params={"period": "today"})).json()
    assert [(r["name"], r["xp"]) for r in body["items"]] == [("Bina", 25), ("Asha", 16)]
    assert body["me"]["rank"] == 2
    assert (await client.get("/api/v1/xp/leaderboard/period", params={"period": "year"})).status_code == 422
