"""Lead bookings — members reserve N pool leads for tomorrow; auto-filled on pool load.

Fulfilment reuses the normal paid-pool claim (wallet debit, invoice, "lead.claimed"
activity) so booked leads land on the member's Calling Board → Today tab exactly
like a manual claim. Members with uncovered fresh leads are skipped (claim gate).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.core.realtime_hub import notify_topics
from app.core.time_ist import today_ist
from app.models.lead import Lead
from app.models.lead_booking import (
    BOOKING_CANCELLED,
    BOOKING_EXPIRED,
    BOOKING_FULFILLED,
    BOOKING_OPEN,
    LeadBooking,
)
from app.models.user import User
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.services.claim_gate import uncovered_claimed_leads

logger = logging.getLogger(__name__)

MAX_BOOKING_COUNT = 50
BOOKING_ROLES = frozenset({"team", "leader"})

SKIP_UNCOVERED = "Cover your earlier fresh leads first — booking paused."
SKIP_LOW_WALLET = "Wallet balance too low for booked leads — recharge to receive them."


def booking_day_for_new_request() -> date:
    """Bookings made today are for tomorrow (IST)."""
    return today_ist() + timedelta(days=1)


async def get_booking(session: AsyncSession, user_id: int, day: date) -> LeadBooking | None:
    return (
        await session.execute(
            select(LeadBooking).where(LeadBooking.user_id == user_id, LeadBooking.booking_date == day)
        )
    ).scalar_one_or_none()


async def upsert_booking(session: AsyncSession, user_id: int, count: int) -> LeadBooking:
    day = booking_day_for_new_request()
    booking = await get_booking(session, user_id, day)
    if booking is None:
        booking = LeadBooking(user_id=user_id, booking_date=day, requested_count=count, fulfilled_count=0)
        session.add(booking)
    else:
        booking.requested_count = max(count, booking.fulfilled_count)
        booking.status = BOOKING_OPEN if booking.requested_count > booking.fulfilled_count else BOOKING_FULFILLED
        booking.last_skip_reason = None
    await session.commit()
    await session.refresh(booking)
    return booking


async def cancel_booking(session: AsyncSession, user_id: int) -> LeadBooking | None:
    booking = await get_booking(session, user_id, booking_day_for_new_request())
    if booking is None:
        return None
    booking.status = BOOKING_CANCELLED
    await session.commit()
    await session.refresh(booking)
    return booking


async def list_bookings_for_day(session: AsyncSession, day: date) -> list[tuple[LeadBooking, User]]:
    rows = await session.execute(
        select(LeadBooking, User)
        .join(User, User.id == LeadBooking.user_id)
        .where(LeadBooking.booking_date == day, LeadBooking.status != BOOKING_CANCELLED)
        .order_by(LeadBooking.created_at.asc(), LeadBooking.id.asc())
    )
    return [(b, u) for b, u in rows.all()]


def _paid_pool_available():
    return (
        Lead.in_pool.is_(True),
        Lead.pool_type == "paid",
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
    )


async def _affordable_count(session: AsyncSession, user_id: int, want: int) -> int:
    """How many of the oldest ``want`` pool leads the member's wallet can pay for."""
    prices = (
        await session.execute(
            select(Lead.pool_price_cents)
            .where(*_paid_pool_available())
            .order_by(Lead.created_at.asc(), Lead.id.asc())
            .limit(want)
        )
    ).scalars().all()
    balance = await SqlAlchemyLeadsRepository(session).wallet_balance_cents(user_id)
    spent = 0
    n = 0
    for price in prices:
        spent += int(price or 0)
        if spent > balance:
            break
        n += 1
    return n


async def _push(session: AsyncSession, user_id: int, title: str, body: str) -> None:
    from app.services.push_service import send_push_to_user

    try:
        await send_push_to_user(session, user_id, title=title, body=body, url="/dashboard/work/leads?tab=today")
    except Exception:
        logger.exception("lead booking push failed for user %s", user_id)


async def _skip(session: AsyncSession, booking_id: int, reason: str) -> None:
    booking = await session.get(LeadBooking, booking_id)
    if booking is None or booking.last_skip_reason == reason:
        return  # notify once per reason, not on every run
    booking.last_skip_reason = reason
    user_id = booking.user_id
    await session.commit()
    await _push(session, user_id, "Booked leads on hold", reason)


async def fulfill_open_bookings(session: AsyncSession, *, day: date | None = None) -> dict[str, Any]:
    """Fill today's open bookings FIFO from the paid pool. Safe to run repeatedly."""
    from app.services.leads_service import LeadsService

    day = day or today_ist()

    # Past days' leftovers expire — a booking is only for its own day.
    stale = (
        await session.execute(
            select(LeadBooking).where(LeadBooking.booking_date < day, LeadBooking.status == BOOKING_OPEN)
        )
    ).scalars().all()
    for booking in stale:
        booking.status = BOOKING_EXPIRED
    if stale:
        await session.commit()

    booking_ids = (
        await session.execute(
            select(LeadBooking.id)
            .where(LeadBooking.booking_date == day, LeadBooking.status == BOOKING_OPEN)
            .order_by(LeadBooking.created_at.asc(), LeadBooking.id.asc())
        )
    ).scalars().all()

    result = {"bookings": len(booking_ids), "leads_assigned": 0, "members_filled": 0, "skipped": 0}
    service = LeadsService(
        repository=SqlAlchemyLeadsRepository(session), notifier=notify_topics, session=session
    )

    for booking_id in booking_ids:
        available = int(
            (await session.execute(select(func.count()).select_from(Lead).where(*_paid_pool_available()))).scalar_one()
        )
        if available <= 0:
            break
        # Lock this booking for the rest of its transaction: the 10-min job, a pool import and
        # the admin "fulfil now" button can run at once — only one of them fills it.
        booking = (
            await session.execute(
                select(LeadBooking)
                .where(LeadBooking.id == booking_id)
                .with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        user = await session.get(User, booking.user_id) if booking else None
        if booking is None or user is None or booking.status != BOOKING_OPEN:
            await session.rollback()  # release the lock
            continue
        remaining = booking.requested_count - booking.fulfilled_count
        if remaining <= 0:
            booking.status = BOOKING_FULFILLED
            await session.commit()
            continue

        if await uncovered_claimed_leads(session, user.id):
            result["skipped"] += 1
            await _skip(session, booking_id, SKIP_UNCOVERED)
            continue

        count = await _affordable_count(session, user.id, min(remaining, available))
        if count <= 0:
            result["skipped"] += 1
            await _skip(session, booking_id, SKIP_LOW_WALLET)
            continue

        actor = AuthUser(user_id=user.id, role=user.role, email=user.email or "")
        try:
            claimed, _ = await service.claim_lead_pool_batch(
                count=count, user=actor, source="booking", commit=False
            )
            # Claim + booking count commit together: a crash can't leave leads charged but the
            # booking still "open" (which would fill it again on the next run).
            booking.fulfilled_count += len(claimed)
            booking.last_skip_reason = None
            if booking.fulfilled_count >= booking.requested_count:
                booking.status = BOOKING_FULFILLED
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("lead booking %s fulfilment failed", booking_id)
            continue
        await notify_topics("leads", "wallet")
        result["leads_assigned"] += len(claimed)
        result["members_filled"] += 1
        await _push(
            session,
            user.id,
            "Your booked leads are here",
            f"{len(claimed)} lead(s) added to your Calling Board (Today).",
        )
    return result
