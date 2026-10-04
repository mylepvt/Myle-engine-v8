"""Leader control room: who on my team is working right now, who is stuck — and a
one-tap nudge that pushes the member a personal check-in from their leader.

Leaders see their downline; admins see every active member. Copy is English.
Nudges are logged in activity_log (``leader.nudge``, entity_id = member) so the
per-member cooldown survives restarts and a leader + admin can't double-ping.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.engagement_nudge import _aware, build_nudge_contexts
from app.core.time_ist import IST
from app.services.live_metrics import fresh_call_counts_by_user, get_daily_call_target, ist_day_bounds
from app.services.report_eligibility import report_eligibility_conditions
from app.services.user_hierarchy import is_user_in_downline_of, recursive_downline_user_ids

logger = logging.getLogger(__name__)

NUDGE_ACTION = "leader.nudge"
NUDGE_COOLDOWN = timedelta(minutes=90)
ACTIVE_WITHIN = timedelta(minutes=60)

# Worst first — the leader's eye should land on who needs help.
STATUS_ORDER = {"not_started": 0, "idle": 1, "working": 2, "done": 3}


def _first(user: User) -> str:
    return (user.name or user.username or user.fbo_id or "Teammate").split(" ")[0]


def member_status(*, calls_today: int, target: int, last_work_at: datetime | None, now: datetime) -> str:
    if target > 0 and calls_today >= target:
        return "done"
    if last_work_at is not None and now - last_work_at <= ACTIVE_WITHIN:
        return "working"
    if calls_today > 0 or last_work_at is not None:
        return "idle"
    return "not_started"


async def _scope_users(session: AsyncSession, viewer_id: int, viewer_role: str) -> list[User]:
    conds = report_eligibility_conditions()
    if viewer_role == "admin":
        stmt = select(User).where(*conds)
    else:
        ids = await recursive_downline_user_ids(session, viewer_id)
        if not ids:
            return []
        stmt = select(User).where(User.id.in_(ids), *conds)
    return list((await session.execute(stmt)).scalars().all())


async def _last_nudges(session: AsyncSession, member_ids: list[int], since: datetime) -> dict[int, datetime]:
    if not member_ids:
        return {}
    rows = await session.execute(
        select(ActivityLog.entity_id, func.max(ActivityLog.created_at))
        .where(
            ActivityLog.action == NUDGE_ACTION,
            ActivityLog.entity_id.in_(member_ids),
            ActivityLog.created_at >= since,
        )
        .group_by(ActivityLog.entity_id)
    )
    return {int(mid): _aware(at) for mid, at in rows.all()}


async def leads_today_by_user(session: AsyncSession, user_ids: list[int], now: datetime) -> dict[int, int]:
    """Leads each member got *today* (IST): claimed, added by them, or reassigned to them."""
    if not user_ids:
        return {}
    start, end = ist_day_bounds(now.astimezone(IST).date())
    got: dict[int, set[int]] = {}
    claimed = await session.execute(
        select(ActivityLog.user_id, ActivityLog.entity_id).where(
            ActivityLog.action == "lead.claimed",
            ActivityLog.user_id.in_(user_ids),
            ActivityLog.created_at >= start,
            ActivityLog.created_at < end,
        )
    )
    added = await session.execute(
        select(Lead.created_by_user_id, Lead.id).where(
            Lead.created_by_user_id.in_(user_ids),
            Lead.created_at >= start,
            Lead.created_at < end,
            Lead.in_pool.is_(False),
            Lead.deleted_at.is_(None),
        )
    )
    given = await session.execute(
        select(Lead.assigned_to_user_id, Lead.id).where(
            Lead.assigned_to_user_id.in_(user_ids),
            Lead.reassigned_at >= start,
            Lead.reassigned_at < end,
            Lead.deleted_at.is_(None),
        )
    )
    for rows in (claimed, added, given):
        for uid, lead_id in rows.all():
            if uid is not None and lead_id is not None:
                got.setdefault(int(uid), set()).add(int(lead_id))
    return {uid: len(ids) for uid, ids in got.items()}


async def _team_leaders(session: AsyncSession, users: list[User]) -> dict[int, int | None]:
    """Member id -> id of the leader whose team they are in (a leader leads their own group)."""
    tree = {
        int(uid): (role, upline)
        for uid, role, upline in (await session.execute(select(User.id, User.role, User.upline_user_id))).all()
    }
    out: dict[int, int | None] = {}
    for u in users:
        if u.role == "leader":
            out[u.id] = u.id
            continue
        cur, hops = u.upline_user_id, 0
        while cur is not None and hops < 20 and tree.get(cur, ("", None))[0] != "leader":
            cur, hops = tree.get(cur, ("", None))[1], hops + 1
        out[u.id] = cur if cur is not None and tree.get(cur, ("", None))[0] == "leader" else None
    return out


async def build_control_room(
    session: AsyncSession, *, viewer_id: int, viewer_role: str, now: datetime | None = None
) -> dict:
    now = now or datetime.now(timezone.utc)
    users = await _scope_users(session, viewer_id, viewer_role)
    target = await get_daily_call_target(session)
    contexts = await build_nudge_contexts(session, users, now)
    # Same "fresh call" count the daily target and work streak use.
    fresh = await fresh_call_counts_by_user(session, [u.id for u in users], now.astimezone(IST).date())
    nudged = await _last_nudges(session, [u.id for u in users], now - NUDGE_COOLDOWN)
    team_of = await _team_leaders(session, users)
    leads_today = await leads_today_by_user(session, [u.id for u in users], now)

    members = []
    for u in users:
        ctx = contexts[u.id]
        calls = fresh.get(u.id, 0)
        status = member_status(calls_today=calls, target=target, last_work_at=ctx.last_work_at, now=now)
        nudged_at = nudged.get(u.id)
        members.append(
            {
                "user_id": u.id,
                "name": u.name or u.username or u.fbo_id,
                "role": u.role,
                "status": status,
                "calls_today": calls,
                "last_work_at": ctx.last_work_at.isoformat() if ctx.last_work_at else None,
                "last_seen_at": _aware(u.last_seen_at).isoformat() if u.last_seen_at else None,
                "streak": ctx.streak,
                "new_leads": ctx.new_leads,
                "followups_due": ctx.followups_due,
                # Leads this member got today (claimed / added / reassigned). 0 = no leads today.
                "leads_today": leads_today.get(u.id, 0),
                "leader_id": team_of.get(u.id),
                "nudge_available_at": (nudged_at + NUDGE_COOLDOWN).isoformat() if nudged_at else None,
            }
        )
    members.sort(key=lambda m: (STATUS_ORDER[m["status"]], m["calls_today"], (m["name"] or "").lower()))
    counts = {s: 0 for s in STATUS_ORDER}
    for m in members:
        counts[m["status"]] += 1
    no_leads = sum(1 for m in members if m["leads_today"] == 0)
    return {"call_target": target, "counts": counts, "no_leads": no_leads, "members": members}


def nudge_message(sender: str, *, status: str, calls: int, target: int, new_leads: int, followups: int) -> tuple[str, str]:
    title = f"{sender} is checking in"
    if status == "not_started":
        waiting = f"{new_leads} new leads" if new_leads else (f"{followups} follow-ups" if followups else "Your leads")
        return title, f"No calls yet today. {waiting} are waiting. Make your first call now."
    if status == "idle":
        left = max(target - calls, 0)
        tail = f" {left} more to hit today's target." if left else ""
        return title, f"You're at {calls}/{target} calls.{tail} Pick up where you left off."
    return title, f"Great work today: {calls} calls. Keep the momentum going!"


class NudgeError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


async def send_leader_nudge(
    session: AsyncSession, *, sender_id: int, sender_role: str, member_id: int, now: datetime | None = None
) -> dict:
    """Push a check-in to one member. Returns {delivered, nudge_available_at}."""
    now = now or datetime.now(timezone.utc)
    if sender_role not in ("leader", "admin"):
        raise NudgeError(403, "Only leaders can nudge")
    if sender_role == "leader" and not await is_user_in_downline_of(session, member_id, sender_id):
        raise NudgeError(403, "Not in your team")
    member = await session.get(User, member_id)
    if member is None or member.removed_at is not None:
        raise NudgeError(404, "Member not found")

    last = (await _last_nudges(session, [member_id], now - NUDGE_COOLDOWN)).get(member_id)
    if last is not None:
        raise NudgeError(429, "Already nudged recently")

    ctx = (await build_nudge_contexts(session, [member], now))[member_id]
    calls = (await fresh_call_counts_by_user(session, [member_id], now.astimezone(IST).date())).get(member_id, 0)
    target = await get_daily_call_target(session)
    status = member_status(calls_today=calls, target=target, last_work_at=ctx.last_work_at, now=now)
    sender = await session.get(User, sender_id)
    title, body = nudge_message(
        _first(sender) if sender else "Your leader",
        status=status,
        calls=calls,
        target=target,
        new_leads=ctx.new_leads,
        followups=ctx.followups_due,
    )

    session.add(
        ActivityLog(
            user_id=sender_id,
            action=NUDGE_ACTION,
            entity_type="user",
            entity_id=member_id,
            meta={"status": status},
            created_at=now,
        )
    )
    await session.commit()

    delivered = 0
    try:
        from app.services.push_service import send_push_to_user

        delivered = await send_push_to_user(
            session, member_id, title=title, body=body, url="/dashboard/work/leads?tab=today"
        )
    except Exception as exc:  # noqa: BLE001 — the nudge is logged even if push fails
        logger.warning("Leader nudge push failed member_id=%s: %s", member_id, exc)
    return {"delivered": delivered > 0, "nudge_available_at": (now + NUDGE_COOLDOWN).isoformat()}


NEEDS_NUDGE = frozenset({"not_started", "idle"})


async def nudge_everyone_idle(
    session: AsyncSession, *, sender_id: int, sender_role: str, now: datetime | None = None
) -> dict:
    """Nudge every member in scope who is not working right now (skips recent nudges)."""
    now = now or datetime.now(timezone.utc)
    if sender_role not in ("leader", "admin"):
        raise NudgeError(403, "Only leaders can nudge")
    room = await build_control_room(session, viewer_id=sender_id, viewer_role=sender_role, now=now)
    sent = no_push = skipped = 0
    for m in room["members"]:
        if m["status"] not in NEEDS_NUDGE or m["user_id"] == sender_id:
            continue
        if m["nudge_available_at"] is not None:
            skipped += 1
            continue
        try:
            r = await send_leader_nudge(
                session, sender_id=sender_id, sender_role=sender_role, member_id=m["user_id"], now=now
            )
        except NudgeError:
            skipped += 1
            continue
        if r["delivered"]:
            sent += 1
        else:
            no_push += 1
    return {"sent": sent, "notifications_off": no_push, "skipped": skipped}
