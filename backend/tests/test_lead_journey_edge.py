"""End-to-end EDGE test of a single lead's full journey.

Walks one lead through the real API as TEAM then LEADER, checking every step:

  CREATE (team)
    new_lead → contacted → invited → video_sent (Enrollment Live) → video_watched
  CLOSING (leader, post-handoff)
    day1 → day2 → day3 → converted

Plus the edges around each boundary:
  - team CANNOT set day1/day2/day3/converted (forbidden statuses)
  - team forward scope ends at video_watched
  - leader CAN push post-handoff day stages and close
  - lost / retarget terminal moves

Hierarchy: leader 202 (no upline) → team 201 (upline 202).
Matches conftest fixtures: team_client=201, leader_client=202, admin_client=203.
"""
from __future__ import annotations

import pytest
from contextlib import asynccontextmanager

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead import Lead
from app.models.user import User


@asynccontextmanager
async def _as_role(engine, role: str, user_id: int):
    """Yield a client authenticated as the given role, bound to the test engine.

    team_client and leader_client share one FastAPI app and clobber each other's
    auth override, so a single test that needs two roles must switch in-place.
    """
    from main import app

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)

    async def _get_db():
        async with factory() as session:
            yield session

    async def _fake_auth():
        return AuthUser(
            user_id=user_id,
            role=role,
            email=f"{role}{user_id}@test.myle",
            fbo_id=f"T{user_id:05d}",
            username=f"{role}_{user_id}",
        )

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = _fake_auth
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


# ── Seed helpers ──────────────────────────────────────────────────────────────

async def _seed_user(
    session: AsyncSession,
    user_id: int,
    role: str,
    upline_user_id: int | None = None,
) -> User:
    existing = await session.get(User, user_id)
    if existing:
        existing.upline_user_id = upline_user_id
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
    )
    session.add(u)
    await session.flush()
    return u


async def _seed_hierarchy(engine) -> None:
    """leader 202 (root) → team 201 (downline)."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 202, "leader", upline_user_id=None)
        await _seed_user(session, 201, "team", upline_user_id=202)
        await session.commit()


async def _create_lead(team_client: AsyncClient, phone: str) -> int:
    resp = await team_client.post(
        "/api/v1/leads",
        json={"name": "Journey Lead", "status": "new_lead", "phone": phone},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "new_lead"
    return body["id"]


async def _patch_status(client: AsyncClient, lead_id: int, status: str):
    return await client.patch(f"/api/v1/leads/{lead_id}", json={"status": status})


async def _get_lead_row(engine, lead_id: int) -> Lead:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        lead = await session.get(Lead, lead_id)
        assert lead is not None
        return lead


# ── 1. TEAM forward walk: new_lead → video_watched ────────────────────────────

@pytest.mark.asyncio
async def test_team_walks_lead_to_video_watched(team_client: AsyncClient, engine):
    await _seed_hierarchy(engine)
    lead_id = await _create_lead(team_client, "9000000001")

    for target in ("contacted", "invited", "video_sent", "video_watched"):
        resp = await _patch_status(team_client, lead_id, target)
        assert resp.status_code == 200, f"team {target} should be allowed: {resp.text}"
        assert resp.json()["status"] == target

    lead = await _get_lead_row(engine, lead_id)
    assert lead.owner_user_id == 201               # owner stays the team claimer (sticky)
    assert lead.assigned_to_user_id == 202         # video_watched hands off to the upline leader
    assert lead.is_reassigned is True


# ── 2. TEAM edge: forbidden forward jumps to closing stages ───────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("forbidden", ["day1", "day2", "day3", "converted"])
async def test_team_cannot_jump_to_closing_stages(team_client: AsyncClient, engine, forbidden):
    await _seed_hierarchy(engine)
    lead_id = await _create_lead(team_client, f"90000100{['day1','day2','day3','converted'].index(forbidden)}")
    # advance to video_watched (last team-allowed pre-handover stage)
    for target in ("contacted", "invited", "video_sent", "video_watched"):
        assert (await _patch_status(team_client, lead_id, target)).status_code == 200

    # After video_watched the lead is handed off to the leader, so the team can no longer
    # push it forward — blocked either by the role gate (400) or loss of access (403).
    resp = await _patch_status(team_client, lead_id, forbidden)
    assert resp.status_code in (400, 403), f"team must NOT set {forbidden}: {resp.text}"


# ── 3. CLOSING walk: leader day1→day2, admin day2→day3, leader day3→converted ──

@pytest.mark.asyncio
async def test_closing_walk_per_day_roles(engine):
    await _seed_hierarchy(engine)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 203, "admin", upline_user_id=None)
        await session.commit()

    # TEAM drives create + walk up to the team boundary (video_watched).
    async with _as_role(engine, "team", 201) as team:
        lead_id = await _create_lead(team, "9000000005")
        for target in ("contacted", "invited", "video_sent", "video_watched"):
            assert (await _patch_status(team, lead_id, target)).status_code == 200

    # LEADER takes over: video_watched → day1 → day2 (but NOT day3).
    async with _as_role(engine, "leader", 202) as leader:
        for target in ("day1", "day2"):
            resp = await _patch_status(leader, lead_id, target)
            assert resp.status_code == 200, resp.text
            assert resp.json()["status"] == target
        # leader must NOT advance into Day 3 (admin-only)
        assert (await _patch_status(leader, lead_id, "day3")).status_code == 400

    # Day 2 → Day 3 is gated on BOTH all Day-2 batches done AND a PASSED business test.
    # Without them, even admin is blocked; satisfy both, then advance.
    async with _as_role(engine, "admin", 203) as admin:
        blocked = await _patch_status(admin, lead_id, "day3")
        assert blocked.status_code == 400, "day3 must be blocked until Day 2 batches + test pass"

    async with AsyncSession(engine, expire_on_commit=False) as session:
        lead_row = await session.get(Lead, lead_id)
        lead_row.d2_morning = True
        lead_row.d2_afternoon = True
        lead_row.d2_evening = True
        lead_row.day2_test_status = "passed"
        lead_row.day2_test_score = 27
        await session.commit()

    # ADMIN advances Day 2 → Day 3 (now that batches are done and the test is passed).
    async with _as_role(engine, "admin", 203) as admin:
        resp = await _patch_status(admin, lead_id, "day3")
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "day3"

    # LEADER closes Day 3 → converted.
    async with _as_role(engine, "leader", 202) as leader:
        resp = await _patch_status(leader, lead_id, "converted")
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "converted"

    lead = await _get_lead_row(engine, lead_id)
    assert lead.status == "converted"
    assert lead.owner_user_id == 201             # owner stays the team claimer (sticky)
    assert lead.day3_completed_at is not None    # closing side-effect stamps day3 completion


# ── 4. TEAM terminal moves: lost / retarget allowed from calling board ────────

@pytest.mark.asyncio
@pytest.mark.parametrize("terminal", ["lost", "retarget"])
async def test_team_can_mark_terminal(team_client: AsyncClient, engine, terminal):
    await _seed_hierarchy(engine)
    lead_id = await _create_lead(team_client, "900002" + ("01" if terminal == "lost" else "02"))
    for target in ("contacted", "invited", "video_sent"):
        assert (await _patch_status(team_client, lead_id, target)).status_code == 200

    resp = await _patch_status(team_client, lead_id, terminal)
    assert resp.status_code == 200, f"team should mark {terminal}: {resp.text}"
    assert resp.json()["status"] == terminal
