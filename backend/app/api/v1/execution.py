"""Execution enforcement — funnel, follow-up pressure, at-risk, leak map (vl2 Postgres)."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.user import User
from app.schemas.execution_enforcement import (
    AtRiskLeadRow,
    DownlineExecutionStatsOut,
    FollowUpAttackRow,
    LeakMapOut,
    MemberExecutionStats,
    StaleRedistributeOut,
    TeamPersonalFunnelOut,
    WeakMemberRow,
)
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
        )
        tags[str(uid)] = enf.bottleneck_tags_for_member(d, calls_today=0)
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
    top_n: int = Query(default=5, ge=1, le=50),
    limit: int = Query(default=50, ge=1, le=500),
) -> StaleRedistributeOut:
    """Admin: legacy auto-assign stale_worker — not enabled until schema supports it."""
    _require_admin(user)
    return await enf.stale_redistribute(
        session, stale_hours=stale_hours, top_n=top_n, limit=limit
    )


@router.get("/lead-ledger", response_model=dict)
async def execution_lead_ledger(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> dict:
    """Placeholder — wallet + ledger tie-in later."""
    _require_admin(user)
    return {
        "items": [],
        "total": 0,
        "note": "Lead ledger aggregation is still out of scope; use GET /wallet/ledger.",
    }
