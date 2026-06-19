from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LandingInquiryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., max_length=200)
    phone: str = Field(..., min_length=8, max_length=20)
    institution: Optional[str] = Field(None, max_length=300)
    message: Optional[str] = Field(None, max_length=2000)


class LandingInquiryResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    institution: Optional[str] = None
    message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
