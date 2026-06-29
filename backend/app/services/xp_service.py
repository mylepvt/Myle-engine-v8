"""Anti-cheat XP service for Myle Community.

Monthly season reset
────────────────────
Every user's XP belongs to a "season" (year + month).  On the first XP-related
action in a new calendar month we:
  1. Archive the previous season's final XP + level into xp_monthly_archive.
  2. Reset xp_total → 0, xp_level → 'rookie', clear xp_events for that user.
  3. Update xp_season_year / xp_season_month to the current month.

This is a lazy reset — no cron job needed.  Admins can also trigger a manual
reset via the admin endpoint.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent
from app.models.xp_monthly_archive import XpMonthlyArchive
from app.services.push_service import send_push_to_user

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

XP_TABLE: dict[str, int] = {
    "login_daily": 5,
    "report_submitted": 25,       # process: +5
    "call_logged": 8,             # process: every call attempt
    "connected_call": 5,          # process: bonus when answered/callback
    "lead_contacted": 10,
    "followup_completed": 20,     # process: +5
    "lead_won": 50,               # result: halved — process actions now dominate
}

# Excluded from process score (result-only actions)
_RESULT_ACTIONS: frozenset[str] = frozenset({"lead_won"})

DAILY_CAP = 300
PER_LEAD_DAILY_ACTIONS = {"followup_completed", "call_logged", "connected_call"}

LEVEL_THRESHOLDS = [
    (1000, "legend"),
    (600, "elite"),
    (300, "pro"),
    (100, "agent"),
    (0, "rookie"),
]

NEXT_LEVEL_XP = {
    "rookie": 100,
    "agent": 300,
    "pro": 600,
    "elite": 1000,
    "legend": None,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _calculate_level(xp_total: int) -> str:
    for threshold, label in LEVEL_THRESHOLDS:
        if xp_total >= threshold:
            return label
    return "rookie"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _today_utc() -> date:
    return _now_utc().date()


async def _today_xp(session: AsyncSession, user_id: int) -> int:
    today = _today_utc()
    result = await session.execute(
        select(func.coalesce(func.sum(XpEvent.xp), 0)).where(
            XpEvent.user_id == user_id,
            func.date(XpEvent.created_at) == today,
        )
    )
    return int(result.scalar_one())


async def _already_granted_today(
    session: AsyncSession,
    user_id: int,
    action: str,
    lead_id: Optional[int],
) -> bool:
    today = _today_utc()
    q = select(func.count()).where(
        XpEvent.user_id == user_id,
        XpEvent.action == action,
        func.date(XpEvent.created_at) == today,
    )
    if lead_id is not None:
        q = q.where(XpEvent.lead_id == lead_id)
    count = int((await session.execute(q)).scalar_one())
    return count > 0


async def _already_granted_ever(
    session: AsyncSession,
    *,
    action: str,
    lead_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> bool:
    q = select(func.count()).where(XpEvent.action == action)
    if lead_id is not None:
        q = q.where(XpEvent.lead_id == lead_id)
    if user_id is not None:
        q = q.where(XpEvent.user_id == user_id)
    count = int((await session.execute(q)).scalar_one())
    return count > 0


# ---------------------------------------------------------------------------
# Monthly season reset
# ---------------------------------------------------------------------------

async def _maybe_reset_season(session: AsyncSession, user: User) -> None:
    """If the user's stored season != current month, archive + reset."""
    now = _now_utc()
    current_year = now.year
    current_month = now.month

    season_year = user.xp_season_year
    season_month = user.xp_season_month

    # First ever XP action — just stamp the season, no archive needed
    if season_year is None or season_month is None:
        user.xp_season_year = current_year
        user.xp_season_month = current_month
        return

    # Same month — nothing to do
    if season_year == current_year and season_month == current_month:
        return

    # New month → archive previous season
    prev_xp = user.xp_total or 0
    prev_level = _calculate_level(prev_xp)

    # Upsert archive row (ignore if already archived by a concurrent reset)
    existing = (await session.execute(
        select(XpMonthlyArchive).where(
            XpMonthlyArchive.user_id == user.id,
            XpMonthlyArchive.year == season_year,
            XpMonthlyArchive.month == season_month,
        )
    )).scalar_one_or_none()

    if existing is None:
        archive = XpMonthlyArchive(
            user_id=user.id,
            year=season_year,
            month=season_month,
            final_xp=prev_xp,
            final_level=prev_level,
        )
        session.add(archive)

    # Delete all xp_events for this user (clean slate for new season)
    await session.execute(
        delete(XpEvent).where(XpEvent.user_id == user.id)
    )

    # Reset user XP
    user.xp_total = 0
    user.xp_level = "rookie"
    user.xp_season_year = current_year
    user.xp_season_month = current_month

    await session.flush()


