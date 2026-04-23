from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class TeamTrackingMemberSummary(BaseModel):
    user_id: int
    member_name: str
    member_username: Optional[str] = None
    member_email: str
    member_phone: Optional[str] = None
    member_fbo_id: str
    member_role: str
    upline_name: Optional[str] = None
    upline_fbo_id: Optional[str] = None
    leader_user_id: Optional[int] = None
    leader_name: Optional[str] = None
    presence_status: str = "offline"
    last_seen_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    login_count: int = 0
    calls_count: int = 0
    leads_added_count: int = 0
    followups_done_count: int = 0
    consistency_score: int = 0
    consistency_band: str = "low"
    insights: list[str] = Field(default_factory=list)


class TeamTrackingOverviewResponse(BaseModel):
    items: list[TeamTrackingMemberSummary] = Field(default_factory=list)
    total: int = 0
    scope_total_members: int = 0
    online_count: int = 0
    idle_count: int = 0
    offline_count: int = 0
    average_score: float = 0
    date: str
    timezone: str = "Asia/Kolkata"
    note: Optional[str] = None


class TeamTrackingTrendPoint(BaseModel):
    date: str
    login_count: int = 0
    calls_count: int = 0
    leads_added_count: int = 0
    followups_done_count: int = 0
    consistency_score: int = 0
    consistency_band: str = "low"


class TeamTrackingActivityItem(BaseModel):
    action: str
    occurred_at: datetime
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    meta: Optional[dict[str, Any]] = None


class TeamTrackingDetailResponse(BaseModel):
    member: TeamTrackingMemberSummary
    trend: list[TeamTrackingTrendPoint] = Field(default_factory=list)
    recent_activity: list[TeamTrackingActivityItem] = Field(default_factory=list)
    date: str
    timezone: str = "Asia/Kolkata"

