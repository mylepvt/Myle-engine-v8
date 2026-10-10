"""Batch task notifications for the Workboard (Day 1 / Day 2 morning-afternoon-evening batches).

1. When a batch task is given (a batch link is shared for a prospect the first time):
   - Day 1 (the leader gives it): the team member who owns the prospect + admins.
   - Day 2 (the admin gives it): the team member + their leader.
   The person who gave the task is never notified about their own action.

2. Daily reminders (IST) to the team member + leader, only for prospects whose batch
   is still pending:
   - 10:00  morning batch is live (10 AM – 12 PM)
   - 13:00  follow up the morning batch (1 – 2 PM) + 2nd batch is live (1 – 3 PM)
   - 15:00  follow up the 2nd batch (3 – 4 PM)
   - 16:00  evening batch is live (4 – 6 PM)
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.person_name import first_name, person_name
from app.core.time_ist import IST
from app.models.app_setting import AppSetting
from app.models.batch_share_link import BatchShareLink
from app.models.lead import Lead
from app.models.user import User
from app.services.user_hierarchy import load_user_hierarchy_entries, nearest_leader_entry

WORKBOARD_URL = "/dashboard/work/workboard"

# Batch windows the team works to (IST). Change here to move every message at once.
WINDOWS = {
    "morning": "10 AM – 12 PM",
    "afternoon": "1 – 3 PM",
    "evening": "4 – 6 PM",
}
FOLLOW_UP = {"morning": "1 – 2 PM", "afternoon": "3 – 4 PM"}
PERIOD_LABEL = {"morning": "Morning", "afternoon": "2nd", "evening": "Evening"}

# Reminder checkpoints (IST hour) → what each one is about.
CHECKPOINTS: dict[int, dict[str, list[str]]] = {
    10: {"start": ["morning"], "follow": []},
    13: {"start": ["afternoon"], "follow": ["morning"]},
    15: {"start": [], "follow": ["afternoon"]},
    16: {"start": ["evening"], "follow": []},
}
DAY_OF_STATUS = {"day1": "d1", "day2": "d2"}


def slot_parts(slot: str) -> tuple[int, str] | None:
    """'d2_morning' → (2, 'morning'); None for slots outside Day 1 / Day 2."""
    day, _, period = slot.partition("_")
    if day not in ("d1", "d2") or period not in WINDOWS:
        return None
    return int(day[1]), period


def _owner_id(lead: Lead) -> int | None:
    return lead.owner_user_id or lead.assigned_to_user_id


async def _admin_ids(session: AsyncSession) -> list[int]:
    return list(
        (
            await session.execute(select(User.id).where(User.role == "admin", User.removed_at.is_(None)))
        ).scalars().all()
    )


async def task_given_pushes(
    session: AsyncSession, *, lead: Lead, slot: str, actor_id: int
) -> list[tuple[int, str, str, str]]:
    """(user_id, title, body, url) for a batch task that was just given."""
    parts = slot_parts(slot)
    if parts is None:
        return []
    day, period = parts
    owner_id = _owner_id(lead)
    entries = await load_user_hierarchy_entries(session, [owner_id, actor_id])
    leader = nearest_leader_entry(owner_id, entries)
    actor = entries.get(actor_id)
    recipients: list[int] = []
    for uid in (owner_id, leader.id if leader else None):
        if uid:
            recipients.append(uid)
    if day == 1:
        recipients += await _admin_ids(session)
    prospect = person_name(lead.name, "your prospect")
    who = first_name(actor.display_name if actor else None, "Your leader")
    title = f"Day {day} · {PERIOD_LABEL[period]} batch for {prospect}"
    follow = f" Follow up {FOLLOW_UP[period]}." if period in FOLLOW_UP else ""
    body = f"{who} shared it. Batch {WINDOWS[period]} — make sure {first_name(lead.name, 'they')} watches.{follow}"
    seen: set[int] = set()
    out = []
    for uid in recipients:
        if uid == actor_id or uid in seen:
            continue
        seen.add(uid)
        out.append((uid, title, body, WORKBOARD_URL))
    return out


@dataclass
class _Pending:
    start: dict[str, list[str]]
    follow: dict[str, list[str]]


def _names(names: list[str]) -> str:
    shown = ", ".join(names[:3])
    return shown + (f" +{len(names) - 3}" if len(names) > 3 else "")


async def build_reminders(session: AsyncSession, hour: int) -> dict[int, tuple[str, str]]:
    """user_id → (title, body) for one checkpoint. Empty when nothing is pending."""
    plan = CHECKPOINTS.get(hour)
    if plan is None:
        return {}
    leads = (
        await session.execute(
            select(Lead).where(
                Lead.status.in_(tuple(DAY_OF_STATUS)),
                Lead.deleted_at.is_(None),
                Lead.archived_at.is_(None),
                Lead.in_pool.is_(False),
            )
        )
    ).scalars().all()
    if not leads:
        return {}
    shared_unwatched = {
        (lead_id, slot)
        for lead_id, slot in (
            await session.execute(
                select(BatchShareLink.lead_id, BatchShareLink.slot).where(
                    BatchShareLink.lead_id.in_([lead.id for lead in leads]), BatchShareLink.used.is_(False)
                )
            )
        ).all()
    }
    owners = {lead.id: _owner_id(lead) for lead in leads}
    entries = await load_user_hierarchy_entries(session, owners.values())

    per_user: dict[int, _Pending] = defaultdict(lambda: _Pending(defaultdict(list), defaultdict(list)))
    for lead in leads:
        prefix = DAY_OF_STATUS[lead.status]
        leader = nearest_leader_entry(owners[lead.id], entries)
        people = {uid for uid in (owners[lead.id], leader.id if leader else None) if uid}
        name = first_name(lead.name, "Prospect")
        for period in plan["start"]:
            if not getattr(lead, f"{prefix}_{period}", False):
                for uid in people:
                    per_user[uid].start[period].append(name)
        for period in plan["follow"]:
            slot = f"{prefix}_{period}"
            # Follow up = the batch link went out but the prospect hasn't watched yet.
            if not getattr(lead, slot, False) and (lead.id, slot) in shared_unwatched:
                for uid in people:
                    per_user[uid].follow[period].append(name)

    out: dict[int, tuple[str, str]] = {}
    for uid, p in per_user.items():
        lines: list[str] = []
        title_bits: list[str] = []
        for period, names in p.follow.items():
            title_bits.append(f"Follow up {PERIOD_LABEL[period].lower()} batch")
            lines.append(f"Follow up {FOLLOW_UP[period]}: {_names(names)} — not watched yet.")
        for period, names in p.start.items():
            title_bits.append(f"{PERIOD_LABEL[period]} batch is live")
            lines.append(f"{PERIOD_LABEL[period]} batch {WINDOWS[period]}: {_names(names)}.")
        if lines:
            out[uid] = ("⏰ " + " · ".join(title_bits), " ".join(lines))
    return out


def checkpoint_key(now: datetime, hour: int) -> str:
    return f"batch_reminder:{now.astimezone(IST).date().isoformat()}:{hour}"


async def claim_checkpoint(session: AsyncSession, now: datetime, hour: int) -> bool:
    """True once per day per checkpoint (so a restart or second worker doesn't resend)."""
    key = checkpoint_key(now, hour)
    if await session.get(AppSetting, key) is not None:
        return False
    session.add(AppSetting(key=key, value=now.isoformat()))
    await session.commit()
    return True
