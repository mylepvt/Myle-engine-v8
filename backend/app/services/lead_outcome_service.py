from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.lead_outcome import (
    OUTCOME_ACTIVE,
    OUTCOME_CHOICES,
    OUTCOME_CONVERTED,
    OUTCOME_DEAD,
    OUTCOME_RECYCLE,
    DROP_REASON_CHOICES,
    outcome_for_status,
    is_terminal_outcome,
)
from app.models.lead import Lead


def sync_outcome_from_status(
    lead: Lead,
    now: datetime | None = None,
) -> bool:
    """Sync the ``outcome`` field to match the current status. Returns True if changed."""
    ts = now or datetime.now(timezone.utc)
    expected = outcome_for_status(lead.status)
    if lead.outcome != expected:
        lead.outcome = expected
        lead.outcome_changed_at = ts
        return True
    return False


def apply_dead_side_effects(
    lead: Lead,
    drop_reason: str,
    drop_notes: str | None,
    user_id: int,
    now: datetime | None = None,
) -> None:
    """When a lead moves to DEAD, capture the reason + who recorded it."""
    ts = now or datetime.now(timezone.utc)
    lead.drop_reason = drop_reason
    lead.drop_notes = drop_notes
    lead.drop_recorded_by_user_id = user_id
    lead.dropped_at = ts
    lead.archived_at = ts
    lead.in_pool = False


def clear_dead_state(lead: Lead) -> None:
    """When a dead lead is revived, clear the drop tracking."""
    lead.drop_reason = None
    lead.drop_notes = None
    lead.drop_recorded_by_user_id = None
    lead.dropped_at = None


def apply_recycle_side_effects(
    lead: Lead,
    recycle_reason: str | None,
    now: datetime | None = None,
) -> None:
    ts = now or datetime.now(timezone.utc)
    lead.recycle_reason = recycle_reason
    lead.outcome_changed_at = ts


# ── Admin report queries ─────────────────────────────────────────────


async def get_outcome_summary(session: AsyncSession) -> dict[str, Any]:
    """Return count of leads per outcome bucket."""
    rows = (
        await session.execute(
            select(Lead.outcome, func.count(Lead.id))
            .where(Lead.deleted_at.is_(None))
            .group_by(Lead.outcome)
        )
    ).all()
    summary: dict[str, int] = {}
    for outcome, count in rows:
        outcome_key = outcome or "unknown"
        summary[outcome_key] = summary.get(outcome_key, 0) + count
    # Ensure all outcomes are present
    for oc in OUTCOME_CHOICES:
        summary.setdefault(oc, 0)
    grand_total = sum(summary.values())
    return {
        "total": grand_total,
        "outcomes": summary,
        "active_pct": round(summary.get(OUTCOME_ACTIVE, 0) / max(grand_total, 1) * 100, 1),
        "converted_pct": round(summary.get(OUTCOME_CONVERTED, 0) / max(grand_total, 1) * 100, 1),
        "dead_pct": round(summary.get(OUTCOME_DEAD, 0) / max(grand_total, 1) * 100, 1),
        "recycle_pct": round(summary.get(OUTCOME_RECYCLE, 0) / max(grand_total, 1) * 100, 1),
    }


async def get_dead_reason_report(session: AsyncSession) -> list[dict[str, Any]]:
    """Per-member breakdown of why leads went DEAD."""
    from app.models.user import User

    rows = (
        await session.execute(
            select(
                Lead.assigned_to_user_id,
                User.fbo_id,
                User.name,
                Lead.drop_reason,
                func.count(Lead.id).label("count"),
            )
            .join(User, User.id == Lead.assigned_to_user_id, isouter=True)
            .where(
                Lead.outcome == OUTCOME_DEAD,
                Lead.deleted_at.is_(None),
                Lead.drop_reason.is_not(None),
            )
            .group_by(Lead.assigned_to_user_id, User.fbo_id, User.name, Lead.drop_reason)
            .order_by(func.count(Lead.id).desc())
        )
    ).all()

    # Group by member
    member_map: dict[int, dict[str, Any]] = {}
    for row in rows:
        uid = row.assigned_to_user_id or 0
        if uid not in member_map:
            member_map[uid] = {
                "user_id": uid,
                "name": row.name or row.fbo_id or "Unknown",
                "total_dead": 0,
                "reasons": {},
            }
        member_map[uid]["reasons"][row.drop_reason] = row.count
        member_map[uid]["total_dead"] += row.count

    return sorted(member_map.values(), key=lambda m: m["total_dead"], reverse=True)


async def get_zombie_leads(
    session: AsyncSession,
    inactive_days: int = 7,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Leads in ACTIVE outcome but untouched for N days."""
    from app.models.user import User

    cutoff = datetime.now(timezone.utc) - timedelta(days=inactive_days)
    rows = (
        await session.execute(
            select(Lead)
            .where(
                Lead.outcome == OUTCOME_ACTIVE,
                Lead.deleted_at.is_(None),
                Lead.archived_at.is_(None),
                Lead.last_action_at.is_(None),
                Lead.created_at < cutoff,
            )
            .order_by(Lead.created_at.asc())
            .limit(limit)
        )
    ).scalars().all()

    # Also check leads with last_action_at before cutoff
    rows2 = (
        await session.execute(
            select(Lead)
            .where(
                Lead.outcome == OUTCOME_ACTIVE,
                Lead.deleted_at.is_(None),
                Lead.archived_at.is_(None),
                Lead.last_action_at.is_not(None),
                Lead.last_action_at < cutoff,
            )
            .order_by(Lead.last_action_at.asc())
            .limit(limit)
        )
    ).scalars().all()

    seen = {r.id for r in rows}
    for r in rows2:
        if r.id not in seen:
            rows.append(r)
            seen.add(r.id)

    result: list[dict[str, Any]] = []
    for lead in rows[:limit]:
        assignee = (
            await session.get(User, lead.assigned_to_user_id)
            if lead.assigned_to_user_id
            else None
        )
        result.append({
            "id": lead.id,
            "name": lead.name,
            "status": lead.status,
            "assigned_to_name": assignee.name if assignee else None,
            "assigned_to_user_id": lead.assigned_to_user_id,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "last_action_at": lead.last_action_at.isoformat() if lead.last_action_at else None,
            "days_inactive": (
                (datetime.now(timezone.utc) - (lead.last_action_at or lead.created_at)).days
                if lead.last_action_at or lead.created_at
                else None
            ),
        })
    return result


async def get_recycle_leads(
    session: AsyncSession,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Leads in RECYCLE outcome, eligible for re-engagement."""
    from app.models.user import User

    rows = (
        await session.execute(
            select(Lead)
            .where(
                Lead.outcome == OUTCOME_RECYCLE,
                Lead.deleted_at.is_(None),
            )
            .order_by(Lead.outcome_changed_at.desc().nullslast())
            .limit(limit)
        )
    ).scalars().all()

    result: list[dict[str, Any]] = []
    for lead in rows:
        assignee = (
            await session.get(User, lead.assigned_to_user_id)
            if lead.assigned_to_user_id
            else None
        )
        result.append({
            "id": lead.id,
            "name": lead.name,
            "status": lead.status,
            "recycle_reason": lead.recycle_reason,
            "assigned_to_name": assignee.name if assignee else None,
            "assigned_to_user_id": lead.assigned_to_user_id,
            "outcome_changed_at": lead.outcome_changed_at.isoformat() if lead.outcome_changed_at else None,
            "days_in_recycle": (
                (datetime.now(timezone.utc) - lead.outcome_changed_at).days
                if lead.outcome_changed_at
                else None
            ),
        })
    return result
