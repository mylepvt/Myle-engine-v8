"""Notice board (announcements) API shapes."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message: str
    created_by: str
    pin: bool
    created_at: datetime


class NoticeBoardResponse(BaseModel):
    """Compatible with ``ShellStubPage`` / ``SystemStubResponse`` (items + total + optional note)."""

    items: list[AnnouncementOut]
    total: int
    note: Optional[str] = None


class AnnouncementCreate(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    pin: bool = False
