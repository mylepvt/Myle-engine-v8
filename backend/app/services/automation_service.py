import json
from datetime import datetime, timezone, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import AutomationActionLog, AutomationRule
from app.models.daily_mission import DailyMission, MissionBlocker
from app.models.lead import Lead
from app.models.task_assignment import TaskAssignment
from app.models.training_campaign import CampaignEnrollment, TrainingCampaign
from app.models.user import User
from app.models.verification_task import VerificationTask
from app.schemas.automation import AutomationActionLogPublic, AutomationEvaluateResponse, AutomationRulePublic
from app.services.user_hierarchy import nearest_leader_for_user


# ── HELPERS ────────────────────────────────────────────────────────────────

async def _get_leader_id(session: AsyncSession, user_id: int) -> int | None:
    leader = await nearest_leader_for_user(session, user_id)
    return leader.id if leader else None


async def _log_action(
    session: AsyncSession,
    rule_id: int,
    trigger_type: str,
    entity_type: str,
    entity_id: int,
    trigger_detail: dict | None,
    action_type: str,
    action_result: dict | None,
) -> AutomationActionLog:
    log = AutomationActionLog(
        rule_id=rule_id,
        trigger_type=trigger_type,
        trigger_entity_type=entity_type,
        trigger_entity_id=entity_id,
        trigger_detail=trigger_detail,
        action_type=action_type,
        action_result=action_result,
    )
    session.add(log)
    await session.flush()
    return log


async def _was_recently_actioned(
    session: AsyncSession,
    rule_id: int,
    entity_type: str,
    entity_id: int,
    cooldown_hours: int,
) -> bool:
    """Check if this rule already acted on this entity within cooldown window."""
    if cooldown_hours <= 0:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)
    existing = (
        await session.execute(
            select(func.count(AutomationActionLog.id)).where(
                AutomationActionLog.rule_id == rule_id,
                AutomationActionLog.trigger_entity_type == entity_type,
                AutomationActionLog.trigger_entity_id == entity_id,
                AutomationActionLog.created_at >= cutoff,
            )
        )
    ).scalar() or 0
    return existing > 0


# ── TRIGGER EVALUATORS ─────────────────────────────────────────────────────

async def _eval_missed_missions(
    session: AsyncSession,
    rule: AutomationRule,
) -> list[dict]:
    """Find members with N+ missed missions in last D days.

    Counts misses by absence of a completed mission, so members who never
    open the app (and thus have no mission rows at all) are still caught.
    Today is excluded — a pending mission for today is not yet a miss.
    """
    config = rule.trigger_config or {}
    missed_count = config.get("missed_count", 3)
    days = config.get("days", 7)
    now = datetime.now(timezone.utc)
    today = now.date()
    cutoff_date = today - timedelta(days=days)

    members = (
        await session.execute(
            select(User).where(
                User.role.in_(["team", "leader"]),
                User.registration_status == "approved",
                User.access_blocked == False,
                User.removed_at == None,
            )
        )
    ).scalars().all()

    results: list[dict] = []
    for member in members:
        joined = member.created_at.date() if member.created_at else cutoff_date
        window_start = max(cutoff_date, joined)
        window_days = (today - window_start).days
        if window_days <= 0:
            continue
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
        if missed >= missed_count:
            results.append({
                "entity_type": "member",
                "entity_id": member.id,
                "detail": {
                    "member_name": member.name or member.fbo_id or f"User #{member.id}",
                    "missed_count": missed,
                    "days": days,
                },
            })
    return results


async def _eval_zombie_leads(
    session: AsyncSession,
    rule: AutomationRule,
) -> list[dict]:
    """Find zombie leads untouched for N+ days."""
    config = rule.trigger_config or {}
    days = config.get("days", 14)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    leads = (
        await session.execute(
            select(Lead).where(
                Lead.outcome == "active",
                Lead.last_action_at != None,
                Lead.last_action_at < cutoff,
                Lead.assigned_to_user_id != None,
            )
        )
    ).scalars().all()

    return [
        {
            "entity_type": "lead",
            "entity_id": lead.id,
            "detail": {
                "lead_name": lead.name,
                "phone": lead.phone,
                "status": lead.status,
                "call_status": lead.call_status,
                "days": (datetime.now(timezone.utc) - lead.last_action_at).days,
                "assigned_to": lead.assigned_to_user_id,
                "owner_user_id": lead.owner_user_id,
            },
        }
        for lead in leads
    ]


