"""Action Queue — converts EOS signals into one ranked, one-tap action list.

Aggregates the same signals the automation evaluators watch (zombie leads,
missed missions, member inactivity, stuck verifications) into a single queue
sorted by severity, with executable actions wired to the existing engines:
WhatsApp leader alert, recovery mission, management escalation.

Every executed action is logged in AutomationActionLog under a dedicated
inactive "Manual Action Queue" rule, so the audit trail and the
recently-actioned badge share one source of truth with the automation engine.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.models.automation import AutomationActionLog, AutomationRule
from app.models.daily_mission import DailyMission
from app.models.lead import Lead
from app.models.task_assignment import TaskAssignment
from app.models.user import User
from app.schemas.action_queue import (
    ActionExecuteResult,
    ActionQueueItem,
    ActionQueueResponse,
)
from app.services import automation_service
from app.services.user_hierarchy import nearest_leader_for_user, recursive_downline_user_ids

logger = logging.getLogger(__name__)

ZOMBIE_DAYS = 7
INACTIVE_DAYS = 7
MISSED_THRESHOLD = 3
STUCK_VERIFICATION_HOURS = 48
MANUAL_RULE_NAME = "Manual Action Queue"

_ITEM_ACTIONS: dict[str, list[str]] = {
    "zombie_lead": ["alert_leader", "create_recovery", "escalate"],
    "missed_missions": ["create_recovery", "alert_leader", "escalate"],
    "inactive_member": ["alert_leader", "create_recovery", "escalate"],
    "stuck_verification": ["alert_leader", "escalate"],
}


def _aware(dt: datetime) -> datetime:
    """Normalize DB datetimes — SQLite returns naive, Postgres returns aware."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _display(user: User | None, fallback_id: int) -> str:
    if user is None:
        return f"User #{fallback_id}"
    return user.name or user.fbo_id or f"User #{user.id}"


async def _active_members(session: AsyncSession, scope_ids: set[int] | None) -> list[User]:
    stmt = select(User).where(
        User.role.in_(["team", "leader"]),
        User.registration_status == "approved",
        User.access_blocked.is_(False),
        User.removed_at.is_(None),
    )
    if scope_ids is not None:
        stmt = stmt.where(User.id.in_(scope_ids))
    return list((await session.execute(stmt)).scalars().all())


