from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class DailyReportSubmit(BaseModel):
    report_date: date
    total_calling: int = Field(default=0, ge=0)
    remarks: Optional[str] = Field(default=None, max_length=8000)
    calls_picked: int = Field(default=0, ge=0)
    wrong_numbers: int = Field(default=0, ge=0)
    enrollments_done: int = Field(default=0, ge=0)
    pending_enroll: int = Field(default=0, ge=0)
    underage: int = Field(default=0, ge=0)
    plan_2cc: int = Field(default=0, ge=0)
    seat_holdings: int = Field(default=0, ge=0)
    leads_educated: int = Field(default=0, ge=0)
    pdf_covered: int = Field(default=0, ge=0)
    videos_sent_actual: int = Field(default=0, ge=0)
    calls_made_actual: int = Field(default=0, ge=0)
    payments_actual: int = Field(default=0, ge=0)


class DailyReportPublic(BaseModel):
    id: int
    user_id: int
    report_date: date
    total_calling: int
    remarks: Optional[str] = None
    calls_picked: int = 0
    wrong_numbers: int = 0
    enrollments_done: int = 0
    pending_enroll: int = 0
    underage: int = 0
    plan_2cc: int = 0
    seat_holdings: int = 0
    leads_educated: int = 0
    pdf_covered: int = 0
    videos_sent_actual: int = 0
    calls_made_actual: int = 0
    payments_actual: int = 0
    submitted_at: datetime
    system_verified: bool
    points_awarded: int = Field(
        default=0,
        description="Points added for this submit (report = +20 legacy)",
    )