# ---------------------------------------------------------------------------
# Core XP operations
# ---------------------------------------------------------------------------

async def grant_xp(
    session: AsyncSession,
    user_id: int,
    action: str,
    lead_id: Optional[int] = None,
) -> Optional[int]:
    """Grant XP for an action. Returns xp granted or None if blocked."""
    xp_amount = XP_TABLE.get(action)
    if xp_amount is None:
        return None

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None

    # Admin excluded
    if user.role == "admin":
        return None

    # Monthly season check — reset if new month
    await _maybe_reset_season(session, user)

    # Login/report actions are single-claim per day even if callers retry.
    if action in {"login_daily", "report_submitted"}:
        if await _already_granted_today(session, user_id, action, None):
            return None

    # First-contact XP: once per user per lead. Per-user so reassigned leads
    # still let the new owner earn it.
    if action == "lead_contacted":
        if lead_id is None:
            return None
        if await _already_granted_ever(session, action=action, lead_id=lead_id, user_id=user_id):
            return None

    # lead_won anti-cheat: lead must be >24h old
    if action == "lead_won":
        if lead_id is None:
            return None
        lead = (await session.execute(select(Lead).where(Lead.id == lead_id))).scalar_one_or_none()
        if lead is None:
            return None
        age = _now_utc() - lead.created_at.replace(tzinfo=timezone.utc)
        if age < timedelta(hours=24):
            return None
        if await _already_granted_ever(session, action=action, lead_id=lead_id):
            return None

    # Per-lead per-day cap
    if action in PER_LEAD_DAILY_ACTIONS and lead_id is not None:
        if await _already_granted_today(session, user_id, action, lead_id):
            return None

    # Daily cap
    daily_xp = await _today_xp(session, user_id)
    if daily_xp >= DAILY_CAP:
        return None

    actual_xp = min(xp_amount, DAILY_CAP - daily_xp)

    event = XpEvent(user_id=user_id, action=action, xp=actual_xp, lead_id=lead_id)
    session.add(event)

    prev_level = user.xp_level or "rookie"
    user.xp_total = (user.xp_total or 0) + actual_xp
    user.xp_level = _calculate_level(user.xp_total)

    if user.xp_level != prev_level:
        try:
            await send_push_to_user(
                session,
                user.id,
                title="Level Up! 🎉",
                body=f"You reached {user.xp_level.title()} level. Keep it up!",
                url="/dashboard",
            )
        except Exception as exc:
            logger.warning("Level-up push failed user_id=%s: %s", user.id, exc)

    await session.flush()
    return actual_xp


async def revoke_won_xp(session: AsyncSession, lead_id: int) -> None:
    """Delete all lead_won XP events for a lead and deduct from each user total."""
    rows = (
        await session.execute(
            select(XpEvent).where(
                XpEvent.action == "lead_won",
                XpEvent.lead_id == lead_id,
            )
        )
    ).scalars().all()

    if not rows:
        return

    total_revoke_by_user: dict[int, int] = defaultdict(int)
    for event in rows:
        total_revoke_by_user[int(event.user_id)] += int(event.xp)

    await session.execute(
        delete(XpEvent).where(
            XpEvent.action == "lead_won",
            XpEvent.lead_id == lead_id,
        )
    )

    if total_revoke_by_user:
        users = (
            await session.execute(
                select(User).where(User.id.in_(tuple(total_revoke_by_user.keys()))),
            )
        ).scalars().all()
        for user in users:
            total_revoke = int(total_revoke_by_user.get(int(user.id), 0))
            if total_revoke <= 0:
                continue
            user.xp_total = max(0, (user.xp_total or 0) - total_revoke)
            user.xp_level = _calculate_level(user.xp_total)

    await session.flush()


