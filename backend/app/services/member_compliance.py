from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST, today_ist
from app.models.daily_report import DailyReport
from app.models.user import User
from app.services.live_metrics import (
    fresh_call_counts_by_user,
    fresh_lead_counts_by_user,
    get_daily_call_target,
)

ComplianceLevel = Literal[
    "clear",
    "warning",
    "strong_warning",
    "final_warning",
    "grace",
    "grace_ending",
    "removed",
    "not_applicable",
]

_ELIGIBLE_ROLES = {"team", "leader"}
_DISCIPLINE_WINDOW_DAYS = 4


@dataclass(slots=True)
class ComplianceSnapshot:
    user_id: int
    eligible: bool
    call_target: int
    calls_short_streak: int = 0
    missing_report_streak: int = 0
    compliance_level: ComplianceLevel = "clear"
    compliance_title: str = "Clear"
    compliance_summary: str = "No active discipline warning."
    access_blocked: bool = False
    discipline_status: str = "active"
    grace_end_date: date | None = None
    grace_reason: str | None = None
    grace_active: bool = False
    grace_ending_tomorrow: bool = False
    removed_at: datetime | None = None
    removal_reason: str | None = None


def _normalize_user_ids(user_ids: Iterable[int]) -> list[int]:
    return sorted({int(uid) for uid in user_ids if uid is not None})


def _completed_business_days(today: date, *, count: int = _DISCIPLINE_WINDOW_DAYS) -> list[date]:
    return [today - timedelta(days=offset) for offset in range(1, count + 1)]


def _stage_for_streak(streak: int) -> ComplianceLevel:
    if streak >= 4:
        return "removed"
    if streak == 3:
        return "final_warning"
    if streak == 2:
        return "strong_warning"
    if streak == 1:
        return "warning"
    return "clear"


def _stage_rank(level: ComplianceLevel) -> int:
    return {
        "not_applicable": 0,
        "clear": 0,
        "grace": 1,
        "grace_ending": 2,
        "warning": 3,
        "strong_warning": 4,
        "final_warning": 5,
        "removed": 6,
    }.get(level, 0)


def _streak_label(prefix: str, streak: int, *, target: int | None = None) -> str:
    if prefix == "calls":
        return f"Below {target or 15} fresh calls for {streak} day{'s' if streak != 1 else ''}"
    return f"Daily report missing for {streak} day{'s' if streak != 1 else ''}"


def _is_active_grace(user: User, today: date) -> bool:
    return (
        bool(user.grace_end_date)
        and (user.discipline_status or "").strip().lower() == "grace"
        and user.grace_end_date >= today
    )


def _has_expired_grace(user: User, today: date) -> bool:
    return (
        bool(user.grace_end_date)
        and (user.discipline_status or "").strip().lower() == "grace"
        and user.grace_end_date < today
    )


def _user_business_start_date(user: User) -> date:
    created_at = user.created_at
    if created_at.tzinfo is None:
        return created_at.date()
    return created_at.astimezone(IST).date()


def _calls_short_streak(
    *,
    user: User,
    days: list[date],
    call_target: int,
    fresh_leads_by_day: dict[date, dict[int, int]],
    fresh_calls_by_day: dict[date, dict[int, int]],
) -> int:
    streak = 0
    reset_on = user.discipline_reset_on
    created_on = _user_business_start_date(user)
    for day in days:
        if day < created_on:
            break
        if reset_on is not None and day < reset_on:
            break
        fresh_leads = int(fresh_leads_by_day.get(day, {}).get(user.id, 0))
        calls = int(fresh_calls_by_day.get(day, {}).get(user.id, 0))
        if fresh_leads > 0 and calls < call_target:
            streak += 1
            continue
        break
    return streak


def _missing_report_streak(
    *,
    user: User,
    days: list[date],
    submitted_reports: set[tuple[int, date]],
) -> int:
    streak = 0
    reset_on = user.discipline_reset_on
    created_on = _user_business_start_date(user)
    for day in days:
        if day < created_on:
            break
        if reset_on is not None and day < reset_on:
            break
        if (user.id, day) not in submitted_reports:
            streak += 1
            continue
        break
    return streak


