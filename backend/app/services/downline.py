"""Recursive downline resolution via ``User.upline_user_id`` (org tree)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User

_MAX_UPLINE_WALK = 64


async def is_user_in_downline_of(
    session: AsyncSession,
    member_user_id: int,
    leader_user_id: int,
) -> bool:
    """True if ``member_user_id`` is a strict descendant of ``leader_user_id`` in the upline tree."""
    if member_user_id == leader_user_id:
        return False
    current: Optional[int] = member_user_id
    for _ in range(_MAX_UPLINE_WALK):
        stmt = select(User.upline_user_id).where(User.id == current)
        parent = (await session.execute(stmt)).scalar_one_or_none()
        if parent is None:
            return False
        if parent == leader_user_id:
            return True
        current = parent
    return False


def lead_visible_to_leader_clause(leader_user_id: int):
    """Leads the leader may see: own + created by any descendant in the upline tree."""
    tree = (
        select(User.id)
        .where(User.upline_user_id == leader_user_id)
        .cte(name="downline_tree", recursive=True)
    )
    tree = tree.union_all(
        select(User.id).where(User.upline_user_id == tree.c.id),
    )
    return or_(
        Lead.created_by_user_id == leader_user_id,
        Lead.created_by_user_id.in_(select(tree.c.id)),
    )
