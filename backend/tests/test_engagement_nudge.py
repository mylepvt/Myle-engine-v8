"""Inactivity nudges: right message for the moment, and the caps that stop spam."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.models.xp_event import XpEvent
from app.services.engagement_nudge import (
    NUDGE_ACTION,
    NudgeContext,
    build_nudge_contexts,
    in_nudge_window,
    pick_nudge,
)

NOON = datetime(2026, 10, 3, 12, 0, tzinfo=IST)


def ctx(**kw) -> NudgeContext:
    base = dict(last_work_at=None, new_leads=3, followups_due=0, streak=0, calls_today=0)
    base.update(kw)
    return NudgeContext(**base)


def test_window():
    assert in_nudge_window(NOON)
    assert not in_nudge_window(NOON.replace(hour=9))
    assert not in_nudge_window(NOON.replace(hour=17))


def test_priority_and_copy():
    assert pick_nudge(ctx(rival_name="Priya", rival_gap_xp=10, streak=6), NOON) == (
        "overtaken",
        "You just got passed",
        "Priya just passed you on today's leaderboard. 2 calls puts you back ahead.",
    )
    assert pick_nudge(ctx(streak=6), NOON)[0] == "streak"
    assert pick_nudge(ctx(next_level="pro", xp_to_next_level=12), NOON)[2] == (
        "You're 12 XP away from Pro level. A few calls gets you there."
    )
    assert pick_nudge(ctx(), NOON)[:2] == ("leads", "3 new leads waiting")


def test_live_crowd_nudge():
    assert pick_nudge(ctx(live_online=5, live_names=["Rahul", "Priya"]), NOON) == (
        "live",
        "5 teammates are working right now",
        "Rahul, Priya and 3 others are on MYLE right now. Jump in and make your calls.",
    )
    assert pick_nudge(ctx(live_online=2, live_names=["Rahul", "Priya"]), NOON)[0] == "leads"  # too few
    # streak at risk still wins; a member with the app open gets nothing
    assert pick_nudge(ctx(streak=4, live_online=5, live_names=["Rahul"]), NOON)[0] == "streak"
    assert pick_nudge(ctx(online=True, live_online=5), NOON) is None


def test_quiet_when_working_or_nothing_to_do():
    assert pick_nudge(ctx(last_work_at=NOON - timedelta(minutes=30)), NOON) is None
    assert pick_nudge(ctx(new_leads=0, followups_due=0, streak=9), NOON) is None


def test_caps():
    two_sent = [("leads", NOON - timedelta(hours=4)), ("streak", NOON - timedelta(hours=3, minutes=10))]
    assert pick_nudge(ctx(sent_today=two_sent), NOON) is None  # max 2/day
    recent = [("leads", NOON - timedelta(hours=1))]
    assert pick_nudge(ctx(sent_today=recent), NOON) is None  # 3h gap
    # Same kind not repeated: leads already used → falls through to follow-ups.
    old = [("leads", NOON - timedelta(hours=4))]
    assert pick_nudge(ctx(followups_due=2, sent_today=old), NOON)[0] == "followups"


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def test_context_from_data(Session):
    now = datetime.now(timezone.utc)
    async with Session() as s:
        s.add_all([
            User(id=1, fbo_id="f1", email="a@t", role="team", name="Asha Rao", xp_total=90,
                 work_streak=5, work_streak_date=now.astimezone(IST).date()),
            User(id=2, fbo_id="f2", email="b@t", role="team", name="Bina Shah"),
        ])
        await s.flush()
        s.add(Lead(name="L", status="new_lead", created_by_user_id=1, owner_user_id=1,
                   assigned_to_user_id=1, in_pool=False, call_count=0))
        s.add_all([
            XpEvent(user_id=1, action="login_daily", xp=5, created_at=now),  # opening app ≠ work
            XpEvent(user_id=2, action="call_logged", xp=24, created_at=now),
            CallEvent(lead_id=1, user_id=2, outcome="answered", called_at=now - timedelta(minutes=20)),
            ActivityLog(user_id=1, action=NUDGE_ACTION, meta={"type": "leads"}, created_at=now - timedelta(hours=4)),
            UserPresenceSession(user_id=2, session_key="b-1", status="online",
                                last_heartbeat_at=now, last_seen_at=now),
        ])
        await s.commit()
        users = [await s.get(User, 1), await s.get(User, 2)]
        contexts = await build_nudge_contexts(s, users, now)

    asha = contexts[1]
    assert asha.last_work_at is None
    assert (asha.new_leads, asha.streak, asha.calls_today) == (1, 5, 0)
    assert (asha.rival_name, asha.rival_gap_xp) == ("Bina", 19)
    assert (asha.next_level, asha.xp_to_next_level) == ("agent", 10)
    assert [k for k, _ in asha.sent_today] == ["leads"]
    assert contexts[2].last_work_at is not None
    assert (asha.online, asha.live_online, asha.live_names) == (False, 1, ["Bina"])
    assert (contexts[2].online, contexts[2].live_online) == (True, 0)
