"""Pydantic schemas for member lead-capture links + the public capture form."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CategoryOption(BaseModel):
    slug: str
    label: str
    message: str


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
    poster_url: str | None = None
    views: int = 0
    # Member's custom message if set, else null (UI shows the category default as placeholder).
    custom_message: str | None = None
    # Effective share-message (custom or category default); client substitutes {link}.
    share_message: str


class CaptureLinkListResponse(BaseModel):
    links: list[CaptureLinkPublic]


class CaptureMessageUpdate(BaseModel):
    # Empty/whitespace clears the override → falls back to the category default.
    message: str | None = Field(default=None, max_length=2000)


class CaptureLeadRow(BaseModel):
    """One captured response — Google-Forms-style list under the link."""

    id: int
    name: str
    phone: str | None = None
    city: str | None = None
    age: int | None = None
    status: str
    created_at: datetime


class CaptureLeadsResponse(BaseModel):
    leads: list[CaptureLeadRow]


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
    # Hidden honeypot — real users leave it empty; bots fill it and get silently dropped.
    company: str | None = Field(default=None, max_length=200)


class PublicSubmitResponse(BaseModel):
    ok: bool = True
