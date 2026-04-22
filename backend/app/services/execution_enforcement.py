"""
Execution enforcement — ported from Myle-Dashboard ``execution_enforcement.py``.

Uses vl2 schema: ``Lead`` + ``FollowUp`` + ``User`` (async SQLAlchemy). Legacy SQLite
columns (``follow_up_date`` on leads, ``pipeline_entered_at``, ``stale_worker``,
``call_result``, ``total_points``) are mapped or omitted — see each function.

**Funnel semantics (vl2):** pre-video ≈ ``new_lead/contacted/invited/whatsapp_sent``;
video reached ≈ ``video_sent`` or beyond; paid ≈ approved payment / post-payment stage.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
import logging
from typing import Any, Optional

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.time_ist import IST, today_ist
from app.models.follow_up import FollowUp
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.user import User
from app.services.live_metrics import (
    fresh_call_counts_by_user,
    fresh_lead_counts_by_user,
    get_daily_call_target,
)
from app.services.user_hierarchy import nearest_leader_username_for_user_id
from app.schemas.execution_enforcement import (
    AtRiskLeadRow,
    LeakMapOut,
    MemberExecutionStats,
    StatusHistogramRow,
    StaleRedistributeOut,
    TeamTodayStatsOut,
    TeamPersonalFunnelOut,
    WeakMemberRow,
    FunnelDropRow,
    FollowUpAttackRow,
)

logger = logging.getLogger(__name__)

# Canonical pre-video stages in the FastAPI-led lifecycle.
PRE_VIDEO_STATUSES_VL2 = frozenset({"new", "new_lead", "contacted", "invited", "whatsapp_sent"})
_FUNNEL_EXCLUDE_TERMINAL = frozenset({"converted", "lost", "inactive"})
# Redistribution-specific terminal states that must not be reassigned.
_REDISTRIBUTION_TERMINAL_STATUSES = frozenset(
    {
        "paid",
        "mindset_lock",
        "day1",
        "day2",
        "day3",
        "interview",
        "track_selected",
        "seat_hold",
        "converted",
        "lost",
        "inactive",
    }
)
_ENROLLED_SIGNAL_STATUSES = frozenset(
    {
        "paid",
        "mindset_lock",
        "day1",
        "day2",
        "day3",
        "interview",
        "track_selected",
        "seat_hold",
        "converted",
    }
)
# ₹196 in paise/cents as stored (rupees × 100).
RUPEES_196_CENTS = 196 * 100


def _lead_last_activity_ts():
    """Best proxy for “stale” until ``updated_at`` exists on ``Lead``."""
    return func.coalesce(
        Lead.last_action_at,
        Lead.last_called_at,
        Lead.payment_proof_uploaded_at,
        Lead.whatsapp_sent_at,
        Lead.day3_completed_at,
        Lead.day2_completed_at,
        Lead.day1_completed_at,
        Lead.created_at,
    )


def _active_lead_filters():
    return and_(
        Lead.in_pool.is_(False),
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
        Lead.status.notin_(_FUNNEL_EXCLUDE_TERMINAL),
    )


def _redistribution_eligible_filters() -> ColumnElement[bool]:
    """Eligible leads for stale redistribution only."""
    return and_(
        Lead.in_pool.is_(False),
        Lead.deleted_at.is_(None),
        Lead.archived_at.is_(None),
        Lead.status.notin_(_REDISTRIBUTION_TERMINAL_STATUSES),
    )


def _pct(num: int, den: int) -> float:
    return round(100.0 * num / den, 1) if den else 0.0


def bottleneck_tags_for_member(
    stats: dict[str, Any] | None,
    calls_today: int,
) -> list[str]:
    """Pure helper — same thresholds as legacy."""
    if not stats:
        return []
    if int(stats.get("total_active") or 0) == 0:
        return ["No assigned leads"]
    tags: list[str] = []
    if int(stats.get("proof_pend") or 0) >= 2:
        tags.append("Proof stuck")
    if int(stats.get("fu_due") or 0) >= 3 or (
        int(stats.get("fu_due") or 0) >= 1
        and int(stats.get("enrollments") or 0) == 0
        and int(stats.get("total_active") or 0) >= 4
    ):
        tags.append("Follow-up slow")
    call_target = int(stats.get("call_target") or 0)
    fresh_leads_today = int(stats.get("fresh_leads_today") or 0)
    if call_target > 0 and fresh_leads_today > 0 and calls_today < call_target:
        tags.append("No activity" if calls_today == 0 else "Call gate short")
    elif int(stats.get("total_active") or 0) >= 2 and calls_today == 0:
        tags.append("No activity")
    if not tags:
        tags.append("On track")
    return tags


def _end_of_day_ist(day_iso: str) -> datetime:
    d = datetime.strptime(day_iso, "%Y-%m-%d").date()
    return datetime.combine(d, time(23, 59, 59), tzinfo=IST)


def _start_of_day_ist(day_iso: str) -> datetime:
    d = datetime.strptime(day_iso, "%Y-%m-%d").date()
    return datetime.combine(d, time(0, 0, 0), tzinfo=IST)


async def nearest_leader_username_for_assignee(
    session: AsyncSession,
    assignee_user_id: int | None,
) -> str | None:
    """Resolve the assignee's nearest leader from the org tree."""
    return await nearest_leader_username_for_user_id(session, assignee_user_id)