async def _eval_verification_sla(
    session: AsyncSession,
    rule: AutomationRule,
) -> list[dict]:
    """Find tasks pending verification for N+ hours."""
    config = rule.trigger_config or {}
    hours = config.get("hours", 48)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    tasks = (
        await session.execute(
            select(TaskAssignment).where(
                TaskAssignment.status == "submitted",
                TaskAssignment.updated_at < cutoff,
            )
        )
    ).scalars().all()

    return [
        {
            "entity_type": "member",
            "entity_id": task.assigned_to_user_id,
            "detail": {
                "member_name": f"User #{task.assigned_to_user_id}",
                "task_id": task.id,
                "hours_pending": round((datetime.now(timezone.utc) - task.updated_at).total_seconds() / 3600, 1),
            },
        }
        for task in tasks
    ]


async def _eval_campaign_incomplete(
    session: AsyncSession,
    rule: AutomationRule,
) -> list[dict]:
    """Find members with expired incomplete campaigns."""
    today = datetime.now(timezone.utc).date()

    enrollments = (
        await session.execute(
            select(CampaignEnrollment).where(
                CampaignEnrollment.status != "completed",
                CampaignEnrollment.campaign_id.in_(
                    select(TrainingCampaign.id).where(
                        TrainingCampaign.expiry_date != None,
                        TrainingCampaign.expiry_date < today,
                    )
                ),
            )
        )
    ).scalars().all()

    # Group by user
    user_map: dict[int, list[CampaignEnrollment]] = {}
    for e in enrollments:
        user_map.setdefault(e.user_id, []).append(e)

    return [
        {
            "entity_type": "member",
            "entity_id": user_id,
            "detail": {
                "campaign_count": len(camps),
                "campaign_ids": [c.campaign_id for c in camps],
            },
        }
        for user_id, camps in user_map.items()
    ]


async def _eval_inactivity(
    session: AsyncSession,
    rule: AutomationRule,
) -> list[dict]:
    """Find members with no lead activity for N+ days."""
    config = rule.trigger_config or {}
    days = config.get("days", 7)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    members = (
        await session.execute(
            select(User).where(
                User.role.in_(["team", "leader"]),
                User.registration_status == "approved",
                User.access_blocked == False,
                User.removed_at == None,
            )
        )
    ).scalars().all()

    results: list[dict] = []
    for member in members:
        last_active = (
            await session.execute(
                select(Lead.last_action_at)
                .where(Lead.assigned_to_user_id == member.id, Lead.last_action_at != None)
                .order_by(Lead.last_action_at.desc())
                .limit(1)
            )
        ).scalar()

        owned = (
            await session.execute(
                select(func.count(Lead.id)).where(Lead.assigned_to_user_id == member.id)
            )
        ).scalar() or 0

        if owned > 0 and (last_active is None or last_active < cutoff):
            inactive_days = (datetime.now(timezone.utc) - last_active).days if last_active else days
            results.append({
                "entity_type": "member",
                "entity_id": member.id,
                "detail": {
                    "member_name": member.name or member.fbo_id or f"User #{member.id}",
                    "days": inactive_days,
                },
            })
    return results


TRIGGER_EVAL = {
    "missed_missions": _eval_missed_missions,
    "zombie_lead": _eval_zombie_leads,
    "verification_sla": _eval_verification_sla,
    "campaign_incomplete": _eval_campaign_incomplete,
    "inactivity": _eval_inactivity,
}


# ── ACTION EXECUTORS ───────────────────────────────────────────────────────

async def _exec_alert_leader(
    session: AsyncSession,
    rule: AutomationRule,
    entity: dict,
) -> dict:
    """Notify the leader about the triggered entity."""
    detail = entity["detail"]
    entity_type = entity["entity_type"]
    entity_id = entity["entity_id"]

    if entity_type == "lead":
        lead_detail = detail
        member_id = lead_detail.get("assigned_to") or lead_detail.get("owner_user_id")
    else:
        member_id = entity_id

    leader_id = await _get_leader_id(session, member_id) if member_id else None
    config = rule.action_config or {}
    message = config.get("message", "Alert triggered.").format(**detail)

    sent = False
    if leader_id is not None:
        leader = await session.get(User, leader_id)
        if leader is not None and leader.phone:
            from app.services.whatsapp_leader_alerts import send_system_alert
            wa_text = (
                f"🚨 *Myle Automation Alert*\n\n"
                f"{message}\n\n"
                f"Rule: {rule.name}\n\n"
                "— Myle Team"
            )
            sent = await send_system_alert(
                leader.phone, wa_text, session,
                message_type="automation_alert", related_user_id=leader.id,
            )

    return {
        "action": "alert_leader",
        "leader_id": leader_id,
        "member_id": member_id,
        "message": message,
        "status": "sent" if sent else "logged",
    }


