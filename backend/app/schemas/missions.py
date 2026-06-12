from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


MISSION_BLOCKER_REASONS = {
    "fear": "Fear",
    "no_prospects": "No Prospects",
    "no_time": "No Time",
    "technical_issue": "Technical Issue",
    "didnt_understand": "Didn't Understand",
    "other": "Other",
}


class MissionTemplateItem(BaseModel):
    key: str
    label: str
    target: int = Field(default=1, ge=0)
    unit: str = "count"
    evidence_required: bool = False


class MissionTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="team", max_length=20)
    items: list[MissionTemplateItem] = Field(min_length=1, max_length=20)


class MissionTemplatePublic(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    role: str
    items: list[dict[str, Any]]
    is_active: bool
    created_by_user_id: Optional[int] = None
    created_at: datetime


class DailyMissionItemPublic(BaseModel):
    key: str
    label: str
    target: int
    achieved: int = 0
    done: bool = False
    evidence: Optional[str] = None
    evidence_file: Optional[str] = None


class DailyMissionPublic(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    user_id: int
    mission_date: date
    items: dict[str, Any]
    completion_pct: float
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    created_at: datetime


class MissionTickRequest(BaseModel):
    item_key: str = Field(max_length=64)
    achieved: int = Field(default=0, ge=0)
    evidence: Optional[str] = Field(default=None, max_length=5000)
    evidence_file: Optional[str] = Field(default=None, max_length=500)


class MissionBlockerRequest(BaseModel):
    reason: str = Field(max_length=32)
    notes: Optional[str] = Field(default=None, max_length=2000)


class MissionBlockerPublic(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    daily_mission_id: int
    reason: str
    notes: Optional[str] = None
    created_at: datetime


class AdminMissionSummary(BaseModel):
    total_members: int
    assigned_today: int
    completed: int
    pending: int
    incomplete: int
    completion_rate_pct: float
    leader_breakdown: list[dict[str, Any]]
    blocker_summary: list[dict[str, Any]]
