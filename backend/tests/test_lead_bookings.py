"""Lead bookings: member books tomorrow, pool load auto-fills FIFO onto their Today tab."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import today_ist
from app.db.base import Base
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.lead_booking import LeadBooking
from app.models.user import User
from app.services.lead_booking_service import SKIP_LOW_WALLET, SKIP_UNCOVERED, fulfill_open_bookings

A, B, ADMIN = 7401, 7402, 7400


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="F07400", email="a7400@t.myle", role="admin", name="Admin"),
            User(id=A, fbo_id="F07401", email="m7401@t.myle", role="team", name="Asha"),
            User(id=B, fbo_id="F07402", email="m7402@t.myle", role="team", name="Bina"),
        ])
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    who = {"user": AuthUser(user_id=A, role="team", email="m7401@t.myle")}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session, who
    app.dependency_overrides = saved
    await engine.dispose()


async def _add_pool(Session, n: int, price_cents: int = 0) -> None:
    async with Session() as s:
        for i in range(n):
            s.add(Lead(name=f"Pool {i}", status="new_lead", created_by_user_id=ADMIN, in_pool=True,
                       pool_type="paid", pool_price_cents=price_cents or None, outcome="active"))
        await s.commit()


async def _book_today(Session, user_id: int, count: int, created_at: datetime) -> None:
    async with Session() as s:
        s.add(LeadBooking(user_id=user_id, booking_date=today_ist(), requested_count=count,
                          fulfilled_count=0, status="open", created_at=created_at))
        await s.commit()


async def test_member_books_for_tomorrow_and_can_change_or_cancel(ctx):
    client, _Session, _who = ctx
    r = await client.put("/api/v1/lead-bookings/me", json={"count": 20})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tomorrow"]["requested_count"] == 20
    assert body["tomorrow"]["booking_date"] == (today_ist() + timedelta(days=1)).isoformat()

    r = await client.put("/api/v1/lead-bookings/me", json={"count": 30})
    assert r.json()["tomorrow"]["requested_count"] == 30

    r = await client.delete("/api/v1/lead-bookings/me")
    assert r.json()["tomorrow"] is None

    assert (await client.put("/api/v1/lead-bookings/me", json={"count": 51})).status_code == 422


async def test_pool_load_fills_bookings_fifo_onto_today_tab(ctx):
    client, Session, who = ctx
    now = datetime.now(timezone.utc)
    await _book_today(Session, A, 3, now - timedelta(hours=2))  # booked first
    await _book_today(Session, B, 3, now - timedelta(hours=1))
    await _add_pool(Session, 4)

    async with Session() as s:
        result = await fulfill_open_bookings(s)
    assert result["leads_assigned"] == 4

    async with Session() as s:
        a = (await s.execute(select(LeadBooking).where(LeadBooking.user_id == A))).scalar_one()
        b = (await s.execute(select(LeadBooking).where(LeadBooking.user_id == B))).scalar_one()
        assert (a.fulfilled_count, a.status) == (3, "fulfilled")
        assert (b.fulfilled_count, b.status) == (1, "open")
        claims = (await s.execute(select(ActivityLog).where(ActivityLog.action == "lead.claimed"))).scalars().all()
        assert len(claims) == 4

    # Booked leads show on the member's Calling Board → Today.
    r = await client.get("/api/v1/leads", params={"ctcs_filter": "today"})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 3

    # More leads later the same day top up the rest.
    await _add_pool(Session, 5)
    async with Session() as s:
        await fulfill_open_bookings(s)
    async with Session() as s:
        b = (await s.execute(select(LeadBooking).where(LeadBooking.user_id == B))).scalar_one()
        assert (b.fulfilled_count, b.status) == (3, "fulfilled")

    # Admin sees the demand for the day.
    who["user"] = AuthUser(user_id=ADMIN, role="admin", email="a7400@t.myle")
    day = (await client.get("/api/v1/lead-bookings")).json()
    assert (day["total_requested"], day["total_fulfilled"]) == (6, 6)
    assert [row["member_name"] for row in day["items"]] == ["Asha", "Bina"]


async def test_booking_skipped_when_wallet_low_or_leads_uncovered(ctx):
    _client, Session, _who = ctx
    now = datetime.now(timezone.utc)
    await _book_today(Session, A, 2, now - timedelta(hours=2))
    await _add_pool(Session, 2, price_cents=5000)  # A has no wallet balance

    # B has an uncovered lead claimed yesterday.
    async with Session() as s:
        old = Lead(name="Old", status="new_lead", created_by_user_id=B, owner_user_id=B,
                   assigned_to_user_id=B, in_pool=False, outcome="active")
        s.add(old)
        await s.flush()
        s.add(ActivityLog(user_id=B, action="lead.claimed", entity_type="lead", entity_id=old.id,
                          created_at=now - timedelta(days=1, hours=2)))
        s.add(LeadBooking(user_id=B, booking_date=today_ist(), requested_count=2, fulfilled_count=0,
                          status="open", created_at=now - timedelta(hours=1)))
        await s.commit()

    async with Session() as s:
        result = await fulfill_open_bookings(s)
    assert result == {"bookings": 2, "leads_assigned": 0, "members_filled": 0, "skipped": 2}
    async with Session() as s:
        rows = {b.user_id: b for b in (await s.execute(select(LeadBooking))).scalars().all()}
        assert rows[A].last_skip_reason == SKIP_LOW_WALLET
        assert rows[B].last_skip_reason == SKIP_UNCOVERED


async def test_yesterdays_open_booking_expires(ctx):
    _client, Session, _who = ctx
    async with Session() as s:
        s.add(LeadBooking(user_id=A, booking_date=today_ist() - timedelta(days=1), requested_count=5,
                          fulfilled_count=0, status="open"))
        await s.commit()
    async with Session() as s:
        await fulfill_open_bookings(s)
    async with Session() as s:
        assert (await s.execute(select(LeadBooking))).scalar_one().status == "expired"
