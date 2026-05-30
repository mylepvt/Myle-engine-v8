"""Helpers to load a lead only if the current user may see it (same rules as list leads)."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.lead import Lead
from app.services.lead_scope import user_can_access_lead


async def require_visible_lead(session: AsyncSession, user: AuthUser, lead_id: int) -> Lead:
    lead = await session.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if lead.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    # Visibility follows assignment: assignee (or owner of an unassigned lead,
    # or a leader over the managing downline) may write notes/follow-ups. Once a
    # lead is reassigned away, the old owner loses this access.
    if not await user_can_access_lead(session, user, lead):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return lead
