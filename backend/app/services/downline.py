"""Org-tree SQL visibility clauses plus lightweight hierarchy wrappers."""

from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.services.lead_owner import lead_owner_clause
from app.services.user_hierarchy import (
    is_user_in_downline_of as hierarchy_is_user_in_downline_of,
    recursive_downline_user_ids as hierarchy_recursive_downline_user_ids,
)

_POST_PAYMENT_FALLBACK_STATUSES = ("paid", "mindset_lock")


async def is_user_in_downline_of(
    session: AsyncSession,
    member_user_id: int,
    leader_user_id: int,
) -> bool:
    """True if ``member_user_id`` is a strict descendant of ``leader_user_id`` in the upline tree."""
    return await hierarchy_is_user_in_downline_of(session, member_user_id, leader_user_id)


async def recursive_downline_user_ids(
    session: AsyncSession,
    leader_user_id: int,
) -> list[int]:
    """Strict descendants of ``leader_user_id`` in the upline tree."""
    return await hierarchy_recursive_downline_user_ids(session, leader_user_id)


def lead_visible_to_leader_clause(leader_user_id: int):
    """Leads the leader may see: own + owned by any descendant in the upline tree."""
    tree = (
        select(User.id)
        .where(User.upline_user_id == leader_user_id)
        .cte(name="downline_tree", recursive=True)
    )
    tree = tree.union_all(
        select(User.id).where(User.upline_user_id == tree.c.id),
    )
    owner_tree = or_(
        Lead.owner_user_id.in_(select(tree.c.id)),
        and_(
            Lead.owner_user_id.is_(None),
            Lead.created_by_user_id.in_(select(tree.c.id)),
        ),
    )
    return or_(
        lead_owner_clause(leader_user_id),
        owner_tree,
    )


def lead_management_visible_to_leader_clause(leader_user_id: int):
    """Leads a leader may manage from All Leads: own/downline owner or assignee scope."""
    tree = (
        select(User.id)
        .where(User.upline_user_id == leader_user_id)
        .cte(name="management_downline_tree", recursive=True)
    )
    tree = tree.union_all(
        select(User.id).where(User.upline_user_id == tree.c.id),
    )
    owner_tree = or_(
        Lead.owner_user_id.in_(select(tree.c.id)),
        and_(
            Lead.owner_user_id.is_(None),
            Lead.created_by_user_id.in_(select(tree.c.id)),
        ),
    )
    return or_(
        lead_owner_clause(leader_user_id),
        Lead.assigned_to_user_id == leader_user_id,
        owner_tree,
        Lead.assigned_to_user_id.in_(select(tree.c.id)),
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
    owner_scope = or_(
        lead_owner_clause(leader_user_id),
        Lead.owner_user_id.in_(select(tree.c.id)),
        and_(
            Lead.owner_user_id.is_(None),
            Lead.created_by_user_id.in_(select(tree.c.id)),
        ),
    )
    return or_(
        Lead.assigned_to_user_id == leader_user_id,
        Lead.assigned_to_user_id.in_(select(tree.c.id)),
        and_(
            Lead.assigned_to_user_id.is_(None),
            Lead.status.in_(_POST_PAYMENT_FALLBACK_STATUSES),
            owner_scope,
        ),
    )
