"""ctcs_filter=today shows only leads CLAIMED today (IST), via ActivityLog.

Covers:
- Lead with a lead.claimed ActivityLog entry today → appears under ctcs_filter=today
- Lead touched today (last_action_at=now) but never claimed → excluded
- Lead claimed yesterday (claim ActivityLog dated yesterday) → excluded
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ist_day_start_utc() -> datetime:
    from app.core.time_ist import IST

    now_ist = datetime.now(IST)
    return now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


async def _seed_user(session: AsyncSession, user_id: int, role: str = "team") -> User:
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
    )
    session.add(u)
    await session.flush()
    return u


async def _seed_lead(
    session: AsyncSession,
    *,
    owner_id: int,
    last_action_at: datetime | None = None,
    status: str = "new_lead",
) -> Lead:
    lead = Lead(
        name="Test Lead",
        status=status,
        created_by_user_id=owner_id,
        owner_user_id=owner_id,
        assigned_to_user_id=owner_id,
        last_action_at=last_action_at,
    )
    session.add(lead)
    await session.flush()
    return lead


async def _seed_claim_activity(
    session: AsyncSession,
    *,
    user_id: int,
    lead_id: int,
    created_at: datetime,
    action: str = "lead.claimed",
) -> None:
    session.add(
        ActivityLog(
            user_id=user_id,
            action=action,
            entity_type="lead",
            entity_id=lead_id,
            created_at=created_at,
        )
    )
    await session.flush()


@pytest.mark.asyncio
async def test_today_includes_lead_claimed_today(team_client: AsyncClient, engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_lead(session, owner_id=201, last_action_at=_now_utc())
        await _seed_claim_activity(session, user_id=201, lead_id=lead.id, created_at=_now_utc())
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=today")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_today_excludes_lead_touched_today_but_not_claimed(team_client: AsyncClient, engine):
    """last_action_at today but no claim ActivityLog → must NOT appear."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_lead(session, owner_id=201, last_action_at=_now_utc())
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=today")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id not in ids


@pytest.mark.asyncio
async def test_today_excludes_free_claim(team_client: AsyncClient, engine):
    """Free-pool claim today (lead.claimed_free) → excluded; Today = paid recharge only."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_lead(session, owner_id=201, last_action_at=_now_utc())
        await _seed_claim_activity(
            session,
            user_id=201,
            lead_id=lead.id,
            created_at=_now_utc(),
            action="lead.claimed_free",
        )
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=today")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id not in ids


@pytest.mark.asyncio
async def test_today_excludes_lead_claimed_yesterday(team_client: AsyncClient, engine):
    """Claim ActivityLog dated just before today's IST start → must NOT appear."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_lead(session, owner_id=201, last_action_at=_now_utc())
        yesterday = _ist_day_start_utc() - timedelta(seconds=1)
        await _seed_claim_activity(session, user_id=201, lead_id=lead.id, created_at=yesterday)
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=today")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id not in ids
