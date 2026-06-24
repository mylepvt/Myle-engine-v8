"""Current CC daily sheet — access rules, upsert, team-member list, trends."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.current_cc import CurrentCcSheet
from app.models.daily_member_stat import DailyMemberStat
from app.models.user import User
from app.schemas.current_cc import (
    CcComparePeriod,
    CcCompareResponse,
    CcPersonRow,
    CurrentCcActuals,
    CurrentCcMatch,
    CurrentCcMatchItem,
    CurrentCcOverviewResponse,
    CurrentCcOverviewRow,
    CurrentCcSheetPublic,
    CurrentCcSheetUpsert,
    CurrentCcTrendPoint,
    CurrentCcTrendResponse,
    EnrollmentRow,
    EnrollmentTrackingRow,
    LeadCycleRow,
    TeamMemberOption,
)
from app.services.downline import recursive_downline_user_ids
from app.services.team_reports_metrics import IST


def today_ist() -> date:
    return datetime.now(IST).date()


async def compute_actuals(
    session: AsyncSession, *, subject_user_id: int, day: date
) -> CurrentCcActuals:
    """Reliable activity for the subject on ``day`` (calls / leads / follow-ups).

    The app's CC read (OCR) is unreliable, so CC is NOT pulled — the sheet is the CC
    truth. Activity comes from DailyMemberStat, which is logged from real app usage.
    """
    stat = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id == subject_user_id,
                DailyMemberStat.stat_date == day,
            )
        )
    ).scalar_one_or_none()
    return CurrentCcActuals(
        calls=stat.calls_count if stat else 0,
        leads_added=stat.leads_added_count if stat else 0,
        followups=stat.followups_done_count if stat else 0,
    )


def _match_status(claimed: float, actual: float) -> str:
    """Green when activity backs the claim, amber when partial, red when unbacked."""
    if claimed <= 0:
        return "none"
    if actual >= claimed:
        return "match"
    if actual >= claimed * 0.5:
        return "partial"
    return "mismatch"


_RANK = {"none": 0, "match": 1, "partial": 2, "mismatch": 3}


def build_match(*, claimed_cc: float, claimed_enrollment: float, actuals: CurrentCcActuals) -> CurrentCcMatch:
    """Cross-check the self-declared sheet against RELIABLE activity (never app CC).

    - Enrollment leads: claimed vs actual leads added.
    - CC activity-backing: CCs are self-declared (trusted number), but if CCs are
      claimed with ZERO activity all day, that's a red flag — no app-CC read involved.
    """
    activity = actuals.activity_total
    cc_status = "none"
    if claimed_cc > 0:
        cc_status = "match" if activity > 0 else "mismatch"

    items = [
        CurrentCcMatchItem(
            metric="cc_activity",
            label="CCs backed by activity",
            claimed=claimed_cc,
            actual=float(activity),
            status=cc_status,
        ),
        CurrentCcMatchItem(
            metric="enrollment",
            label="Enrollment vs leads added",
            claimed=claimed_enrollment,
            actual=float(actuals.leads_added),
            status=_match_status(claimed_enrollment, float(actuals.leads_added)),
        ),
    ]
    overall = max((it.status for it in items), key=lambda s: _RANK[s], default="none")
    return CurrentCcMatch(
        overall=overall,
        flagged=any(it.status == "mismatch" for it in items),
        items=items,
    )


def _display_name(u: User | None) -> str:
    if u is None:
        return "—"
    return u.name or u.username or u.fbo_id or f"User #{u.id}"


async def _can_access(session: AsyncSession, *, actor: AuthUser, subject_user_id: int) -> bool:
    """Self always; admin always; leader only for strict downline members."""
    if subject_user_id == actor.user_id:
        return True
    if actor.role == "admin":
        return True
    if actor.role == "leader":
        downline = await recursive_downline_user_ids(session, actor.user_id)
        return subject_user_id in downline
    return False


def _clean_names(raw: list[str] | None) -> list[str]:
    return [str(n).strip() for n in (raw or []) if str(n).strip()]


def _names_from_json(raw: object) -> list[str]:
    return [str(n) for n in raw] if isinstance(raw, list) else []


def _person_rows(raw: object) -> list[CcPersonRow]:
    rows = raw if isinstance(raw, list) else []
    return [CcPersonRow(**r) for r in rows if isinstance(r, dict)]


def _enrollment_rows(raw: object) -> list[EnrollmentRow]:
    rows = raw if isinstance(raw, list) else []
    return [EnrollmentRow(**r) for r in rows if isinstance(r, dict)]


def _lead_cycle_rows(raw: object) -> list[LeadCycleRow]:
    rows = raw if isinstance(raw, list) else []
    return [LeadCycleRow(**r) for r in rows if isinstance(r, dict)]


def _tracking_rows(raw: object) -> list[EnrollmentTrackingRow]:
    rows = raw if isinstance(raw, list) else []
    return [EnrollmentTrackingRow(**r) for r in rows if isinstance(r, dict)]


def _to_public(
    row: CurrentCcSheet,
    *,
    subject: User | None,
    filled_by: User | None,
    can_edit: bool,
) -> CurrentCcSheetPublic:
    closed = _person_rows(row.closed_persons)
    pending = _person_rows(row.pending_persons)
    enrollment = _enrollment_rows(row.enrollment_rows)
    lead_cycle = _lead_cycle_rows(row.lead_cycle_rows)
    closed_total = sum(r.ccs for r in closed)
    return CurrentCcSheetPublic(
        id=row.id,
        subject_user_id=row.subject_user_id,
        subject_name=_display_name(subject),
        sheet_date=row.sheet_date,
        filled_by_user_id=row.filled_by_user_id,
        filled_by_name=_display_name(filled_by) if filled_by else None,
        target_ccs=row.target_ccs,
        direct_persons=_names_from_json(row.direct_persons),
        direct_total_ccs=row.direct_total_ccs,
        real_active_persons=_names_from_json(row.real_active_persons),
        light_active_persons=_names_from_json(row.light_active_persons),
        closed_persons=closed,
        pending_persons=pending,
        enrollment_rows=enrollment,
        lead_cycle_rows=lead_cycle,
        lead_covered=row.lead_covered,
        process_check=row.process_check,
        enrollment_tracking_rows=_tracking_rows(row.enrollment_tracking_rows),
        drop_reason_remarks=row.drop_reason_remarks,
        improvement_area=row.improvement_area,
        closed_total_ccs=closed_total,
        pending_total_ccs=sum(r.ccs for r in pending),
        current_ccs=closed_total,
        enrollment_total=sum(r.total for r in enrollment),
        lead_cycle_checked=sum(1 for r in lead_cycle if r.checked),
        lead_cycle_total=len(lead_cycle),
        can_edit=can_edit,
        updated_at=row.updated_at,
    )


async def _user(session: AsyncSession, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def _attach_actuals(
    session: AsyncSession, public: CurrentCcSheetPublic
) -> CurrentCcSheetPublic:
    """Fill ``actuals`` + ``match`` by comparing the sheet's claims to real system data."""
    actuals = await compute_actuals(
        session, subject_user_id=public.subject_user_id, day=public.sheet_date
    )
    public.actuals = actuals
    public.match = build_match(
        claimed_cc=public.closed_total_ccs,
        claimed_enrollment=float(public.enrollment_total),
        actuals=actuals,
    )
    return public


