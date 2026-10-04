"""Scheduled notification runs are recorded and summarised for the admin."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import IST
from app.db.base import Base
from app.models.push_job_run import PushJobRun
from app.services import push_job_runs, scheduled_jobs
from app.services.push_job_runs import todays_push_runs

NOW = datetime.now(IST).replace(hour=18, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


@pytest.fixture
async def Session(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr("app.db.session.AsyncSessionLocal", S)
    yield S
    await engine.dispose()


async def test_runs_are_summarised_per_job(Session):
    async with Session() as s:
        s.add_all([
            PushJobRun(job="morning_plan", targeted=25, sent=18, ran_at=NOW - timedelta(hours=9)),
            PushJobRun(job="inactivity_nudge", targeted=3, sent=2, ran_at=NOW - timedelta(hours=6)),
            PushJobRun(job="inactivity_nudge", targeted=4, sent=4, ran_at=NOW - timedelta(hours=5)),
            PushJobRun(job="call_target_reminder", targeted=0, sent=0, error="boom", ran_at=NOW - timedelta(hours=1)),
            PushJobRun(job="morning_plan", targeted=30, sent=30, ran_at=NOW - timedelta(days=1)),  # yesterday
        ])
        await s.commit()
        jobs = {j["job"]: j for j in await todays_push_runs(s, now=NOW)}
    assert (jobs["morning_plan"]["ran"], jobs["morning_plan"]["targeted"], jobs["morning_plan"]["sent"]) == (True, 25, 18)
    assert (jobs["inactivity_nudge"]["runs"], jobs["inactivity_nudge"]["sent"]) == (2, 6)
    assert jobs["call_target_reminder"]["error"] == "boom"
    assert jobs["evening_recap"]["ran"] is False


async def test_morning_plan_job_records_its_run(Session, monkeypatch):
    from types import SimpleNamespace

    users = [SimpleNamespace(id=1), SimpleNamespace(id=2), SimpleNamespace(id=3)]

    async def eligible(_s):
        return users

    async def plans(_s, us, _d):
        return {u.id: u.id for u in us}

    async def push(_s, user, *_a, **_k):
        return user.id != 3  # third member has no device

    monkeypatch.setattr(scheduled_jobs, "AsyncSessionLocal", Session)
    monkeypatch.setattr(scheduled_jobs, "_get_eligible_users", eligible)
    monkeypatch.setattr(scheduled_jobs, "build_morning_plans", plans)
    monkeypatch.setattr(scheduled_jobs, "morning_plan_message", lambda p: None if p == 2 else ("t", "b"))
    monkeypatch.setattr(scheduled_jobs, "_push_digest", push)

    await scheduled_jobs.job_morning_plan()
    async with Session() as s:
        jobs = {j["job"]: j for j in await todays_push_runs(s)}
    assert (jobs["morning_plan"]["targeted"], jobs["morning_plan"]["sent"]) == (2, 1)


async def test_verification_escalation_job_no_longer_crashes(Session):
    """It built timedelta(hours=<SQL column>) and failed at 11:00 and 18:00 every day."""
    from app.services.verification_service import run_escalation_checks

    async with Session() as s:
        assert await run_escalation_checks(s) == []
