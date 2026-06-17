"""Member behavior map — aggregates activity_log into a per-user behavior
profile: what they do (category mix), when they're active (hour / weekday
pattern), how consistent (active days, streak), and derived behavior tags,
over a 30/60-day window or lifetime.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.activity_log import ActivityLog

# Raw action → human category. Order matters (first match wins).
_CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("claim", ("lead.claimed", "lead.claimed_free", "lead:claimed", "lead:batch_claimed")),
    ("convert", ("lead_won", "lead.closed", "lead:closed", "lead.won")),
    ("sale", ("sale_",)),
    ("create", ("lead.created", "lead_created", "lead_added", "lead.pool_import", "lead.free_pool_import")),
    ("contact", ("lead_contacted", "lead.contacted")),
    ("educate", ("lead_education",)),
    ("reassign", ("reassign", "reassignment")),
    ("money", ("wallet",)),
]


def _category(action: str) -> str:
    a = action.lower()
    for cat, needles in _CATEGORY_RULES:
        for n in needles:
            if a.startswith(n) or n in a:
                return cat
    return "other"


def _ist_dt(stamp: datetime) -> datetime:
    """Normalize a stored stamp (naive=UTC in SQLite, aware in Postgres) to IST."""
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(IST)


def _tags(
    *,
    total: int,
    window_days: int,
    active_days: int,
    by_category: dict[str, int],
    peak_hour: int | None,
) -> list[str]:
    tags: list[str] = []

    # Consistency
    if window_days > 0:
        ratio = active_days / window_days
        if ratio >= 0.7:
            tags.append("Consistent")
        elif ratio >= 0.3:
            tags.append("Irregular")
        else:
            tags.append("Low presence")

    # Dominant behavior
    if by_category:
        top = max(by_category.items(), key=lambda kv: kv[1])[0]
        tags.append(
            {
                "claim": "Lead grabber",
                "convert": "Closer",
                "sale": "Biller",
                "create": "Sourcer",
                "contact": "Caller",
                "educate": "Educator",
                "reassign": "Re-router",
                "money": "Wallet activity",
            }.get(top, "Mixed")
        )

    # Active window
    if peak_hour is not None:
        if peak_hour < 12:
            tags.append("Morning worker")
        elif peak_hour < 17:
            tags.append("Afternoon worker")
        else:
            tags.append("Evening worker")

    # Volume
    if window_days > 0 and total / max(window_days, 1) >= 10:
        tags.append("High output")

    return tags


async def build_activity_map(session: AsyncSession, *, user_id: int, days: int) -> dict:
    """``days=0`` ⇒ lifetime. Otherwise the last ``days`` calendar days (IST)."""
    today = datetime.now(IST).date()
    lifetime = days <= 0
    start: date | None = None if lifetime else today - timedelta(days=days - 1)

    stmt = select(ActivityLog.created_at, ActivityLog.action).where(ActivityLog.user_id == user_id)
    if start is not None:
        # Coarse UTC filter with a 1-day buffer; precise IST bucketing below.
        stmt = stmt.where(ActivityLog.created_at >= datetime.combine(start - timedelta(days=1), datetime.min.time()))

    rows = (await session.execute(stmt)).all()

    by_category: dict[str, int] = defaultdict(int)
    by_hour = [0] * 24
    by_dow = [0] * 7  # Mon=0 .. Sun=6
    by_day: dict[date, int] = defaultdict(int)
    total = 0
    first_at: datetime | None = None
    last_at: datetime | None = None

    for created_at, action in rows:
        ist = _ist_dt(created_at)
        d = ist.date()
        if start is not None and (d < start or d > today):
            continue
        total += 1
        by_category[_category(action)] += 1
        by_hour[ist.hour] += 1
        by_dow[ist.weekday()] += 1
        by_day[d] += 1
        if first_at is None or ist < first_at:
            first_at = ist
        if last_at is None or ist > last_at:
            last_at = ist

    # Window for consistency: lifetime → first activity → today.
    if lifetime:
        window_start = first_at.date() if first_at else today
    else:
        window_start = start  # type: ignore[assignment]
    window_days = (today - window_start).days + 1 if window_start else 0
    active_days = len(by_day)

    # Longest active-day streak.
    longest_streak = 0
    if by_day:
        ordered = sorted(by_day.keys())
        run = 1
        longest_streak = 1
        for prev, cur in zip(ordered, ordered[1:]):
            run = run + 1 if (cur - prev).days == 1 else 1
            longest_streak = max(longest_streak, run)

    # Daily series for the chart — last min(window, 90) days, zero-filled.
    series_days = min(window_days, 90) if window_days else 0
    series_start = today - timedelta(days=series_days - 1) if series_days else today
    daily_series = [
        {"date": (series_start + timedelta(days=i)).isoformat(), "count": by_day.get(series_start + timedelta(days=i), 0)}
        for i in range(series_days)
    ]

    peak_hour = max(range(24), key=lambda h: by_hour[h]) if total else None
    peak_dow = max(range(7), key=lambda d: by_dow[d]) if total else None

    return {
        "user_id": user_id,
        "days": days,
        "lifetime": lifetime,
        "total": total,
        "active_days": active_days,
        "window_days": window_days,
        "consistency_pct": round(active_days / window_days * 100) if window_days else 0,
        "longest_streak": longest_streak,
        "first_at": first_at.isoformat() if first_at else None,
        "last_at": last_at.isoformat() if last_at else None,
        "peak_hour": peak_hour,
        "peak_dow": peak_dow,
        "by_category": dict(by_category),
        "by_hour": by_hour,
        "by_dow": by_dow,
        "daily_series": daily_series,
        "tags": _tags(
            total=total,
            window_days=window_days,
            active_days=active_days,
            by_category=dict(by_category),
            peak_hour=peak_hour,
        ),
    }
