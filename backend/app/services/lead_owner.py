"""Sticky lead ownership helpers.

`owner_user_id` is the permanent owner:
- direct create -> creator
- personal import -> importer
- pool claim -> claimer

`assigned_to_user_id` remains the mutable execution assignee.
"""

from __future__ import annotations

from sqlalchemy import and_, or_

from app.models.lead import Lead


def resolved_owner_user_id(lead: Lead) -> int:
    """Backwards-compatible owner lookup for rows created before owner backfill."""
    return int(lead.owner_user_id or lead.created_by_user_id)


def lead_owner_clause(user_id: int):
    """SQL clause for leads permanently owned by `user_id`."""
    return or_(
        Lead.owner_user_id == user_id,
        and_(
            Lead.owner_user_id.is_(None),
            Lead.created_by_user_id == user_id,
        ),
    )


def lead_personal_scope_clause(user_id: int):
    """Personal visibility that follows assignment.

    A user sees a lead if they are the current assignee, OR they own a lead
    that has not been assigned to anyone else. Once a lead is reassigned away
    from its owner (``assigned_to_user_id`` points elsewhere), the old owner no
    longer sees it — visibility moves with the lead to the new assignee.

    Note: ``owner_user_id`` itself is never changed (monetization / paid-claim
    record stays sticky); only what each user *sees* follows the assignment.
    """
    return or_(
        Lead.assigned_to_user_id == user_id,
        and_(
            lead_owner_clause(user_id),
            Lead.assigned_to_user_id.is_(None),
        ),
    )


def lead_owner_or_assignee_clause(user_id: int):
    """Ownership-aware access for personal queues and follow-up surfaces.

    Visibility follows assignment: assignee, or owner of an unassigned lead.
    """
    return lead_personal_scope_clause(user_id)
