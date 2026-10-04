"""Calling-board file import: new leads are fresh today, duplicates never get in."""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import openpyxl
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.core.time_ist import today_ist
from app.db.base import Base
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.services.lead_file_import import run_personal_lead_import
from app.services.live_metrics import fresh_call_counts_by_user

MEMBER, OTHER = 9601, 9602


def _xlsx(rows: list[tuple[str, str]]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Name", "Phone"])
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
async def Session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with S() as s:
        s.add_all([User(id=MEMBER, fbo_id="m", email="m@t", role="team", name="Priya"),
                   User(id=OTHER, fbo_id="o", email="o@t", role="team", name="Rahul")])
        await s.flush()
        s.add(Lead(name="Old", status="contacted", phone="9876500000", created_by_user_id=OTHER,
                   owner_user_id=OTHER, assigned_to_user_id=OTHER, in_pool=False,
                   created_at=datetime.now(timezone.utc) - timedelta(days=3)))
        await s.commit()
    yield S
    await engine.dispose()


async def test_import_skips_duplicates_and_counts_fresh(Session):
    data = _xlsx([
        ("Rohit", "+91 98765 11111"),   # new
        ("Old again", "9876500000"),    # already in Myle (another member's lead)
        ("Rohit twin", "9876511111"),   # repeated in this file
        ("No phone", "12345"),          # bad number
        ("Sita", "98765-22222"),        # new
    ])
    async with Session() as s:
        r = await run_personal_lead_import(s, user_id=MEMBER, file_bytes=data, filename="leads.xlsx", source_tag="Import")
        assert (r.imported, r.duplicates, r.invalid, r.skipped) == (2, 2, 1, 3)
        mine = (await s.execute(select(Lead).where(Lead.created_by_user_id == MEMBER))).scalars().all()
        assert sorted(l.phone for l in mine) == ["9876511111", "9876522222"]
        assert all(l.assigned_to_user_id == MEMBER and not l.in_pool and l.status == "new_lead" for l in mine)

        # Uploading the same file again adds nothing.
        again = await run_personal_lead_import(s, user_id=MEMBER, file_bytes=data, filename="leads.xlsx", source_tag="Import")
        assert (again.imported, again.duplicates) == (0, 4)

        # Calling an imported lead counts as a fresh call today (it was added today).
        s.add(CallEvent(lead_id=mine[0].id, user_id=MEMBER, outcome="answered", called_at=datetime.now(timezone.utc)))
        await s.commit()
        fresh = await fresh_call_counts_by_user(s, [MEMBER], today_ist())
    assert fresh.get(MEMBER) == 1