def _prettify(value: str | None) -> str:
    """'video_sent' -> 'Video Sent'. Returns '—' for empty values."""
    if not value:
        return "—"
    return str(value).replace("_", " ").strip().title() or "—"


def _digest_line(index: int, rule: AutomationRule, entity: dict) -> str:
    """One compact line for a leader digest entry."""
    detail = entity.get("detail") or {}
    if entity.get("entity_type") == "lead":
        name = detail.get("lead_name") or f"Lead #{entity.get('entity_id')}"
        phone = detail.get("phone") or "—"
        stage = _prettify(detail.get("status"))
        last_ctx = _prettify(detail.get("call_status"))
        days = detail.get("days", "?")
        return f"{index}. {name} · {phone} · now: {stage} · last: {last_ctx} · {days}d idle"
    # Member-based alert (missed missions / incomplete campaigns): reuse the
    # rule's message template, falling back gracefully on missing keys.
    config = rule.action_config or {}
    template = config.get("message", "Needs attention.")
    try:
        text = template.format(**detail)
    except Exception:
        text = template
    return f"{index}. {text}"


async def _exec_alert_leader_batched(
    session: AsyncSession,
    rule: AutomationRule,
    entities: list[dict],
) -> dict[int, dict]:
    """Send one digest per leader (max 50 entries per WhatsApp) instead of one
    message per entity. Returns a {entity_id: result} map for action logging.
    """
    BATCH_SIZE = 50

    # Group entities by their resolved leader.
    groups: dict[int | None, list[dict]] = {}
    for entity in entities:
        detail = entity.get("detail") or {}
        if entity.get("entity_type") == "lead":
            member_id = detail.get("assigned_to") or detail.get("owner_user_id")
        else:
            member_id = entity.get("entity_id")
        leader_id = await _get_leader_id(session, member_id) if member_id else None
        groups.setdefault(leader_id, []).append(entity)

    from app.services.whatsapp_leader_alerts import send_system_alert

    # Management sees only a per-leader rollup (leader name + phone + count) so
    # Shikha can ring the responsible leader — not every lead's number/details.
    rollup_rows: list[tuple[str, str, int]] = []

    results: dict[int, dict] = {}
    for leader_id, group in groups.items():
        leader = await session.get(User, leader_id) if leader_id else None
        phone = leader.phone if leader else None

        sent_any = False
        if phone:
            total = len(group)
            parts = (total + BATCH_SIZE - 1) // BATCH_SIZE
            for part_index in range(parts):
                chunk = group[part_index * BATCH_SIZE : (part_index + 1) * BATCH_SIZE]
                lines = [
                    _digest_line(part_index * BATCH_SIZE + offset + 1, rule, entity)
                    for offset, entity in enumerate(chunk)
                ]
                header = f"🚨 *Myle: {rule.name}*"
                if parts > 1:
                    header += f"  ({part_index + 1}/{parts})"
                body = f"{header}\n\n" + "\n".join(lines) + "\n\n— Myle Team"
                ok = await send_system_alert(
                    phone, body, session,
                    message_type="automation_alert", related_user_id=leader_id,
                )
                sent_any = sent_any or ok

        lead_count = sum(1 for e in group if e.get("entity_type") == "lead")
        if lead_count:
            leader_name = (leader.name or leader.fbo_id) if leader else "Unassigned"
            leader_phone = (leader.phone if leader else None) or "—"
            rollup_rows.append((leader_name, leader_phone, lead_count))

        status = "sent" if (phone and sent_any) else "logged"
        for entity in group:
            results[entity["entity_id"]] = {
                "action": "alert_leader",
                "leader_id": leader_id,
                "status": status,
                "batched": True,
            }

    await _send_management_leader_rollup(session, rule, rollup_rows)
    return results


