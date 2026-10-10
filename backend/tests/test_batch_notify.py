"""Workboard batch notifications: task given → right people; 10/1/3/4 reminders only for pending batches."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.batch_share_link import BatchShareLink
from app.models.lead import Lead
from app.models.user import User
from app.services import batch_notify as bn

ADMIN, LEADER, PRIYA, RAHUL = 1, 2, 3, 4
NOW = datetime.now(timezone.utc)


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def _seed(s: AsyncSession) -> None:
    s.add(User(id=ADMIN, fbo_id="a", email="a@t", role="admin", name="Karanveer"))
    await s.flush()
    s.add(User(id=LEADER, fbo_id="l", email="l@t", role="leader", name="Aman_Gill", upline_user_id=ADMIN))
    await s.flush()
    s.add_all([
        User(id=PRIYA, fbo_id="p", email="p@t", role="team", name="Priya", upline_user_id=LEADER),
        User(id=RAHUL, fbo_id="r", email="r@t", role="team", name="Rahul", upline_user_id=LEADER),
    ])
    await s.flush()


def _lead(lead_id: int, owner: int, status: str, **kw) -> Lead:
    return Lead(id=lead_id, name=kw.pop("name", f"Ravi_{lead_id}"), status=status, created_by_user_id=owner,
                owner_user_id=owner, assigned_to_user_id=LEADER if status != "new_lead" else owner,
                in_pool=False, call_count=0, phone=f"98000000{lead_id:02d}", created_at=NOW - timedelta(days=1), **kw)


async def test_day1_task_from_leader_goes_to_member_and_admin(Session):
    async with Session() as s:
        await _seed(s)
        lead = _lead(1, PRIYA, "day1", name="ravi_kumar")
        s.add(lead)
        await s.commit()
        pushes = await bn.task_given_pushes(s, lead=lead, slot="d1_morning", actor_id=LEADER)
        assert sorted(uid for uid, *_ in pushes) == [ADMIN, PRIYA]
        _, title, body, url = pushes[0]
        assert title == "Day 1 · Morning batch for Ravi Kumar"
        assert body == "Aman shared it. Batch 10 AM – 12 PM — make sure Ravi watches. Follow up 1 – 2 PM."
        assert url == "/dashboard/work/workboard"


async def test_day2_task_from_admin_goes_to_member_and_leader(Session):
    async with Session() as s:
        await _seed(s)
        lead = _lead(1, PRIYA, "day2")
        s.add(lead)
        await s.commit()
        pushes = await bn.task_given_pushes(s, lead=lead, slot="d2_evening", actor_id=ADMIN)
        assert sorted(uid for uid, *_ in pushes) == [LEADER, PRIYA]
        assert pushes[0][1].startswith("Day 2 · Evening batch")
        assert "Follow up" not in pushes[0][2]  # no follow-up window after the evening batch
        assert await bn.task_given_pushes(s, lead=lead, slot="d4_morning", actor_id=ADMIN) == []


async def test_reminders_only_for_pending_batches(Session):
    async with Session() as s:
        await _seed(s)
        s.add_all([
            _lead(1, PRIYA, "day1", name="Ravi"),  # morning pending
            _lead(2, PRIYA, "day2", name="Sonu", d2_morning=True),  # morning done
            _lead(3, RAHUL, "day2", name="Neha"),  # morning pending
            _lead(4, RAHUL, "day3", name="Amit"),  # not a Day 1/2 prospect
        ])
        await s.commit()

        ten = await bn.build_reminders(s, 10)
        assert set(ten) == {PRIYA, RAHUL, LEADER}
        assert ten[PRIYA] == ("⏰ Morning batch is live", "Morning batch 10 AM – 12 PM: Ravi.")
        assert ten[LEADER][1] == "Morning batch 10 AM – 12 PM: Ravi, Neha."
        assert await bn.build_reminders(s, 11) == {}


async def test_one_pm_follows_up_shared_but_unwatched_and_starts_2nd_batch(Session):
    async with Session() as s:
        await _seed(s)
        s.add_all([_lead(1, PRIYA, "day2", name="Ravi"), _lead(2, PRIYA, "day2", name="Sonu")])
        await s.flush()
        s.add(BatchShareLink(token="t1", lead_id=1, slot="d2_morning", created_by_user_id=ADMIN, used=False))
        await s.commit()

        one = await bn.build_reminders(s, 13)
        title, body = one[PRIYA]
        assert title == "⏰ Follow up morning batch · 2nd batch is live"
        assert body == "Follow up 1 – 2 PM: Ravi — not watched yet. 2nd batch 1 – 3 PM: Ravi, Sonu."


async def test_each_checkpoint_runs_once_a_day(Session):
    async with Session() as s:
        now = datetime.now(IST).replace(hour=10, minute=0)
        assert await bn.claim_checkpoint(s, now, 10) is True
        assert await bn.claim_checkpoint(s, now, 10) is False
        assert await bn.claim_checkpoint(s, now, 13) is True
