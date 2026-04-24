from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EnrollShareLinkCreate(BaseModel):
    lead_id: int


class EnrollShareLinkPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    lead_id: int
    created_by_user_id: int
    youtube_url: Optional[str]
    title: Optional[str]
    view_count: int
    first_viewed_at: Optional[datetime]
    last_viewed_at: Optional[datetime]
    status_synced: bool
    created_at: datetime
    expires_at: datetime
    share_url: str = ""
    is_expired: bool = False

    @model_validator(mode="after")
    def set_share_url(self) -> "EnrollShareLinkPublic":
        expiry = self.expires_at.replace(tzinfo=timezone.utc) if self.expires_at.tzinfo is None else self.expires_at.astimezone(timezone.utc)
        self.expires_at = expiry
        self.share_url = f"/watch/{self.token}"
        self.is_expired = expiry <= datetime.now(timezone.utc)
        return self


class EnrollShareLinkListResponse(BaseModel):
    items: list[EnrollShareLinkPublic]
    total: int


class EnrollmentVideoSendDelivery(BaseModel):
    ok: bool
    channel: str
    manual_share_url: Optional[str] = None
    message_preview: Optional[str] = None
    http_status: Optional[int] = None
    body_preview: Optional[str] = None
    error: Optional[str] = None
    detail: Optional[str] = None


class EnrollmentVideoSendResponse(BaseModel):
    link: EnrollShareLinkPublic
    delivery: EnrollmentVideoSendDelivery


class WatchPageData(BaseModel):
    """Public data for the watch page — no auth required."""

    token: str
    title: str
    lead_name: str  # first name only for privacy
    masked_phone: str
    expires_at: datetime
    access_granted: bool
    stream_url: Optional[str] = None
    watch_started: bool = False
    watch_completed: bool = False
    social_proof_count: Optional[int] = None
    total_seats: Optional[int] = None
    seats_left: Optional[int] = None
    trust_note: Optional[str] = None


class WatchUnlockRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=32)


class WatchEventResponse(BaseModel):
    ok: bool = True
    watch_started: bool = False
    watch_completed: bool = False