async def _send_management_leader_rollup(
    session: AsyncSession,
    rule: AutomationRule,
    rollup_rows: list[tuple[str, str, int]],
) -> None:
    """Management (Shikha) gets a leader-level rollup only: each leader's name +
    phone + how many of their team's leads need attention — so she can call the
    leader. No individual lead numbers/details. Max 50 leaders per message.
    """
    if not rollup_rows:
        return
    from app.services.whatsapp_leader_alerts import send_system_alert
    from app.services.whatsapp_management_updates import get_management_phone

    mgmt_phone = await get_management_phone(session)
    if not mgmt_phone:
        return

    rollup_rows.sort(key=lambda r: r[2], reverse=True)
    BATCH_SIZE = 50
    total_leaders = len(rollup_rows)
    total_leads = sum(c for _, _, c in rollup_rows)
    parts = (total_leaders + BATCH_SIZE - 1) // BATCH_SIZE
    for part_index in range(parts):
        chunk = rollup_rows[part_index * BATCH_SIZE : (part_index + 1) * BATCH_SIZE]
        lines = [
            f"{part_index * BATCH_SIZE + offset + 1}. {name} 📞 {phone} — "
            f"{count} lead{'s' if count != 1 else ''}"
            for offset, (name, phone, count) in enumerate(chunk)
        ]
        header = f"🧟 *Leads needing attention — by team* ({total_leads} across {total_leaders} leaders)"
        if parts > 1:
            header += f"  ({part_index + 1}/{parts})"
        body = (
            f"{header}\n\nCall the leader to action their team's stale leads:\n\n"
            + "\n".join(lines)
            + "\n\n— Myle Team"
        )
        try:
            await send_system_alert(
                mgmt_phone, body, session, message_type="automation_alert_management",
            )
        except Exception:
            pass


async def _exec_create_task(
    session: AsyncSession,
    rule: AutomationRule,
    entity: dict,
) -> dict:
    """Create a verification task + assignment for the member."""
    detail = entity["detail"]
    config = rule.action_config or {}
    entity_type = entity["entity_type"]
    entity_id = entity["entity_id"]

    member_id: int | None = None
    if entity_type == "lead":
        member_id = detail.get("assigned_to") or detail.get("owner_user_id")
    else:
        member_id = entity_id

    if not member_id:
        return {"action": "create_task", "status": "skipped", "reason": "no_member_id"}

    # Check if a pending task already exists for this trigger
    existing = (
        await session.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.assigned_to_user_id == member_id,
                TaskAssignment.status == "pending",
                TaskAssignment.verification_task_id.in_(
                    select(VerificationTask.id).where(
                        VerificationTask.task_type == "follow_up",
                    )
                ),
            )
        )
    ).scalar() or 0
    if existing > 0:
        return {"action": "create_task", "status": "skipped", "reason": "pending_task_exists"}

    # Create a system verification task
    task_type = config.get("task_type", "follow_up")
    message = config.get("message", "Automated task").format(**detail)

    vt = VerificationTask(
        title=f"Auto: {rule.name}",
        description=message[:500],
        task_type=task_type,
        created_by_user_id=None,  # system
        is_active=True,
    )
    session.add(vt)
    await session.flush()

    # Find leader for assignment
    from app.services.user_hierarchy import nearest_leader_for_user
    leader = await nearest_leader_for_user(session, member_id)
    leader_id = leader.id if leader else None

    # Create assignment
    ta = TaskAssignment(
        verification_task_id=vt.id,
        assigned_to_user_id=member_id,
        assigned_by_user_id=None,
        leader_user_id=leader_id,
        due_at=datetime.now(timezone.utc) + timedelta(hours=config.get("due_hours", 48)),
        status="pending",
    )
    session.add(ta)
    await session.flush()

    return {
        "action": "create_task",
        "status": "created",
        "task_id": ta.id,
        "verification_task_id": vt.id,
        "assigned_to": member_id,
        "due_in_hours": config.get("due_hours", 48),
    }


