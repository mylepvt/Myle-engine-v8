"""Action Queue — ranked one-tap action list + execute endpoint.

Covers:
- Admin queue surfaces a zombie lead and a member with missed missions
- Member with zero mission rows (never opened app) is still flagged
- Team role gets 403
- Leader queue is scoped to own downline
- execute create_recovery merges items into today's existing mission
  (unique user_id+mission_date) and logs under the Manual Action Queue rule
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import AutomationActionLog, AutomationRule
from app.models.daily_mission import DailyMission
from app.models.lead import Lead
from app.models.user import User
from app.services.action_queue_service import MANUAL_RULE_NAME


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _seed_user(
    session: AsyncSession,
    user_id: int,
    role: str = "team",
    upline_user_id: int | None = None,
    created_days_ago: int = 30,
) -> User:
    existing = await session.get(User, user_id)
    if existing:
        return existing
    u = User(
        id=user_id,
        name=f"Test {role} {user_id}",
        username=f"test_{role}_{user_id}",
        email=f"test_{role}_{user_id}@myle.test",
        role=role,
        registration_status="approved",
        fbo_id=f"F{user_id:05d}",
        upline_user_id=upline_user_id,
        created_at=_now() - timedelta(days=created_days_ago),
    )
    session.add(u)
    await session.flush()
    return u


async def _seed_zombie_lead(session: AsyncSession, *, assigned_to: int, idle_days: int = 10) -> Lead:
    lead = Lead(
        name=f"Zombie Lead u{assigned_to}",
        status="video_sent",
        created_by_user_id=assigned_to,
        owner_user_id=assigned_to,
        assigned_to_user_id=assigned_to,
        last_action_at=_now() - timedelta(days=idle_days),
        outcome="active",
    )
    session.add(lead)
    await session.flush()
    return lead


@pytest.mark.asyncio
async def test_admin_queue_flags_zombie_lead_and_ghost_member(admin_client: AsyncClient, engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        # Ghost member: 30 days old, zero DailyMission rows
        ghost = await _seed_user(session, 301)
        lead = await _seed_zombie_lead(session, assigned_to=ghost.id, idle_days=10)
        await session.commit()
        ghost_id, lead_id = ghost.id, lead.id

    resp = await admin_client.get("/api/v1/action-queue")
    assert resp.status_code == 200
    body = resp.json()
    ids = [i["id"] for i in body["items"]]
    assert f"zombie_lead:{lead_id}" in ids
    assert f"missed_missions:{ghost_id}" in ids
    # severity-sorted
    sevs = [i["severity"] for i in body["items"]]
    assert sevs == sorted(sevs, reverse=True)


@pytest.mark.asyncio
async def test_team_role_forbidden(team_client: AsyncClient):
    resp = await team_client.get("/api/v1/action-queue")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_leader_queue_scoped_to_downline(leader_client: AsyncClient, engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 202, role="leader")
        mine = await _seed_user(session, 302, upline_user_id=202)
        outsider = await _seed_user(session, 303)
        my_lead = await _seed_zombie_lead(session, assigned_to=mine.id)
        other_lead = await _seed_zombie_lead(session, assigned_to=outsider.id)
        await session.commit()
        my_lead_id, other_lead_id = my_lead.id, other_lead.id

    resp = await leader_client.get("/api/v1/action-queue")
    assert resp.status_code == 200
    ids = [i["id"] for i in resp.json()["items"]]
    assert f"zombie_lead:{my_lead_id}" in ids
    assert f"zombie_lead:{other_lead_id}" not in ids


@pytest.mark.asyncio
async def test_execute_create_recovery_merges_into_today_mission(admin_client: AsyncClient, engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        member = await _seed_user(session, 304)
        mission = DailyMission(
            user_id=member.id,
            mission_date=_now().date(),
            status="completed",
            items={"calls": {"target": 3, "achieved": 3, "done": True}},
            completion_pct=100.0,
        )
        session.add(mission)
        await session.commit()
        member_id, mission_id = member.id, mission.id

    resp = await admin_client.post(
        "/api/v1/action-queue/execute",
        json={
            "item_type": "missed_missions",
            "entity_type": "member",
            "entity_id": member_id,
            "action": "create_recovery",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "merged"
    assert body["detail"]["mission_id"] == mission_id

    async with AsyncSession(engine, expire_on_commit=False) as session:
        mission = await session.get(DailyMission, mission_id)
        assert "recovery_leads" in mission.items
        assert mission.status == "pending"  # reopened
        assert mission.completion_pct < 100.0

        rule = (
            await session.execute(
                select(AutomationRule).where(AutomationRule.name == MANUAL_RULE_NAME)
            )
        ).scalar_one()
        assert rule.is_active is False
        log = (
            await session.execute(
                select(AutomationActionLog).where(
                    AutomationActionLog.rule_id == rule.id,
                    AutomationActionLog.trigger_entity_id == member_id,
                )
            )
        ).scalars().all()
        assert len(log) == 1
        assert log[0].action_type == "create_recovery"
