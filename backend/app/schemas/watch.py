from __future__ import annotations

from datetime import datetime
from typing import Optional

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
    youtube_url: Optional[str] = None
    video_id: Optional[str] = None
    watch_complete: bool = False
    submission_enabled: bool = False
    submission: Optional[BatchWatchSubmissionPublic] = None
