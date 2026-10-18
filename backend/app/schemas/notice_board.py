"""Notice board (announcements) API shapes."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted_by_me: bool


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message: str
    created_by: str
    pin: bool
    created_at: datetime
    reactions: list[ReactionSummary] = []
    # Voice notice (null for text-only notices).
    audio_url: Optional[str] = None
    audio_duration_sec: Optional[int] = None
    played_by_me: bool = False
    reply_count: int = 0
    # Admin only: how many members played it, out of how many active members.
    played_count: Optional[int] = None
    audience_count: Optional[int] = None


class NoticeBoardResponse(BaseModel):
    """Compatible with ``ShellStubPage`` / ``SystemStubResponse`` (items + total + optional note)."""

    items: list[AnnouncementOut]
    total: int
    note: Optional[str] = None


class AnnouncementCreate(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    pin: bool = False


class ReactionToggle(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


class PlayEvent(BaseModel):
    completed: bool = False


class ListenerRow(BaseModel):
    user_id: int
    name: str
    role: str
    fbo_id: Optional[str] = None
    first_played_at: Optional[datetime] = None
    last_played_at: Optional[datetime] = None
    play_count: int = 0
    completed: bool = False


class ListenersResponse(BaseModel):
    announcement_id: int
    audience_count: int
    played: list[ListenerRow]
    not_played: list[ListenerRow]


class ReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class ReplyOut(BaseModel):
    id: int
    announcement_id: int
    user_id: int
    author: str
    role: str
    body: str
    created_at: datetime
    mine: bool = False
    can_delete: bool = False


class RepliesResponse(BaseModel):
    items: list[ReplyOut]
    total: int
