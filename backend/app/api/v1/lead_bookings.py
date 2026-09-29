"""Lead bookings — members book tomorrow's pool leads; admin sees demand and can fill now."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import today_ist
from app.models.lead_booking import BOOKING_CANCELLED, LeadBooking
from app.schemas.lead_booking import (
    LeadBookingAdminRow,
    LeadBookingDayResponse,
    LeadBookingFulfillResponse,
    LeadBookingPublic,
    LeadBookingRequest,
    MyLeadBookingsResponse,
)
from app.services.lead_booking_service import (
    BOOKING_ROLES,
    MAX_BOOKING_COUNT,
    cancel_booking,
    fulfill_open_bookings,
    get_booking,
    list_bookings_for_day,
    upsert_booking,
)

router = APIRouter()


def _public(b: LeadBooking | None) -> LeadBookingPublic | None:
    if b is None or b.status == BOOKING_CANCELLED:
        return None
    return LeadBookingPublic(
        booking_date=b.booking_date,
        requested_count=b.requested_count,
        fulfilled_count=b.fulfilled_count,
        status=b.status,
        last_skip_reason=b.last_skip_reason,
    )


def _require_booker(user: AuthUser) -> None:
    if user.role not in BOOKING_ROLES:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only team and leaders book leads")


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")


async def _mine(session: AsyncSession, user_id: int) -> MyLeadBookingsResponse:
    today = today_ist()
    return MyLeadBookingsResponse(
        today=_public(await get_booking(session, user_id, today)),
        tomorrow=_public(await get_booking(session, user_id, today + timedelta(days=1))),
        max_count=MAX_BOOKING_COUNT,
    )


@router.get("/me", response_model=MyLeadBookingsResponse)
async def my_bookings(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MyLeadBookingsResponse:
    return await _mine(session, user.user_id)


@router.put("/me", response_model=MyLeadBookingsResponse)
async def book_for_tomorrow(
    body: LeadBookingRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MyLeadBookingsResponse:
    """Create or change the booking for tomorrow (IST)."""
    _require_booker(user)
    await upsert_booking(session, user.user_id, body.count)
    return await _mine(session, user.user_id)


@router.delete("/me", response_model=MyLeadBookingsResponse)
async def cancel_tomorrow(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MyLeadBookingsResponse:
    _require_booker(user)
    await cancel_booking(session, user.user_id)
    return await _mine(session, user.user_id)


@router.get("", response_model=LeadBookingDayResponse)
async def bookings_for_day(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    day: Optional[date] = Query(default=None, description="IST day (default: today)"),
) -> LeadBookingDayResponse:
    """Admin: who booked how many leads for a day — load at least this many into the pool."""
    _require_admin(user)
    day = day or today_ist()
    rows = await list_bookings_for_day(session, day)
    items = [
        LeadBookingAdminRow(
            user_id=u.id,
            member_name=u.name or u.username or f"Member #{u.id}",
            booking_date=b.booking_date,
            requested_count=b.requested_count,
            fulfilled_count=b.fulfilled_count,
            status=b.status,
            last_skip_reason=b.last_skip_reason,
        )
        for b, u in rows
    ]
    return LeadBookingDayResponse(
        booking_date=day,
        total_requested=sum(i.requested_count for i in items),
        total_fulfilled=sum(i.fulfilled_count for i in items),
        items=items,
    )


@router.post("/fulfill", response_model=LeadBookingFulfillResponse)
async def fulfill_now(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadBookingFulfillResponse:
    """Admin: fill today's bookings from the pool right now."""
    _require_admin(user)
    return LeadBookingFulfillResponse(**await fulfill_open_bookings(session))
