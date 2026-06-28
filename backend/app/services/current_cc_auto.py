"""Auto-compute the Tracking Report (Current CC sheet) from real system data.

Almost every section of the daily sheet is already recorded by the app, so we
derive it instead of asking the member to re-type it:

* Direct team        -> org tree (``User.upline_user_id``)
* Real/Light active  -> approved ``LeadSale`` + ``EnrollmentShareLink`` this month
* Closed CCs         -> approved ``LeadSale.case_credits`` (NOT the unreliable OCR)
* Pending            -> seat-held ``Lead`` not yet converted
* Enrollment + budget-> ``EnrollmentShareLink`` + ``WalletRecharge`` for the day
* Enrollment tracking-> ``Lead`` pipeline state / drop-reason for the day
* Activity           -> ``DailyMemberStat`` (via ``compute_actuals``)

Process Check and Improvement Area are deliberately left out — they are the
leader's own diagnosis/solution and have no system signal.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.core.lead_outcome import (
    DROP_REASON_LABELS,
    OUTCOME_CONVERTED,
    OUTCOME_DEAD,
    OUTCOME_RECYCLE,
)
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.daily_member_stat import DailyMemberStat  # noqa: F401 (used via compute_actuals)
from app.models.enrollment_share_link import EnrollmentShareLink
from app.models.lead import Lead
from app.models.lead_sale import LeadSale
from app.models.user import User
from app.models.wallet_recharge import WalletRecharge
from app.schemas.current_cc import (
    CcPersonRow,
    CurrentCcActivityBreakdown,
    CurrentCcActuals,
    CurrentCcAuto,
    EnrollmentRow,
    EnrollmentTrackingRow,
    LeadCycleRow,
)
from app.services.current_cc import _can_access, _display_name, compute_actuals, today_ist
from app.services.downline import recursive_downline_user_ids
from app.services.team_reports_metrics import IST

# A direct team smaller than this nudges the leader to recruit more at the front.
RECRUITMENT_MIN_DIRECT = 5

# activity_log action names that distinguish how a lead entered the member's book.
_CREATED_ACTIONS = ("lead.created",)
_UPLOADED_ACTIONS = ("lead.pool_import", "lead.free_pool_import")
_CLAIMED_ACTIONS = ("lead.claimed", "lead.claimed_free")


def _ist_date(stamp: datetime | None) -> date | None:
    """IST calendar date of a timestamp; naive stamps are treated as UTC (SQLite)."""
    if stamp is None:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(IST).date()


def _coarse_cutoff(day: date) -> datetime:
    """Naive lower bound ~2 days before ``day`` for a portable DB pre-filter.

    Naive (not tz-aware) on purpose: it compares cleanly against both Postgres
    ``timestamptz`` columns and the SQLite test DB; exact IST-day matching is
    then done in Python via ``_ist_date``. Mirrors the pattern in sales_service.
    """
    return datetime.combine(day - timedelta(days=2), datetime.min.time())


def _f(value: Decimal | float | int | None) -> float:
    return float(value) if value is not None else 0.0


def _status_label(status: str | None) -> str:
    return (status or "").replace("_", " ").strip().title() or "—"


def _owner_scope_clause(scope: list[int]):
    """Leads owned by anyone in ``scope`` (sticky owner, or creator when unset)."""
    return or_(
        Lead.owner_user_id.in_(scope),
        and_(Lead.owner_user_id.is_(None), Lead.created_by_user_id.in_(scope)),
    )


async def compute_auto(
    session: AsyncSession, *, subject_user_id: int, day: date
) -> CurrentCcAuto:
    """Derive the whole sheet for ``subject_user_id`` (plus full downline) on ``day``."""
    downline = await recursive_downline_user_ids(session, subject_user_id)
    scope = [subject_user_id, *downline]
    team_ids = list(downline)  # team buckets exclude the subject themselves
    # Naive cutoffs for portable DB pre-filtering (see _coarse_cutoff).
    month_start = datetime.combine(day.replace(day=1), datetime.min.time())

    auto = CurrentCcAuto(subject_user_id=subject_user_id, sheet_date=day)

    # Display names for every user in scope (one lookup, reused everywhere).
    users = (
        await session.execute(select(User).where(User.id.in_(scope)))
    ).scalars().all()
    name_by_id = {u.id: _display_name(u) for u in users}

    # ── 1. Direct team ────────────────────────────────────────────────────────
    children = (
        await session.execute(
            select(User).where(User.upline_user_id == subject_user_id).order_by(User.name)
        )
    ).scalars().all()
    auto.direct_persons = [_display_name(u) for u in children]
    auto.direct_count = len(children)
    auto.recruitment_low = auto.direct_count < RECRUITMENT_MIN_DIRECT

    # ── 4. Closed leads + realised CCs (approved sales, sticky owner in scope) ─
    closed_rows = (
        await session.execute(
            select(
                Lead.name,
                Lead.status,
                func.coalesce(func.sum(LeadSale.case_credits), 0),
            )
            .join(LeadSale, LeadSale.lead_id == Lead.id)
            .where(LeadSale.status == "approved", LeadSale.owner_user_id.in_(scope))
            .group_by(Lead.id, Lead.name, Lead.status)
        )
    ).all()
    closed_total = 0.0
    for lead_name, lead_status, cc in closed_rows:
        cc_f = _f(cc)
        if cc_f <= 0:
            continue
        closed_total += cc_f
        auto.closed_persons.append(
            CcPersonRow(name=lead_name or "—", ccs=cc_f, current_state=_status_label(lead_status))
        )
    auto.closed_persons.sort(key=lambda r: r.ccs, reverse=True)
    auto.closed_total_ccs = round(closed_total, 3)

    # ── 5. Pending (seat held, not yet converted) ─────────────────────────────
    pending = (
        await session.execute(
            select(Lead.name, Lead.status)
            .where(
                _owner_scope_clause(scope),
                Lead.seat_hold_amount_cents.isnot(None),
                Lead.outcome != OUTCOME_CONVERTED,
                Lead.deleted_at.is_(None),
            )
            .order_by(Lead.last_action_at.desc())
            .limit(100)
        )
    ).all()
    auto.pending_persons = [
        CcPersonRow(name=n or "—", ccs=0.0, current_state=_status_label(s)) for n, s in pending
    ]

    # ── 6/7. Enrollment video shares + budget recharge for the day ────────────
    await _attach_enrollment_and_budget(
        session, auto=auto, scope=scope, day=day, name_by_id=name_by_id
    )

    # ── 2/3. Real vs Light active team (this month) ───────────────────────────
    await _attach_active_buckets(
        session,
        auto=auto,
        team_ids=team_ids,
        month_start=month_start,
        name_by_id=name_by_id,
    )

    # ── 8. Today's enrollment movement + drop reasons ─────────────────────────
    await _attach_enrollment_tracking(
        session, auto=auto, scope=scope, day=day
    )

    # ── Activity (reliable, for the subject) ──────────────────────────────────
    auto.actuals = await compute_actuals(session, subject_user_id=subject_user_id, day=day)
    auto.activity_breakdown = await compute_activity_breakdown(
        session, subject_user_id=subject_user_id, day=day
    )
    return auto


async def compute_activity_breakdown(
    session: AsyncSession, *, subject_user_id: int, day: date
) -> CurrentCcActivityBreakdown:
    """Exact per-category counts from app logs (subject's own actions on ``day``).

    Each lead action is a distinct ``activity_log`` row and each call a
    ``call_events`` row, so these are the un-inflatable truth the member's
    claimed numbers can be cross-checked against. Retarget calls are calls to
    leads currently in the recycle/retarget state (best-effort: the lead's
    state at call time is not snapshotted).
    """
    coarse = _coarse_cutoff(day)

    # Lead-origin actions from the activity log.
    log_rows = (
        await session.execute(
            select(ActivityLog.action, ActivityLog.created_at).where(
                ActivityLog.user_id == subject_user_id,
                ActivityLog.created_at >= coarse,
            )
        )
    ).all()
    created = uploaded = claimed = 0
    for action, ts in log_rows:
        if _ist_date(ts) != day:
            continue
        if action in _CREATED_ACTIONS:
            created += 1
        elif action in _UPLOADED_ACTIONS:
            uploaded += 1
        elif action in _CLAIMED_ACTIONS:
            claimed += 1

    # Calls from the call log (exact, per-call rows).
    call_rows = (
        await session.execute(
            select(CallEvent.lead_id, CallEvent.called_at).where(
                CallEvent.user_id == subject_user_id,
                CallEvent.called_at >= coarse,
            )
        )
    ).all()
    todays_calls = [(lid, ts) for lid, ts in call_rows if _ist_date(ts) == day]
    calls_total = len(todays_calls)

    retarget_calls = 0
    lead_ids = {lid for lid, _ in todays_calls if lid is not None}
    if lead_ids:
        retarget_lead_ids = {
            int(lid)
            for (lid,) in (
                await session.execute(
                    select(Lead.id).where(
                        Lead.id.in_(lead_ids),
                        or_(
                            Lead.retarget_at.isnot(None),
                            Lead.outcome == OUTCOME_RECYCLE,
                        ),
                    )
                )
            ).all()
        }
        retarget_calls = sum(1 for lid, _ in todays_calls if lid in retarget_lead_ids)

    return CurrentCcActivityBreakdown(
        leads_created=created,
        leads_uploaded=uploaded,
        leads_claimed=claimed,
        calls_total=calls_total,
        retarget_calls=retarget_calls,
    )


async def _attach_enrollment_and_budget(
    session: AsyncSession,
    *,
    auto: CurrentCcAuto,
    scope: list[int],
    day: date,
    name_by_id: dict[int, str],
) -> None:
    # Coarse DB filter then exact IST-day match in Python — portable across
    # Postgres timestamptz and the SQLite test DB.
    coarse = _coarse_cutoff(day)
    shares = (
        await session.execute(
            select(
                EnrollmentShareLink.created_by_user_id,
                EnrollmentShareLink.viewer_phone,
                EnrollmentShareLink.created_at,
            ).where(
                EnrollmentShareLink.created_by_user_id.in_(scope),
                EnrollmentShareLink.created_at >= coarse,
            )
        )
    ).all()
    todays = [(uid, phone) for uid, phone, ts in shares if _ist_date(ts) == day]

    # Classify fresh vs old by matching the viewer phone to an existing lead that
    # predates today. Best-effort: unmatched / newer phones count as "fresh".
    phones = {p for _, p in todays if p}
    old_phones: set[str] = set()
    if phones:
        lead_rows = (
            await session.execute(
                select(Lead.phone, Lead.created_at).where(Lead.phone.in_(phones))
            )
        ).all()
        for ph, created in lead_rows:
            d = _ist_date(created)
            if ph and d is not None and d < day:
                old_phones.add(ph)

    fresh_old: dict[int, list[int]] = {}  # uid -> [fresh, old]
    for uid, phone in todays:
        bucket = fresh_old.setdefault(uid, [0, 0])
        if phone and phone in old_phones:
            bucket[1] += 1
        else:
            bucket[0] += 1

    # Budget recharges submitted today (per member) + approval (Gurveer "check").
    recharges = (
        await session.execute(
            select(
                WalletRecharge.user_id, WalletRecharge.status, WalletRecharge.created_at
            ).where(
                WalletRecharge.user_id.in_(scope),
                WalletRecharge.created_at >= coarse,
            )
        )
    ).all()
    submitted: set[int] = set()
    approved: set[int] = set()
    approved_count = 0
    submitted_count = 0
    for uid, st, ts in recharges:
        if _ist_date(ts) != day:
            continue
        submitted.add(uid)
        submitted_count += 1
        if st == "approved":
            approved.add(uid)
            approved_count += 1

    member_ids = sorted(set(fresh_old) | submitted, key=lambda i: name_by_id.get(i, ""))
    total = 0
    for uid in member_ids:
        fresh, old = fresh_old.get(uid, [0, 0])
        name = name_by_id.get(uid, f"User #{uid}")
        if fresh or old:
            auto.enrollment_rows.append(
                EnrollmentRow(name=name, fresh_lead=fresh, old_lead=old)
            )
        auto.lead_cycle_rows.append(
            LeadCycleRow(
                name=name,
                enrollment=fresh + old,
                budget_check=uid in submitted,
                checked=uid in approved,
            )
        )
        total += fresh + old

    auto.enrollment_total = total
    auto.enrollment_split_approx = total > 0
    if submitted_count:
        auto.lead_covered = (
            f"{approved_count}/{submitted_count} recharge(s) approved today by admin."
        )


async def _attach_active_buckets(
    session: AsyncSession,
    *,
    auto: CurrentCcAuto,
    team_ids: list[int],
    month_start: datetime,
    name_by_id: dict[int, str],
) -> None:
    if not team_ids:
        return
    # Real active = team member with an approved CC sale this month.
    real_ids = {
        int(uid)
        for (uid,) in (
            await session.execute(
                select(LeadSale.owner_user_id)
                .where(
                    LeadSale.owner_user_id.in_(team_ids),
                    LeadSale.status == "approved",
                    LeadSale.created_at >= month_start,
                    func.coalesce(LeadSale.case_credits, 0) > 0,
                )
                .distinct()
            )
        ).all()
        if uid is not None
    }
    # Enrollment sharers this month.
    enroll_ids = {
        int(uid)
        for (uid,) in (
            await session.execute(
                select(EnrollmentShareLink.created_by_user_id)
                .where(
                    EnrollmentShareLink.created_by_user_id.in_(team_ids),
                    EnrollmentShareLink.created_at >= month_start,
                )
                .distinct()
            )
        ).all()
        if uid is not None
    }
    # Light active = shared enrollment but did NOT give a CC this month.
    light_ids = enroll_ids - real_ids
    auto.real_active_persons = sorted(
        (name_by_id.get(i, f"User #{i}") for i in real_ids), key=str.lower
    )
    auto.light_active_persons = sorted(
        (name_by_id.get(i, f"User #{i}") for i in light_ids), key=str.lower
    )


async def _attach_enrollment_tracking(
    session: AsyncSession, *, auto: CurrentCcAuto, scope: list[int], day: date
) -> None:
    coarse = _coarse_cutoff(day)
    leads = (
        await session.execute(
            select(Lead)
            .where(
                _owner_scope_clause(scope),
                Lead.deleted_at.is_(None),
                or_(
                    Lead.last_action_at >= coarse,
                    Lead.dropped_at >= coarse,
                    Lead.day1_completed_at >= coarse,
                ),
            )
            .order_by(Lead.last_action_at.desc())
            .limit(200)
        )
    ).scalars().all()

    drop_reasons: dict[str, int] = {}
    for lead in leads:
        moved_today = day in {
            _ist_date(lead.last_action_at),
            _ist_date(lead.dropped_at),
            _ist_date(lead.day1_completed_at),
        }
        if not moved_today:
            continue
        is_drop = lead.outcome == OUTCOME_DEAD
        auto.enrollment_tracking_rows.append(
            EnrollmentTrackingRow(
                name=lead.name or "—",
                current_state=_status_label(lead.status),
                drop_continue="drop" if is_drop else "continue",
                day1="Yes" if lead.day1_completed_at else "",
            )
        )
        if is_drop and _ist_date(lead.dropped_at) == day and lead.drop_reason:
            label = DROP_REASON_LABELS.get(lead.drop_reason, lead.drop_reason)
            drop_reasons[label] = drop_reasons.get(label, 0) + 1

    auto.enrollment_tracking_rows = auto.enrollment_tracking_rows[:50]
    if drop_reasons:
        auto.drop_reason_remarks = ", ".join(
            f"{label} ×{n}" for label, n in sorted(drop_reasons.items())
        )


async def get_auto(
    session: AsyncSession, *, actor: AuthUser, subject_user_id: int, day: date
) -> CurrentCcAuto:
    """Permission-checked entry point used by the API layer."""
    if not await _can_access(session, actor=actor, subject_user_id=subject_user_id):
        raise PermissionError("Not allowed to view this member's tracking report.")
    return await compute_auto(session, subject_user_id=subject_user_id, day=day)


__all__ = ["compute_auto", "compute_activity_breakdown", "get_auto", "today_ist"]
