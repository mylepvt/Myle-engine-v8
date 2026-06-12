from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.models.daily_mission import DailyMission, MissionBlocker, MissionTemplate
from app.models.user import User
from app.schemas.missions import (
    AdminMissionSummary,
    DailyMissionPublic,
    MissionBlockerPublic,
    MissionTemplateCreate,
    MissionTemplatePublic,
    MissionTickRequest,
)


_TODAY_MISSION_ITEMS = [
    {"key": "invitations", "label": "Invitations", "target": 10, "evidence_required": False},
    {"key": "follow_ups", "label": "Follow-ups", "target": 5, "evidence_required": False},
    {"key": "calls", "label": "Calls", "target": 3, "evidence_required": False},
    {"key": "learning_task", "label": "Learning Task", "target": 1, "evidence_required": True},
    {"key": "lead_added", "label": "Lead Added", "target": 1, "evidence_required": False},
]

_LEADER_MISSION_ITEMS = [
    {"key": "calls", "label": "Calls", "target": 5, "evidence_required": False},
    {"key": "team_checkin", "label": "Team Check-in", "target": 1, "evidence_required": True},
    {"key": "follow_ups", "label": "Follow-ups", "target": 3, "evidence_required": False},
    {"key": "learning_task", "label": "Learning Task", "target": 1, "evidence_required": True},
]


def _compute_completion_pct(items: dict[str, Any]) -> float:
    if not items:
        return 0.0
    total = len(items)
    done = sum(1 for v in items.values() if isinstance(v, dict) and v.get("done"))
    return round((done / total) * 100, 1) if total else 0.0


def _default_mission_items(role: str) -> list[dict[str, Any]]:
    if role == "leader":
        return _LEADER_MISSION_ITEMS
    return _TODAY_MISSION_ITEMS