async def _recent_action_map(session: AsyncSession) -> dict[tuple[str, int], datetime]:
    """(entity_type, entity_id) -> latest action time within 24h, any source."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = (
        await session.execute(
            select(
                AutomationActionLog.trigger_entity_type,
                AutomationActionLog.trigger_entity_id,
                func.max(AutomationActionLog.created_at),
            )
            .where(AutomationActionLog.created_at >= cutoff)
            .group_by(
                AutomationActionLog.trigger_entity_type,
                AutomationActionLog.trigger_entity_id,
            )
        )
    ).all()
    return {(etype, eid): ts for etype, eid, ts in rows}


async def get_action_queue(
    session: AsyncSession,
    *,
    leader_user_id: int | None = None,
    limit: int = 50,
) -> ActionQueueResponse:
    """Build the ranked queue. Admin: org-wide. Leader: own downline only."""
    now = datetime.now(timezone.utc)
    today = now.date()

    scope_ids: set[int] | None = None
    if leader_user_id is not None:
        scope_ids = set(await recursive_downline_user_ids(session, leader_user_id))
        if not scope_ids:
            return ActionQueueResponse(items=[], total=0, computed_at=now)

    members = await _active_members(session, scope_ids)
    member_map = {m.id: m for m in members}
    recent = await _recent_action_map(session)
    items: list[ActionQueueItem] = []

    # ── 1. Zombie leads: active, assigned, untouched for ZOMBIE_DAYS+ ──
    zombie_stmt = select(Lead).where(
        Lead.outcome == "active",
        Lead.last_action_at.isnot(None),
        Lead.last_action_at < now - timedelta(days=ZOMBIE_DAYS),
        Lead.assigned_to_user_id.isnot(None),
    )
    if scope_ids is not None:
        zombie_stmt = zombie_stmt.where(Lead.assigned_to_user_id.in_(scope_ids))
    zombies = (await session.execute(zombie_stmt)).scalars().all()
    for lead in zombies:
        days = (now - _aware(lead.last_action_at)).days
        holder = member_map.get(lead.assigned_to_user_id)
        items.append(ActionQueueItem(
            id=f"zombie_lead:{lead.id}",
            item_type="zombie_lead",
            severity=min(100.0, 40.0 + days * 4.0),
            entity_type="lead",
            entity_id=lead.id,
            member_id=lead.assigned_to_user_id,
            member_name=_display(holder, lead.assigned_to_user_id),
            title=f"Lead {lead.name} — {days}d untouched",
            subtitle=f"With {_display(holder, lead.assigned_to_user_id)} · stage {lead.status}",
            age_days=float(days),
            actions=_ITEM_ACTIONS["zombie_lead"],
            last_actioned_at=recent.get(("lead", lead.id)),
        ))

    # ── 2 + 3. Per-member: missed missions & inactivity ──
    for member in members:
        joined = member.created_at.date() if member.created_at else today - timedelta(days=7)
        window_start = max(today - timedelta(days=7), joined)
        window_days = (today - window_start).days
        if window_days > 0:
            completed = (
                await session.execute(
                    select(func.count(DailyMission.id)).where(
                        DailyMission.user_id == member.id,
                        DailyMission.status == "completed",
                        DailyMission.mission_date >= window_start,
                        DailyMission.mission_date < today,
                    )
                )
            ).scalar() or 0
            missed = window_days - completed
            if missed >= MISSED_THRESHOLD:
                items.append(ActionQueueItem(
                    id=f"missed_missions:{member.id}",
                    item_type="missed_missions",
                    severity=min(100.0, 30.0 + missed * 10.0),
                    entity_type="member",
                    entity_id=member.id,
                    member_id=member.id,
                    member_name=_display(member, member.id),
                    title=f"{_display(member, member.id)} — {missed} missions missed",
                    subtitle=f"{missed} of last {window_days} days without a completed mission",
                    age_days=float(missed),
                    actions=_ITEM_ACTIONS["missed_missions"],
                    last_actioned_at=recent.get(("member", member.id)),
                ))

        last_active = (
            await session.execute(
                select(Lead.last_action_at)
                .where(Lead.assigned_to_user_id == member.id, Lead.last_action_at.isnot(None))
                .order_by(Lead.last_action_at.desc())
                .limit(1)
            )
        ).scalar()
        owned = (
            await session.execute(
                select(func.count(Lead.id)).where(Lead.assigned_to_user_id == member.id)
            )
        ).scalar() or 0
        if owned > 0 and last_active is not None and _aware(last_active) < now - timedelta(days=INACTIVE_DAYS):
            days = (now - _aware(last_active)).days
            items.append(ActionQueueItem(
                id=f"inactive_member:{member.id}",
                item_type="inactive_member",
                severity=min(100.0, 35.0 + days * 5.0),
                entity_type="member",
                entity_id=member.id,
                member_id=member.id,
                member_name=_display(member, member.id),
                title=f"{_display(member, member.id)} — {days}d no lead activity",
                subtitle=f"Holds {owned} lead(s), none touched for {days} days",
                age_days=float(days),
                actions=_ITEM_ACTIONS["inactive_member"],
                last_actioned_at=recent.get(("member", member.id)),
            ))

    # ── 4. Stuck verifications: submitted, nobody verified for 48h+ ──
    stuck_stmt = select(TaskAssignment).where(
        TaskAssignment.status == "submitted",
        TaskAssignment.updated_at < now - timedelta(hours=STUCK_VERIFICATION_HOURS),
    )
    if scope_ids is not None:
        stuck_stmt = stuck_stmt.where(TaskAssignment.assigned_to_user_id.in_(scope_ids))
    stuck = (await session.execute(stuck_stmt)).scalars().all()
    for a in stuck:
        hours = (now - _aware(a.updated_at)).total_seconds() / 3600
        member = member_map.get(a.assigned_to_user_id)
        items.append(ActionQueueItem(
            id=f"stuck_verification:{a.id}",
            item_type="stuck_verification",
            severity=min(100.0, 30.0 + (hours / 24.0) * 10.0),
            entity_type="member",
            entity_id=a.assigned_to_user_id,
            member_id=a.assigned_to_user_id,
            member_name=_display(member, a.assigned_to_user_id),
            title=f"{_display(member, a.assigned_to_user_id)} — evidence waiting {int(hours)}h",
            subtitle="Submitted evidence not verified by leader yet",
            age_days=round(hours / 24.0, 1),
            actions=_ITEM_ACTIONS["stuck_verification"],
            last_actioned_at=recent.get(("member", a.assigned_to_user_id)),
        ))

    items.sort(key=lambda i: i.severity, reverse=True)
    total = len(items)
    return ActionQueueResponse(items=items[:limit], total=total, computed_at=now)


# ── EXECUTION ───────────────────────────────────────────────────────────────

async def _get_manual_rule(session: AsyncSession) -> AutomationRule:
    rule = (
        await session.execute(
            select(AutomationRule).where(AutomationRule.name == MANUAL_RULE_NAME).limit(1)
        )
    ).scalar_one_or_none()
    if rule is None:
        rule = AutomationRule(
            name=MANUAL_RULE_NAME,
            description="System rule for logging one-tap actions from the Action Queue. Never auto-evaluated.",
            trigger_type="manual",
            action_type="manual",
            is_active=False,
        )
        session.add(rule)
        await session.flush()
    return rule


async def _resolve_member(
    session: AsyncSession, entity_type: str, entity_id: int
) -> tuple[User | None, Lead | None]:
    if entity_type == "lead":
        lead = await session.get(Lead, entity_id)
        if lead is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        member_id = lead.assigned_to_user_id or lead.owner_user_id
        member = await session.get(User, member_id) if member_id else None
        return member, lead
    member = await session.get(User, entity_id)
    if member is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Member not found")
    return member, None


async def execute_action(
    session: AsyncSession,
    *,
    item_type: str,
    entity_type: str,
    entity_id: int,
    action: str,
    actor_user_id: int,
    actor_role: str,
) -> ActionExecuteResult:
    from app.services.whatsapp_leader_alerts import send_system_alert

    member, lead = await _resolve_member(session, entity_type, entity_id)

    if actor_role == "leader":
        downline = set(await recursive_downline_user_ids(session, actor_user_id))
        target_id = member.id if member else None
        if target_id is None or target_id not in downline:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Not in your team",
            )

    member_name = _display(member, entity_id)
    context = f"Lead: {lead.name} (stage {lead.status})\n" if lead else ""
    reason = {
        "zombie_lead": "Lead untouched for too long",
        "missed_missions": "Daily missions repeatedly missed",
        "inactive_member": "No lead activity for days",
        "stuck_verification": "Submitted evidence awaiting verification",
    }.get(item_type, "Action required")

    result: dict = {}

    if action == "alert_leader":
        leader = await nearest_leader_for_user(session, member.id) if member else None
        leader_user = await session.get(User, leader.id) if leader else None
        if leader_user is None or not leader_user.phone:
            result = {"status": "failed", "reason": "no_leader_phone"}
        else:
            msg = (
                f"🚨 *Myle Action Required*\n\n"
                f"Member: {member_name}\n"
                f"{context}"
                f"Issue: {reason}\n\n"
                "Please follow up today and get this moving.\n\n"
                "— Myle Team"
            )
            sent = await send_system_alert(
                leader_user.phone, msg, session,
                message_type="action_queue_alert", related_user_id=leader_user.id,
            )
            result = {"status": "sent" if sent else "failed", "leader_id": leader_user.id}

    elif action == "create_recovery":
        if member is None:
            result = {"status": "failed", "reason": "no_member"}
        else:
            result = await automation_service.create_recovery_mission_for_member(session, member.id)

    elif action == "escalate":
        result = {"status": "logged", "reason": "management_escalation_disabled"}

    else:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Unknown action")

    rule = await _get_manual_rule(session)
    log_entity_type = "lead" if entity_type == "lead" else "member"
    log_entity_id = entity_id if entity_type == "lead" else (member.id if member else entity_id)
    log = AutomationActionLog(
        rule_id=rule.id,
        trigger_type=item_type,
        trigger_entity_type=log_entity_type,
        trigger_entity_id=log_entity_id,
        trigger_detail={"source": "action_queue", "actor_user_id": actor_user_id},
        action_type=action,
        action_result=result,
    )
    session.add(log)
    await session.commit()

    status = result.get("status", "done")
    logger.info(
        "action_queue execute: %s %s:%s by user=%s -> %s",
        action, entity_type, entity_id, actor_user_id, status,
    )
    return ActionExecuteResult(status=status, action=action, detail=result)


# ── DAILY DIGEST ────────────────────────────────────────────────────────────

DIGEST_TOP_N = 8


def build_digest_text(items: list[ActionQueueItem], total: int, *, heading: str) -> str | None:
    """Compact WhatsApp digest of the queue — top items + overflow count."""
    if not items:
        return None
    lines = [f"🔥 *{heading} — {total} item(s)*", ""]
    for i, item in enumerate(items[:DIGEST_TOP_N], start=1):
        lines.append(f"{i}. {item.title}")
    overflow = total - min(len(items), DIGEST_TOP_N)
    if overflow > 0:
        lines.append(f"…aur {overflow} more.")
    lines += ["", "Open the app → Do This Now to act.", "", "— Myle Team"]
    return "\n".join(lines)


async def send_action_queue_digests(session: AsyncSession) -> dict:
    """Push the queue automatically: org digest to management, scoped digest to each leader."""
    from app.services.whatsapp_leader_alerts import send_system_alert

    result = {"leaders_sent": 0, "leaders_skipped": 0}

    leaders = (
        await session.execute(
            select(User).where(
                User.role == "leader",
                User.registration_status == "approved",
                User.access_blocked.is_(False),
                User.removed_at.is_(None),
                User.phone.isnot(None),
            )
        )
    ).scalars().all()

    for leader in leaders:
        try:
            scoped = await get_action_queue(session, leader_user_id=leader.id, limit=DIGEST_TOP_N)
            text = build_digest_text(scoped.items, scoped.total, heading="Team Action Queue")
            if not text:
                result["leaders_skipped"] += 1
                continue
            sent = await send_system_alert(
                leader.phone, text, session,
                message_type="action_queue_digest", related_user_id=leader.id,
            )
            result["leaders_sent"] += 1 if sent else 0
        except Exception as exc:
            logger.warning("action queue digest failed leader_id=%s: %s", leader.id, exc)

    return result
