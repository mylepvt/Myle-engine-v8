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
from app.core.auth_cookies import display_name_from_user
from app.models.activity_log import ActivityLog
from app.models.batch_day_submission import BatchDaySubmission
from app.models.follow_up import FollowUp
from app.models.call_event import CallEvent
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.models.user import User
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.live_metrics import (
    fresh_call_counts_by_user,
    fresh_lead_counts_by_user,
    get_daily_call_target,
)
from app.services.user_hierarchy import nearest_leader_username_for_user_id
from app.schemas.execution_enforcement import (
    AtRiskLeadRow,
    LeakMapOut,
    LeadControlAssignableUser,
    LeadControlDay2SubmissionRow,
    LeadControlHistoryRow,
    LeadControlHistorySummaryRow,
    LeadControlManualReassignOut,
    LeadControlOut,
    LeadControlQueueLead,
    MemberExecutionStats,
    StatusHistogramRow,
    StaleRedistributeOut,
    TeamTodayStatsOut,
    TeamPersonalFunnelOut,
    WeakMemberRow,
    FunnelDropRow,
    FollowUpAttackRow,
)
from app.services.push_service import send_push_to_user

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
_WATCH_PIPELINE_STATUSES = frozenset({"video_sent", "video_watched"})
# ₹196 in paise/cents as stored (rupees × 100).
RUPEES_196_CENTS = 196 * 100
_WATCH_ARCHIVE_BUCKET = "completed_watch_archived_leads"
_STALE_WATCH_BUCKET = "archived_completed_watch_stale_leads"
_DEFAULT_MAX_ACTIVE_LEADS_PER_WORKER = 50
_DEFAULT_WATCH_ARCHIVE_AFTER_HOURS = 24
_AUTO_REASSIGNMENT_ACTION = "lead.stale_watch_reassigned"
_MANUAL_REASSIGNMENT_ACTION = "lead.manual_watch_reassigned"
_REASSIGNMENT_HISTORY_ACTIONS = (_AUTO_REASSIGNMENT_ACTION, _MANUAL_REASSIGNMENT_ACTION)


def _user_label(user: User | None, user_id: int | None = None) -> str:
    if user is not None:
        return display_name_from_user(user) or user.fbo_id or f"User #{int(user.id)}"
    if user_id is None:
        return "Unassigned"
    return f"User #{int(user_id)}"


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _preview_text(value: str | None, *, limit: int = 160) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


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
        Lead.archived_at.is_not(None),
        Lead.status.notin_(_REDISTRIBUTION_TERMINAL_STATUSES),
    )


def _completed_watch_exists() -> ColumnElement[bool]:
    return exists(
        select(1).where(
            EnrollShareLink.lead_id == Lead.id,
            EnrollShareLink.status_synced.is_(True),
        )
    )


