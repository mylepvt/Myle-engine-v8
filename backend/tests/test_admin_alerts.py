"""Live admin alerts: captured from every lead save, pushed to admins (never to the actor)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.db.base import Base
from app.models.lead import Lead
from app.models.user import User
from app.services import admin_alerts, push_service, team_tracking
from app.services.admin_alerts import AlertEvent, alert_text, dispatch, set_disabled_kinds
from app.services.observation_logger import set_request_context

ADMIN1, ADMIN2, MEMBER = 9401, 9402, 9411


@pytest.fixture
async def ctx(monkeypatch):
    captured: list[AlertEvent] = []
    pushes: list[tuple[int, str, str]] = []
    monkeypatch.setattr(admin_alerts, "schedule", lambda evs: captured.extend(evs))

    async def fake_push(_s, user_id, *, title, body, url="/dashboard"):
        pushes.append((user_id, title, body))
        return 1

    monkeypatch.setattr(push_service, "send_push_to_user", fake_push)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with S() as s:
        s.add_all([
            User(id=ADMIN1, fbo_id="a1", email="a1@t", role="admin", name="Karan"),
            User(id=ADMIN2, fbo_id="a2", email="a2@t", role="admin", name="Second"),
            User(id=MEMBER, fbo_id="m1", email="m1@t", role="team", name="Priya Sharma"),
        ])
        await s.commit()
    captured.clear()
    yield S, captured, pushes
    set_request_context(user_id="", actor_name="")
    await engine.dispose()


def _lead(**kw) -> Lead:
    kw.setdefault("status", "new_lead")
    return Lead(name="Rohit", created_by_user_id=MEMBER, owner_user_id=MEMBER,
                assigned_to_user_id=MEMBER, in_pool=False, **kw)


async def test_member_actions_become_events(ctx):
    S, captured, _ = ctx
    set_request_context(user_id=str(MEMBER), actor_name="Priya Sharma")
    async with S() as s:
        lead = _lead()
        s.add(lead)
        await s.commit()
        lead.status = "video_watched"
        await s.commit()
        lead.status = "day1"
        lead.enrollment_amount_cents = 19600
        lead.enrollment_proof_uploaded_at = datetime.now(timezone.utc)
        await s.commit()
        lead.name = "Rohit K"  # no stage change → no alert
        await s.commit()
    assert [(e.kind, e.old_status, e.new_status) for e in captured] == [
        ("lead_added", "", "new_lead"),
        ("status", "new_lead", "video_watched"),
        ("enrollment", "", "day1"),  # the Day 1 move is folded into the enrollment alert
    ]
    assert captured[2].amount_cents == 19600
    assert all(e.owner_id == MEMBER for e in captured)  # routes to Priya's team leaders


async def test_background_jobs_and_pool_imports_are_ignored(ctx):
    S, captured, _ = ctx
    set_request_context(user_id="", actor_name="")
    async with S() as s:
        lead = _lead()
        s.add(lead)
        await s.commit()
        lead.status = "lost"
        await s.commit()
    set_request_context(user_id=str(MEMBER), actor_name="Priya")
    async with S() as s:
        pool = _lead()
        pool.in_pool = True  # admin pool import, not live work
        s.add(pool)
        await s.commit()
        failed = _lead()
        s.add(failed)
        await s.flush()
        await s.rollback()  # never committed → no alert
    assert captured == []


async def test_dispatch_skips_the_actor_and_switched_off_kinds(ctx):
    S, _, pushes = ctx
    async with S() as s:
        ev = AlertEvent(kind="status", actor_id=ADMIN1, actor_name="Karan", lead_id=5, lead_name="Rohit",
                        old_status="day1", new_status="day2")
        assert await dispatch(s, [ev]) == 1
        assert pushes == [(ADMIN2, "Rohit → Day 2", "Karan moved Rohit from Day 1")]
        await set_disabled_kinds(s, {"status"})
        assert await dispatch(s, [ev]) == 0


def test_alert_copy():
    ev = AlertEvent(kind="enrollment", actor_id=1, actor_name="Priya Sharma", lead_id=3, lead_name="Rohit", amount_cents=19600)
    assert alert_text(ev) == ("Enrollment", "Priya enrolled Rohit (₹196)", "/dashboard/work/leads/3")
    assert alert_text(AlertEvent(kind="lead_added", actor_id=1, actor_name="Priya", lead_name="Rohit"))[1] == "Priya added Rohit"
    assert alert_text(AlertEvent(kind="online", actor_id=1, actor_name="Priya"))[:2] == ("Online now", "Priya is online")


async def test_online_alert_every_time_they_come_back_after_a_break(ctx, monkeypatch):
    from app.models.user_presence_session import UserPresenceSession

    S, _, _ = ctx
    seen: list[int] = []
    monkeypatch.setattr(admin_alerts, "member_came_online", lambda u: seen.append(u.id))
    t0 = datetime.now(timezone.utc)

    async def connect(s, key, at):
        await team_tracking.connect_presence_session(s, user_id=MEMBER, session_key=key, last_path="/", user_agent="x", now=at)

    async def go_offline(s, at):
        for row in (await s.execute(select(UserPresenceSession))).scalars():
            row.disconnected_at = at
            row.status = "offline"
            row.last_heartbeat_at = at
        await s.commit()

    async with S() as s:
        await connect(s, "phone", t0)                                # first time → alert
        await connect(s, "laptop", t0 + timedelta(minutes=2))        # already online on phone → no
        await go_offline(s, t0 + timedelta(minutes=10))
        await connect(s, "phone", t0 + timedelta(minutes=14))        # back after 4 min (blip) → no
        await go_offline(s, t0 + timedelta(minutes=20))
        await connect(s, "phone", t0 + timedelta(minutes=40))        # back after 20 min → alert
    assert seen == [MEMBER, MEMBER]



async def test_calling_board_buttons_alert_even_without_stage_change(ctx):
    from app.services.admin_alerts import mark_call_outcome

    S, captured, _ = ctx
    set_request_context(user_id=str(MEMBER), actor_name="Priya Sharma")
    async with S() as s:
        lead = _lead(status="contacted")
        s.add(lead)
        await s.commit()
        captured.clear()
        mark_call_outcome(s, lead, "not_picked")  # stays Contacted
        await s.commit()
        lead.status = "video_sent"
        mark_call_outcome(s, lead, "interested")  # stage moves too: one alert, not two
        await s.commit()
    assert [(e.kind, e.call_outcome, e.new_status) for e in captured] == [
        ("status", "not_picked", "contacted"),
        ("status", "interested", "video_sent"),
    ]
    assert alert_text(captured[0])[:2] == ("Rohit → Not picked", "Priya marked Rohit Not picked on the calling board")


async def test_team_leaders_get_their_teams_alerts_only(ctx):
    from app.services.admin_alerts import set_user_disabled_kinds

    S, _, pushes = ctx
    LEAD, SUBLEAD, MEMBER2, OTHER_LEAD = 9421, 9422, 9423, 9424
    async with S() as s:
        s.add_all([
            User(id=LEAD, fbo_id="l1", email="l1@t", role="leader", name="Neha"),
            User(id=SUBLEAD, fbo_id="l2", email="l2@t", role="leader", name="Ravi", upline_user_id=LEAD),
            User(id=MEMBER2, fbo_id="m2", email="m2@t", role="team", name="Amit", upline_user_id=SUBLEAD),
            User(id=OTHER_LEAD, fbo_id="l3", email="l3@t", role="leader", name="Other"),
        ])
        await s.commit()
        ev = AlertEvent(kind="lead_added", actor_id=MEMBER2, actor_name="Amit", lead_id=1, lead_name="Rohit", owner_id=MEMBER2)
        await dispatch(s, [ev])
        # Both leaders above Amit + both admins; never the other team's leader.
        assert sorted(uid for uid, *_ in pushes) == sorted([ADMIN1, ADMIN2, LEAD, SUBLEAD])

        pushes.clear()
        await set_user_disabled_kinds(s, SUBLEAD, {"lead_added"})
        await dispatch(s, [ev])
        assert SUBLEAD not in [uid for uid, *_ in pushes] and LEAD in [uid for uid, *_ in pushes]

        pushes.clear()
        # A leader's own action never alerts themselves.
        await dispatch(s, [AlertEvent(kind="status", actor_id=SUBLEAD, actor_name="Ravi", lead_id=1,
                                      lead_name="Rohit", old_status="day1", new_status="day2", owner_id=MEMBER2)])
        assert SUBLEAD not in [uid for uid, *_ in pushes] and LEAD in [uid for uid, *_ in pushes]
