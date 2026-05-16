from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class BatchWatchSubmissionPublic(BaseModel):
    notes_url: Optional[str] = None
    voice_note_url: Optional[str] = None
    video_url: Optional[str] = None
    notes_text: Optional[str] = None
    submitted_at: Optional[datetime] = None


class BatchWatchPageData(BaseModel):
    token: str
    slot: str
    version: int
    day_number: int
    slot_label: str
    title: str
    subtitle: str
    lead_name: str
    access_open: bool = True
    opens_at: Optional[datetime] = None
    gate_message: Optional[str] = None
    youtube_url: Optional[str] = None
    video_id: Optional[str] = None
    watch_complete: bool = False
    day2_evaluation_ready: bool = False
    submission_enabled: bool = False
    submission: Optional[BatchWatchSubmissionPublic] = None


class Day6LivePageData(BaseModel):
    lead_name: str
    slot: str
    state: Literal["upcoming", "waiting", "live", "ended"]
    video_url: Optional[str] = None
    waiting_starts_at: str
    live_starts_at: str
    live_ends_at: str
    viewer_count: int
