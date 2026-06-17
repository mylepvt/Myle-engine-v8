from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class TimelineEvent(BaseModel):
    type: str
    label: str
    timestamp: str
    actor: str
    detail: str = ""

    @field_validator("timestamp", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class LeadTimelineResponse(BaseModel):
    lead_id: int
    lead_name: str
    owner: str = ""
    assigned_to: str = ""
    outcome: str = ""
    events: list[TimelineEvent]
