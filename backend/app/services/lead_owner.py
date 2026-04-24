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


def lead_owner_or_assignee_clause(user_id: int):
    """Ownership-aware access for personal queues and follow-up surfaces."""
    return or_(
        Lead.assigned_to_user_id == user_id,
        lead_owner_clause(user_id),
    )
