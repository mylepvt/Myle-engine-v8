from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class CampaignMissionCreate(BaseModel):
    item_key: str
    label: str
    target: int = 1
    verification_required: bool = False
    evidence_instructions: Optional[str] = None
    sort_order: int = 0


class CampaignMissionPublic(BaseModel):
    id: int
    item_key: str
    label: str
    target: int
    verification_required: bool
    evidence_instructions: Optional[str] = None
    sort_order: int


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    webinar_date: Optional[date] = None
    expiry_date: Optional[date] = None
    missions: list[CampaignMissionCreate]


class CampaignPublic(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    webinar_date: Optional[date] = None
    expiry_date: Optional[date] = None
    is_active: bool
    missions: list[CampaignMissionPublic]
    enrollment_count: int = 0
    created_at: str

    @field_validator("created_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class CampaignEnrollRequest(BaseModel):
    user_ids: list[int]


class CampaignMemberProgressPublic(BaseModel):
    id: int
    campaign_mission_id: int
    label: str
    target: int
    achieved: int
    evidence: Optional[str] = None
    status: str
    verified_by_user_id: Optional[int] = None
    verified_at: Optional[str] = None
    rejection_reason: Optional[str] = None


class CampaignProgressSubmit(BaseModel):
    progress_id: int
    achieved: int
    evidence: Optional[str] = None


class CampaignVerifyRequest(BaseModel):
    progress_id: int
    approved: bool
    rejection_reason: Optional[str] = None


class CampaignEnrollmentPublic(BaseModel):
    id: int
    campaign_id: int
    user_id: int
    user_name: Optional[str] = None
    status: str
    enrolled_at: str
    completed_at: Optional[str] = None
    progress: list[CampaignMemberProgressPublic]

    @field_validator("enrolled_at", "completed_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class CampaignMetrics(BaseModel):
    attendance: int
    implementation: int
    implementation_pct: float
    success: int
    success_pct: float
    total_enrolled: int
    total_missions: int
