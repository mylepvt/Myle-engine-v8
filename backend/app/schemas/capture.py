"""Pydantic schemas for member lead-capture links + the public capture form."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CategoryOption(BaseModel):
    slug: str
    label: str


class CaptureLinkCreate(BaseModel):
    category: str = Field(..., max_length=50)


class CaptureLinkPublic(BaseModel):
    id: int
    token: str
    category: str
    category_label: str
    active: bool
    leads_count: int
    created_at: datetime


class CaptureLinkListResponse(BaseModel):
    links: list[CaptureLinkPublic]


# ── Public (no-auth) form ─────────────────────────────────────────────────────

class PublicLinkInfo(BaseModel):
    """What the public form page needs to render — no owner PII beyond display name."""

    owner_name: str
    category: str
    category_label: str


class PublicLeadSubmit(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=4, max_length=20)
    city: str | None = Field(default=None, max_length=100)
    age: int | None = Field(default=None, ge=1, le=120)


class PublicSubmitResponse(BaseModel):
    ok: bool = True
