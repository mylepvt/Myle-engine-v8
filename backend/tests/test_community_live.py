"""Community live pulse: online count, today's totals and a privacy-safe feed."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.db.base import Base
from app.models.batch_share_link import BatchShareLink
from app.models.call_event import CallEvent
from app.models.day2_test_session import Day2TestSession
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.training_progress import TrainingProgress
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.models.win import Win
from app.models.xp_event import XpEvent
from app.services.community_live import build_live_snapshot

PRIYA, RAHUL, ADMIN, GONE, IDLE = 1, 2, 3, 4, 5


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


def _presence(uid: int, key: str, beat: datetime, *, gone: bool = False) -> UserPresenceSession:
    return UserPresenceSession(
        user_id=uid, session_key=key, status="online", last_heartbeat_at=beat, last_seen_at=beat,
        disconnected_at=beat if gone else None,
    )


async def test_snapshot(Session):
    now = datetime.now(timezone.utc)
    async with Session() as s:
        s.add_all([
            User(id=PRIYA, fbo_id="f1", email="p@t", role="team", name="Priya Sharma"),
            User(id=RAHUL, fbo_id="f2", email="r@t", role="leader", name="Rahul Verma"),
            User(id=ADMIN, fbo_id="f3", email="a@t", role="admin", name="Boss"),
            User(id=GONE, fbo_id="f4", email="g@t", role="team", name="Old", removed_at=now),
            User(id=IDLE, fbo_id="f5", email="i@t", role="team", name="Idle Ira"),
        ])
        await s.flush()
        s.add(Lead(id=1, name="Secret Prospect", phone="9999999999", status="new_lead",
                   created_by_user_id=PRIYA, owner_user_id=PRIYA, assigned_to_user_id=PRIYA,
                   in_pool=False, call_count=0, created_at=now - timedelta(days=2)))
        await s.flush()
        s.add_all([
            _presence(PRIYA, "p1", now - timedelta(seconds=5)),
            _presence(RAHUL, "r1", now - timedelta(seconds=20)),
            _presence(ADMIN, "a1", now),                               # admins not counted
            _presence(GONE, "g1", now),                                # removed member
            _presence(IDLE, "i1", now - timedelta(minutes=5)),         # stale heartbeat
            _presence(IDLE, "i2", now, gone=True),                     # closed tab
            CallEvent(lead_id=1, user_id=PRIYA, outcome="answered", called_at=now - timedelta(minutes=2)),
            CallEvent(lead_id=1, user_id=PRIYA, outcome="no_answer", called_at=now - timedelta(minutes=10)),
            CallEvent(lead_id=1, user_id=PRIYA, outcome="no_answer", called_at=now - timedelta(hours=5)),
            CallEvent(lead_id=1, user_id=RAHUL, outcome="answered", called_at=now - timedelta(days=3)),
            CallEvent(lead_id=1, user_id=GONE, outcome="answered", called_at=now),
            FollowUp(lead_id=1, note="x", created_by_user_id=RAHUL, completed_by_user_id=RAHUL,
                     completed_at=now - timedelta(minutes=1)),
            XpEvent(user_id=IDLE, action="login_daily", xp=5, created_at=now),  # opening app ≠ work
            XpEvent(user_id=RAHUL, action="report_submitted", xp=25, created_at=now - timedelta(minutes=30)),
            Win(user_id=RAHUL, kind="enrollment", created_at=now - timedelta(minutes=40)),
            BatchShareLink(token="b1", lead_id=1, slot="d2_morning", created_by_user_id=PRIYA,
                           used=True, used_at=now - timedelta(minutes=50)),
            Day2TestSession(token="t1", lead_id=1, created_by_user_id=RAHUL, status="submitted",
                            passed=True, score=27, submitted_at=now - timedelta(hours=2)),
            TrainingProgress(user_id=IDLE, day_number=3, completed=True, completed_at=now - timedelta(hours=4)),
            TrainingTestAttempt(user_id=IDLE, score=9, total_questions=10, passed=True,
                                attempted_at=now - timedelta(hours=6)),
            TrainingProgress(user_id=IDLE, day_number=1, completed=True, completed_at=now - timedelta(days=2)),
        ])
        await s.flush()
        s.add(Lead(id=2, name="Another", status="new_lead", created_by_user_id=PRIYA, owner_user_id=PRIYA,
                   assigned_to_user_id=PRIYA, in_pool=False, call_count=0, created_at=now - timedelta(minutes=3)))
        await s.commit()
        snap = await build_live_snapshot(s, now)

    assert snap["online_now"] == 2
    assert snap["online_names"] == ["Priya", "Rahul"]
    assert snap["today"]["calls"] >= 2  # 5 h ago may fall on the previous IST day
    assert snap["today"]["followups"] == 1
    assert snap["today"]["members_worked"] == 2  # Priya (calls) + Rahul (report); not Ira's login
    assert snap["today"]["leads_added"] == 1
    assert snap["week"]["calls"] == 4  # + Rahul's call 3 days ago; removed member excluded
    assert snap["week"]["leads_added"] == 2
    texts = [e["text"] for e in snap["feed"]]
    assert texts[:3] == ["Rahul completed a follow-up", "Priya made 2 calls", "Priya added a new lead"]
    for line in (
        "Rahul submitted the daily report",
        "Rahul enrolled a new prospect",
        "Priya's prospect watched a Day 2 batch",
        "Rahul's prospect passed the Day 2 test",
        "Idle completed Day 3 of training",
        "Idle earned the training certificate",
    ):
        assert line in texts, line
    assert "Idle completed Day 1 of training" not in texts  # older than 24 h
    blob = repr(snap)
    assert "Secret" not in blob and "9999999999" not in blob and "Old" not in blob and "Boss" not in blob


async def test_endpoint_open_to_members(team_client: AsyncClient):
    r = await team_client.get("/api/v1/community/live")
    assert r.status_code == 200, r.text
    body = r.json()
    assert {"online_now", "online_names", "today", "feed"} <= body.keys()
