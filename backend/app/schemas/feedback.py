from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FeedbackSubmit(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


class FeedbackPublic(BaseModel):
    id: int
    user_id: int
    member_name: str
    member_role: str
    message: str
    created_at: datetime