async def _exec_create_recovery_mission(
    session: AsyncSession,
    rule: AutomationRule,
    entity: dict,
) -> dict:
    """Create a recovery mission with items as JSON."""
    detail = entity["detail"]
    config = rule.action_config or {}
    entity_type = entity["entity_type"]
    member_id = entity_id = entity["entity_id"] if entity_type != "lead" else (detail.get("assigned_to") or detail.get("owner_user_id"))

    if not member_id:
        return {"action": "create_recovery_mission", "status": "skipped", "reason": "no_member_id"}

    return await create_recovery_mission_for_member(
        session, member_id, recovery_items=config.get("recovery_items"),
    )


async def create_recovery_mission_for_member(
    session: AsyncSession,
    member_id: int,
    recovery_items: list[dict] | None = None,
) -> dict:
    """Add recovery items to the member's mission for today.

    Daily missions are unique per (user_id, mission_date), so recovery items
    are merged into today's existing mission instead of creating a new row.
    A completed mission is reopened so the member has to act again.
    """
    pending = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.user_id == member_id,
                DailyMission.status == "pending",
            )
        )
    ).scalar() or 0
    if pending >= 3:
        return {"action": "create_recovery_mission", "status": "skipped", "reason": "max_pending_reached"}

    today = datetime.now(timezone.utc).date()
    recovery_items = recovery_items or [
        {"key": "recovery_tasks", "label": "Complete pending tasks", "target": 1, "evidence_required": False},
        {"key": "recovery_missions", "label": "Review missed missions", "target": 1, "evidence_required": False},
        {"key": "recovery_leads", "label": "Call your leads", "target": 3, "evidence_required": False},
    ]
    items_dict = {
        item["key"]: {
            "target": item.get("target", 1),
            "achieved": 0,
            "done": False,
            "evidence": None,
            "evidence_file": None,
            "label": item.get("label", item["key"]),
        }
        for item in recovery_items
    }

    mission = (
        await session.execute(
            select(DailyMission).where(
                DailyMission.user_id == member_id,
                DailyMission.mission_date == today,
            )
        )
    ).scalar_one_or_none()

    if mission is not None:
        merged = dict(mission.items or {})
        added = [k for k in items_dict if k not in merged]
        if not added:
            return {
                "action": "create_recovery_mission",
                "status": "skipped",
                "reason": "recovery_already_added",
                "mission_id": mission.id,
            }
        merged.update({k: items_dict[k] for k in added})
        mission.items = merged
        mission.status = "pending"
        total = len(merged)
        done = sum(1 for v in merged.values() if isinstance(v, dict) and v.get("done"))
        mission.completion_pct = round((done / total) * 100, 1) if total else 0.0
        await session.flush()
        return {
            "action": "create_recovery_mission",
            "status": "merged",
            "mission_id": mission.id,
            "member_id": member_id,
            "items": added,
        }

    mission = DailyMission(
        user_id=member_id,
        mission_date=today,
        status="pending",
        items=items_dict,
    )
    session.add(mission)
    await session.flush()

    return {
        "action": "create_recovery_mission",
        "status": "created",
        "mission_id": mission.id,
        "member_id": member_id,
        "items": list(items_dict.keys()),
    }


async def _exec_escalate(
    session: AsyncSession,
    rule: AutomationRule,
    entity: dict,
) -> dict:
    """Escalate to admin."""
    detail = entity["detail"]
    config = rule.action_config or {}
    message = config.get("message", "Escalation triggered.").format(**detail)

    return {
        "action": "escalate",
        "priority": config.get("priority", "high"),
        "message": message,
        "status": "logged",
    }


ACTION_EXEC = {
    "alert_leader": _exec_alert_leader,
    "create_task": _exec_create_task,
    "create_recovery_mission": _exec_create_recovery_mission,
    "escalate": _exec_escalate,
}


# ── MAIN ────────────────────────────────────────────────────────────────────

