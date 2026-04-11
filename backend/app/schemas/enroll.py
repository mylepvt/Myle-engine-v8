from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EnrollShareLinkCreate(BaseModel):
    lead_id: int
    youtube_url: Optional[str] = Field(default=None, max_length=500)
    title: Optional[str] = Field(default=None, max_length=200)


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
    share_url: str = ""

    @model_validator(mode="after")
    def set_share_url(self) -> "EnrollShareLinkPublic":
        self.share_url = f"/watch/{self.token}"
        return self


class EnrollShareLinkListResponse(BaseModel):
    items: list[EnrollShareLinkPublic]
    total: int


class WatchPageData(BaseModel):
    """Public data for the watch page — no auth required."""

    token: str
    title: str
    youtube_url: Optional[str]
    lead_name: str  # first name only for privacy
    view_count: int
