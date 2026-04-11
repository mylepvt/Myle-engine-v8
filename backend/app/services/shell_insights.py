"""Decision-engine + analytics snapshots built from live data — thin, testable queries."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.lead import Lead
from app.schemas.system_surface import SystemStubResponse
from app.services.lead_scope import lead_visibility_where

_STALE_DAYS = 14


def _scoped_pipeline_predicates(user: AuthUser):
    """Active pipeline leads (not archived, not deleted, not in pool)."""
    parts = [
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
    ]
    vis = lead_visibility_where(user)
    if vis is not None:
        parts.append(vis)
    return parts


async def build_decision_engine_snapshot(session: AsyncSession, user: AuthUser) -> SystemStubResponse:
    """Surface actionable signals — not a full rules engine (that stays small and explicit)."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_STALE_DAYS)
    items: list[dict] = []

    stale_q = select(func.count()).select_from(Lead).where(
        *_scoped_pipeline_predicates(user),
        Lead.status == "new",
        Lead.created_at < cutoff,
    )
    stale = int((await session.execute(stale_q)).scalar_one())
    if stale > 0:
        items.append(
            {
                "kind": "stale_new_leads",
                "severity": "warning",
                "count": stale,
                "title": "Stale “new” leads",
                "detail": f"{stale} lead(s) still in “new” after {_STALE_DAYS}+ days.",
                "href": "work/leads",
            }
        )

    pool_q = select(func.count()).select_from(Lead).where(
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(True),
    )
    if user.role != "admin":
        pool_q = pool_q.where(Lead.created_by_user_id == user.user_id)
    in_pool = int((await session.execute(pool_q)).scalar_one())
    if user.role == "admin" and in_pool > 0:
        items.append(
            {
                "kind": "lead_pool_depth",
                "severity": "info",
                "count": in_pool,
                "title": "Leads in shared pool",
                "detail": "Review pool depth and assignment fairness.",
                "href": "work/lead-pool-admin",
            }
        )

    note = (
        "Signals refresh on each request — add a persisted rule engine later without changing the API shape."
        if items
        else "No risk signals right now — pipeline looks clear for this scope."
    )
    return SystemStubResponse(items=items, total=len(items), note=note)


async def build_activity_log_snapshot(session: AsyncSession, user: AuthUser) -> SystemStubResponse:
    """Recent lead creations as a stand-in until audit events exist."""
    vis = lead_visibility_where(user)
    q = (
        select(Lead.id, Lead.name, Lead.status, Lead.created_at)
        .where(Lead.archived_at.is_(None), Lead.deleted_at.is_(None))
        .order_by(Lead.created_at.desc())
        .limit(20)
    )
    if vis is not None:
        q = q.where(vis)
    rows = (await session.execute(q)).all()
    items = [
        {
            "type": "lead_created",
            "lead_id": rid,
            "name": name,
            "status": status,
            "at": created.isoformat() if created else None,
        }
        for rid, name, status, created in rows
    ]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Recent leads in your scope — full audit trail can replace this list later.",
    )


async def build_status_funnel_report(session: AsyncSession, user: AuthUser) -> SystemStubResponse:
    """Group active leads by status — useful “Day 2 style” funnel without a separate Day2 table yet."""
    q = select(Lead.status, func.count()).where(*_scoped_pipeline_predicates(user)).group_by(Lead.status)
    rows = (await session.execute(q)).all()
    items = [{"status": st, "count": int(c)} for st, c in rows]
    items.sort(key=lambda x: (-x["count"], x["status"]))
    total = sum(x["count"] for x in items)
    return SystemStubResponse(
        items=items,
        total=total,
        note="Counts by lead status (scoped) — extend with Day 2 test rows when modeled.",
    )
