from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EnrollmentLinkCreate(BaseModel):
    viewer_name: Optional[str] = Field(default=None, max_length=120)
    viewer_phone: Optional[str] = Field(default=None, max_length=32)
    video_source: str = Field(min_length=1, max_length=600)
    title: Optional[str] = Field(default=None, max_length=200)
    window_seconds: Optional[int] = Field(default=None, ge=60, le=24 * 3600)
    max_views: Optional[int] = Field(default=None, ge=1, le=20)


class EnrollmentLinkPublic(BaseModel):
    token: str
    viewer_name: Optional[str] = None
    title: Optional[str] = None
    view_count: int
    max_views: int
    window_seconds: int
    device_locked: bool
    opened_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    creation_expires_at: Optional[datetime] = None
    created_at: datetime


class EnrollmentWatchData(BaseModel):
    token: str
    title: str
    watermark_label: str
    access_granted: bool
    stream_url: Optional[str] = None
    window_seconds: int
    expires_at: Optional[datetime] = None
    dead: bool = False
    dead_reason: Optional[str] = None


class EnrollmentOpenRequest(BaseModel):
    fingerprint: str = Field(min_length=4, max_length=200)


class EnrollmentEventResponse(BaseModel):
    ok: bool
