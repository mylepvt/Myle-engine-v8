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


async def recursive_downline_user_ids(
    session: AsyncSession,
    leader_user_id: int,
) -> list[int]:
    """Strict descendants of ``leader_user_id`` in the upline tree."""
    tree = (
        select(User.id)
        .where(User.upline_user_id == leader_user_id)
        .cte(name="recursive_downline_tree", recursive=True)
    )
    tree = tree.union_all(
        select(User.id).where(User.upline_user_id == tree.c.id),
    )
    rows = await session.execute(select(tree.c.id))
    return [int(uid) for uid in rows.scalars().all()]


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


def lead_execution_visible_to_leader_clause(leader_user_id: int):
    """Execution ownership visibility: leader + assignees in downline tree."""
    tree = (
        select(User.id)
        .where(User.upline_user_id == leader_user_id)
        .cte(name="execution_downline_tree", recursive=True)
    )
    tree = tree.union_all(
        select(User.id).where(User.upline_user_id == tree.c.id),
    )
    return or_(
        Lead.assigned_to_user_id == leader_user_id,
        Lead.assigned_to_user_id.in_(select(tree.c.id)),
    )
