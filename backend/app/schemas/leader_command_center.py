from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class FiresSummary(BaseModel):
    pending_verifications: int = 0
    members_at_risk: int = 0
    zombie_leads: int = 0
    campaign_failures: int = 0
    blockers_waiting: int = 0
    expired_campaigns: int = 0
    campaigns_running: int = 0


class TeamHealthSummary(BaseModel):
    mission_completion_pct: float = 0.0
    verification_pct: float = 0.0
    conversion_pct: float = 0.0
    zombie_score: float = 100.0
    blocker_resolution_pct: float = 0.0
    leader_score: float = 0.0
    leader_band: str = "unknown"


class ActionItem(BaseModel):
    member_id: int
    member_name: str
    issue: str
    detail: str
    severity: str  # critical / warning / info
    action_label: str = ""
    action_type: str = ""  # call / verify / review / message / follow_up
    action_ref: str = ""


class LeaderCommandCenterResponse(BaseModel):
    fires: FiresSummary
    team_health: TeamHealthSummary
    actions: list[ActionItem]
    team_size: int
    computed_at: str

    @field_validator("computed_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)
