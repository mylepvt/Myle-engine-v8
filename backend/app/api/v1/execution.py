"""Execution enforcement — funnel, follow-up pressure, at-risk, leak map (vl2 Postgres)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.realtime_hub import notify_topics
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.schemas.execution_enforcement import (
    AtRiskLeadRow,
    DownlineExecutionStatsOut,
    FollowUpAttackRow,
    LeakMapOut,
    LeadControlManualReassignIn,
    LeadControlManualReassignOut,
    LeadControlOut,
    MemberExecutionStats,
    StaleRedistributeOut,
    TeamPersonalFunnelOut,
    TeamTodayStatsOut,
    WeakMemberRow,
)
from app.schemas.system_surface import SystemStubResponse
from app.services import execution_enforcement as enf

router = APIRouter()


def _require_team(user: AuthUser) -> None:
    if user.role != "team":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_leader(user: AuthUser) -> None:
    if user.role != "leader":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/personal-funnel", response_model=TeamPersonalFunnelOut)
async def execution_personal_funnel(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamPersonalFunnelOut:
    """Team: assigned-lead funnel counts (vl2 status + payment fields)."""
    _require_team(user)
    return await enf.team_personal_funnel(session, user.user_id)


@router.get("/team-today-stats", response_model=TeamTodayStatsOut)
async def execution_team_today_stats(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    today: Optional[str] = Query(default=None, description="Calendar day ISO (YYYY-MM-DD), IST"),
) -> TeamTodayStatsOut:
    """Team: legacy dashboard-style day stats (claimed/calls/enrolled)."""
    _require_team(user)
    day = today or enf.default_today_iso()
    return await enf.team_today_stats(session, user.user_id, day)


@router.get("/follow-up-attack", response_model=list[FollowUpAttackRow])
async def execution_follow_up_attack(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    today: Optional[str] = Query(
        default=None,
        description="Calendar day ISO (YYYY-MM-DD), IST; default: today IST",
    ),
    limit: int = Query(default=15, ge=1, le=100),
) -> list[FollowUpAttackRow]:
    """Team: open follow-ups due by end of `today` (IST), newest due first."""
    _require_team(user)
    day = today or enf.default_today_iso()
    return await enf.team_followup_attack_rows(session, user.user_id, day, limit=limit)


@router.get("/downline-stats", response_model=DownlineExecutionStatsOut)
async def execution_downline_stats(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    today: Optional[str] = Query(default=None),
    user_ids: Optional[str] = Query(
        default=None,
        description="Comma-separated assignee user ids; default: all users with role team",
    ),
) -> DownlineExecutionStatsOut:
    """Leader: per–team-member execution aggregates + bottleneck tags."""
    _require_leader(user)
    day = today or enf.default_today_iso()
    if user_ids and user_ids.strip():
        ids = [int(x.strip()) for x in user_ids.split(",") if x.strip().isdigit()]
    else:
        res = await session.execute(select(User.id).where(User.role == "team"))
        ids = [int(x) for x in res.scalars().all()]
    raw = await enf.downline_member_execution_stats(session, ids, day)
    stats: dict[str, MemberExecutionStats] = {}
    tags: dict[str, list[str]] = {}
    for uid, d in raw.items():
        stats[str(uid)] = MemberExecutionStats(
            total_active=d["total_active"],
            enrollments=d["enrollments"],
            proof_pend=d["proof_pend"],
            fu_due=d["fu_due"],
            conv_pct=d["conv_pct"],
            calls_today=d["calls_today"],
            fresh_leads_today=d["fresh_leads_today"],
            call_target=d["call_target"],
            call_gate_met=d["call_gate_met"],
        )
        tags[str(uid)] = enf.bottleneck_tags_for_member(d, calls_today=d["calls_today"])
    return DownlineExecutionStatsOut(stats=stats, bottleneck_tags=tags)


@router.get("/at-risk-leads", response_model=list[AtRiskLeadRow])
async def execution_at_risk(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stale_hours: int = Query(default=48, ge=1, le=720),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[AtRiskLeadRow]:
    """Admin: leads with ``updated_at`` older than ``stale_hours`` (working-set filters)."""
    _require_admin(user)
    return await enf.admin_at_risk_leads(session, stale_hours=stale_hours, limit=limit)


@router.get("/weak-members", response_model=list[WeakMemberRow])
async def execution_weak_members(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    today: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[WeakMemberRow]:
    """Admin: team + leader load vs enrollment + follow-up debt."""
    _require_admin(user)
    day = today or enf.default_today_iso()
    return await enf.admin_weak_members(session, day, limit=limit)


@router.get("/leak-map", response_model=LeakMapOut)
async def execution_leak_map(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeakMapOut:
    """Admin: status histogram + ordered funnel drop hints (vl2 status names)."""
    _require_admin(user)
    return await enf.admin_leak_map(session)


@router.post("/stale-redistribute", response_model=StaleRedistributeOut)
async def execution_stale_redistribute(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stale_hours: int = Query(default=48, ge=1, le=720),
    top_n: int = Query(default=10, ge=1, le=50),
    limit: int = Query(default=500, ge=1, le=500),
) -> StaleRedistributeOut:
    """Admin: auto-cycle completed-watch stale leads into the top-XP team pool."""
    _require_admin(user)
    return await enf.stale_redistribute(
        session, stale_hours=stale_hours, top_n=top_n, limit=limit
    )


@router.get("/lead-control", response_model=LeadControlOut)
async def execution_lead_control(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    stale_hours: int = Query(default=24, ge=1, le=720),
    queue_limit: int = Query(default=100, ge=1, le=250),
    history_limit: int = Query(default=80, ge=1, le=250),
    day2_limit: int = Query(default=24, ge=1, le=100),
) -> LeadControlOut:
    """Admin: manual reassignment queue + soft history + recent Day 2 review."""
    _require_admin(user)
    return await enf.admin_lead_control_snapshot(
        session,
        stale_hours=stale_hours,
        queue_limit=queue_limit,
        history_limit=history_limit,
        day2_limit=day2_limit,
    )


@router.post("/lead-control/reassign", response_model=LeadControlManualReassignOut)
async def execution_manual_reassign(
    body: LeadControlManualReassignIn,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadControlManualReassignOut:
    """Admin: manually reassign a queued archived completed-watch lead."""
    _require_admin(user)
    try:
        result = await enf.admin_manual_reassign_archived_completed_watch_lead(
            session,
            admin_user_id=user.user_id,
            lead_id=body.lead_id,
            to_user_id=body.to_user_id,
            reason=body.reason,
        )
    except ValueError as exc:
        detail = str(exc).strip() or "Unable to reassign lead"
        status_code = (
            http_status.HTTP_404_NOT_FOUND
            if detail == "Lead not found"
            else http_status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    await notify_topics("leads", "workboard", "team_tracking")
    return result


@router.get("/lead-ledger", response_model=SystemStubResponse)
async def execution_lead_ledger(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Recent wallet lines — lead-scoped billing hooks up via product rules + ledger notes."""
    _require_admin(user)
    q = await session.execute(
        select(WalletLedgerEntry).order_by(WalletLedgerEntry.created_at.desc()).limit(50)
    )
    rows = q.scalars().all()
    items = [
        {
            "title": f"Ledger #{e.id} · user {e.user_id}",
            "detail": f"₹{e.amount_cents / 100:,.2f} — {e.note or 'wallet line'}",
        }
        for e in rows
    ]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Per-user history also available via GET /api/v1/wallet/ledger; this is an admin-wide slice.",
    )
