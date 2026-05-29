"""Restoring an archived lead must restart the 24h watch.

Spec: when a team member restores a lead from Archived it returns to the
calling board at its last stage and gets a fresh 24h chance. If the restore
only cleared archived_at without refreshing the stale anchor, the next
auto-archive sweep would immediately re-archive it.

Covers:
- PATCH {archived: false} clears archived_at AND bumps last_action_at to now
- After restore, auto_archive_general_pipeline_leads does NOT re-archive the lead
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User
from app.services.execution_enforcement import auto_archive_general_pipeline_leads


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


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


async def _seed_archived_stale_lead(session: AsyncSession, *, owner_id: int) -> Lead:
    now = _now_utc()
    lead = Lead(
        name="Stale Archived Lead",
        status="new_lead",
        created_by_user_id=owner_id,
        owner_user_id=owner_id,
        assigned_to_user_id=owner_id,
        in_pool=False,
        last_action_at=now - timedelta(hours=30),  # idle long enough to be re-archivable
        archived_at=now - timedelta(hours=1),
    )
    session.add(lead)
    await session.flush()
    return lead


@pytest.mark.asyncio
async def test_restore_clears_archive_and_refreshes_anchor(team_client: AsyncClient, engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_archived_stale_lead(session, owner_id=201)
        await session.commit()
        lead_id = lead.id

    resp = await team_client.patch(f"/api/v1/leads/{lead_id}", json={"archived": False})
    assert resp.status_code == 200, resp.text

    async with AsyncSession(engine, expire_on_commit=False) as session:
        refreshed = await session.get(Lead, lead_id)
        assert refreshed.archived_at is None
        assert refreshed.last_action_at is not None
        last_action = refreshed.last_action_at
        if last_action.tzinfo is None:
            last_action = last_action.replace(tzinfo=timezone.utc)
        # Watch restarted: anchor is fresh (within the last minute), not 30h old.
        assert _now_utc() - last_action < timedelta(minutes=1)


@pytest.mark.asyncio
async def test_restored_lead_not_reimmediately_archived(team_client: AsyncClient, engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_archived_stale_lead(session, owner_id=201)
        await session.commit()
        lead_id = lead.id

    resp = await team_client.patch(f"/api/v1/leads/{lead_id}", json={"archived": False})
    assert resp.status_code == 200, resp.text

    async with AsyncSession(engine, expire_on_commit=False) as session:
        archived = await auto_archive_general_pipeline_leads(session, now=_now_utc())
        assert archived == 0
        refreshed = await session.get(Lead, lead_id)
        assert refreshed.archived_at is None