async def evaluate_rule(
    session: AsyncSession,
    rule: AutomationRule,
) -> list[AutomationActionLog]:
    """Evaluate a single rule and execute actions."""
    evaluator = TRIGGER_EVAL.get(rule.trigger_type)
    if not evaluator:
        return []

    executor = ACTION_EXEC.get(rule.action_type)
    if not executor:
        return []

    triggered_entities = await evaluator(session, rule)

    # Drop entities still inside their per-entity cooldown window.
    eligible: list[dict] = []
    for entity in triggered_entities:
        if await _was_recently_actioned(
            session, rule.id, entity["entity_type"], entity["entity_id"], rule.cooldown_hours
        ):
            continue
        eligible.append(entity)

    # alert_leader is batched: one digest per leader (max 50 entries per
    # WhatsApp) so leaders get a single list, not one message per entity.
    batched_results: dict[int, dict] = {}
    if rule.action_type == "alert_leader":
        batched_results = await _exec_alert_leader_batched(session, rule, eligible)

    logs: list[AutomationActionLog] = []
    for entity in eligible:
        entity_type = entity["entity_type"]
        entity_id = entity["entity_id"]

        if rule.action_type == "alert_leader":
            result = batched_results.get(
                entity_id, {"action": "alert_leader", "status": "logged"}
            )
        else:
            result = await executor(session, rule, entity)

        log = await _log_action(
            session,
            rule.id,
            rule.trigger_type,
            entity_type,
            entity_id,
            entity["detail"],
            rule.action_type,
            result,
        )
        logs.append(log)

    await session.commit()
    return logs


async def evaluate_all_rules(
    session: AsyncSession,
) -> AutomationEvaluateResponse:
    """Evaluate all active rules and return action logs."""
    rules = (
        await session.execute(
            select(AutomationRule).where(AutomationRule.is_active == True)
        )
    ).scalars().all()

    all_logs: list[AutomationActionLog] = []
    for rule in rules:
        logs = await evaluate_rule(session, rule)
        all_logs.extend(logs)

    return AutomationEvaluateResponse(
        triggered=len(all_logs),
        actions=[
            AutomationActionLogPublic(
                id=log.id,
                rule_id=log.rule_id,
                trigger_type=log.trigger_type,
                trigger_entity_type=log.trigger_entity_type,
                trigger_entity_id=log.trigger_entity_id,
                trigger_detail=log.trigger_detail,
                action_type=log.action_type,
                action_result=log.action_result,
                created_at=log.created_at,
            )
            for log in all_logs
        ],
    )


async def list_rules(session: AsyncSession) -> list[AutomationRulePublic]:
    rules = (
        await session.execute(
            select(AutomationRule).order_by(AutomationRule.created_at.desc())
        )
    ).scalars().all()
    return [
        AutomationRulePublic(
            id=r.id,
            name=r.name,
            description=r.description,
            trigger_type=r.trigger_type,
            trigger_config=r.trigger_config,
            action_type=r.action_type,
            action_config=r.action_config,
            cooldown_hours=r.cooldown_hours,
            is_active=r.is_active,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rules
    ]


async def create_rule(session: AsyncSession, data: dict) -> AutomationRulePublic:
    rule = AutomationRule(**data)
    session.add(rule)
    await session.flush()
    await session.refresh(rule)
    return AutomationRulePublic(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        trigger_type=rule.trigger_type,
        trigger_config=rule.trigger_config,
        action_type=rule.action_type,
        action_config=rule.action_config,
        cooldown_hours=rule.cooldown_hours,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


async def update_rule(session: AsyncSession, rule_id: int, data: dict) -> AutomationRulePublic | None:
    rule = await session.get(AutomationRule, rule_id)
    if not rule:
        return None
    for key, value in data.items():
        if value is not None and hasattr(rule, key):
            setattr(rule, key, value)
    await session.flush()
    await session.refresh(rule)
    return AutomationRulePublic(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        trigger_type=rule.trigger_type,
        trigger_config=rule.trigger_config,
        action_type=rule.action_type,
        action_config=rule.action_config,
        cooldown_hours=rule.cooldown_hours,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


async def delete_rule(session: AsyncSession, rule_id: int) -> bool:
    rule = await session.get(AutomationRule, rule_id)
    if not rule:
        return False
    await session.delete(rule)
    await session.flush()
    return True


async def list_action_logs(
    session: AsyncSession,
    limit: int = 50,
) -> list[AutomationActionLogPublic]:
    logs = (
        await session.execute(
            select(AutomationActionLog)
            .order_by(AutomationActionLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        AutomationActionLogPublic(
            id=log.id,
            rule_id=log.rule_id,
            trigger_type=log.trigger_type,
            trigger_entity_type=log.trigger_entity_type,
            trigger_entity_id=log.trigger_entity_id,
            trigger_detail=log.trigger_detail,
            action_type=log.action_type,
            action_result=log.action_result,
            created_at=log.created_at,
        )
        for log in logs
    ]
