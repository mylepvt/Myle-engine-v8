from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class LeaderComponentScores(BaseModel):
    mission_completion: float = 0.0
    verification_rate: float = 0.0
    conversion_rate: float = 0.0
    zombie_lead_score: float = 100.0
    blocker_resolution: float = 0.0
    lead_activity: float = 0.0


class LeaderEffectivenessPublic(BaseModel):
    user_id: int
    name: str
    team_size: int
    weighted_score: float
    band: str
    components: LeaderComponentScores
    weakest_component: Optional[str] = None

    @field_validator("band")
    @classmethod
    def validate_band(cls, v: str) -> str:
        allowed = {"elite", "average", "critical"}
        if v not in allowed:
            raise ValueError(f"band must be one of {allowed}")
        return v


class LeaderEffectivenessResponse(BaseModel):
    leaders: list[LeaderEffectivenessPublic]
    total_leaders: int
    average_score: float
    band_distribution: dict[str, int]
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def format_datetime(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
