"""Grace "till X" means X is the last day off — work (and rules) restart on X+1."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.time_ist import today_ist
from app.models.grace_history import GraceHistory
from app.models.user import User
from app.services.member_compliance import build_compliance_snapshots

UID = 7301


@pytest.fixture
async def member(engine, monkeypatch):
    monkeypatch.setattr(settings, "discipline_rollout_start_date", today_ist() - timedelta(days=60))
    monkeypatch.setattr(settings, "discipline_warning_pause_until", None)
    async with AsyncSession(engine, expire_on_commit=False) as s:
        await s.execute(delete(GraceHistory).where(GraceHistory.user_id == UID))
        u = await s.get(User, UID)
        if u is None:
            u = User(id=UID, fbo_id="G07301", email="grace7301@test.myle", role="team")
            s.add(u)
        u.registration_status = "approved"
        u.training_required = False
        u.training_status = "completed"
        u.training_gate_until = None
        u.access_blocked = False
        u.removed_at = None
        u.removal_reason = None
        u.discipline_status = "active"
        u.discipline_reset_on = None
        u.grace_end_date = None
        u.grace_request_end_date = None
        u.grace_request_requested_at = None
        u.created_at = datetime.now(timezone.utc) - timedelta(days=60)
        await s.commit()
    return UID


async def _set(engine, **fields):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        u = await s.get(User, UID)
        for k, v in fields.items():
            setattr(u, k, v)
        await s.commit()


async def _evaluate(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        snap = (await build_compliance_snapshots(s, [UID], apply_actions=True))[UID]
    async with AsyncSession(engine, expire_on_commit=False) as s:
        return snap, await s.get(User, UID)


async def test_day_after_grace_is_a_normal_work_day(engine, member):
    today = today_ist()
    await _set(engine, discipline_status="grace", grace_end_date=today - timedelta(days=1))

    snap, user = await _evaluate(engine)

    assert snap.compliance_level == "clear"
    assert user.discipline_status == "active"
    assert user.grace_end_date is None
    assert user.discipline_reset_on == today
    assert user.access_blocked is False


async def test_one_missed_day_after_grace_is_a_warning_not_removal(engine, member):
    today = today_ist()
    await _set(engine, discipline_status="grace", grace_end_date=today - timedelta(days=2))

    snap, user = await _evaluate(engine)

    assert snap.compliance_level == "warning"
    assert user.access_blocked is False
    assert user.discipline_status == "active"
    assert user.discipline_reset_on == today - timedelta(days=1)


async def test_unanswered_grace_request_days_are_not_counted_as_misses(engine, member):
    today = today_ist()
    await _set(
        engine,
        grace_request_end_date=today - timedelta(days=2),
        grace_request_requested_at=datetime.now(timezone.utc) - timedelta(days=6),
    )

    snap, user = await _evaluate(engine)

    # Only yesterday (the first day back) counts; the held days are excused.
    assert snap.missing_report_streak == 1
    assert snap.compliance_level == "warning"
    assert user.access_blocked is False
