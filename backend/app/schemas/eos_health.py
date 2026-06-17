from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class EosHealthComponents(BaseModel):
    org_score: float = 0.0
    avg_leader_score: float = 0.0
    mission_completion: float = 0.0
    verification_rate: float = 0.0
    conversion_rate: float = 0.0
    zombie_pct: float = 0.0
    risk_score: float = 0.0
    campaign_success_pct: float = 0.0


class EosHealthResponse(BaseModel):
    health_score: float
    components: EosHealthComponents
    band: str
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