def _mark_removed(
    user: User,
    *,
    reason: str,
    removed_by_user_id: int | None,
    now: datetime,
) -> None:
    user.access_blocked = True
    user.discipline_status = "removed"
    user.removed_at = now
    user.removed_by_user_id = removed_by_user_id
    user.removal_reason = reason


def _summarize_active_stage(
    *,
    level: ComplianceLevel,
    calls_short_streak: int,
    missing_report_streak: int,
    call_target: int,
) -> tuple[str, str]:
    labels: list[str] = []
    if calls_short_streak > 0:
        labels.append(_streak_label("calls", calls_short_streak, target=call_target))
    if missing_report_streak > 0:
        labels.append(_streak_label("reports", missing_report_streak))

    if level == "warning":
        title = "Warning"
    elif level == "strong_warning":
        title = "Strong warning"
    elif level == "final_warning":
        title = "Final warning"
    else:
        title = "Clear"

    if not labels:
        return title, "No active discipline warning."
    return title, " | ".join(labels)


async def build_compliance_snapshots(
    session: AsyncSession,
    user_ids: Iterable[int],
    *,
    today: date | None = None,
    apply_actions: bool = False,
) -> dict[int, ComplianceSnapshot]:
    ids = _normalize_user_ids(user_ids)
    if not ids:
        return {}

    rows = (
        await session.execute(
            select(User).where(User.id.in_(ids))
        )
    ).scalars().all()
    if not rows:
        return {}

    today_date = today or today_ist()
    completed_days = _completed_business_days(today_date)
    call_target = await get_daily_call_target(session)

    eligible_ids = [
        user.id
        for user in rows
        if (user.role or "").strip().lower() in _ELIGIBLE_ROLES
        and (user.registration_status or "").strip().lower() == "approved"
    ]

    fresh_leads_by_day: dict[date, dict[int, int]] = {}
    fresh_calls_by_day: dict[date, dict[int, int]] = {}
    submitted_reports: set[tuple[int, date]] = set()

    if eligible_ids:
        for day in completed_days:
            fresh_leads_by_day[day] = await fresh_lead_counts_by_user(session, eligible_ids, day)
            fresh_calls_by_day[day] = await fresh_call_counts_by_user(session, eligible_ids, day)

        report_rows = (
            await session.execute(
                select(DailyReport.user_id, DailyReport.report_date).where(
                    DailyReport.user_id.in_(eligible_ids),
                    DailyReport.report_date.in_(completed_days),
                )
            )
        ).all()
        submitted_reports = {
            (int(user_id), report_date)
            for user_id, report_date in report_rows
        }

    now = datetime.now(timezone.utc)
    changed = False
    snapshots: dict[int, ComplianceSnapshot] = {}

    for user in rows:
        status = (user.discipline_status or "").strip().lower() or "active"
        snapshot = ComplianceSnapshot(
            user_id=user.id,
            eligible=user.id in eligible_ids,
            call_target=call_target,
            access_blocked=bool(user.access_blocked),
            discipline_status=status,
            grace_end_date=user.grace_end_date,
            grace_reason=(user.grace_reason or "").strip() or None,
            removed_at=user.removed_at,
            removal_reason=(user.removal_reason or "").strip() or None,
        )

        if not snapshot.eligible:
            snapshot.compliance_level = "not_applicable"
            snapshot.compliance_title = "Not applicable"
            snapshot.compliance_summary = "Performance rules apply only to approved leader and team accounts."
            snapshots[user.id] = snapshot
            continue

        if user.access_blocked or status == "removed":
            snapshot.compliance_level = "removed"
            snapshot.compliance_title = "Removed from system"
            snapshot.compliance_summary = snapshot.removal_reason or "Access is blocked for this member."
            snapshots[user.id] = snapshot
            continue

        if _has_expired_grace(user, today_date):
            reason = (
                f"Grace ended on {user.grace_end_date.isoformat()} and the system removed this member."
            )
            if apply_actions:
                _mark_removed(user, reason=reason, removed_by_user_id=None, now=now)
                changed = True
            snapshot.access_blocked = True
            snapshot.discipline_status = "removed"
            snapshot.removed_at = now
            snapshot.removal_reason = reason
            snapshot.compliance_level = "removed"
            snapshot.compliance_title = "Removed after grace"
            snapshot.compliance_summary = reason
            snapshots[user.id] = snapshot
            continue

        if _is_active_grace(user, today_date):
            snapshot.grace_active = True
            snapshot.grace_ending_tomorrow = bool(
                user.grace_end_date == today_date + timedelta(days=1)
            )
            snapshot.compliance_level = "grace_ending" if snapshot.grace_ending_tomorrow else "grace"
            snapshot.compliance_title = (
                "Grace ends tomorrow" if snapshot.grace_ending_tomorrow else "Grace active"
            )
            detail = f"Grace active until {user.grace_end_date.isoformat()}"
            if snapshot.grace_reason:
                detail = f"{detail} | {snapshot.grace_reason}"
            if snapshot.grace_ending_tomorrow:
                detail = f"{detail} | 1 day left before auto-removal."
            snapshot.compliance_summary = detail
            snapshots[user.id] = snapshot
            continue

        snapshot.calls_short_streak = _calls_short_streak(
            user=user,
            days=completed_days,
            call_target=call_target,
            fresh_leads_by_day=fresh_leads_by_day,
            fresh_calls_by_day=fresh_calls_by_day,
        )
        snapshot.missing_report_streak = _missing_report_streak(
            user=user,
            days=completed_days,
            submitted_reports=submitted_reports,
        )

        call_level = _stage_for_streak(snapshot.calls_short_streak)
        report_level = _stage_for_streak(snapshot.missing_report_streak)
        winning_level = call_level if _stage_rank(call_level) >= _stage_rank(report_level) else report_level

        if winning_level == "removed":
            reason = " | ".join(
                label
                for label in (
                    _streak_label("calls", snapshot.calls_short_streak, target=call_target)
                    if snapshot.calls_short_streak >= 4
                    else None,
                    _streak_label("reports", snapshot.missing_report_streak)
                    if snapshot.missing_report_streak >= 4
                    else None,
                )
                if label
            ) or "Removed for repeated non-compliance."
            if apply_actions:
                _mark_removed(user, reason=reason, removed_by_user_id=None, now=now)
                changed = True
            snapshot.access_blocked = True
            snapshot.discipline_status = "removed"
            snapshot.removed_at = now
            snapshot.removal_reason = reason
            snapshot.compliance_level = "removed"
            snapshot.compliance_title = "Removed from system"
            snapshot.compliance_summary = reason
            snapshots[user.id] = snapshot
            continue

        snapshot.compliance_level = winning_level
        snapshot.compliance_title, snapshot.compliance_summary = _summarize_active_stage(
            level=winning_level,
            calls_short_streak=snapshot.calls_short_streak,
            missing_report_streak=snapshot.missing_report_streak,
            call_target=call_target,
        )
        snapshots[user.id] = snapshot

    if changed:
        await session.commit()

    return snapshots


async def ensure_user_compliance_snapshot(
    session: AsyncSession,
    *,
    user_id: int,
    today: date | None = None,
    apply_actions: bool = True,
) -> ComplianceSnapshot | None:
    return (await build_compliance_snapshots(
        session,
        [user_id],
        today=today,
        apply_actions=apply_actions,
    )).get(user_id)


async def count_submitted_reports_for_day(
    session: AsyncSession,
    user_ids: Iterable[int],
    day: date,
) -> dict[int, bool]:
    ids = _normalize_user_ids(user_ids)
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(DailyReport.user_id).where(
                DailyReport.user_id.in_(ids),
                DailyReport.report_date == day,
            )
        )
    ).scalars().all()
    submitted = {int(uid) for uid in rows}
    return {uid: uid in submitted for uid in ids}
