from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class LeadBookingPublic(BaseModel):
    booking_date: date
    requested_count: int
    fulfilled_count: int
    status: str
    last_skip_reason: Optional[str] = None


class MyLeadBookingsResponse(BaseModel):
    today: Optional[LeadBookingPublic] = None
    tomorrow: Optional[LeadBookingPublic] = None
    max_count: int


class LeadBookingRequest(BaseModel):
    count: int = Field(ge=1, le=50)


class LeadBookingAdminRow(LeadBookingPublic):
    user_id: int
    member_name: str


class LeadBookingDayResponse(BaseModel):
    booking_date: date
    total_requested: int
    total_fulfilled: int
    items: list[LeadBookingAdminRow]


class LeadBookingFulfillResponse(BaseModel):
    bookings: int
    leads_assigned: int
    members_filled: int
    skipped: int
