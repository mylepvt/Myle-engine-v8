"""Today's closing list: interview done + today's 2 PM session watched, Day 3, own team only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.closing_ready import closing_ready_today
from app.services.leads_service import _toggle_process_task

NOW = datetime.now(IST).replace(hour=16, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
LEADER, MEMBER, OTHER = 9701, 9702, 9703


SPECS = []  # (name, owner, interview, session_at, status)


def _day3(name, owner, *, interview=True, session_at=NOW - timedelta(hours=1), status="day3"):
    tracking = {"day3": {"day3_interview": interview}}
    if session_at is not None:
        tracking["day3"]["day3_live_session"] = True
    lead = Lead(name=name, phone="9876500000", status=status, created_by_user_id=owner, owner_user_id=owner,
                assigned_to_user_id=LEADER, in_pool=False, process_tracking=tracking)
    SPECS.append((lead, session_at))
    return lead


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with S() as s:
        s.add_all([
            User(id=LEADER, fbo_id="l", email="l@t", role="leader", name="Neha"),
            User(id=MEMBER, fbo_id="m", email="m@t", role="team", name="Priya", upline_user_id=LEADER),
            User(id=OTHER, fbo_id="o", email="o@t", role="team", name="Stranger"),
        ])
        await s.flush()
        s.add_all([
            _day3("Ready Rohit", MEMBER),
            _day3("No interview", MEMBER, interview=False),
            _day3("No session", MEMBER, session_at=None),
            _day3("Yesterday's session", MEMBER, session_at=NOW - timedelta(days=1)),
            _day3("Already converted", MEMBER, status="converted"),
            _day3("Other team", OTHER),
        ])
        await s.flush()
        for lead, session_at in SPECS:
            if session_at is not None:
                s.add(ActivityLog(user_id=LEADER, action="process.task_done", entity_type="lead", entity_id=lead.id,
                                  meta={"stage": "day3", "task": "day3_live_session"}, created_at=session_at))
        SPECS.clear()
        await s.commit()
    yield S
    await engine.dispose()


async def test_leader_sees_todays_ready_prospects_in_own_team(Session):
    async with Session() as s:
        items = await closing_ready_today(s, viewer_id=LEADER, viewer_role="leader", now=NOW)
    assert [i["name"] for i in items] == ["Ready Rohit"]
    assert items[0]["owner_name"] == "Priya" and items[0]["phone"] == "9876500000"


async def test_admin_sees_every_team(Session):
    async with Session() as s:
        items = await closing_ready_today(s, viewer_id=1, viewer_role="admin", now=NOW)
    assert sorted(i["name"] for i in items) == ["Other team", "Ready Rohit"]


def test_process_tracking_stays_yes_no_so_leads_still_load():
    """Ticks must not put timestamps in process_tracking — LeadPublic only accepts booleans."""
    from pydantic import TypeAdapter

    from app.schemas.leads import LeadPublic

    lead = Lead(name="x", process_tracking={})
    _toggle_process_task(lead, stage="day3", task="day3_live_session", done=True)
    assert lead.process_tracking == {"day3": {"day3_live_session": True}}
    TypeAdapter(LeadPublic.model_fields["process_tracking"].annotation).validate_python(lead.process_tracking)
