"""
LOCKED — see CLAUDE.md before modifying this file.
These tests are the authoritative spec for the leader→team lead handoff rule.
Do NOT weaken or delete any assertion. If a test fails after a code change,
fix the code — not the test.

Realtime test: leader → team conversion transfers Day-2 handoff leads to upline leader.

Hierarchy used in tests:
    upline_leader (role=leader)
        └── converted_leader (role=leader, will be downgraded to team)
                └── team_member (role=team)

Leads:
    A: owner=team_member, assigned_to=converted_leader  → Day-2 handoff → must go to upline_leader
    B: owner=converted_leader, assigned_to=converted_leader → leader's own lead → must stay
    C: in_pool=True, assigned_to=converted_leader → pool lead → must stay untouched
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.models.lead import Lead
from app.models.user import User
from app.core.passwords import DEV_LOGIN_BCRYPT_HASH
from conftest import get_test_session_factory
from main import app
from util_jwt_patch import patch_jwt_settings

client = TestClient(app)

# Unique FBO IDs so these users never clash with conftest users
_FBO_UPLINE = "test-conv-upline-001"
_FBO_CONVERTED = "test-conv-leader-001"
_FBO_TEAM = "test-conv-team-001"


def _authed_admin(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    return c


async def _seed() -> tuple[int, int, int, int, int]:
    """Create hierarchy + leads. Returns (upline_id, converted_id, team_id, lead_a_id, lead_b_id, lead_c_id)."""
    factory = get_test_session_factory()
    async with factory() as session:
        upline = User(
            fbo_id=_FBO_UPLINE,
            email="test-conv-upline@myle.local",
            role="leader",
            hashed_password=DEV_LOGIN_BCRYPT_HASH,
            registration_status="approved",
        )
        session.add(upline)
        await session.flush()

        converted = User(
            fbo_id=_FBO_CONVERTED,
            email="test-conv-leader@myle.local",
            role="leader",
            hashed_password=DEV_LOGIN_BCRYPT_HASH,
            registration_status="approved",
            upline_user_id=upline.id,
        )
        session.add(converted)
        await session.flush()

        team_member = User(
            fbo_id=_FBO_TEAM,
            email="test-conv-team@myle.local",
            role="team",
            hashed_password=DEV_LOGIN_BCRYPT_HASH,
            registration_status="approved",
            upline_user_id=converted.id,
        )
        session.add(team_member)
        await session.flush()

        # Lead A: Day-2 handoff — owner is team_member, assigned to converted_leader
        lead_a = Lead(
            name="Prospect A (Day-2 handoff)",
            status="day2",
            created_by_user_id=team_member.id,
            owner_user_id=team_member.id,
            assigned_to_user_id=converted.id,
            in_pool=False,
        )
        # Lead B: leader's own lead — owner AND assigned is converted_leader
        lead_b = Lead(
            name="Prospect B (leader own)",
            status="new_lead",
            created_by_user_id=converted.id,
            owner_user_id=converted.id,
            assigned_to_user_id=converted.id,
            in_pool=False,
        )
        # Lead C: pool lead — should never be touched
        lead_c = Lead(
            name="Prospect C (pool)",
            status="new_lead",
            created_by_user_id=converted.id,
            owner_user_id=converted.id,
            assigned_to_user_id=converted.id,
            in_pool=True,
        )
        session.add_all([lead_a, lead_b, lead_c])
        await session.commit()
        return upline.id, converted.id, team_member.id, lead_a.id, lead_b.id, lead_c.id


async def _cleanup() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        fbos = [_FBO_UPLINE, _FBO_CONVERTED, _FBO_TEAM]
        user_ids = (
            await session.execute(select(User.id).where(User.fbo_id.in_(fbos)))
        ).scalars().all()
        if user_ids:
            await session.execute(
                delete(Lead).where(
                    Lead.created_by_user_id.in_(user_ids)
                )
            )
        await session.execute(delete(User).where(User.fbo_id.in_(fbos)))
        await session.commit()


async def _fetch_lead(lead_id: int) -> Lead | None:
    factory = get_test_session_factory()
    async with factory() as session:
        return await session.get(Lead, lead_id)


def test_leader_to_team_transfers_day2_leads_to_upline_leader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Day-2 handoff leads (owner=team_member) must move to upline leader on conversion."""
    upline_id, converted_id, _team_id, lead_a_id, lead_b_id, lead_c_id = asyncio.run(_seed())
    try:
        c = _authed_admin(monkeypatch)
        res = c.patch(
            f"/api/v1/team/members/{converted_id}/role",
            json={"role": "team"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["role"] == "team"

        # Lead A (Day-2 handoff) must now be assigned to upline leader
        lead_a = asyncio.run(_fetch_lead(lead_a_id))
        assert lead_a is not None
        assert lead_a.assigned_to_user_id == upline_id, (
            f"Expected lead A to move to upline_leader ({upline_id}), "
            f"got {lead_a.assigned_to_user_id}"
        )

        # Lead B (leader's own) must stay with the converted user
        lead_b = asyncio.run(_fetch_lead(lead_b_id))
        assert lead_b is not None
        assert lead_b.assigned_to_user_id == converted_id, (
            f"Expected lead B to stay with converted user ({converted_id}), "
            f"got {lead_b.assigned_to_user_id}"
        )

        # Lead C (pool) must be untouched
        lead_c = asyncio.run(_fetch_lead(lead_c_id))
        assert lead_c is not None
        assert lead_c.assigned_to_user_id == converted_id, (
            f"Pool lead C should not be touched, got {lead_c.assigned_to_user_id}"
        )
    finally:
        asyncio.run(_cleanup())


def test_leader_to_team_no_upline_leader_leaves_leads_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If converted leader has no upline leader (orphan), leads must stay as-is."""
    factory = get_test_session_factory()
    fbo_orphan = "test-conv-orphan-001"

    async def seed_orphan() -> tuple[int, int]:
        async with factory() as session:
            orphan = User(
                fbo_id=fbo_orphan,
                email="test-conv-orphan@myle.local",
                role="leader",
                hashed_password=DEV_LOGIN_BCRYPT_HASH,
                registration_status="approved",
                upline_user_id=None,  # no upline
            )
            session.add(orphan)
            await session.flush()
            lead = Lead(
                name="Orphan handoff lead",
                status="day2",
                created_by_user_id=1,
                owner_user_id=1,
                assigned_to_user_id=orphan.id,
                in_pool=False,
            )
            session.add(lead)
            await session.commit()
            return orphan.id, lead.id

    async def cleanup_orphan() -> None:
        async with factory() as session:
            rows = (
                await session.execute(select(User.id).where(User.fbo_id == fbo_orphan))
            ).scalars().all()
            if rows:
                await session.execute(delete(Lead).where(Lead.created_by_user_id == 1, Lead.name == "Orphan handoff lead"))
            await session.execute(delete(User).where(User.fbo_id == fbo_orphan))
            await session.commit()

    orphan_id, lead_id = asyncio.run(seed_orphan())
    try:
        c = _authed_admin(monkeypatch)
        res = c.patch(
            f"/api/v1/team/members/{orphan_id}/role",
            json={"role": "team"},
        )
        assert res.status_code == 200
        lead = asyncio.run(_fetch_lead(lead_id))
        assert lead is not None
        assert lead.assigned_to_user_id == orphan_id, (
            "Lead should remain with orphan when no upline leader exists"
        )
    finally:
        asyncio.run(cleanup_orphan())
