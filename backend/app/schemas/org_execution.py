from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class OrgComponentScores(BaseModel):
    mission_completion: float = 0.0
    verification: float = 0.0
    lead_activity: float = 0.0
    zombie_leads: float = 0.0


class OrganizationScoreResponse(BaseModel):
    overall_score: float
    components: OrgComponentScores
    total_members: int
    total_leads: int
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def format_datetime(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
