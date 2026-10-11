"""The commit hook observes leads that were written — not every lead the session happened to load."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.config import settings
from app.db.base import Base
from app.models.lead import Lead
from app.models.user import User
from app.services import observation_logger as obs


@pytest.fixture
async def Session(monkeypatch):
    monkeypatch.setattr(settings, "phase1_observation_enabled", True)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def seen(monkeypatch):
    out: list[int] = []
    monkeypatch.setattr(obs, "_broadcast_to_feed", lambda record: out.append(record["lead_id"]))
    monkeypatch.setattr(obs, "emit_observation", lambda record: None)
    return out


async def test_only_written_leads_are_observed(Session, seen):
    async with Session() as s:
        s.add(User(id=1, fbo_id="a", email="a@t", role="team", name="Priya"))
        await s.flush()
        s.add_all([
            Lead(id=i, name=f"Ravi {i}", status="new_lead", created_by_user_id=1, owner_user_id=1,
                 in_pool=False, call_count=0, phone=f"98000000{i:02d}", created_at=datetime.now(timezone.utc))
            for i in range(1, 6)
        ])
        await s.commit()
    assert sorted(seen) == [1, 2, 3, 4, 5]

    seen.clear()
    async with Session() as s:
        leads = (await s.execute(select(Lead))).scalars().all()  # read-only, like the rewards scan
        await s.commit()
        assert seen == []

        leads[2].status = "contacted"
        await s.commit()
        assert seen == [3]

        seen.clear()
        leads[0].status = "day1"
        await s.flush()
        await s.rollback()
        await s.commit()
        assert seen == []
