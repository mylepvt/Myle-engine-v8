"""Live work alerts: a phone push to admins — and to each leader for their own
team — whenever real work happens.

Kinds (each can be switched off in admin Settings):
- lead_added  — a member added a lead
- status      — a lead moved stage (Day 1, Day 2, Converted, …)
- enrollment  — an enrollment proof was uploaded
- online      — a member came online for the first time today

Lead events are captured once, centrally, by SQLAlchemy hooks: ``before_flush``
records what changed, ``after_commit`` hands it to a background task — so every
code path is covered and the member's save is never slowed down. Only changes
made by a signed-in person count (scheduled jobs are ignored), and an admin is
never alerted about their own action. Copy is English (app UI rule).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass

from sqlalchemy import event as sa_event, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SASession

from app.core.lead_status import LEAD_STATUS_LABELS
from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.models.user import User

logger = logging.getLogger(__name__)

KINDS: dict[str, str] = {
    "lead_added": "New leads",
    "status": "Lead status changes (incl. calling board)",
    "enrollment": "Enrollments",
    "online": "Members coming online",
}
SETTING_KEY = "admin_alerts.off"  # JSON list of kinds switched off
_INFO_KEY = "admin_alert_events"
_OUTCOME_KEY = "admin_alert_call_outcomes"

# Calling-board buttons. "Not picked" / "Call later" often leave the stage as
# Contacted, so they would be invisible to the stage hook — they get their own text.
CALL_OUTCOME_LABELS = {
    "interested": "Interested",
    "not_picked": "Not picked",
    "call_later": "Call later",
    "not_interested": "Not interested",
    "paid": "Paid",
}


@dataclass(frozen=True)
class AlertEvent:
    kind: str
    actor_id: int
    actor_name: str
    lead_id: int | None = None
    lead_name: str = ""
    old_status: str = ""
    new_status: str = ""
    amount_cents: int = 0
    call_outcome: str = ""
    owner_id: int | None = None  # member whose lead / presence it is (picks the team's leaders)


def _label(status: str) -> str:
    return LEAD_STATUS_LABELS.get(status, status.replace("_", " ").title())


def _first(name: str) -> str:
    return (name or "Someone").split(" ")[0]


def alert_text(ev: AlertEvent) -> tuple[str, str, str]:
    """(title, body, url) for an event."""
    who, lead = _first(ev.actor_name), ev.lead_name or "a lead"
    url = f"/dashboard/work/leads/{ev.lead_id}" if ev.lead_id else "/dashboard"
    if ev.kind == "lead_added":
        return "New lead", f"{who} added {lead}", url
    if ev.kind == "enrollment":
        amount = f" (₹{ev.amount_cents // 100})" if ev.amount_cents else ""
        return "Enrollment", f"{who} enrolled {lead}{amount}", url
    if ev.kind == "status" and ev.call_outcome:
        label = CALL_OUTCOME_LABELS.get(ev.call_outcome, ev.call_outcome.replace("_", " ").title())
        return f"{lead} → {label}", f"{who} marked {lead} {label} on the calling board", url
    if ev.kind == "status":
        return f"{lead} → {_label(ev.new_status)}", f"{who} moved {lead} from {_label(ev.old_status)}", url
    return "Online now", f"{who} is online", "/dashboard"


# ── capture ────────────────────────────────────────────────────────────────


def _actor() -> tuple[int | None, str]:
    from app.services.observation_logger import _actor_name_ctx, _user_id_ctx

    raw = _user_id_ctx.get()
    return (int(raw) if raw else None), _actor_name_ctx.get()


@sa_event.listens_for(SASession, "before_flush")
def _capture_lead_changes(session: SASession, _ctx, _instances) -> None:
    actor_id, actor_name = _actor()
    if actor_id is None:
        return  # scheduled jobs / scripts: not live work
    events: list = session.info.setdefault(_INFO_KEY, [])
    for obj in session.new:
        if isinstance(obj, Lead) and not obj.in_pool:
            events.append(("lead_added", obj, actor_id, actor_name, "", 0))
    for obj in session.dirty:
        if not isinstance(obj, Lead):
            continue
        state = inspect(obj)
        status = state.attrs.status.history
        if status.has_changes() and status.deleted and status.deleted[0] != obj.status:
            events.append(("status", obj, actor_id, actor_name, status.deleted[0], 0))
        proof = state.attrs.enrollment_proof_uploaded_at.history
        if proof.has_changes() and obj.enrollment_proof_uploaded_at is not None:
            events.append(("enrollment", obj, actor_id, actor_name, "", int(obj.enrollment_amount_cents or 0)))


def mark_call_outcome(session: AsyncSession, lead: Lead, action: str) -> None:
    """Calling-board button pressed: alert with the button's name once the save commits."""
    actor_id, actor_name = _actor()
    if actor_id is None:
        return
    session.info.setdefault(_OUTCOME_KEY, {})[lead.id] = (lead, action, actor_id, actor_name)


@sa_event.listens_for(SASession, "after_rollback")
def _drop_on_rollback(session: SASession) -> None:
    session.info.pop(_INFO_KEY, None)
    session.info.pop(_OUTCOME_KEY, None)