async def get_sheet(
    session: AsyncSession,
    *,
    actor: AuthUser,
    subject_user_id: int,
    sheet_date: date,
) -> Optional[CurrentCcSheetPublic]:
    if not await _can_access(session, actor=actor, subject_user_id=subject_user_id):
        raise PermissionError("Not allowed to view this member's sheet.")
    row = (
        await session.execute(
            select(CurrentCcSheet).where(
                CurrentCcSheet.subject_user_id == subject_user_id,
                CurrentCcSheet.sheet_date == sheet_date,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    subject = await _user(session, subject_user_id)
    filled_by = await _user(session, row.filled_by_user_id)
    public = _to_public(row, subject=subject, filled_by=filled_by, can_edit=True)
    return await _attach_actuals(session, public)


async def upsert_sheet(
    session: AsyncSession,
    *,
    actor: AuthUser,
    payload: CurrentCcSheetUpsert,
) -> CurrentCcSheetPublic:
    if not await _can_access(session, actor=actor, subject_user_id=payload.subject_user_id):
        raise PermissionError("Not allowed to edit this member's sheet.")
    if actor.role != "admin" and payload.sheet_date != today_ist():
        raise ValueError("Only today's Current CC sheet can be saved.")

    row = (
        await session.execute(
            select(CurrentCcSheet).where(
                CurrentCcSheet.subject_user_id == payload.subject_user_id,
                CurrentCcSheet.sheet_date == payload.sheet_date,
            )
        )
    ).scalar_one_or_none()

    if row is None:
        row = CurrentCcSheet(
            subject_user_id=payload.subject_user_id,
            sheet_date=payload.sheet_date,
        )
        session.add(row)

    row.filled_by_user_id = actor.user_id
    row.target_ccs = payload.target_ccs
    row.direct_persons = _clean_names(payload.direct_persons)
    row.direct_total_ccs = payload.direct_total_ccs
    row.real_active_persons = _clean_names(payload.real_active_persons)
    row.light_active_persons = _clean_names(payload.light_active_persons)
    row.closed_persons = [
        r.model_dump() for r in payload.closed_persons if r.name.strip() or r.ccs
    ]
    row.pending_persons = [
        r.model_dump() for r in payload.pending_persons if r.name.strip() or r.ccs
    ]
    row.enrollment_rows = [
        r.model_dump() for r in payload.enrollment_rows if r.name.strip() or r.fresh_lead or r.old_lead
    ]
    row.lead_cycle_rows = [
        r.model_dump()
        for r in payload.lead_cycle_rows
        if r.name.strip() or r.enrollment or r.budget_check or r.checked
    ]
    row.lead_covered = (payload.lead_covered or "").strip() or None
    row.process_check = (payload.process_check or "").strip() or None
    row.enrollment_tracking_rows = [
        r.model_dump()
        for r in payload.enrollment_tracking_rows
        if r.name.strip() or r.current_state.strip() or r.drop_continue.strip() or r.day1.strip()
    ]
    row.drop_reason_remarks = (payload.drop_reason_remarks or "").strip() or None
    row.improvement_area = (payload.improvement_area or "").strip() or None

    await session.commit()
    await session.refresh(row)

    subject = await _user(session, payload.subject_user_id)
    filled_by = await _user(session, actor.user_id)
    public = _to_public(row, subject=subject, filled_by=filled_by, can_edit=True)
    return await _attach_actuals(session, public)


async def get_overview(
    session: AsyncSession, *, actor: AuthUser, day: date
) -> CurrentCcOverviewResponse:
    """Admin/leader board — every scoped member: filled today?, CC vs target, match flag."""
    members = await list_team_members(session, actor=actor)
    member_ids = [m.user_id for m in members]
    sheets = (
        await session.execute(
            select(CurrentCcSheet).where(
                CurrentCcSheet.subject_user_id.in_(member_ids),
                CurrentCcSheet.sheet_date == day,
            )
        )
    ).scalars().all()
    by_subject = {s.subject_user_id: s for s in sheets}

    rows: list[CurrentCcOverviewRow] = []
    flagged = 0
    not_filled = 0
    for m in members:
        sheet = by_subject.get(m.user_id)
        actuals = await compute_actuals(session, subject_user_id=m.user_id, day=day)
        if sheet is None:
            not_filled += 1
            rows.append(
                CurrentCcOverviewRow(
                    subject_user_id=m.user_id,
                    subject_name=m.name,
                    filled=False,
                    activity_total=actuals.activity_total,
                )
            )
            continue
        closed = _person_rows(sheet.closed_persons)
        enrollment = _enrollment_rows(sheet.enrollment_rows)
        current_cc = sum(r.ccs for r in closed)
        target = sheet.target_ccs or 0.0
        match = build_match(
            claimed_cc=current_cc,
            claimed_enrollment=float(sum(r.total for r in enrollment)),
            actuals=actuals,
        )
        if match.flagged:
            flagged += 1
        rows.append(
            CurrentCcOverviewRow(
                subject_user_id=m.user_id,
                subject_name=m.name,
                filled=True,
                current_ccs=current_cc,
                target_ccs=target,
                gap=target - current_cc,
                activity_total=actuals.activity_total,
                match_overall=match.overall,
                flagged=match.flagged,
            )
        )
    # Flagged + not-filled float to the top for the admin's attention.
    rows.sort(key=lambda r: (not r.flagged, r.filled, r.subject_name.lower()))
    return CurrentCcOverviewResponse(
        sheet_date=day,
        rows=rows,
        flagged_count=flagged,
        not_filled_count=not_filled,
    )


async def list_team_members(session: AsyncSession, *, actor: AuthUser) -> list[TeamMemberOption]:
    """Subjects the actor may fill a sheet for. Members get just themselves."""
    if actor.role == "admin":
        rows = (await session.execute(select(User).order_by(User.name))).scalars().all()
        return [TeamMemberOption(user_id=u.id, name=_display_name(u)) for u in rows]
    ids: list[int] = [actor.user_id]
    if actor.role == "leader":
        downline = await recursive_downline_user_ids(session, actor.user_id)
        ids = [actor.user_id, *downline]
    rows = (
        await session.execute(select(User).where(User.id.in_(ids)).order_by(User.name))
    ).scalars().all()
    return [TeamMemberOption(user_id=u.id, name=_display_name(u)) for u in rows]


async def get_trends(
    session: AsyncSession,
    *,
    actor: AuthUser,
    subject_user_id: int,
    days: int,
) -> CurrentCcTrendResponse:
    if not await _can_access(session, actor=actor, subject_user_id=subject_user_id):
        raise PermissionError("Not allowed to view this member's trends.")
    days = max(1, min(days, 90))
    start = today_ist() - timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(CurrentCcSheet)
            .where(
                CurrentCcSheet.subject_user_id == subject_user_id,
                CurrentCcSheet.sheet_date >= start,
            )
            .order_by(CurrentCcSheet.sheet_date)
        )
    ).scalars().all()

    # Reliable activity per day for the same window (calls / leads / follow-ups).
    stats = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id == subject_user_id,
                DailyMemberStat.stat_date >= start,
            )
        )
    ).scalars().all()
    stat_by_day = {s.stat_date: s for s in stats}

    points: list[CurrentCcTrendPoint] = []
    for row in rows:
        closed = _person_rows(row.closed_persons)
        enrollment = _enrollment_rows(row.enrollment_rows)
        stat = stat_by_day.get(row.sheet_date)
        points.append(
            CurrentCcTrendPoint(
                date=row.sheet_date,
                direct=len(_names_from_json(row.direct_persons)),
                real_active=len(_names_from_json(row.real_active_persons)),
                light_active=len(_names_from_json(row.light_active_persons)),
                closed=len(closed),
                closed_ccs=sum(r.ccs for r in closed),
                enrollment_total=sum(r.total for r in enrollment),
                target_ccs=row.target_ccs or 0.0,
                calls=stat.calls_count if stat else 0,
                leads_added=stat.leads_added_count if stat else 0,
                followups=stat.followups_done_count if stat else 0,
            )
        )
    return CurrentCcTrendResponse(subject_user_id=subject_user_id, points=points)


