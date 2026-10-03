"""Daily engagement pushes: a morning plan (9:00 IST) and an evening recap (20:30 IST).

The data builders are separate from the copy so the message wording can be
unit-tested without a database. All copy is English (app UI rule).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_event import CallEvent
from app.models.daily_report import DailyReport
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.models.xp_event import XpEvent
from app.services.live_metrics import ist_day_bounds


@dataclass
class MorningPlan:
    new_leads: int
    followups_due: int
    streak: int


@dataclass
class EveningRecap:
    calls_today: int
    calls_yesterday: int
    xp_today: int
    rank_today: int | None  # by today's XP among everyone eligible; None if no XP yet
    ranked_total: int
    report_submitted: bool


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


# ── Copy ─────────────────────────────────────────────────────────────────────

def morning_plan_message(plan: MorningPlan) -> tuple[str, str] | None:
    """(title, body), or None when there is nothing worth a push."""
    parts: list[str] = []
    if plan.new_leads:
        parts.append(f"{_plural(plan.new_leads, 'new lead')} to call")
    if plan.followups_due:
        parts.append(f"{_plural(plan.followups_due, 'follow-up')} due")
    if not parts and plan.streak < 2:
        return None
    body = " · ".join(parts) if parts else "Start your calls early and stay ahead today."
    if plan.streak >= 2:
        body += f". You're on a {plan.streak}-day streak — keep it going."
    else:
        body += "."
    return "Your plan for today", body


def evening_recap_message(recap: EveningRecap) -> tuple[str, str]:
    diff = recap.calls_today - recap.calls_yesterday
    if recap.calls_today == 0:
        calls_line = "No calls logged today."
    elif diff > 0:
        calls_line = f"{_plural(recap.calls_today, 'call')} today, {diff} more than yesterday."
    elif diff < 0:
        calls_line = f"{_plural(recap.calls_today, 'call')} today, {-diff} fewer than yesterday."
    else:
        calls_line = f"{_plural(recap.calls_today, 'call')} today, same as yesterday."

    rank_line = ""
    if recap.rank_today is not None and recap.xp_today > 0:
        rank_line = f" You earned {recap.xp_today} XP — #{recap.rank_today} of {recap.ranked_total} today."

    if not recap.report_submitted:
        return "Your day so far", f"{calls_line}{rank_line} Submit your daily report before midnight."
    return "Great work today", f"{calls_line}{rank_line} See you tomorrow."


# ── Data ─────────────────────────────────────────────────────────────────────

async def build_morning_plans(
    session: AsyncSession, users: list[User], today: date
) -> dict[int, MorningPlan]:
    ids = [u.id for u in users]
    if not ids:
        return {}
    _start, end = ist_day_bounds(today)

    new_leads = dict(
        (
            await session.execute(
                select(Lead.assigned_to_user_id, func.count(Lead.id))
                .where(
                    Lead.assigned_to_user_id.in_(ids),
                    Lead.deleted_at.is_(None),
                    Lead.archived_at.is_(None),
                    Lead.in_pool.is_(False),
                    Lead.call_count == 0,
                )
                .group_by(Lead.assigned_to_user_id)
            )
        ).all()
    )
    followups = dict(
        (
            await session.execute(
                select(Lead.assigned_to_user_id, func.count(FollowUp.id))
                .join(Lead, Lead.id == FollowUp.lead_id)
                .where(
                    Lead.assigned_to_user_id.in_(ids),
                    Lead.deleted_at.is_(None),
                    FollowUp.completed_at.is_(None),
                    FollowUp.due_at < end,
                )
                .group_by(Lead.assigned_to_user_id)
            )
        ).all()
    )
    return {
        u.id: MorningPlan(
            new_leads=int(new_leads.get(u.id, 0)),
            followups_due=int(followups.get(u.id, 0)),
            streak=int(u.login_streak or 0),
        )
        for u in users
    }


async def _calls_by_user(session: AsyncSession, ids: list[int], day: date) -> dict[int, int]:
    start, end = ist_day_bounds(day)
    rows = await session.execute(
        select(CallEvent.user_id, func.count(CallEvent.id))
        .where(CallEvent.user_id.in_(ids), CallEvent.called_at >= start, CallEvent.called_at < end)
        .group_by(CallEvent.user_id)
    )
    return {int(uid): int(n) for uid, n in rows.all()}


async def build_evening_recaps(
    session: AsyncSession, users: list[User], today: date
) -> dict[int, EveningRecap]:
    ids = [u.id for u in users]
    if not ids:
        return {}
    start, end = ist_day_bounds(today)
    calls_today = await _calls_by_user(session, ids, today)
    calls_yesterday = await _calls_by_user(session, ids, today - timedelta(days=1))
    xp_today = {
        int(uid): int(xp or 0)
        for uid, xp in (
            await session.execute(
                select(XpEvent.user_id, func.sum(XpEvent.xp))
                .where(XpEvent.user_id.in_(ids), XpEvent.created_at >= start, XpEvent.created_at < end)
                .group_by(XpEvent.user_id)
            )
        ).all()
    }
    reported = {
        int(uid)
        for (uid,) in (
            await session.execute(
                select(DailyReport.user_id).where(
                    DailyReport.user_id.in_(ids), DailyReport.report_date == today
                )
            )
        ).all()
    }
    earners = sorted((uid for uid, xp in xp_today.items() if xp > 0), key=lambda uid: -xp_today[uid])
    rank = {uid: i + 1 for i, uid in enumerate(earners)}
    return {
        uid: EveningRecap(
            calls_today=calls_today.get(uid, 0),
            calls_yesterday=calls_yesterday.get(uid, 0),
            xp_today=xp_today.get(uid, 0),
            rank_today=rank.get(uid),
            ranked_total=len(earners),
            report_submitted=uid in reported,
        )
        for uid in ids
    }
