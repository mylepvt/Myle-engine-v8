"""Execution enforcement — funnel, follow-up pressure, at-risk, leak map (vl2 Postgres)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.realtime_hub import notify_topics
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.schemas.leads import LeadPublic
from app.services.lead_owner import lead_owner_clause
from app.services.lead_payloads import build_lead_public_payloads
from app.schemas.execution_enforcement import (
    AtRiskLeadRow,
    Day2ReviewOut,
    DownlineExecutionStatsOut,
    FollowUpAttackRow,
    LeadControlBulkReassignIn,
    LeadControlBulkReassignOut,
    LeakMapOut,
    LeadControlManualReassignIn,
    LeadControlManualReassignOut,
    LeadControlOut,
    LeadControlRevertIn,
    LeadControlRevertOut,
    LosSnapshotOut,
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


@router.get("/handed-off-leads", response_model=list[LeadPublic])
async def execution_handed_off_leads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=200),
) -> list[LeadPublic]:
    """Team: read-only progress of own leads now handed off to a leader.

    Owner sticky (`owner_user_id`), but execution moved to the upline leader
    (`assigned_to_user_id` points elsewhere). Returns each lead with its current
    stage + process_tracking so the original team member can follow progress.
    """
    _require_team(user)
    condition = and_(
        lead_owner_clause(user.user_id),
        Lead.assigned_to_user_id.is_not(None),
        Lead.assigned_to_user_id != user.user_id,
        Lead.in_pool.is_(False),
        Lead.deleted_at.is_(None),
    )
    repo = SqlAlchemyLeadsRepository(session)
    rows = await repo.list_leads(condition=condition, limit=limit, offset=0)
    return await build_lead_public_payloads(session, rows)


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
            flp_min_billings=d["flp_min_billings"],
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


@router.get("/los-snapshot", response_model=LosSnapshotOut)
async def execution_los_snapshot(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    today: Optional[str] = Query(default=None),
    activations_target: int = Query(default=5, ge=1, le=100),
) -> LosSnapshotOut:
    """Leader OS: team execution snapshot — calls, activations, billing, leader score."""
    _require_leader(user)
    day = today or enf.default_today_iso()
    return await enf.leader_los_snapshot(
        session,
        leader_user_id=user.user_id,
        today_iso=day,
        activations_target=activations_target,
    )


@router.get("/stage-counts")
async def execution_stage_counts(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    hours: Optional[float] = Query(default=None, description="Rolling window hours instead of IST-today"),
    range: Optional[str] = Query(default=None, description="'month' for current calendar month window"),
) -> dict:
    """Admin: active lead counts per pipeline stage + today's movements."""
    _require_admin(user)
    return await enf.admin_stage_counts(session, hours=hours, range=range)


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
    stale_hours: int = Query(default=24, ge=1, le=720),
    top_n: int = Query(default=10, ge=1, le=50),
    limit: int = Query(default=500, ge=1, le=500),
) -> StaleRedistributeOut:
    """Admin: redistribute leads that have already spent `stale_hours` inside archived watch queue."""
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
) -> LeadControlOut:
    """Admin: reassignment queue + soft history for completed-watch archived leads."""
    _require_admin(user)
    return await enf.admin_lead_control_snapshot(
        session,
        stale_hours=stale_hours,
        queue_limit=queue_limit,
        history_limit=history_limit,
    )


@router.get("/day2-review", response_model=Day2ReviewOut)
async def execution_day2_review(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=40, ge=1, le=150),
) -> Day2ReviewOut:
    """Admin: recent Day 2 notes, voice notes, and videos in a dedicated review surface."""
    _require_admin(user)
    return await enf.admin_day2_review_snapshot(session, limit=limit)


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


@router.post("/lead-control/reassign-bulk", response_model=LeadControlBulkReassignOut)
async def execution_bulk_manual_reassign(
    body: LeadControlBulkReassignIn,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadControlBulkReassignOut:
    """Admin: manually bulk reassign queued archived completed-watch stale leads."""
    _require_admin(user)
    try:
        result = await enf.admin_manual_bulk_reassign_archived_completed_watch_leads(
            session,
            admin_user_id=user.user_id,
            lead_ids=body.lead_ids,
            to_user_id=body.to_user_id,
            reason=body.reason,
        )
    except ValueError as exc:
        detail = str(exc).strip() or "Unable to bulk reassign leads"
        status_code = (
            http_status.HTTP_404_NOT_FOUND
            if detail == "Lead not found"
            else http_status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    await notify_topics("leads", "workboard", "team_tracking")
    return result


@router.post("/lead-control/revert", response_model=LeadControlRevertOut)
async def execution_revert_reassignment(
    body: LeadControlRevertIn,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LeadControlRevertOut:
    """Admin: revert a reassignment, restoring the lead to its previous assignee."""
    _require_admin(user)
    try:
        result = await enf.admin_revert_lead_reassignment(
            session,
            admin_user_id=user.user_id,
            lead_id=body.lead_id,
            activity_id=body.activity_id,
            reason=body.reason,
        )
    except ValueError as exc:
        detail = str(exc).strip() or "Unable to revert reassignment"
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