async def team_personal_funnel(session: AsyncSession, user_id: int) -> TeamPersonalFunnelOut:
    base = and_(Lead.assigned_to_user_id == user_id, _active_lead_filters())

    claimed = int(
        (
            await session.execute(select(func.count()).select_from(Lead).where(base))
        ).scalar_one()
        or 0
    )

    video = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Lead)
                .where(base, Lead.status.notin_(PRE_VIDEO_STATUSES_VL2))
            )
        ).scalar_one()
        or 0
    )

    proof_cond = and_(
        base,
        Lead.payment_proof_url.isnot(None),
        Lead.payment_proof_url != "",
        Lead.payment_status.in_(("pending", "proof_uploaded")),
    )
    proof = int(
        (await session.execute(select(func.count()).select_from(Lead).where(proof_cond))).scalar_one()
        or 0
    )

    paid_cond = and_(
        base,
        or_(
            Lead.payment_amount_cents >= RUPEES_196_CENTS,
            and_(Lead.status.in_(tuple(_ENROLLED_SIGNAL_STATUSES)), Lead.payment_status == "approved"),
        ),
    )
    paid = int(
        (await session.execute(select(func.count()).select_from(Lead).where(paid_cond))).scalar_one()
        or 0
    )

    return TeamPersonalFunnelOut(
        claimed=claimed,
        video_reached=video,
        proof_pending=proof,
        paid_196=paid,
        enrolled_total=paid,
        pct_video_vs_claimed=_pct(video, claimed),
        pct_proof_vs_video=_pct(proof, video),
        pct_enrolled_vs_video=_pct(paid, video),
        pct_enrolled_vs_claimed=_pct(paid, claimed),
    )


async def team_today_stats(
    session: AsyncSession,
    user_id: int,
    today_iso: str,
) -> TeamTodayStatsOut:
    """Legacy-like team day counters for dashboard cards."""
    day = datetime.strptime(today_iso, "%Y-%m-%d").date()
    start = _start_of_day_ist(today_iso)
    end = _end_of_day_ist(today_iso)
    base = and_(Lead.assigned_to_user_id == user_id, _active_lead_filters())

    fresh_leads_today = (await fresh_lead_counts_by_user(session, [user_id], day)).get(user_id, 0)
    calls_today = (await fresh_call_counts_by_user(session, [user_id], day)).get(user_id, 0)
    call_target = await get_daily_call_target(session)
    effective_call_target = call_target if fresh_leads_today > 0 else 0

    enrolled_today = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Lead)
                .where(
                    base,
                    or_(
                        and_(
                            Lead.payment_proof_uploaded_at.isnot(None),
                            Lead.payment_proof_uploaded_at >= start,
                            Lead.payment_proof_uploaded_at <= end,
                        ),
                        and_(
                            Lead.payment_amount_cents >= RUPEES_196_CENTS,
                            Lead.created_at >= start,
                            Lead.created_at <= end,
                        ),
                    ),
                )
            )
        ).scalar_one()
        or 0
    )

    return TeamTodayStatsOut(
        claimed_today=fresh_leads_today,
        fresh_leads_today=fresh_leads_today,
        calls_today=calls_today,
        call_target=effective_call_target,
        enrolled_today=enrolled_today,
    )