# ---------------------------------------------------------------------------
# Admin manual reset (for testing or emergency)
# ---------------------------------------------------------------------------

async def admin_recalc_cutoff(session: AsyncSession, cutoff: datetime) -> dict:
    """Delete xp_events before cutoff, recalculate xp_total from remaining events.

    Used when the lazy monthly reset failed to fire for all users (e.g. users
    who never logged in during the new month).  Keeps post-cutoff points intact.
    """
    from sqlalchemy import func as sa_func

    now = _now_utc()
    users = (await session.execute(
        select(User).where(User.role != "admin")
    )).scalars().all()

    total_deleted = 0
    reset_count = 0
    for user in users:
        # Delete events before cutoff
        result = await session.execute(
            delete(XpEvent).where(
                XpEvent.user_id == user.id,
                XpEvent.created_at < cutoff,
            )
        )
        total_deleted += result.rowcount if result.rowcount is not None else 0

        # Recalculate from remaining events
        remaining = (await session.execute(
            select(sa_func.coalesce(sa_func.sum(XpEvent.xp), 0)).where(
                XpEvent.user_id == user.id,
            )
        )).scalar_one()

        old_total = user.xp_total or 0
        if old_total != remaining:
            user.xp_total = remaining
            user.xp_level = _calculate_level(remaining)
            reset_count += 1

        # Stamp season so lazy reset doesn't double-delete later
        user.xp_season_year = now.year
        user.xp_season_month = now.month

    await session.flush()
    return {
        "users_updated": reset_count,
        "events_deleted": total_deleted,
    }

async def admin_force_reset_all(session: AsyncSession) -> int:
    """Archive + reset XP for ALL users. Returns count of users reset."""
    now = _now_utc()
    users = (await session.execute(
        select(User).where(User.role != "admin")
    )).scalars().all()

    reset_count = 0
    for user in users:
        if (user.xp_total or 0) == 0:
            continue  # nothing to archive

        existing = (await session.execute(
            select(XpMonthlyArchive).where(
                XpMonthlyArchive.user_id == user.id,
                XpMonthlyArchive.year == now.year,
                XpMonthlyArchive.month == now.month,
            )
        )).scalar_one_or_none()

        if existing is None:
            archive = XpMonthlyArchive(
                user_id=user.id,
                year=now.year,
                month=now.month,
                final_xp=user.xp_total or 0,
                final_level=_calculate_level(user.xp_total or 0),
            )
            session.add(archive)

        await session.execute(delete(XpEvent).where(XpEvent.user_id == user.id))
        user.xp_total = 0
        user.xp_level = "rookie"
        user.xp_season_year = now.year
        user.xp_season_month = now.month
        reset_count += 1

    await session.flush()
    return reset_count


# ---------------------------------------------------------------------------
# Read queries
# ---------------------------------------------------------------------------

async def get_user_xp_summary(session: AsyncSession, user_id: int) -> dict:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return {}

    # Lazy season check on read too (so dashboard is always fresh)
    await _maybe_reset_season(session, user)

    daily_xp = await _today_xp(session, user_id)
    xp_total = user.xp_total or 0
    level = _calculate_level(xp_total)
    next_xp = NEXT_LEVEL_XP.get(level)

    if next_xp is None:
        progress_pct = 100.0
    else:
        prev_threshold = 0
        for threshold, label in reversed(LEVEL_THRESHOLDS):
            if label == level:
                prev_threshold = threshold
                break
        span = next_xp - prev_threshold
        progress_pct = round(min(100.0, (xp_total - prev_threshold) / span * 100), 1) if span > 0 else 100.0

    return {
        "xp_total": xp_total,
        "level": level,
        "daily_xp": daily_xp,
        "daily_cap": DAILY_CAP,
        "streak": user.login_streak or 0,
        "next_level_xp": next_xp,
        "progress_pct": progress_pct,
        "season_year": user.xp_season_year,
        "season_month": user.xp_season_month,
    }


async def get_user_xp_history(session: AsyncSession, user_id: int) -> list[dict]:
    """Past monthly archive for a user, newest first."""
    rows = (
        await session.execute(
            select(XpMonthlyArchive)
            .where(XpMonthlyArchive.user_id == user_id)
            .order_by(XpMonthlyArchive.year.desc(), XpMonthlyArchive.month.desc())
        )
    ).scalars().all()
    return [
        {"year": r.year, "month": r.month, "final_xp": r.final_xp, "final_level": r.final_level}
        for r in rows
    ]


