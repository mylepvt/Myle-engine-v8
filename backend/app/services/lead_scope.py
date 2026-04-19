"""Reusable visibility rules for ``Lead`` rows (admin vs leader tree vs team)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.lead import Lead
from app.services.downline import (
    is_user_in_downline_of,
    lead_execution_visible_to_leader_clause,
)


def lead_visibility_where(user: AuthUser) -> Optional[Any]:
    """None = no extra filter (admin).

    Leader: own leads plus leads created by users under them (``User.upline_user_id`` tree).

    Team: only leads they created.
    """
    if user.role == "admin":
        return None
    # Leaders see only their own leads (not downline team leads).
    return Lead.created_by_user_id == user.user_id


def lead_execution_visibility_where(user: AuthUser) -> Optional[Any]:
    """Execution scope uses assignment ownership, not creator ownership."""
    if user.role == "admin":
        return None
    if user.role == "leader":
        return lead_execution_visible_to_leader_clause(user.user_id)
    return Lead.assigned_to_user_id == user.user_id


async def user_can_access_lead(session: AsyncSession, user: AuthUser, lead: Lead) -> bool:
    """Single-lead gate aligned with list/workboard visibility (plus assignee read)."""
    if user.role == "admin":
        return True
    if lead.created_by_user_id == user.user_id:
        return True
    if lead.assigned_to_user_id == user.user_id:
        return True
    if user.role == "leader":
        return await is_user_in_downline_of(session, lead.created_by_user_id, user.user_id)
    return False


async def user_can_mutate_lead(session: AsyncSession, user: AuthUser, lead: Lead) -> bool:
    """PATCH/delete and similar — admin, owner, or leader over downline-created leads."""
    if user.role == "admin":
        return True
    if lead.created_by_user_id == user.user_id:
        return True
    if user.role == "leader":
        return await is_user_in_downline_of(session, lead.created_by_user_id, user.user_id)
    return False