def _items_to_mission_dict(items: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for item in items:
        key = item["key"]
        result[key] = {
            "target": item.get("target", 1),
            "achieved": 0,
            "done": False,
            "evidence": None,
            "evidence_file": None,
            "label": item.get("label", key),
        }
    return result


# ── Template CRUD ──────────────────────────────────────────────────


async def create_template(
    session: AsyncSession,
    body: MissionTemplateCreate,
    user_id: int,
) -> MissionTemplate:
    template = MissionTemplate(
        name=body.name,
        role=body.role,
        items=[m.model_dump() for m in body.items],
        created_by_user_id=user_id,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


async def list_templates(session: AsyncSession, active_only: bool = True) -> list[MissionTemplate]:
    q = select(MissionTemplate)
    if active_only:
        q = q.where(MissionTemplate.is_active.is_(True))
    q = q.order_by(MissionTemplate.created_at.desc())
    rows = (await session.execute(q)).scalars().all()
    return list(rows)


# ── Daily Mission ──────────────────────────────────────────────────


async def get_or_create_today_mission(
    session: AsyncSession,
    user_id: int,
    role: str,
) -> DailyMission:
    """Return today's mission for the user, creating it from template if not yet exists."""
    today = date.today()

    existing = (
        await session.execute(
            select(DailyMission).where(
                DailyMission.user_id == user_id,
                DailyMission.mission_date == today,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        return existing

    # Get active template for this role, or use defaults
    template = (
        await session.execute(
            select(MissionTemplate).where(
                MissionTemplate.role == role,
                MissionTemplate.is_active.is_(True),
            ).limit(1)
        )
    ).scalar_one_or_none()

    if template:
        items_dict = _items_to_mission_dict(template.items)  # type: ignore[arg-type]
        template_id = template.id
    else:
        items_dict = _items_to_mission_dict(_default_mission_items(role))
        template_id = None

    mission = DailyMission(
        user_id=user_id,
        mission_date=today,
        template_id=template_id,
        items=items_dict,
        completion_pct=0.0,
        status="pending",
        started_at=datetime.now(timezone.utc),
    )
    session.add(mission)
    await session.commit()
    await session.refresh(mission)
    return mission


async def tick_mission_item(
    session: AsyncSession,
    mission: DailyMission,
    body: MissionTickRequest,
) -> DailyMission:
    """Tick one item on today's mission."""
    if mission.status == "completed":
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Mission already completed")

    items: dict[str, Any] = dict(mission.items) if mission.items else {}
    item = items.get(body.item_key)
    if item is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown mission item: {body.item_key}",
        )

    item["achieved"] = body.achieved
    item["done"] = body.achieved >= item.get("target", 1)
    if body.evidence:
        item["evidence"] = body.evidence
    if body.evidence_file:
        item["evidence_file"] = body.evidence_file

    mission.items = items
    mission.completion_pct = _compute_completion_pct(items)

    # If all items done, auto-complete
    if mission.completion_pct >= 100:
        mission.status = "completed"
        mission.completed_at = datetime.now(timezone.utc)

    mission.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(mission)
    return mission


async def complete_mission(
    session: AsyncSession,
    mission: DailyMission,
) -> DailyMission:
    """Force-complete a mission even if not 100%."""
    mission.status = "completed"
    mission.completed_at = datetime.now(timezone.utc)
    mission.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(mission)
    return mission


async def mark_incomplete(
    session: AsyncSession,
    mission: DailyMission,
) -> DailyMission:
    mission.status = "incomplete"
    mission.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(mission)
    return mission


async def create_blocker(
    session: AsyncSession,
    mission: DailyMission,
    reason: str,
    notes: str | None,
) -> MissionBlocker:
    blocker = MissionBlocker(
        daily_mission_id=mission.id,
        reason=reason,
        notes=notes,
    )
    session.add(blocker)
    mission.status = "incomplete"
    mission.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(blocker)
    return blocker


async def get_mission_blockers(
    session: AsyncSession,
    mission_id: int,
) -> list[MissionBlocker]:
    rows = (
        await session.execute(
            select(MissionBlocker).where(MissionBlocker.daily_mission_id == mission_id)
            .order_by(MissionBlocker.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def get_member_mission_history(
    session: AsyncSession,
    user_id: int,
    limit: int = 30,
) -> list[DailyMission]:
    rows = (
        await session.execute(
            select(DailyMission)
            .where(DailyMission.user_id == user_id)
            .order_by(DailyMission.mission_date.desc())
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)


# ── Leader view ────────────────────────────────────────────────────


async def get_team_today_missions(
    session: AsyncSession,
    leader_user_id: int,
) -> list[dict[str, Any]]:
    """Return today's mission status for every member under this leader."""
    from app.services.user_hierarchy import recursive_downline_user_ids

    downline_ids = await recursive_downline_user_ids(session, leader_user_id)
    if not downline_ids:
        return []

    today = date.today()
    rows = (
        await session.execute(
            select(DailyMission)
            .where(
                DailyMission.user_id.in_(downline_ids),
                DailyMission.mission_date == today,
            )
        )
    ).scalars().all()

    mission_map: dict[int, DailyMission] = {m.user_id: m for m in rows}

    result: list[dict[str, Any]] = []
    for uid in downline_ids:
        user = await session.get(User, uid)
        if not user:
            continue
        mission = mission_map.get(uid)
        result.append({
            "user_id": uid,
            "name": user.display_name or user.fbo_id or "Unknown",
            "mission_id": mission.id if mission else None,
            "completion_pct": mission.completion_pct if mission else 0.0,
            "status": mission.status if mission else "pending",
            "has_blocker": False,  # simplified
        })
    return result


# ── Admin summary ──────────────────────────────────────────────────


async def get_admin_summary(
    session: AsyncSession,
    mission_date: date | None = None,
) -> AdminMissionSummary:
    today = mission_date or date.today()

    # Total team + leader members
    total_members = (
        await session.execute(
            select(func.count()).select_from(User).where(
                User.role.in_(["team", "leader"]),
                User.removed_at.is_(None),
            )
        )
    ).scalar() or 0

    # Missions for today
    missions = (
        await session.execute(
            select(DailyMission).where(DailyMission.mission_date == today)
        )
    ).scalars().all()

    assigned_today = len(missions)
    completed = sum(1 for m in missions if m.status == "completed")
    incomplete = sum(1 for m in missions if m.status == "incomplete")
    pending = assigned_today - completed - incomplete

    rate = round((completed / max(assigned_today, 1)) * 100, 1)

    # Leader breakdown
    leaders = (
        await session.execute(
            select(User).where(User.role == "leader", User.removed_at.is_(None))
        )
    ).scalars().all()

    from app.services.user_hierarchy import recursive_downline_user_ids

    leader_breakdown: list[dict[str, Any]] = []
    for leader in leaders:
        downline_ids = await recursive_downline_user_ids(session, leader.id)
        if not downline_ids:
            continue
        team_missions = (
            await session.execute(
                select(DailyMission).where(
                    DailyMission.user_id.in_(downline_ids),
                    DailyMission.mission_date == today,
                )
            )
        ).scalars().all()
        team_total = len(team_missions)
        team_done = sum(1 for m in team_missions if m.status == "completed")
        leader_breakdown.append({
            "user_id": leader.id,
            "name": leader.display_name or leader.fbo_id or "Unknown",
            "team_size": len(downline_ids),
            "assigned": team_total,
            "completed": team_done,
            "completion_rate_pct": round((team_done / max(team_total, 1)) * 100, 1),
        })

    leader_breakdown.sort(key=lambda l: l["completion_rate_pct"], reverse=True)

    # Blocker summary
    blocker_rows = (
        await session.execute(
            select(
                MissionBlocker.reason,
                func.count(MissionBlocker.id).label("count"),
            )
            .group_by(MissionBlocker.reason)
            .order_by(func.count(MissionBlocker.id).desc())
        )
    ).all()

    blocker_summary = [
        {"reason": row.reason, "count": row.count} for row in blocker_rows
    ]

    return AdminMissionSummary(
        total_members=total_members,
        assigned_today=assigned_today,
        completed=completed,
        pending=pending,
        incomplete=incomplete,
        completion_rate_pct=rate,
        leader_breakdown=leader_breakdown,
        blocker_summary=blocker_summary,
    )
