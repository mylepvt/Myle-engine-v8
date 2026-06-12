from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class RiskSignal(BaseModel):
    type: str
    label: str
    value: float
    detail: str


class MemberRiskScore(BaseModel):
    user_id: int
    name: str
    score: float
    band: str
    signals: list[RiskSignal]


class LeaderRiskScore(BaseModel):
    user_id: int
    name: str
    score: float
    band: str
    team_size: int
    signals: list[RiskSignal]


class OrgRiskStats(BaseModel):
    total_members: int
    total_leaders: int
    low_risk: int
    medium_risk: int
    high_risk: int
    critical_risk: int
    avg_member_score: float = 0.0
    band_pct_low: float = 0.0
    band_pct_medium: float = 0.0
    band_pct_high: float = 0.0
    band_pct_critical: float = 0.0


class PredictiveRiskResponse(BaseModel):
    member_risks: list[MemberRiskScore]
    leader_risks: list[LeaderRiskScore]
    org_stats: OrgRiskStats
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
