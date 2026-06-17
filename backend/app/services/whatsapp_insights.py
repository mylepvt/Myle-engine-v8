"""Build personalized performance insight messages for WhatsApp."""
from __future__ import annotations

import asyncio
import calendar
import json
import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import today_ist
from app.models.daily_report import DailyReport
from app.models.user import User

logger = logging.getLogger(__name__)

_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_DAY_NAMES_HI = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _date_range(period: int) -> tuple[date, date]:
    end = today_ist() - timedelta(days=1)  # yesterday (today not complete yet)
    start = end - timedelta(days=period - 1)
    return start, end


def _streak(submitted_dates: set[date], end_date: date) -> int:
    streak = 0
    d = end_date
    while d in submitted_dates:
        streak += 1
        d -= timedelta(days=1)
    return streak


def _build_7day_message(first_name: str, reports: list[DailyReport], period_start: date, period_end: date) -> str:
    submitted: dict[date, DailyReport] = {r.report_date: r for r in reports}
    total_days = (period_end - period_start).days + 1
    submitted_count = len(submitted)
    total_calls = sum((r.total_calling or 0) for r in reports)
    streak = _streak(set(submitted.keys()), period_end)

    # Which days missed
    missed = []
    for i in range(total_days):
        d = period_start + timedelta(days=i)
        if d not in submitted:
            missed.append(_DAY_NAMES[d.weekday()])

    # Best call day
    best_day_entry = max(reports, key=lambda r: r.total_calling or 0, default=None)
    best_day_str = ""
    if best_day_entry and (best_day_entry.total_calling or 0) > 0:
        best_day_str = f"{_DAY_NAMES[best_day_entry.report_date.weekday()]} ({best_day_entry.total_calling} calls)"

    lines = [f"Hi {first_name},", "", "Here's your performance summary for the last 7 days:"]
    lines.append(f"✅ Reports submitted: {submitted_count}/{total_days}")
    lines.append(f"🔥 Current streak: {streak} day{'s' if streak != 1 else ''}")
    lines.append(f"📞 Total calls made: {total_calls}")
    if missed:
        lines.append(f"⚠️ Days missed: {', '.join(missed)}")
    if best_day_str:
        lines.append(f"💪 Best day: {best_day_str}")
    lines.append("")
    lines.append("Keep it up — consistency is everything.")
    lines.append("")
    lines.append("— Myle Team")
    return "\n".join(lines)


def _build_30day_message(first_name: str, reports: list[DailyReport], period_start: date, period_end: date) -> str:
    submitted: dict[date, DailyReport] = {r.report_date: r for r in reports}
    total_days = (period_end - period_start).days + 1
    submitted_count = len(submitted)

    # Best streak
    best_streak = current = 0
    d = period_start
    while d <= period_end:
        if d in submitted:
            current += 1
            best_streak = max(best_streak, current)
        else:
            current = 0
        d += timedelta(days=1)

    # Weekly breakdown (4 weeks)
    week_stats: list[dict[str, int]] = []
    for w in range(4):
        ws = period_end - timedelta(days=6 + w * 7)
        we = period_end - timedelta(days=w * 7)
        w_reports = [r for r in reports if ws <= r.report_date <= we]
        week_stats.insert(0, {
            "calls": sum(r.total_calling or 0 for r in w_reports),
            "reports": len(w_reports),
        })

    avg_calls = round(sum(r.total_calling or 0 for r in reports) / max(submitted_count, 1))

    # Day-of-week miss pattern (only flag if missed 3+ out of 4 weeks)
    weekday_misses: dict[int, int] = defaultdict(int)
    d = period_start
    while d <= period_end:
        if d not in submitted:
            weekday_misses[d.weekday()] += 1
        d += timedelta(days=1)
    pattern_day = None
    for wd, count in weekday_misses.items():
        if count >= 3:
            pattern_day = (_DAY_NAMES_HI[wd], count)
            break

    lines = [f"Hi {first_name},", "", "Here's your 30-day performance analysis:"]
    lines.append(f"✅ Reports submitted: {submitted_count}/{total_days}")
    lines.append(f"🔥 Best streak: {best_streak} day{'s' if best_streak != 1 else ''}")
    lines.append(f"📞 Average calls/day: {avg_calls}")
    lines.append("")
    lines.append("📊 Weekly breakdown (oldest → recent):")
    for i, ws in enumerate(week_stats, 1):
        lines.append(f"  Week {i}: {ws['calls']} calls · {ws['reports']}/7 reports")
    if pattern_day:
        lines.append("")
        lines.append(f"⚠️ Pattern noticed: Reports were missed on {pattern_day[0]} in {pattern_day[1]} out of the last 4 weeks.")
        lines.append("💡 Try to stay consistent on that day — small habits make big results.")
    lines.append("")
    lines.append("— Myle Team")
    return "\n".join(lines)


async def build_insight_message(*, user: User, period: int, session: AsyncSession) -> str:
    first_name = ((user.name or "").strip() or "there").split()[0]
    start, end = _date_range(period)

    reports = (
        await session.execute(
            select(DailyReport).where(
                and_(
                    DailyReport.user_id == user.id,
                    DailyReport.report_date >= start,
                    DailyReport.report_date <= end,
                )
            )
        )
    ).scalars().all()

    if period <= 7:
        return _build_7day_message(first_name, list(reports), start, end)
    return _build_30day_message(first_name, list(reports), start, end)
