"""FLP rank & CC tracking service.

Rank thresholds (cumulative personal CC):
  - none / fbo                  → < 4 CC in no consecutive active months
  - assistant_supervisor (AS)   → 2 consecutive active months (≥4 CC total, ≥1 personal each)
  - supervisor                  → cumulative 25 CC
  - assistant_manager           → cumulative 75 CC
  - manager                     → cumulative 120 CC

Active month rule: total_cc ≥ 4 AND personal_cc ≥ 1.

Ranks are monotonic — once achieved they do not downgrade.
Admin can manually set rank for edge cases (e.g. Manager via the 3-4 month 150 CC path).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flp_cc_entry import FLPCCEntry
from app.models.flp_monthly_cc import FLPMonthlyCC
from app.models.user import User

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RANK_ORDER = [
    "none",
    "preferred_customer",
    "fbo",
    "assistant_supervisor",
    "supervisor",
    "assistant_manager",
    "manager",
]

# Cumulative personal CC thresholds for automatic rank suggestions
CC_THRESHOLDS = {
    "supervisor": 25.0,
    "assistant_manager": 75.0,
    "manager": 120.0,
}

RANK_LABELS = {
    "none": "Not Started",
    "preferred_customer": "Preferred Customer",
    "fbo": "FBO",
    "assistant_supervisor": "Assistant Supervisor",
    "supervisor": "Supervisor",
    "assistant_manager": "Assistant Manager",
    "manager": "Manager",
}

ACTIVE_MIN_TOTAL_CC = 4.0
ACTIVE_MIN_PERSONAL_CC = 1.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rank_index(rank: str) -> int:
    try:
        return RANK_ORDER.index(rank)
    except ValueError:
        return 0


def _current_ym() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def is_active_month(personal_cc: float, total_cc: float) -> bool:
    return total_cc >= ACTIVE_MIN_TOTAL_CC and personal_cc >= ACTIVE_MIN_PERSONAL_CC


# ---------------------------------------------------------------------------
# Monthly CC rollup
# ---------------------------------------------------------------------------

async def upsert_monthly_rollup(session: AsyncSession, user_id: int, year_month: str) -> FLPMonthlyCC:
    """Recompute and persist monthly CC rollup for a user+month from raw entries."""
    personal_sum = (
        await session.execute(
            select(func.coalesce(func.sum(FLPCCEntry.cc_amount), 0.0)).where(
                FLPCCEntry.user_id == user_id,
                FLPCCEntry.year_month == year_month,
                FLPCCEntry.entry_type == "personal",
            )
        )
    ).scalar_one()

    group_sum = (
        await session.execute(
            select(func.coalesce(func.sum(FLPCCEntry.cc_amount), 0.0)).where(
                FLPCCEntry.user_id == user_id,
                FLPCCEntry.year_month == year_month,
                FLPCCEntry.entry_type == "group",
            )
        )
    ).scalar_one()

    total = float(personal_sum) + float(group_sum)
    active = is_active_month(float(personal_sum), total)

    row = (
        await session.execute(
            select(FLPMonthlyCC).where(
                FLPMonthlyCC.user_id == user_id,
                FLPMonthlyCC.year_month == year_month,
            )
        )
    ).scalar_one_or_none()

    if row is None:
        row = FLPMonthlyCC(
            user_id=user_id,
            year_month=year_month,
            personal_cc=float(personal_sum),
            group_cc=float(group_sum),
            total_cc=total,
            is_active=active,
        )
        session.add(row)
    else:
        row.personal_cc = float(personal_sum)
        row.group_cc = float(group_sum)
        row.total_cc = total
        row.is_active = active

    return row


# ---------------------------------------------------------------------------
# Rank recomputation
# ---------------------------------------------------------------------------

async def recompute_user_rank(session: AsyncSession, user_id: int) -> User:
    """Recalculate flp_rank and flp_cumulative_cc from stored CC entries.

    Only upgrades rank — never downgrades below current rank.
    """
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise ValueError(f"User {user_id} not found")

    # Cumulative personal CC
    cum_personal = (
        await session.execute(
            select(func.coalesce(func.sum(FLPCCEntry.cc_amount), 0.0)).where(
                FLPCCEntry.user_id == user_id,
                FLPCCEntry.entry_type == "personal",
            )
        )
    ).scalar_one()
    user.flp_cumulative_cc = float(cum_personal)

    # Check CC threshold ranks (supervisor+)
    suggested_rank = user.flp_rank
    for rank_name, threshold in sorted(CC_THRESHOLDS.items(), key=lambda x: x[1]):
        if float(cum_personal) >= threshold:
            if rank_index(rank_name) > rank_index(suggested_rank):
                suggested_rank = rank_name

    # Check AS qualification (2 consecutive active months)
    if rank_index(suggested_rank) < rank_index("assistant_supervisor"):
        active_months = (
            await session.execute(
                select(FLPMonthlyCC.year_month)
                .where(FLPMonthlyCC.user_id == user_id, FLPMonthlyCC.is_active.is_(True))
                .order_by(FLPMonthlyCC.year_month)
            )
        ).scalars().all()

        consecutive = _find_consecutive_pair(list(active_months))
        if consecutive:
            m1, m2 = consecutive
            user.flp_active_month_1 = m1
            user.flp_active_month_2 = m2
            if rank_index("assistant_supervisor") > rank_index(suggested_rank):
                suggested_rank = "assistant_supervisor"

    # Never downgrade
    if rank_index(suggested_rank) > rank_index(user.flp_rank):
        user.flp_rank = suggested_rank

    return user


def _find_consecutive_pair(months: list[str]) -> Optional[tuple[str, str]]:
    """Return first (m1, m2) that are calendar-consecutive YYYY-MM strings."""
    for i in range(len(months) - 1):
        y1, mo1 = map(int, months[i].split("-"))
        y2, mo2 = map(int, months[i + 1].split("-"))
        next_month = (mo1 % 12) + 1
        next_year = y1 + (1 if mo1 == 12 else 0)
        if y2 == next_year and mo2 == next_month:
            return months[i], months[i + 1]
    return None


# ---------------------------------------------------------------------------
# Summary helpers
# ---------------------------------------------------------------------------

async def get_user_flp_summary(session: AsyncSession, user_id: int) -> dict:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return {}

    current_ym = _current_ym()
    monthly = (
        await session.execute(
            select(FLPMonthlyCC).where(
                FLPMonthlyCC.user_id == user_id,
                FLPMonthlyCC.year_month == current_ym,
            )
        )
    ).scalar_one_or_none()

    next_rank, cc_needed = _next_rank_info(user.flp_rank, user.flp_cumulative_cc)

    return {
        "user_id": user_id,
        "flp_rank": user.flp_rank,
        "flp_rank_label": RANK_LABELS.get(user.flp_rank, user.flp_rank),
        "flp_cumulative_cc": user.flp_cumulative_cc,
        "current_month": current_ym,
        "current_month_personal_cc": monthly.personal_cc if monthly else 0.0,
        "current_month_group_cc": monthly.group_cc if monthly else 0.0,
        "current_month_total_cc": monthly.total_cc if monthly else 0.0,
        "current_month_active": monthly.is_active if monthly else False,
        "flp_active_month_1": user.flp_active_month_1,
        "flp_active_month_2": user.flp_active_month_2,
        "next_rank": next_rank,
        "next_rank_label": RANK_LABELS.get(next_rank, next_rank) if next_rank else None,
        "cc_needed_for_next_rank": cc_needed,
    }


def _next_rank_info(current_rank: str, cumulative_cc: float) -> tuple[Optional[str], Optional[float]]:
    idx = rank_index(current_rank)
    if idx >= len(RANK_ORDER) - 1:
        return None, None

    next_rank = RANK_ORDER[idx + 1]

    if next_rank in ("preferred_customer", "fbo"):
        return next_rank, None
    if next_rank == "assistant_supervisor":
        return next_rank, None  # requires active months, not just CC
    threshold = CC_THRESHOLDS.get(next_rank)
    if threshold is not None:
        needed = max(0.0, threshold - cumulative_cc)
        return next_rank, needed
    return next_rank, None


async def get_team_flp_summary(session: AsyncSession, user_ids: list[int]) -> list[dict]:
    if not user_ids:
        return []

    users = (
        await session.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()

    current_ym = _current_ym()
    monthly_rows = (
        await session.execute(
            select(FLPMonthlyCC).where(
                FLPMonthlyCC.user_id.in_(user_ids),
                FLPMonthlyCC.year_month == current_ym,
            )
        )
    ).scalars().all()
    monthly_map = {r.user_id: r for r in monthly_rows}

    result = []
    for u in users:
        m = monthly_map.get(u.id)
        result.append({
            "user_id": u.id,
            "name": u.name or u.fbo_id,
            "fbo_id": u.fbo_id,
            "flp_rank": u.flp_rank,
            "flp_rank_label": RANK_LABELS.get(u.flp_rank, u.flp_rank),
            "flp_cumulative_cc": u.flp_cumulative_cc,
            "current_month_total_cc": m.total_cc if m else 0.0,
            "current_month_active": m.is_active if m else False,
        })

    return sorted(result, key=lambda x: (-rank_index(x["flp_rank"]), -x["flp_cumulative_cc"]))