def _completed_watch_anchor_ts():
    latest_watch_ts = (
        select(
            func.max(
                func.coalesce(
                    EnrollShareLink.last_viewed_at,
                    EnrollShareLink.first_viewed_at,
                    EnrollShareLink.created_at,
                )
            )
        )
        .where(
            EnrollShareLink.lead_id == Lead.id,
            EnrollShareLink.status_synced.is_(True),
        )
        .scalar_subquery()
    )
    return func.coalesce(
        Lead.last_action_at,
        latest_watch_ts,
        Lead.created_at,
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
    value = (
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
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _ensure_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _get_workers(session: AsyncSession) -> list[tuple[int, str]]:
    rows = await session.execute(
        select(User.id, User.username, User.fbo_id)
        .where(
            User.role == "team",
            User.access_blocked.is_(False),
            User.registration_status == "approved",
            User.removed_at.is_(None),
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


async def _get_top_xp_workers(
    session: AsyncSession,
    *,
    top_n: int,
) -> list[tuple[int, str]]:
    rows = await session.execute(
        select(User.id, User.username, User.fbo_id)
        .where(
            User.role == "team",
            User.access_blocked.is_(False),
            User.registration_status == "approved",
            User.removed_at.is_(None),
        )
        .order_by(User.xp_total.desc(), User.id.asc())
        .limit(top_n)
    )
    workers: list[tuple[int, str]] = []
    for uid, uname, fbo in rows.all():
        label = (uname or fbo or f"user_{int(uid)}")
        workers.append((int(uid), label))
    return workers


async def _get_archivable_completed_watch_leads(
    session: AsyncSession,
    *,
    cutoff: datetime,
    limit: int,
) -> list[tuple[Lead, datetime]]:
    activity_ts = _completed_watch_anchor_ts()
    rows = await session.execute(
        select(Lead, activity_ts.label("activity_at"))
        .where(
            Lead.in_pool.is_(False),
            Lead.deleted_at.is_(None),
            Lead.archived_at.is_(None),
            Lead.status.in_(tuple(_WATCH_PIPELINE_STATUSES)),
            _completed_watch_exists(),
            activity_ts <= cutoff,
        )
        .order_by(activity_ts.asc(), Lead.id.asc())
        .limit(limit)
    )
    out: list[tuple[Lead, datetime]] = []
    for lead, activity_at in rows.all():
        safe_activity = _ensure_utc_datetime(activity_at)
        if safe_activity is None:
            safe_activity = _lead_last_activity_value(lead)
        out.append((lead, safe_activity))
    return out


async def _get_completed_watch_stale_leads(
    session: AsyncSession,
    *,
    cutoff: datetime,
    limit: int,
) -> list[Lead]:
    rows = await session.execute(
        select(Lead)
        .where(
            _redistribution_eligible_filters(),
            Lead.status.in_(tuple(_WATCH_PIPELINE_STATUSES)),
            _completed_watch_exists(),
            Lead.archived_at <= cutoff,
        )
        .order_by(Lead.archived_at.asc(), Lead.id.asc())
        .limit(limit)
    )
    return rows.scalars().all()


async def _count_completed_watch_stale_leads(
    session: AsyncSession,
    *,
    cutoff: datetime,
) -> int:
    return int(
        (
            await session.execute(
                select(func.count())
                .select_from(Lead)
                .where(
                    _redistribution_eligible_filters(),
                    Lead.status.in_(tuple(_WATCH_PIPELINE_STATUSES)),
                    _completed_watch_exists(),
                    Lead.archived_at <= cutoff,
                )
            )
        ).scalar_one()
        or 0
    )


async def _load_users_by_ids(
    session: AsyncSession,
    user_ids: set[int],
) -> dict[int, User]:
    ids = sorted({int(uid) for uid in user_ids if uid})
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(User).where(User.id.in_(ids))
        )
    ).scalars().all()
    return {int(row.id): row for row in rows}


async def _get_watch_completion_map(
    session: AsyncSession,
    *,
    lead_ids: list[int],
) -> dict[int, datetime]:
    if not lead_ids:
        return {}
    rows = (
        await session.execute(
            select(
                EnrollShareLink.lead_id,
                func.max(
                    func.coalesce(
                        EnrollShareLink.last_viewed_at,
                        EnrollShareLink.first_viewed_at,
                        EnrollShareLink.created_at,
                    )
                ).label("watch_completed_at"),
            )
            .where(
                EnrollShareLink.lead_id.in_(lead_ids),
                EnrollShareLink.status_synced.is_(True),
            )
            .group_by(EnrollShareLink.lead_id)
        )
    ).all()
    out: dict[int, datetime] = {}
    for lead_id, watch_completed_at in rows:
        safe = _ensure_utc_datetime(watch_completed_at)
        if safe is not None:
            out[int(lead_id)] = safe
    return out


async def _get_manual_assignable_users(
    session: AsyncSession,
) -> list[LeadControlAssignableUser]:
    rows = (
        await session.execute(
            select(User)
            .where(
                User.role.in_(("leader", "team")),
                User.registration_status == "approved",
                User.removed_at.is_(None),
                User.access_blocked.is_(False),
            )
            .order_by(User.role.asc(), User.xp_total.desc(), User.created_at.asc(), User.id.asc())
        )
    ).scalars().all()
    user_ids = [int(row.id) for row in rows]
    active_loads = await _get_worker_load(session, user_ids)
    out: list[LeadControlAssignableUser] = []
    for row in rows:
        out.append(
            LeadControlAssignableUser(
                user_id=int(row.id),
                display_name=_user_label(row),
                role=row.role,
                fbo_id=row.fbo_id,
                username=row.username,
                active_leads_count=int(active_loads.get(int(row.id), 0)),
                xp_total=int(row.xp_total or 0),
            )
        )
    out.sort(
        key=lambda item: (
            int(item.active_leads_count),
            0 if item.role == "team" else 1,
            -int(item.xp_total),
            item.display_name.lower(),
        )
    )
    return out


async def auto_archive_completed_watch_leads(
    session: AsyncSession,
    *,
    archive_after_hours: int = _DEFAULT_WATCH_ARCHIVE_AFTER_HOURS,
    limit: int = 500,
    now: datetime | None = None,
) -> int:
    ts = _ensure_utc_datetime(now) or datetime.now(timezone.utc)
    archive_hours = max(1, int(archive_after_hours))
    cutoff = ts - timedelta(hours=archive_hours)
    rows = await _get_archivable_completed_watch_leads(session, cutoff=cutoff, limit=max(1, int(limit)))
    if not rows:
        return 0

    audit_logs: list[ActivityLog] = []
    archived = 0
    for lead, activity_at in rows:
        safe_activity = _ensure_utc_datetime(activity_at) or _lead_last_activity_value(lead)
        if safe_activity > cutoff:
            continue
        archive_mark_at = safe_activity + timedelta(hours=archive_hours)
        lead.archived_at = archive_mark_at
        lead.in_pool = False
        archived += 1
        audit_logs.append(
            ActivityLog(
                user_id=int(lead.assigned_to_user_id or lead.owner_user_id or lead.created_by_user_id),
                action="lead.auto_archived_after_watch",
                entity_type="lead",
                entity_id=lead.id,
                meta={
                    "actor": "system.watch_archive_cycle",
                    "source_bucket": _WATCH_ARCHIVE_BUCKET,
                    "watch_completed": True,
                    "status": lead.status,
                    "watch_completed_at": safe_activity.isoformat(),
                    "archived_at": archive_mark_at.isoformat(),
                    "owner_user_id": int(lead.owner_user_id) if lead.owner_user_id is not None else None,
                    "assigned_to_user_id": int(lead.assigned_to_user_id) if lead.assigned_to_user_id is not None else None,
                    "auto_cycle_hours": archive_hours,
                },
            )
        )
    if archived:
        session.add_all(audit_logs)
        await session.commit()
    return archived


async def run_completed_watch_pipeline_maintenance(
    session: AsyncSession,
    *,
    archive_after_hours: int = _DEFAULT_WATCH_ARCHIVE_AFTER_HOURS,
    stale_hours: int = _DEFAULT_WATCH_ARCHIVE_AFTER_HOURS,
    top_n: int = 10,
    limit: int = 500,
    now: datetime | None = None,
) -> dict[str, int]:
    ts = _ensure_utc_datetime(now) or datetime.now(timezone.utc)
    auto_archived = await auto_archive_completed_watch_leads(
        session,
        archive_after_hours=archive_after_hours,
        limit=limit,
        now=ts,
    )
    redistribution = await stale_redistribute(
        session,
        stale_hours=stale_hours,
        top_n=top_n,
        limit=limit,
        now=ts,
    )
    return {
        "auto_archived": int(auto_archived),
        "reassigned": int(redistribution.assigned),
        "skipped": int(redistribution.skipped),
    }


def _assign_leads(
    *,
    leads: list[Lead],
    workers: list[int],
    load_map: dict[int, int],
    cutoff: datetime,
    now: datetime,
    worker_rank: dict[int, int],
    max_active_per_worker: int,
    auto_cycle_hours: int,
    audit_log_user_id: int | None = None,
) -> tuple[int, int, list[list[Any]], list[ActivityLog]]:
    assigned = 0
    skipped = 0
    assignments: list[list[Any]] = []
    audit_logs: list[ActivityLog] = []

    for lead in leads:
        # Guard: skip if lead appears recently active at runtime.
        if _lead_last_activity_value(lead) > cutoff:
            skipped += 1
            continue

        from_uid = int(lead.assigned_to_user_id) if lead.assigned_to_user_id is not None else None
        eligible_workers = sorted(
            workers,
            key=lambda wid: (int(load_map.get(wid, 0)), int(worker_rank.get(wid, 9999)), int(wid)),
        )
        to_uid = next(
            (
                wid
                for wid in eligible_workers
                if wid != from_uid and int(load_map.get(wid, 0)) < max_active_per_worker
            ),
            None,
        )
        if to_uid is None:
            skipped += 1
            continue

        # Guard: no-op reassignment should not be counted.
        if from_uid == to_uid:
            skipped += 1
            continue

        # Ownership safety: only assignee can change.
        lead.assigned_to_user_id = to_uid
        lead.archived_at = None
        lead.last_action_at = now

        assigned += 1
        load_map[to_uid] = load_map.get(to_uid, 0) + 1
        if from_uid is not None and from_uid in load_map and load_map[from_uid] > 0:
            load_map[from_uid] -= 1
        assignments.append([int(lead.id), from_uid, to_uid])
        if audit_log_user_id is not None:
            lead_meta = {
                "actor": "system.stale_watch_cycle",
                "previous_assignee_user_id": from_uid,
                "assigned_to_user_id": to_uid,
                "owner_user_id": int(lead.owner_user_id) if lead.owner_user_id is not None else None,
                "source_bucket": _STALE_WATCH_BUCKET,
                "max_active_per_worker": max_active_per_worker,
            }
            lead_meta["watch_completed"] = True
            lead_meta["status"] = lead.status
            lead_meta["stale_cutoff_at"] = cutoff.isoformat()
            lead_meta["worker_rank"] = int(worker_rank.get(to_uid, 0)) + 1
            yield_log = ActivityLog(
                user_id=int(to_uid or audit_log_user_id),
                action="lead.stale_watch_reassigned",
                entity_type="lead",
                entity_id=lead.id,
                meta=lead_meta,
            )
            lead_meta["owner_preserved"] = True
            lead_meta["auto_cycle_hours"] = auto_cycle_hours
            # ActivityLog is append-only audit trail for sensitive redistribution.
            audit_logs.append(yield_log)
    return assigned, skipped, assignments, audit_logs


async def stale_redistribute(
    session: AsyncSession,
    *,
    stale_hours: int = _DEFAULT_WATCH_ARCHIVE_AFTER_HOURS,
    top_n: int = 10,
    limit: int = 500,
    now: datetime | None = None,
) -> StaleRedistributeOut:
    """
    Reassign archived completed-watch leads to the top XP team pool.

    Safety rules:
    - never change ``owner_user_id``
    - only reassign from the archived completed-watch stale bucket
    - only assign into the top-XP approved team pool
    - cap each selected worker at 50 active leads
    """
    sh = max(1, int(stale_hours))
    n_workers = max(1, int(top_n))
    max_rows = max(1, int(limit))
    ts = _ensure_utc_datetime(now) or datetime.now(timezone.utc)
    cutoff = ts - timedelta(hours=sh)
    max_active_per_worker = _DEFAULT_MAX_ACTIVE_LEADS_PER_WORKER

    workers = await _get_top_xp_workers(session, top_n=n_workers)
    if not workers:
        return StaleRedistributeOut(
            implemented=True,
            message="No eligible top-XP team members found for redistribution.",
            source_bucket=_STALE_WATCH_BUCKET,
            max_active_per_worker=max_active_per_worker,
        )

    worker_ids = [wid for wid, _label in workers]
    worker_meta = {wid: label for wid, label in workers}
    worker_rank = {wid: idx for idx, wid in enumerate(worker_ids)}
    load_map = await _get_worker_load(session, worker_ids)
    eligible_workers = [wid for wid in worker_ids if int(load_map.get(wid, 0)) < max_active_per_worker]
    if not eligible_workers:
        return StaleRedistributeOut(
            implemented=True,
            message="Top-XP team members are already at the active-lead cap.",
            source_bucket=_STALE_WATCH_BUCKET,
            max_active_per_worker=max_active_per_worker,
            worker_pool_size=len(worker_ids),
            worker_counts={worker_meta[wid]: int(load_map.get(wid, 0)) for wid in worker_ids},
        )

    stale_leads = await _get_completed_watch_stale_leads(
        session,
        cutoff=cutoff,
        limit=max_rows,
    )
    if not stale_leads:
        return StaleRedistributeOut(
            implemented=True,
            message="No archived completed-watch stale leads matched the given threshold.",
            source_bucket=_STALE_WATCH_BUCKET,
            max_active_per_worker=max_active_per_worker,
            worker_pool_size=len(worker_ids),
            worker_counts={worker_meta[wid]: int(load_map.get(wid, 0)) for wid in worker_ids},
        )

    audit_log_user_id = next((wid for wid in worker_ids if int(load_map.get(wid, 0)) < max_active_per_worker), None)
    assigned, skipped, assignments, audit_logs = _assign_leads(
        leads=stale_leads,
        workers=eligible_workers,
        load_map=load_map,
        cutoff=cutoff,
        now=ts,
        worker_rank=worker_rank,
        max_active_per_worker=max_active_per_worker,
        auto_cycle_hours=sh,
        audit_log_user_id=audit_log_user_id,
    )
    session.add_all(audit_logs)

    await session.commit()
    notified_users: set[int] = set()
    for _lead_id, _from_uid, to_uid in assignments:
        if to_uid is None or int(to_uid) in notified_users:
            continue
        notified_users.add(int(to_uid))
        try:
            await send_push_to_user(
                session,
                int(to_uid),
                title="Leads Reassigned",
                body="Stale archived leads have been moved back into your Calling Board.",
                url="/dashboard/work/leads",
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to send stale reassignment push to user %s", to_uid)
    logger.info(
        "stale_watch_redistribute assigned=%s skipped=%s workers=%s stale_hours=%s limit=%s",
        assigned,
        skipped,
        len(eligible_workers),
        sh,
        max_rows,
    )
    return StaleRedistributeOut(
        implemented=True,
        message=f"Redistributed {assigned} archived completed-watch stale lead(s); skipped {skipped}.",
        assigned=assigned,
        skipped=skipped,
        assignments=assignments,
        worker_counts={worker_meta[wid]: int(load_map.get(wid, 0)) for wid in worker_ids},
        worker_pool_size=len(worker_ids),
        source_bucket=_STALE_WATCH_BUCKET,
        max_active_per_worker=max_active_per_worker,
    )


async def admin_lead_control_snapshot(
    session: AsyncSession,
    *,
    stale_hours: int = _DEFAULT_WATCH_ARCHIVE_AFTER_HOURS,
    queue_limit: int = 100,
    history_limit: int = 80,
    day2_limit: int = 24,
) -> LeadControlOut:
    stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, int(stale_hours)))
    queue = await _get_completed_watch_stale_leads(
        session,
        cutoff=stale_cutoff,
        limit=max(1, int(queue_limit)),
    )
    queue_total = await _count_completed_watch_stale_leads(session, cutoff=stale_cutoff)
    queue_lead_ids = [int(lead.id) for lead in queue]
    watch_map = await _get_watch_completion_map(session, lead_ids=queue_lead_ids)
    queue_user_ids: set[int] = set()
    for lead in queue:
        if lead.owner_user_id is not None:
            queue_user_ids.add(int(lead.owner_user_id))
        if lead.assigned_to_user_id is not None:
            queue_user_ids.add(int(lead.assigned_to_user_id))
    queue_users = await _load_users_by_ids(session, queue_user_ids)
    queue_rows = [
        LeadControlQueueLead(
            lead_id=int(lead.id),
            lead_name=lead.name,
            phone=lead.phone,
            status=lead.status,
            owner_user_id=int(lead.owner_user_id) if lead.owner_user_id is not None else None,
            owner_name=_user_label(
                queue_users.get(int(lead.owner_user_id)) if lead.owner_user_id is not None else None,
                lead.owner_user_id,
            ),
            assigned_to_user_id=int(lead.assigned_to_user_id) if lead.assigned_to_user_id is not None else None,
            assigned_to_name=_user_label(
                queue_users.get(int(lead.assigned_to_user_id))
                if lead.assigned_to_user_id is not None
                else None,
                lead.assigned_to_user_id,
            ),
            archived_at=_ensure_utc_datetime(lead.archived_at) or datetime.now(timezone.utc),
            watch_completed_at=watch_map.get(int(lead.id)),
            last_action_at=_ensure_utc_datetime(lead.last_action_at),
        )
        for lead in queue
    ]

    assignable_users = await _get_manual_assignable_users(session)

    history_logs = (
        await session.execute(
            select(ActivityLog)
            .where(ActivityLog.action.in_(_REASSIGNMENT_HISTORY_ACTIONS))
            .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        )
    ).scalars().all()
    history_total = len(history_logs)
    recent_logs = history_logs[: max(1, int(history_limit))]

    history_user_ids: set[int] = set()
    history_lead_ids: set[int] = set()
    summary_map: dict[int, LeadControlHistorySummaryRow] = {}
    for log in history_logs:
        meta = log.meta if isinstance(log.meta, dict) else {}
        assigned_to_user_id = _coerce_int(meta.get("assigned_to_user_id"))
        previous_assignee_user_id = _coerce_int(meta.get("previous_assignee_user_id"))
        owner_user_id = _coerce_int(meta.get("owner_user_id"))
        if assigned_to_user_id is not None:
            history_user_ids.add(assigned_to_user_id)
        if previous_assignee_user_id is not None:
            history_user_ids.add(previous_assignee_user_id)
        if owner_user_id is not None:
            history_user_ids.add(owner_user_id)
        if log.action == _MANUAL_REASSIGNMENT_ACTION:
            history_user_ids.add(int(log.user_id))
        if log.entity_id is not None:
            history_lead_ids.add(int(log.entity_id))

    history_users = await _load_users_by_ids(session, history_user_ids)
    history_leads = (
        await session.execute(select(Lead).where(Lead.id.in_(sorted(history_lead_ids))))
    ).scalars().all()
    history_leads_by_id = {int(lead.id): lead for lead in history_leads}

    for log in history_logs:
        meta = log.meta if isinstance(log.meta, dict) else {}
        assigned_to_user_id = _coerce_int(meta.get("assigned_to_user_id"))
        if assigned_to_user_id is None:
            continue
        assigned_user = history_users.get(assigned_to_user_id)
        entry = summary_map.get(assigned_to_user_id)
        if entry is None:
            entry = LeadControlHistorySummaryRow(
                user_id=assigned_to_user_id,
                display_name=_user_label(assigned_user, assigned_to_user_id),
                role=assigned_user.role if assigned_user is not None else "unknown",
                total_received=0,
                manual_received=0,
                auto_received=0,
                last_received_at=None,
            )
            summary_map[assigned_to_user_id] = entry
        entry.total_received += 1
        if log.action == _MANUAL_REASSIGNMENT_ACTION:
            entry.manual_received += 1
        else:
            entry.auto_received += 1
        received_at = _ensure_utc_datetime(log.created_at)
        if received_at is not None and (
            entry.last_received_at is None or received_at > entry.last_received_at
        ):
            entry.last_received_at = received_at

    history_summary = sorted(
        summary_map.values(),
        key=lambda row: (-int(row.total_received), row.display_name.lower(), int(row.user_id)),
    )

    history_rows: list[LeadControlHistoryRow] = []
    for log in recent_logs:
        meta = log.meta if isinstance(log.meta, dict) else {}
        lead_id = int(log.entity_id or 0)
        lead = history_leads_by_id.get(lead_id)
        previous_assignee_user_id = _coerce_int(meta.get("previous_assignee_user_id"))
        assigned_to_user_id = _coerce_int(meta.get("assigned_to_user_id"))
        owner_user_id = _coerce_int(meta.get("owner_user_id"))
        mode = "manual" if log.action == _MANUAL_REASSIGNMENT_ACTION else "auto"
        actor_name = (
            _user_label(history_users.get(int(log.user_id)), int(log.user_id))
            if mode == "manual"
            else "System cycle"
        )
        history_rows.append(
            LeadControlHistoryRow(
                activity_id=int(log.id),
                occurred_at=_ensure_utc_datetime(log.created_at) or datetime.now(timezone.utc),
                mode=mode,
                lead_id=lead_id,
                lead_name=lead.name if lead is not None else f"Lead #{lead_id}",
                previous_assignee_user_id=previous_assignee_user_id,
                previous_assignee_name=(
                    _user_label(history_users.get(previous_assignee_user_id), previous_assignee_user_id)
                    if previous_assignee_user_id is not None
                    else "Unassigned"
                ),
                assigned_to_user_id=assigned_to_user_id,
                assigned_to_name=(
                    _user_label(history_users.get(assigned_to_user_id), assigned_to_user_id)
                    if assigned_to_user_id is not None
                    else "Unassigned"
                ),
                owner_user_id=owner_user_id,
                owner_name=(
                    _user_label(history_users.get(owner_user_id), owner_user_id)
                    if owner_user_id is not None
                    else "Unknown"
                ),
                actor_name=actor_name,
                reason=str(meta.get("reason")).strip() if isinstance(meta.get("reason"), str) and str(meta.get("reason")).strip() else None,
            )
        )

    day2_total = int(
        (
            await session.execute(
                select(func.count())
                .select_from(BatchDaySubmission)
                .where(BatchDaySubmission.day_number == 2)
            )
        ).scalar_one()
        or 0
    )
    day2_rows = (
        await session.execute(
            select(BatchDaySubmission, Lead)
            .join(Lead, Lead.id == BatchDaySubmission.lead_id)
            .where(BatchDaySubmission.day_number == 2)
            .order_by(BatchDaySubmission.submitted_at.desc(), BatchDaySubmission.id.desc())
            .limit(max(1, int(day2_limit)))
        )
    ).all()
    day2_user_ids: set[int] = set()
    for _submission, lead in day2_rows:
        if lead.assigned_to_user_id is not None:
            day2_user_ids.add(int(lead.assigned_to_user_id))
        if lead.owner_user_id is not None:
            day2_user_ids.add(int(lead.owner_user_id))
    day2_users = await _load_users_by_ids(session, day2_user_ids)
    day2_submissions = [
        LeadControlDay2SubmissionRow(
            submission_id=int(submission.id),
            lead_id=int(lead.id),
            lead_name=lead.name,
            slot=submission.slot,
            submitted_at=_ensure_utc_datetime(submission.submitted_at) or datetime.now(timezone.utc),
            assigned_to_user_id=int(lead.assigned_to_user_id) if lead.assigned_to_user_id is not None else None,
            assigned_to_name=_user_label(
                day2_users.get(int(lead.assigned_to_user_id))
                if lead.assigned_to_user_id is not None
                else None,
                lead.assigned_to_user_id,
            ),
            owner_user_id=int(lead.owner_user_id) if lead.owner_user_id is not None else None,
            owner_name=_user_label(
                day2_users.get(int(lead.owner_user_id)) if lead.owner_user_id is not None else None,
                lead.owner_user_id,
            ),
            notes_text_preview=_preview_text(submission.notes_text),
            notes_url=submission.notes_url,
            voice_note_url=submission.voice_note_url,
            video_url=submission.video_url,
        )
        for submission, lead in day2_rows
    ]

    return LeadControlOut(
        note=(
            "Admin-only control surface. Owner never changes here; only the working assignee can move. "
            "Archived completed-watch leads appear once they are stale for reassignment."
        ),
        queue=queue_rows,
        queue_total=queue_total,
        assignable_users=assignable_users,
        history_summary=history_summary,
        history=history_rows,
        history_total=history_total,
        day2_submissions=day2_submissions,
        day2_total=day2_total,
    )


async def admin_manual_reassign_archived_completed_watch_lead(
    session: AsyncSession,
    *,
    admin_user_id: int,
    lead_id: int,
    to_user_id: int,
    reason: str | None = None,
) -> LeadControlManualReassignOut:
    lead = await session.get(Lead, int(lead_id))
    if lead is None or lead.deleted_at is not None or lead.in_pool:
        raise ValueError("Lead not found")
    if lead.archived_at is None:
        raise ValueError("Lead is not in the archived reassignment queue")
    if lead.status not in _WATCH_PIPELINE_STATUSES:
        raise ValueError("Only completed-watch archived leads can be reassigned here")
    watch_completed = bool(
        (
            await session.execute(
                select(func.count())
                .select_from(EnrollShareLink)
                .where(
                    EnrollShareLink.lead_id == lead.id,
                    EnrollShareLink.status_synced.is_(True),
                )
            )
        ).scalar_one()
        or 0
    )
    if not watch_completed:
        raise ValueError("Lead has not completed the enrollment watch flow")

    target_user = (
        await session.execute(
            select(User).where(
                User.id == int(to_user_id),
                User.role.in_(("leader", "team")),
                User.registration_status == "approved",
                User.removed_at.is_(None),
                User.access_blocked.is_(False),
            )
        )
    ).scalar_one_or_none()
    if target_user is None:
        raise ValueError("Select an active approved leader or team member")

    from_user_id = int(lead.assigned_to_user_id) if lead.assigned_to_user_id is not None else None
    if from_user_id == int(target_user.id):
        raise ValueError("Lead is already assigned to that member")

    involved_user_ids = {int(target_user.id), int(admin_user_id)}
    if from_user_id is not None:
        involved_user_ids.add(from_user_id)
    if lead.owner_user_id is not None:
        involved_user_ids.add(int(lead.owner_user_id))
    users_by_id = await _load_users_by_ids(session, involved_user_ids)

    now = datetime.now(timezone.utc)
    lead.assigned_to_user_id = int(target_user.id)
    lead.archived_at = None
    lead.in_pool = False
    lead.last_action_at = now
    enqueue_lead_shadow_upsert(session, lead)
    session.add(
        ActivityLog(
            user_id=int(admin_user_id),
            action=_MANUAL_REASSIGNMENT_ACTION,
            entity_type="lead",
            entity_id=int(lead.id),
            meta={
                "actor": "admin.manual_reassign",
                "previous_assignee_user_id": from_user_id,
                "assigned_to_user_id": int(target_user.id),
                "owner_user_id": int(lead.owner_user_id) if lead.owner_user_id is not None else None,
                "source_bucket": _STALE_WATCH_BUCKET,
                "owner_preserved": True,
                "reason": (reason or "").strip() or None,
                "status": lead.status,
                "manual": True,
            },
        )
    )
    await session.commit()
    try:
        await send_push_to_user(
            session,
            int(target_user.id),
            title="Lead Reassigned",
            body=f"Lead '{lead.name}' has been moved into your Calling Board by admin.",
            url="/dashboard/work/leads",
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send manual reassignment push for lead %s", lead.id)
    return LeadControlManualReassignOut(
        success=True,
        message="Lead reassigned successfully. Owner stayed unchanged and the lead left the queue.",
        lead_id=int(lead.id),
        previous_assignee_user_id=from_user_id,
        previous_assignee_name=(
            _user_label(users_by_id.get(from_user_id), from_user_id)
            if from_user_id is not None
            else "Unassigned"
        ),
        assigned_to_user_id=int(target_user.id),
        assigned_to_name=_user_label(target_user),
        owner_user_id=int(lead.owner_user_id) if lead.owner_user_id is not None else None,
        owner_name=_user_label(
            users_by_id.get(int(lead.owner_user_id)) if lead.owner_user_id is not None else None,
            lead.owner_user_id,
        ),
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
