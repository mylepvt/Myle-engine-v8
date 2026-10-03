"""Leader control room: live status per member, scoped to the downline, nudge cooldown."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.services import control_room, push_service
from app.services.control_room import NudgeError, build_control_room, member_status, send_leader_nudge

LEADER, IDLE, BUSY, DONE, NEW, OTHER_LEADER, STRANGER = 9100, 9101, 9102, 9103, 9104, 9200, 9201
# Mid-afternoon IST today, so "3h ago" never crosses midnight.
NOW = datetime.now(IST).replace(hour=15, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


@pytest.fixture
async def Session(monkeypatch):
    pushes: list[tuple[int, str, str]] = []

    async def fake_push(_s, user_id, *, title, body, url="/dashboard"):
        pushes.append((user_id, title, body))
        return 1

    async def target(_s):
        return 3

    monkeypatch.setattr(push_service, "send_push_to_user", fake_push)
    monkeypatch.setattr(control_room, "get_daily_call_target", target)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    def u(uid, role, upline, name):
        return User(id=uid, fbo_id=f"f{uid}", email=f"{uid}@t", role=role, name=name, upline_user_id=upline)

    async with S() as s:
        s.add_all([
            u(LEADER, "leader", None, "Neha Kapoor"), u(IDLE, "team", LEADER, "Idle"), u(BUSY, "team", LEADER, "Busy"),
            u(DONE, "team", LEADER, "Done"), u(NEW, "team", LEADER, "New"),
            u(OTHER_LEADER, "leader", None, "Other"), u(STRANGER, "team", OTHER_LEADER, "Stranger"),
        ])
        await s.flush()
        for uid, n, ago in ((IDLE, 1, timedelta(hours=3)), (BUSY, 1, timedelta(minutes=10)), (DONE, 3, timedelta(hours=4))):
            for i in range(n):
                lead = Lead(name=f"L{uid}{i}", status="new_lead", created_by_user_id=uid, owner_user_id=uid,
                            assigned_to_user_id=uid, in_pool=False, created_at=NOW)
                s.add(lead)
                await s.flush()
                s.add(CallEvent(lead_id=lead.id, user_id=uid, outcome="answered", called_at=NOW - ago))
        await s.commit()
    S.pushes = pushes
    yield S
    await engine.dispose()


def test_member_status_rules():
    assert member_status(calls_today=0, target=3, last_work_at=None, now=NOW) == "not_started"
    assert member_status(calls_today=1, target=3, last_work_at=NOW - timedelta(hours=2), now=NOW) == "idle"
    assert member_status(calls_today=1, target=3, last_work_at=NOW - timedelta(minutes=5), now=NOW) == "working"
    assert member_status(calls_today=3, target=3, last_work_at=NOW - timedelta(hours=5), now=NOW) == "done"


async def test_leader_sees_own_team_worst_first(Session):
    async with Session() as s:
        room = await build_control_room(s, viewer_id=LEADER, viewer_role="leader", now=NOW)
    assert [(m["user_id"], m["status"]) for m in room["members"]] == [
        (NEW, "not_started"), (IDLE, "idle"), (BUSY, "working"), (DONE, "done"),
    ]
    assert room["counts"] == {"not_started": 1, "idle": 1, "working": 1, "done": 1}
    assert room["call_target"] == 3


async def test_admin_sees_everyone(Session):
    async with Session() as s:
        room = await build_control_room(s, viewer_id=1, viewer_role="admin", now=NOW)
    assert {m["user_id"] for m in room["members"]} >= {IDLE, STRANGER, OTHER_LEADER}


async def test_nudge_pushes_once_then_cools_down(Session):
    async with Session() as s:
        r = await send_leader_nudge(s, sender_id=LEADER, sender_role="leader", member_id=IDLE, now=NOW)
        assert r["delivered"] is True
        assert Session.pushes == [(IDLE, "Neha is checking in",
                                   "You're at 1/3 calls. 2 more to hit today's target. Pick up where you left off.")]
        with pytest.raises(NudgeError) as e:
            await send_leader_nudge(s, sender_id=1, sender_role="admin", member_id=IDLE, now=NOW + timedelta(minutes=5))
        assert e.value.status_code == 429
        room = await build_control_room(s, viewer_id=LEADER, viewer_role="leader", now=NOW)
        idle = next(m for m in room["members"] if m["user_id"] == IDLE)
        assert idle["nudge_available_at"] is not None
        # cooldown over → allowed again
        await send_leader_nudge(s, sender_id=LEADER, sender_role="leader", member_id=IDLE, now=NOW + timedelta(hours=2))
        assert len(Session.pushes) == 2


async def test_nudge_guards(Session):
    async with Session() as s:
        for sender, role, member, code in ((LEADER, "leader", STRANGER, 403), (IDLE, "team", BUSY, 403)):
            with pytest.raises(NudgeError) as e:
                await send_leader_nudge(s, sender_id=sender, sender_role=role, member_id=member, now=NOW)
            assert e.value.status_code == code
        await send_leader_nudge(s, sender_id=LEADER, sender_role="leader", member_id=NEW, now=NOW)
    assert Session.pushes[-1][2].startswith("No calls yet today.")