def _pct(current: float, previous: float) -> Optional[float]:
    if previous <= 0:
        return None
    return round((current - previous) / previous * 100, 1)


async def get_compare(
    session: AsyncSession, *, actor: AuthUser, subject_user_id: int
) -> CcCompareResponse:
    """Period-over-period growth: last 7d vs prior 7d, last 30d vs prior 30d."""
    if not await _can_access(session, actor=actor, subject_user_id=subject_user_id):
        raise PermissionError("Not allowed to view this member's growth.")
    today = today_ist()
    horizon = today - timedelta(days=59)

    sheets = (
        await session.execute(
            select(CurrentCcSheet)
            .where(
                CurrentCcSheet.subject_user_id == subject_user_id,
                CurrentCcSheet.sheet_date >= horizon,
            )
            .order_by(CurrentCcSheet.sheet_date)
        )
    ).scalars().all()
    stats = (
        await session.execute(
            select(DailyMemberStat).where(
                DailyMemberStat.user_id == subject_user_id,
                DailyMemberStat.stat_date >= horizon,
            )
        )
    ).scalars().all()

    def cc_snapshot(start: date, end: date) -> float:
        """Latest closed-CC total within [start, end] (CC is a running snapshot)."""
        in_window = [s for s in sheets if start <= s.sheet_date <= end]
        if not in_window:
            return 0.0
        latest = max(in_window, key=lambda s: s.sheet_date)
        return sum(r.ccs for r in _person_rows(latest.closed_persons))

    def activity_sum(start: date, end: date) -> int:
        return sum(
            (s.calls_count + s.leads_added_count + s.followups_done_count)
            for s in stats
            if start <= s.stat_date <= end
        )

    def period(label: str, span: int) -> CcComparePeriod:
        cur_start = today - timedelta(days=span - 1)
        prev_end = cur_start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=span - 1)
        cc_cur = cc_snapshot(cur_start, today)
        cc_prev = cc_snapshot(prev_start, prev_end)
        act_cur = activity_sum(cur_start, today)
        act_prev = activity_sum(prev_start, prev_end)
        return CcComparePeriod(
            label=label,
            cc_current=cc_cur,
            cc_previous=cc_prev,
            cc_pct=_pct(cc_cur, cc_prev),
            activity_current=act_cur,
            activity_previous=act_prev,
            activity_pct=_pct(float(act_cur), float(act_prev)),
        )

    return CcCompareResponse(
        subject_user_id=subject_user_id,
        week=period("Last 7 days", 7),
        month=period("Last 30 days", 30),
    )
