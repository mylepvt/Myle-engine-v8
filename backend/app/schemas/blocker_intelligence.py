from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class BlockerBreakdown(BaseModel):
    reason: str
    label: str
    count: int
    pct: float


class BlockerIntelligence(BaseModel):
    current_summary: list[BlockerBreakdown]
    total_current: int
    previous_summary: list[BlockerBreakdown]
    total_previous: int
    biggest_blocker: str
    biggest_blocker_label: str
    biggest_blocker_pct: float
    suggestion: str
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