async def get_process_leaderboard(
    session: AsyncSession,
    limit: int = 10,
    within_user_ids: Optional[list[int]] = None,
    days: int = 7,
) -> list[dict]:
    """Rank by process XP in last N days (excludes result actions like lead_won)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    q = (
        select(
            XpEvent.user_id,
            func.coalesce(func.sum(XpEvent.xp), 0).label("process_score"),
        )
        .where(
            ~XpEvent.action.in_(list(_RESULT_ACTIONS)),
            XpEvent.created_at >= cutoff,
        )
        .group_by(XpEvent.user_id)
        .order_by(func.sum(XpEvent.xp).desc())
        .limit(limit)
    )

    if within_user_ids is not None:
        q = q.where(XpEvent.user_id.in_(within_user_ids))

    rows = (await session.execute(q)).all()
    if not rows:
        return []

    user_ids = [r.user_id for r in rows]
    users_map = {
        u.id: u
        for u in (
            await session.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
    }

    result = []
    for rank, row in enumerate(rows, start=1):
        u = users_map.get(row.user_id)
        if u is None or u.role == "admin":
            continue
        result.append({
            "rank": rank,
            "user_id": u.id,
            "name": u.name or u.username or u.fbo_id,
            "fbo_id": u.fbo_id,
            "level": _calculate_level(u.xp_total or 0),
            "level_label": _calculate_level(u.xp_total or 0).title(),
            "xp_total": u.xp_total or 0,
            "process_score_7d": int(row.process_score),
        })
    return result


async def get_assignable_members(session: AsyncSession, days: int = 7) -> list[dict]:
    """All approved, active leaders + team members — admin reassign target picker.

    Unlike :func:`get_process_leaderboard` this is not capped and includes members
    with zero recent activity, so admin can hand a lead to *any* leader/member.
    Ranked by 7-day process score (then name) so strong performers float up, but
    the full roster is searchable on the client.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    users = (
        await session.execute(
            select(User).where(
                User.role.in_(("leader", "team")),
                User.registration_status == "approved",
                User.removed_at.is_(None),
                User.access_blocked.is_(False),
            )
        )
    ).scalars().all()
    if not users:
        return []

    user_ids = [u.id for u in users]
    score_rows = (
        await session.execute(
            select(
                XpEvent.user_id,
                func.coalesce(func.sum(XpEvent.xp), 0).label("process_score"),
            )
            .where(
                ~XpEvent.action.in_(list(_RESULT_ACTIONS)),
                XpEvent.created_at >= cutoff,
                XpEvent.user_id.in_(user_ids),
            )
            .group_by(XpEvent.user_id)
        )
    ).all()
    score_map = {r.user_id: int(r.process_score) for r in score_rows}

    result = []
    for u in users:
        level = _calculate_level(u.xp_total or 0)
        result.append({
            "user_id": u.id,
            "name": u.name or u.username or u.fbo_id,
            "fbo_id": u.fbo_id,
            "role": u.role,
            "level": level,
            "level_label": level.title(),
            "xp_total": u.xp_total or 0,
            "process_score_7d": score_map.get(u.id, 0),
        })
    result.sort(key=lambda r: (-r["process_score_7d"], (r["name"] or "").lower()))
    for rank, row in enumerate(result, start=1):
        row["rank"] = rank
    return result


async def get_leaderboard(session: AsyncSession, limit: int = 10) -> list[dict]:
    """Top 10 by cumulative season XP — leaders + team both eligible."""
    rows = (
        await session.execute(
            select(User)
            .where(User.role.in_(("leader", "team")))
            .order_by(User.xp_total.desc())
            .limit(limit)
        )
    ).scalars().all()

    result = []
    for rank, u in enumerate(rows, start=1):
        result.append({
            "rank": rank,
            "user_id": u.id,
            "name": u.name or u.username or u.fbo_id,
            "fbo_id": u.fbo_id,
            "level": _calculate_level(u.xp_total or 0),
            "level_label": _calculate_level(u.xp_total or 0).title(),
            "xp_total": u.xp_total or 0,
            "process_score_7d": 0,
        })
    return result
