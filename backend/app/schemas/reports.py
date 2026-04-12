from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class DailyReportSubmit(BaseModel):
    report_date: date
    total_calling: int = Field(default=0, ge=0)
    remarks: Optional[str] = Field(default=None, max_length=8000)


class DailyReportPublic(BaseModel):
    id: int
    user_id: int
    report_date: date
    total_calling: int
    remarks: Optional[str] = None
    submitted_at: datetime
    system_verified: bool
    points_awarded: int = Field(
        default=0,
        description="Points added for this submit (report = +20 legacy)",
    )
