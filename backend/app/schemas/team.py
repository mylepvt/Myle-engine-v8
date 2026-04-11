from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.constants.roles import Role


class TeamMemberPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fbo_id: str
    username: Optional[str] = None
    email: str
    role: str
    created_at: datetime


class TeamMemberListResponse(BaseModel):
    items: list[TeamMemberPublic]
    total: int
    limit: int
    offset: int


class TeamMemberCreate(BaseModel):
    """Admin-only: create a user with password login (bcrypt stored server-side)."""

    fbo_id: str = Field(min_length=1, max_length=64, description="Globally unique login / directory id")
    username: Optional[str] = Field(
        default=None,
        max_length=128,
        description="Optional display name; may duplicate across users",
    )
    # Str (not EmailStr) so ``@myle.local`` and internal domains work without email-validator.
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    role: Role


class TeamMyTeamResponse(BaseModel):
    """V1: only the authenticated user until org / reporting lines exist."""

    items: list[TeamMemberPublic]
    total: int


class TeamEnrollmentListResponse(BaseModel):
    """Stub for future INR 196 enrollment workflow — always empty in V1."""

    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0
    limit: int
    offset: int