@sa_event.listens_for(SASession, "after_commit")
def _send_after_commit(session: SASession) -> None:
    raw = session.info.pop(_INFO_KEY, None) or []
    outcomes = session.info.pop(_OUTCOME_KEY, None) or {}
    if not raw and not outcomes:
        return
    events = []
    for kind, lead, actor_id, actor_name, old, amount in raw:
        try:
            events.append(
                AlertEvent(
                    kind=kind,
                    actor_id=actor_id,
                    actor_name=actor_name,
                    lead_id=lead.id,
                    lead_name=lead.name or "",
                    old_status=old,
                    new_status=lead.status or "",
                    amount_cents=amount,
                    owner_id=lead.assigned_to_user_id,
                )
            )
        except Exception:  # noqa: BLE001 — a detached lead must never break the commit
            continue
    # A calling-board button replaces the plain stage alert for that lead.
    events = [e for e in events if not (e.kind == "status" and e.lead_id in outcomes)]
    for lead_id, (lead, action, actor_id, actor_name) in outcomes.items():
        try:
            events.append(
                AlertEvent(
                    kind="status",
                    actor_id=actor_id,
                    actor_name=actor_name,
                    lead_id=lead_id,
                    lead_name=lead.name or "",
                    new_status=lead.status or "",
                    call_outcome=action,
                    owner_id=lead.assigned_to_user_id,
                )
            )
        except Exception:  # noqa: BLE001
            continue
    # An enrollment also moves the lead to Day 1 — one alert is enough.
    enrolled = {e.lead_id for e in events if e.kind == "enrollment"}
    schedule([e for e in events if not (e.kind == "status" and e.lead_id in enrolled)])


def schedule(events: list[AlertEvent]) -> None:
    if not events or os.environ.get("ADMIN_ALERTS_DISABLED"):
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_dispatch_bg(events))


async def _dispatch_bg(events: list[AlertEvent]) -> None:
    from app.db.session import get_session_factory

    try:
        async with get_session_factory()() as session:
            await dispatch(session, events)
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin alerts failed: %s", exc)


# ── delivery ───────────────────────────────────────────────────────────────


async def disabled_kinds(session: AsyncSession) -> set[str]:
    row = await session.get(AppSetting, SETTING_KEY)
    try:
        return set(json.loads(row.value)) if row and row.value else set()
    except (ValueError, TypeError):
        return set()


async def set_disabled_kinds(session: AsyncSession, off: set[str]) -> None:
    row = await session.get(AppSetting, SETTING_KEY)
    value = json.dumps(sorted(k for k in off if k in KINDS))
    if row is None:
        session.add(AppSetting(key=SETTING_KEY, value=value))
    else:
        row.value = value
    await session.commit()


USER_SETTING_PREFIX = "live_alerts.off:"  # + user id → JSON list of kinds that user switched off


def _parse(value: str | None) -> set[str] | None:
    if not value:
        return None
    try:
        return set(json.loads(value))
    except (ValueError, TypeError):
        return None


async def user_disabled_kinds(session: AsyncSession, user_ids: list[int], admin_ids: set[int]) -> dict[int, set[str]]:
    """Each recipient's switched-off kinds. Admins without their own choice keep the
    older workspace-wide admin setting."""
    keys = [f"{USER_SETTING_PREFIX}{uid}" for uid in user_ids]
    rows = {
        k: v
        for k, v in (
            await session.execute(select(AppSetting.key, AppSetting.value).where(AppSetting.key.in_(keys or [""])))
        ).all()
    }
    legacy = await disabled_kinds(session) if admin_ids else set()
    out: dict[int, set[str]] = {}
    for uid in user_ids:
        own = _parse(rows.get(f"{USER_SETTING_PREFIX}{uid}"))
        out[uid] = own if own is not None else (legacy if uid in admin_ids else set())
    return out


async def set_user_disabled_kinds(session: AsyncSession, user_id: int, off: set[str]) -> None:
    key = f"{USER_SETTING_PREFIX}{user_id}"
    value = json.dumps(sorted(k for k in off if k in KINDS))
    row = await session.get(AppSetting, key)
    if row is None:
        session.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    await session.commit()


def _leaders_above(tree: dict[int, tuple[str, int | None, bool]], user_id: int | None) -> set[int]:
    """Every active leader up the org tree from ``user_id`` (their team's leaders)."""
    found: set[int] = set()
    cur = tree.get(user_id, (None, None, False))[1] if user_id is not None else None
    hops = 0
    while cur is not None and hops < 30:
        role, upline, active = tree.get(cur, ("", None, False))
        if role == "leader" and active:
            found.add(cur)
        cur, hops = upline, hops + 1
    return found


async def dispatch(session: AsyncSession, events: list[AlertEvent]) -> int:
    """Push each event to every admin and to the leaders of the member's team —
    never to the person who did it. Returns pushes sent."""
    from app.services.push_service import send_push_to_user

    if not events:
        return 0
    tree = {
        int(uid): (role, upline, removed is None)
        for uid, role, upline, removed in (
            await session.execute(select(User.id, User.role, User.upline_user_id, User.removed_at))
        ).all()
    }
    admins = {uid for uid, (role, _u, active) in tree.items() if role == "admin" and active}
    plan: list[tuple[AlertEvent, set[int]]] = []
    for ev in events:
        recipients = admins | _leaders_above(tree, ev.owner_id) | _leaders_above(tree, ev.actor_id)
        recipients.discard(ev.actor_id)
        plan.append((ev, recipients))
    everyone = sorted({uid for _e, rs in plan for uid in rs})
    off = await user_disabled_kinds(session, everyone, admins)

    sent = 0
    for ev, recipients in plan:
        title, body, url = alert_text(ev)
        for uid in sorted(recipients):
            if ev.kind in off.get(uid, set()):
                continue
            sent += await send_push_to_user(session, uid, title=title, body=body, url=url)
    logger.info("live alerts: %s event(s) -> %s push(es)", len(events), sent)
    return sent


def member_came_online(user: User) -> None:
    """Called once per member per day, on their first connection."""
    if user.role == "admin":
        return
    schedule(
        [
            AlertEvent(
                kind="online",
                actor_id=user.id,
                actor_name=user.name or user.username or user.fbo_id,
                owner_id=user.id,
            )
        ]
    )
