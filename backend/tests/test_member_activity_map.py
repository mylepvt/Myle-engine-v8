"""Tests for the per-member behavior map aggregation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.activity_log import ActivityLog
from app.models.user import User
from app.services.member_activity_map import build_activity_map


@pytest_asyncio.fixture
async def session(engine) -> AsyncSession:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        for tbl in ("activity_log", "users"):
            await s.execute(text(f"DELETE FROM {tbl}"))
        await s.commit()
        yield s


async def _seed_user(session: AsyncSession, uid: int = 701) -> int:
    session.add(
        User(
            id=uid, name="Mapped Member", username=f"u{uid}", email=f"u{uid}@myle.test",
            role="team", registration_status="approved", fbo_id=f"F{uid:05d}",
        )
    )
    await session.flush()
    return uid


def _log(uid: int, action: str, when: datetime) -> ActivityLog:
    return ActivityLog(user_id=uid, action=action, entity_type="lead", entity_id=1, created_at=when)


@pytest.mark.asyncio
async def test_activity_map_categories_and_consistency(session: AsyncSession):
    uid = await _seed_user(session)
    now = datetime.now(timezone.utc)
    # Today: 3 claims + 1 conversion; yesterday: 1 create.
    session.add_all([
        _log(uid, "lead.claimed", now),
        _log(uid, "lead.claimed", now),
        _log(uid, "lead.claimed_free", now),
        _log(uid, "lead_won", now),
        _log(uid, "lead.created", now - timedelta(days=1)),
    ])
    await session.commit()

    out = await build_activity_map(session, user_id=uid, days=30)
    assert out["total"] == 5
    assert out["by_category"]["claim"] == 3
    assert out["by_category"]["convert"] == 1
    assert out["by_category"]["create"] == 1
    assert out["active_days"] == 2
    assert out["window_days"] == 30
    assert "Lead grabber" in out["tags"]  # claim is dominant
    assert len(out["daily_series"]) == 30
    assert out["peak_hour"] is not None


@pytest.mark.asyncio
async def test_activity_map_empty_member(session: AsyncSession):
    uid = await _seed_user(session, 702)
    await session.commit()
    out = await build_activity_map(session, user_id=uid, days=60)
    assert out["total"] == 0
    assert out["active_days"] == 0
    assert out["consistency_pct"] == 0
    assert out["tags"]  # still returns a consistency tag ("Low presence")


@pytest.mark.asyncio
async def test_activity_map_lifetime(session: AsyncSession):
    uid = await _seed_user(session, 703)
    old = datetime.now(timezone.utc) - timedelta(days=200)
    session.add(_log(uid, "sale_approved", old))
    await session.commit()
    out = await build_activity_map(session, user_id=uid, days=0)
    assert out["lifetime"] is True
    assert out["total"] == 1
    assert out["by_category"]["sale"] == 1
