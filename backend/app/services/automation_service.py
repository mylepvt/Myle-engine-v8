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
    """Find members with N+ missed missions in last D days."""
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
        count = (
            await session.execute(
                select(func.count(DailyMission.id)).where(
                    DailyMission.user_id == member.id,
                    DailyMission.status != "completed",
                    DailyMission.mission_date >= cutoff_date,
                )
            )
        ).scalar() or 0
        if count >= missed_count:
            results.append({
                "entity_type": "member",
                "entity_id": member.id,
                "detail": {
                    "member_name": member.name or member.fbo_id or f"User #{member.id}",
                    "missed_count": count,
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
            "entity_id": task.user_id,
            "detail": {
                "member_name": f"User #{task.user_id}",
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

    # In future this would send a push notification/WhatsApp
    return {
        "action": "alert_leader",
        "leader_id": leader_id,
        "member_id": member_id,
        "message": message,
        "status": "logged",
    }


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

    # Check existing pending recovery
    existing = (
        await session.execute(
            select(func.count(DailyMission.id)).where(
                DailyMission.user_id == member_id,
                DailyMission.status == "pending",
            )
        )
    ).scalar() or 0
    if existing >= 3:
        return {"action": "create_recovery_mission", "status": "skipped", "reason": "max_pending_reached"}

    today = datetime.now(timezone.utc).date()
    recovery_items = config.get("recovery_items", [
        {"key": "recovery_tasks", "label": "Complete pending tasks", "target": 1, "evidence_required": False},
        {"key": "recovery_missions", "label": "Review missed missions", "target": 1, "evidence_required": False},
        {"key": "recovery_leads", "label": "Call your leads", "target": 3, "evidence_required": False},
    ])
    items_dict = {
        item["key"]: {
            "target": item.get("target", 1),
            "achieved": 0,
            "done": False,
            "evidence": None,
            "evidence_file": None,
        }
        for item in recovery_items
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
    logs: list[AutomationActionLog] = []

    for entity in triggered_entities:
        entity_type = entity["entity_type"]
        entity_id = entity["entity_id"]

        # Cooldown check
        if await _was_recently_actioned(session, rule.id, entity_type, entity_id, rule.cooldown_hours):
            continue

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
