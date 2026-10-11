"""15+ club alert: once someone crosses 15 calls, everyone still under 15 hears about it (once a day)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.services.star_alert import (
    STAR_ALERT_ACTION,
    in_star_alert_window,
    run_star_alert,
    star_alert_message,
)

PRIYA, RAHUL, AMAN, NEHA = 1, 2, 3, 4


def test_copy():
    assert star_alert_message(["Priya"], 6) == (
        "🔥 Priya just crossed 15 calls today",
        "How many have you made? You're on 6 — 9 more to join the 15+ club.",
    )
    assert star_alert_message(["Priya", "Rahul", "Aman"], 0) == (
        "🔥 Priya and 2 others crossed 15 calls today",
        "How many have you made? Start now and join the 15+ club.",
    )
    assert star_alert_message(["Priya", "Rahul"], 3)[0] == "🔥 Priya and 1 other crossed 15 calls today"


def test_window():
    day = datetime(2026, 10, 5, tzinfo=IST)
    assert not in_star_alert_window(day.replace(hour=9, minute=59))
    assert in_star_alert_window(day.replace(hour=10))
    assert in_star_alert_window(day.replace(hour=19, minute=45))
    assert not in_star_alert_window(day.replace(hour=20))


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def _seed(s: AsyncSession, now: datetime) -> list[User]:
    users = [
        User(id=PRIYA, fbo_id="f1", email="p@t", role="team", name="Priya Sharma"),
        User(id=RAHUL, fbo_id="f2", email="r@t", role="team", name="Rahul Verma"),
        User(id=AMAN, fbo_id="f3", email="a@t", role="leader", name="Aman"),
        User(id=NEHA, fbo_id="f4", email="n@t", role="team", name="Neha"),
    ]
    s.add_all(users)
    await s.flush()
    s.add(Lead(id=1, name="L", status="new_lead", created_by_user_id=PRIYA, owner_user_id=PRIYA,
               assigned_to_user_id=PRIYA, in_pool=False, call_count=0, created_at=now - timedelta(days=1)))
    await s.flush()
    for i in range(15):  # Priya crosses 15
        s.add(CallEvent(lead_id=1, user_id=PRIYA, outcome="answered", called_at=now - timedelta(minutes=30 - i)))
    for i in range(6):  # Rahul is on 6
        s.add(CallEvent(lead_id=1, user_id=RAHUL, outcome="answered", called_at=now - timedelta(minutes=40 - i)))
    await s.commit()
    return users


async def test_alerts_everyone_under_15_once_a_day(Session):
    now = datetime.now(IST).replace(hour=13, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    sent: list[tuple[int, str, str]] = []

    async def send(_s, user, title, body):
        sent.append((user.id, title, body))
        return True

    async with Session() as s:
        users = await _seed(s, now)
        targeted, n = await run_star_alert(s, users, now, send)
        await s.commit()
        # Second run the same day (another member crosses too) → nobody is pushed again.
        for i in range(15):
            s.add(CallEvent(lead_id=1, user_id=NEHA, outcome="answered", called_at=now - timedelta(minutes=10 - i * 0.5)))
        await s.commit()
        again = await run_star_alert(s, users, now + timedelta(minutes=15), send)
        logged = (await s.execute(select(ActivityLog.user_id).where(ActivityLog.action == STAR_ALERT_ACTION))).scalars().all()

    assert (targeted, n) == (3, 3)  # Rahul, Aman, Neha — not Priya herself
    by_user = {uid: (title, body) for uid, title, body in sent}
    assert set(by_user) == {RAHUL, AMAN, NEHA}
    assert by_user[RAHUL] == (
        "🔥 Priya just crossed 15 calls today",
        "How many have you made? You're on 6 — 9 more to join the 15+ club.",
    )
    assert by_user[AMAN][1] == "How many have you made? Start now and join the 15+ club."
    assert again == (0, 0)
    assert sorted(logged) == [RAHUL, AMAN, NEHA]


async def test_quiet_until_someone_crosses(Session):
    now = datetime.now(IST).replace(hour=13, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    async def send(*_a):
        raise AssertionError("no push expected")

    async with Session() as s:
        s.add(User(id=RAHUL, fbo_id="f2", email="r@t", role="team", name="Rahul"))
        await s.commit()
        users = [await s.get(User, RAHUL)]
        assert await run_star_alert(s, users, now, send) == (0, 0)


async def test_failed_push_is_retried_next_run(Session):
    now = datetime.now(IST).replace(hour=13, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    attempts: list[int] = []

    async def send(_s, user, _t, _b):
        attempts.append(user.id)
        return False  # no push subscription

    async with Session() as s:
        users = await _seed(s, now)
        assert await run_star_alert(s, users, now, send) == (3, 0)
        await s.commit()
        assert await run_star_alert(s, users, now, send) == (3, 0)