async def team_followup_attack_rows(
    session: AsyncSession,
    user_id: int,
    today_iso: str,
    *,
    limit: int = 15,
) -> list[FollowUpAttackRow]:
    """Open follow-ups due by end of `today_iso` (IST) for leads assigned to user."""
    end = _end_of_day_ist(today_iso)
    stmt = (
        select(Lead, FollowUp)
        .join(FollowUp, FollowUp.lead_id == Lead.id)
        .where(
            Lead.assigned_to_user_id == user_id,
            _active_lead_filters(),
            FollowUp.completed_at.is_(None),
            FollowUp.due_at.isnot(None),
            FollowUp.due_at <= end,
        )
        .order_by(FollowUp.due_at.asc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    out: list[FollowUpAttackRow] = []
    for lead, fu in rows:
        due_s = fu.due_at.date().isoformat() if fu.due_at else None
        out.append(
            FollowUpAttackRow(
                id=lead.id,
                name=lead.name,
                phone=lead.phone,
                follow_up_date=due_s,
                status=lead.status,
                call_result=lead.call_status,
            )
        )
    return out


async def downline_member_execution_stats(
    session: AsyncSession,
    user_ids: list[int],
    today_iso: str,
) -> dict[int, dict[str, Any]]:
    """Per assignee: totals, enrollments, proof queue, follow-up pressure."""
    if not user_ids:
        return {}
    day = datetime.strptime(today_iso, "%Y-%m-%d").date()
    end = _end_of_day_ist(today_iso)
    calls_today_map = await fresh_call_counts_by_user(session, user_ids, day)
    fresh_leads_today_map = await fresh_lead_counts_by_user(session, user_ids, day)
    daily_call_target = await get_daily_call_target(session)

    fu_open_due = exists(
        select(1).where(
            FollowUp.lead_id == Lead.id,
            FollowUp.completed_at.is_(None),
            FollowUp.due_at.isnot(None),
            FollowUp.due_at <= end,
        )
    )
    hot_call = Lead.call_status.in_(("callback_requested",))

    enrolled_expr = case(
        (
            or_(
                Lead.payment_amount_cents >= RUPEES_196_CENTS,
                and_(Lead.status.in_(tuple(_ENROLLED_SIGNAL_STATUSES)), Lead.payment_status == "approved"),
            ),
            1,
        ),
        else_=0,
    )
    proof_expr = case(
        (
            and_(
                Lead.payment_proof_url.isnot(None),
                Lead.payment_proof_url != "",
                Lead.payment_status.in_(("pending", "proof_uploaded")),
            ),
            1,
        ),
        else_=0,
    )
    fu_expr = case((or_(fu_open_due, hot_call), 1), else_=0)

    stmt = (
        select(
            Lead.assigned_to_user_id.label("uid"),
            func.count(Lead.id).label("total_active"),
            func.sum(enrolled_expr).label("enrollments"),
            func.sum(proof_expr).label("proof_pend"),
            func.sum(fu_expr).label("fu_due"),
        )
        .where(
            Lead.assigned_to_user_id.in_(user_ids),
            _active_lead_filters(),
        )
        .group_by(Lead.assigned_to_user_id)
    )
    result = await session.execute(stmt)
    out: dict[int, dict[str, Any]] = {}
    for r in result.mappings().all():
        uid = int(r["uid"])
        tot = int(r["total_active"] or 0)
        enr = int(r["enrollments"] or 0)
        calls_today = int(calls_today_map.get(uid, 0))
        fresh_leads_today = int(fresh_leads_today_map.get(uid, 0))
        call_target = daily_call_target if fresh_leads_today > 0 else 0
        out[uid] = {
            "total_active": tot,
            "enrollments": enr,
            "proof_pend": int(r["proof_pend"] or 0),
            "fu_due": int(r["fu_due"] or 0),
            "conv_pct": round(100.0 * enr / tot, 1) if tot else 0.0,
            "calls_today": calls_today,
            "fresh_leads_today": fresh_leads_today,
            "call_target": call_target,
            "call_gate_met": call_target == 0 or calls_today >= call_target,
        }
    return out


async def admin_at_risk_leads(
    session: AsyncSession,
    *,
    stale_hours: int = 48,
    limit: int = 500,
) -> list[AtRiskLeadRow]:
    """Leads stale on last-activity timestamp (see ``_lead_last_activity_ts``)."""
    sh = max(1, int(stale_hours))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=sh)
    act = _lead_last_activity_ts()
    stmt = (
        select(
            Lead.id,
            Lead.name,
            Lead.phone,
            Lead.status,
            act.label("activity_at"),
            Lead.payment_status,
            Lead.payment_proof_url,
            User.id,
            User.username,
            User.fbo_id,
        )
        .select_from(Lead)
        .outerjoin(User, User.id == Lead.assigned_to_user_id)
        .where(
            _active_lead_filters(),
            act <= cutoff,
        )
        .order_by(act.asc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    now = datetime.now(timezone.utc)
    out: list[AtRiskLeadRow] = []
    for row in rows:
        lid, name, phone, status, activity_at, pay_st, proof_url, assignee_user_id, uname, assignee_fbo = row
        days_stuck = 0.0
        if activity_at:
            uat = activity_at
            if uat.tzinfo is None:
                uat = uat.replace(tzinfo=timezone.utc)
            days_stuck = max(0.0, (now - uat).total_seconds() / 86400.0)
        ps = (pay_st or "").strip().lower()
        path = (proof_url or "").strip()
        if path and ps == "pending":
            proof_state = "pending"
        elif ps == "approved":
            proof_state = "approved"
        elif ps == "rejected":
            proof_state = "rejected"
        elif not path:
            proof_state = "none"
        else:
            proof_state = "uploaded"
        ax = (uname or assignee_fbo or "").strip()
        leader = await nearest_leader_username_for_assignee(session, assignee_user_id)
        out.append(
            AtRiskLeadRow(
                id=int(lid),
                name=name,
                phone=phone,
                status=status,
                updated_at=activity_at,
                assignee=(uname or assignee_fbo),
                team_member_display=ax,
                leader_username=leader,
                days_stuck=round(days_stuck, 1),
                proof_state=proof_state,
            )
        )
    out.sort(key=lambda x: -x.days_stuck)
    return out


def _lead_last_activity_value(lead: Lead) -> datetime:
    """Python-side mirror of `_lead_last_activity_ts()` for runtime guards."""
    return (
        lead.last_action_at
        or lead.last_called_at
        or lead.payment_proof_uploaded_at
        or lead.whatsapp_sent_at
        or lead.day3_completed_at
        or lead.day2_completed_at
        or lead.day1_completed_at
        or lead.created_at
        or datetime.now(timezone.utc)
    )


async def _get_workers(session: AsyncSession) -> list[tuple[int, str]]:
    rows = await session.execute(
        select(User.id, User.username, User.fbo_id)
        .where(
            User.role == "team",
            User.access_blocked.is_(False),
            User.registration_status == "approved",
        )
        .order_by(User.id.asc())
    )
    workers: list[tuple[int, str]] = []
    for uid, uname, fbo in rows.all():
        label = (uname or fbo or f"user_{int(uid)}")
        workers.append((int(uid), label))
    return workers


async def _get_worker_load(
    session: AsyncSession,
    worker_ids: list[int],
) -> dict[int, int]:
    if not worker_ids:
        return {}
    rows = await session.execute(
        select(
            Lead.assigned_to_user_id.label("uid"),
            func.count(Lead.id).label("cnt"),
        )
        .where(
            Lead.assigned_to_user_id.in_(worker_ids),
            _active_lead_filters(),
        )
        .group_by(Lead.assigned_to_user_id)
    )
    load_map = {int(r.uid): int(r.cnt or 0) for r in rows.mappings().all()}
    for wid in worker_ids:
        load_map.setdefault(wid, 0)
    return load_map


async def _get_stale_leads(
    session: AsyncSession,
    *,
    cutoff: datetime,
    limit: int,
) -> list[Lead]:
    activity_ts = _lead_last_activity_ts()
    rows = await session.execute(
        select(Lead)
        .where(
            _redistribution_eligible_filters(),
            activity_ts <= cutoff,
        )
        .order_by(activity_ts.asc(), Lead.id.asc())
        .limit(limit)
    )
    return rows.scalars().all()


def _assign_leads(
    *,
    leads: list[Lead],
    workers: list[int],
    load_map: dict[int, int],
    cutoff: datetime,
) -> tuple[int, int, list[list[Any]]]:
    assigned = 0
    skipped = 0
    assignments: list[list[Any]] = []
    worker_cursor = 0

    for lead in leads:
        # Guard: skip if lead appears recently active at runtime.
        if _lead_last_activity_value(lead) > cutoff:
            skipped += 1
            continue

        from_uid = int(lead.assigned_to_user_id) if lead.assigned_to_user_id is not None else None
        to_uid = workers[worker_cursor % len(workers)]
        worker_cursor += 1

        # Guard: no-op reassignment should not be counted.
        if from_uid == to_uid:
            skipped += 1
            continue

        # Ownership safety: only assignee can change.
        lead.assigned_to_user_id = to_uid

        assigned += 1
        load_map[to_uid] = load_map.get(to_uid, 0) + 1
        if from_uid is not None and from_uid in load_map and load_map[from_uid] > 0:
            load_map[from_uid] -= 1
        assignments.append([int(lead.id), from_uid, to_uid])
    return assigned, skipped, assignments


async def stale_redistribute(
    session: AsyncSession,
    *,
    stale_hours: int = 48,
    top_n: int = 5,
    limit: int = 50,
) -> StaleRedistributeOut:
    """
    Reassign stale active leads to least-loaded active team members.

    Uses existing ``leads.assigned_to_user_id`` to avoid schema changes.
    """
    sh = max(1, int(stale_hours))
    n_workers = max(1, int(top_n))
    max_rows = max(1, int(limit))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=sh)

    workers = await _get_workers(session)
    if not workers:
        return StaleRedistributeOut(
            implemented=True,
            message="No eligible team members found for redistribution.",
        )

    worker_ids = [wid for wid, _label in workers]
    worker_meta = {wid: label for wid, label in workers}
    load_map = await _get_worker_load(session, worker_ids)
    sorted_workers = sorted(worker_ids, key=lambda wid: (load_map[wid], wid))[:n_workers]
    if not sorted_workers:
        return StaleRedistributeOut(
            implemented=True,
            message="No workers selected for redistribution.",
        )

    stale_leads = await _get_stale_leads(
        session,
        cutoff=cutoff,
        limit=max_rows,
    )
    if not stale_leads:
        return StaleRedistributeOut(
            implemented=True,
            message="No stale leads matched the given threshold.",
            worker_counts={worker_meta[wid]: load_map[wid] for wid in sorted_workers},
        )

    assigned, skipped, assignments = _assign_leads(
        leads=stale_leads,
        workers=sorted_workers,
        load_map=load_map,
        cutoff=cutoff,
    )

    await session.commit()
    logger.info(
        "stale_redistribute assigned=%s skipped=%s workers=%s stale_hours=%s limit=%s",
        assigned,
        skipped,
        len(sorted_workers),
        sh,
        max_rows,
    )
    return StaleRedistributeOut(
        implemented=True,
        message=f"Redistributed {assigned} stale lead(s); skipped {skipped}.",
        assigned=assigned,
        skipped=skipped,
        assignments=assignments,
        worker_counts={worker_meta[wid]: int(load_map.get(wid, 0)) for wid in sorted_workers},
    )


async def admin_weak_members(
    session: AsyncSession,
    today_iso: str,
    *,
    limit: int = 200,
) -> list[WeakMemberRow]:
    end = _end_of_day_ist(today_iso)
    fu_open_due = exists(
        select(1).where(
            FollowUp.lead_id == Lead.id,
            FollowUp.completed_at.is_(None),
            FollowUp.due_at.isnot(None),
            FollowUp.due_at <= end,
        )
    )
    hot_call = Lead.call_status.in_(("callback_requested",))
    fu_expr = case((or_(fu_open_due, hot_call), 1), else_=0)
    enrolled_expr = case(
        (
            or_(
                Lead.payment_amount_cents >= RUPEES_196_CENTS,
                and_(Lead.status.in_(tuple(_ENROLLED_SIGNAL_STATUSES)), Lead.payment_status == "approved"),
            ),
            1,
        ),
        else_=0,
    )

    stmt = (
        select(
            User.username,
            User.role,
            func.count(Lead.id).label("total_leads"),
            func.sum(enrolled_expr).label("enrollments"),
            func.sum(fu_expr).label("fu_pending"),
        )
        .select_from(User)
        .outerjoin(
            Lead,
            and_(
                Lead.assigned_to_user_id == User.id,
                _active_lead_filters(),
            ),
        )
        .where(User.role.in_(("team", "leader")))
        .group_by(User.id, User.username, User.role)
        .order_by(User.username.asc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    out: list[WeakMemberRow] = []
    for r in rows:
        un, role, tot, enr, fu = r
        tot_i = int(tot or 0)
        enr_i = int(enr or 0)
        fu_i = int(fu or 0)
        conv = round(100.0 * enr_i / tot_i, 1) if tot_i else 0.0
        out.append(
            WeakMemberRow(
                username=un,
                role=role,
                total_leads=tot_i,
                enrollments=enr_i,
                fu_pending=fu_i,
                conv_pct=conv,
            )
        )
    out.sort(key=lambda x: (x.conv_pct, -x.fu_pending))
    return out


async def admin_leak_map(session: AsyncSession) -> LeakMapOut:
    stmt = (
        select(Lead.status, func.count())
        .where(
            Lead.in_pool.is_(False),
            Lead.deleted_at.is_(None),
        )
        .group_by(Lead.status)
        .order_by(func.count().desc())
    )
    rows = (await session.execute(stmt)).all()
    hist_list = [StatusHistogramRow(status=s, count=int(c or 0)) for s, c in rows]
    m = {x.status: x.count for x in hist_list}
    funnel_order = [
        "new_lead",
        "contacted",
        "invited",
        "whatsapp_sent",
        "video_sent",
        "video_watched",
        "paid",
        "mindset_lock",
        "day1",
        "day2",
        "day3",
        "converted",
    ]
    drops: list[FunnelDropRow] = []
    prev: tuple[str, int] | None = None
    for st in funnel_order:
        c = int(m.get(st, 0))
        if prev is not None:
            drops.append(
                FunnelDropRow(
                    from_status=prev[0],
                    to_status=st,
                    from_count=prev[1],
                    to_count=c,
                    drop_pct=_pct(prev[1] - c, prev[1]),
                )
            )
        prev = (st, c)
    return LeakMapOut(histogram=hist_list, funnel_drops=drops)


def default_today_iso() -> str:
    return today_ist().isoformat()
