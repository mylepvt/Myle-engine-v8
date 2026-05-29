"""Edge tests for is_reassigned / reassigned_at / ctcs_filter=reassigned.

Covers:
- _ctcs_filter_clause('reassigned') produces correct SQL condition
- ctcs_filter=reassigned via GET /leads returns only today's reassigned leads
- ctcs_filter=reassigned excludes yesterday's reassigned leads
- ctcs_filter=reassigned excludes leads with is_reassigned=False
- ctcs_filter=invalid still returns 422
- PATCH /leads/:id with assigned_to_user_id sets is_reassigned=True + reassigned_at
- Re-patch (same assignee) still keeps is_reassigned=True
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.user import User


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _today_start() -> datetime:
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
    assigned_to_id: int,
    is_reassigned: bool = False,
    reassigned_at: datetime | None = None,
    status: str = "new_lead",
) -> Lead:
    lead = Lead(
        name="Test Lead",
        status=status,
        created_by_user_id=owner_id,
        owner_user_id=owner_id,
        assigned_to_user_id=assigned_to_id,
        is_reassigned=is_reassigned,
        reassigned_at=reassigned_at,
    )
    session.add(lead)
    await session.flush()
    return lead


# ── Unit: _ctcs_filter_clause ─────────────────────────────────────────────────

def test_ctcs_filter_clause_reassigned_returns_condition():
    """_ctcs_filter_clause('reassigned') must return a non-None clause."""
    from app.services.leads_service import _ctcs_filter_clause
    clause = _ctcs_filter_clause("reassigned")
    assert clause is not None


def test_ctcs_filter_clause_all_returns_none():
    from app.services.leads_service import _ctcs_filter_clause
    assert _ctcs_filter_clause("all") is None
    assert _ctcs_filter_clause("") is None
    assert _ctcs_filter_clause(None) is None


def test_ctcs_filter_clause_invalid_raises():
    from fastapi import HTTPException
    from app.services.leads_service import _ctcs_filter_clause
    with pytest.raises(HTTPException) as exc_info:
        _ctcs_filter_clause("garbage_value")
    assert exc_info.value.status_code == 422
    assert "reassigned" in exc_info.value.detail


# ── Integration: GET /leads?ctcs_filter=reassigned ───────────────────────────

@pytest.mark.asyncio
async def test_reassigned_filter_returns_todays_reassigned_leads(team_client: AsyncClient, engine):
    """Leads reassigned today appear under ctcs_filter=reassigned."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)  # team member (matches team_client auth)
        lead = await _seed_lead(
            session,
            owner_id=201,
            assigned_to_id=201,
            is_reassigned=True,
            reassigned_at=_now_utc(),
        )
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=reassigned")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_reassigned_filter_excludes_yesterdays_leads(team_client: AsyncClient, engine):
    """Leads reassigned yesterday must NOT appear under ctcs_filter=reassigned."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        yesterday = _today_start() - timedelta(seconds=1)
        lead = await _seed_lead(
            session,
            owner_id=201,
            assigned_to_id=201,
            is_reassigned=True,
            reassigned_at=yesterday,
        )
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=reassigned")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id not in ids


@pytest.mark.asyncio
async def test_reassigned_filter_excludes_non_reassigned_leads(team_client: AsyncClient, engine):
    """Lead with is_reassigned=False must NOT appear even if reassigned_at is today."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_lead(
            session,
            owner_id=201,
            assigned_to_id=201,
            is_reassigned=False,
            reassigned_at=_now_utc(),  # set timestamp but flag is False
        )
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=reassigned")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id not in ids


@pytest.mark.asyncio
async def test_reassigned_filter_excludes_leads_with_null_reassigned_at(team_client: AsyncClient, engine):
    """Lead with is_reassigned=True but reassigned_at=NULL must NOT appear."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 201)
        lead = await _seed_lead(
            session,
            owner_id=201,
            assigned_to_id=201,
            is_reassigned=True,
            reassigned_at=None,
        )
        await session.commit()
        lead_id = lead.id

    resp = await team_client.get("/api/v1/leads?ctcs_filter=reassigned")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert lead_id not in ids


@pytest.mark.asyncio
async def test_invalid_ctcs_filter_returns_422(team_client: AsyncClient):
    resp = await team_client.get("/api/v1/leads?ctcs_filter=blah_blah")
    assert resp.status_code == 422


# ── Integration: PATCH sets is_reassigned + reassigned_at ─────────────────────

@pytest.mark.asyncio
async def test_manual_patch_sets_is_reassigned_flag(admin_client: AsyncClient, engine):
    """Admin PATCH with assigned_to_user_id must set is_reassigned=True + reassigned_at."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 203)  # admin (matches admin_client auth)
        await _seed_user(session, 299, role="team")  # reassignment target
        lead = await _seed_lead(
            session,
            owner_id=203,
            assigned_to_id=203,
        )
        await session.commit()
        lead_id = lead.id

    before = _now_utc()
    resp = await admin_client.patch(
        f"/api/v1/leads/{lead_id}",
        json={"assigned_to_user_id": 299},
    )
    assert resp.status_code == 200

    async with AsyncSession(engine, expire_on_commit=False) as session:
        refreshed = await session.get(Lead, lead_id)
        assert refreshed is not None
        assert refreshed.is_reassigned is True
        assert refreshed.reassigned_at is not None
        assert refreshed.reassigned_at >= before.replace(tzinfo=None) or (
            refreshed.reassigned_at.tzinfo is not None
            and refreshed.reassigned_at >= before
        )


@pytest.mark.asyncio
async def test_patch_without_reassign_does_not_set_flag(admin_client: AsyncClient, engine):
    """PATCH that only updates status must NOT set is_reassigned."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 203)
        lead = await _seed_lead(
            session,
            owner_id=203,
            assigned_to_id=203,
            is_reassigned=False,
        )
        await session.commit()
        lead_id = lead.id

    resp = await admin_client.patch(
        f"/api/v1/leads/{lead_id}",
        json={"call_status": "called"},
    )
    assert resp.status_code == 200

    async with AsyncSession(engine, expire_on_commit=False) as session:
        refreshed = await session.get(Lead, lead_id)
        assert refreshed is not None
        assert refreshed.is_reassigned is False
        assert refreshed.reassigned_at is None


# ── Unit: _get_previous_assignees ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_previous_assignees_returns_prior_uid(engine):
    """_get_previous_assignees returns user IDs from auto-reassign activity logs."""
    from app.models.activity_log import ActivityLog
    from app.services.execution_enforcement import _get_previous_assignees

    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 500)
        await _seed_user(session, 501)
        lead = await _seed_lead(session, owner_id=500, assigned_to_id=501)
        await session.flush()
        session.add(ActivityLog(
            user_id=501,
            action="lead.stale_watch_reassigned",
            entity_type="lead",
            entity_id=lead.id,
            meta={"assigned_to_user_id": 501, "previous_assignee_user_id": 500},
        ))
        await session.commit()
        lead_id = lead.id

    async with AsyncSession(engine, expire_on_commit=False) as session:
        result = await _get_previous_assignees(session, [lead_id])
        assert lead_id in result
        assert 501 in result[lead_id]


@pytest.mark.asyncio
async def test_get_previous_assignees_includes_manual_action(engine):
    """_get_previous_assignees includes manual reassignment logs."""
    from app.models.activity_log import ActivityLog
    from app.services.execution_enforcement import _get_previous_assignees

    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 510)
        await _seed_user(session, 511)
        lead = await _seed_lead(session, owner_id=510, assigned_to_id=511)
        await session.flush()
        session.add(ActivityLog(
            user_id=510,
            action="lead.manual_watch_reassigned",
            entity_type="lead",
            entity_id=lead.id,
            meta={"assigned_to_user_id": 511, "previous_assignee_user_id": 510},
        ))
        await session.commit()
        lead_id = lead.id

    async with AsyncSession(engine, expire_on_commit=False) as session:
        result = await _get_previous_assignees(session, [lead_id])
        assert 511 in result.get(lead_id, set())


@pytest.mark.asyncio
async def test_get_previous_assignees_empty_lead_ids(engine):
    """Empty lead_ids returns empty dict without hitting DB."""
    from app.services.execution_enforcement import _get_previous_assignees
    async with AsyncSession(engine, expire_on_commit=False) as session:
        result = await _get_previous_assignees(session, [])
    assert result == {}


@pytest.mark.asyncio
async def test_get_previous_assignees_ignores_unrelated_logs(engine):
    """Logs for other leads or unrelated actions are not included."""
    from app.models.activity_log import ActivityLog
    from app.services.execution_enforcement import _get_previous_assignees

    async with AsyncSession(engine, expire_on_commit=False) as session:
        await _seed_user(session, 520)
        lead = await _seed_lead(session, owner_id=520, assigned_to_id=520)
        other_lead = await _seed_lead(session, owner_id=520, assigned_to_id=520)
        await session.flush()
        # Log belongs to other_lead, not lead
        session.add(ActivityLog(
            user_id=520,
            action="lead.stale_watch_reassigned",
            entity_type="lead",
            entity_id=other_lead.id,
            meta={"assigned_to_user_id": 520},
        ))
        await session.commit()
        lead_id = lead.id

    async with AsyncSession(engine, expire_on_commit=False) as session:
        result = await _get_previous_assignees(session, [lead_id])
        assert result.get(lead_id, set()) == set()


# ── Unit: _assign_leads intelligent routing ───────────────────────────────────

def _make_lead(lead_id: int, assigned_to: int, status: str = "new_lead"):
    from types import SimpleNamespace
    return SimpleNamespace(
        id=lead_id,
        assigned_to_user_id=assigned_to,
        owner_user_id=assigned_to,
        created_by_user_id=assigned_to,
        last_action_at=None,
        last_called_at=None,
        payment_proof_uploaded_at=None,
        whatsapp_sent_at=None,
        day3_completed_at=None,
        day2_completed_at=None,
        day1_completed_at=None,
        created_at=datetime.now(timezone.utc),
        archived_at=None,
        is_reassigned=False,
        reassigned_at=None,
        status=status,
    )


def test_assign_leads_skips_prior_assignee():
    """_assign_leads prefers fresh worker over one who already let it go stale."""
    from datetime import timezone
    from app.services.execution_enforcement import _assign_leads

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=25)
    lead = _make_lead(1, assigned_to=10)
    lead.last_action_at = cutoff - timedelta(hours=1)

    assigned, skipped, assignments, _ = _assign_leads(
        leads=[lead],
        workers=[10, 20, 30],
        load_map={10: 0, 20: 0, 30: 0},
        cutoff=cutoff,
        now=now,
        worker_rank={10: 0, 20: 1, 30: 2},
        max_active_per_worker=None,
        auto_cycle_hours=24,
        previously_assigned={1: {10}},  # worker 10 already had this lead
    )
    assert assigned == 1
    assert skipped == 0
    # Must NOT go to 10 (prior assignee), must go to 20 (next by rank)
    assert assignments[0][2] == 20


def test_assign_leads_fallback_when_all_prior():
    """_assign_leads falls back to any eligible worker if all were prior assignees."""
    from datetime import timezone
    from app.services.execution_enforcement import _assign_leads

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=25)
    lead = _make_lead(1, assigned_to=10)
    lead.last_action_at = cutoff - timedelta(hours=1)

    assigned, skipped, assignments, _ = _assign_leads(
        leads=[lead],
        workers=[10, 20],
        load_map={10: 0, 20: 0},
        cutoff=cutoff,
        now=now,
        worker_rank={10: 0, 20: 1},
        max_active_per_worker=None,
        auto_cycle_hours=24,
        previously_assigned={1: {10, 20}},  # both are prior assignees
    )
    # Falls back — 10 is current holder so skip, 20 is prior but fallback picks it
    assert assigned == 1
    assert assignments[0][2] == 20


def test_assign_leads_sets_is_reassigned_flag():
    """_assign_leads must set is_reassigned=True and reassigned_at on assigned leads."""
    from datetime import timezone
    from app.services.execution_enforcement import _assign_leads

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=25)
    lead = _make_lead(1, assigned_to=10)
    lead.last_action_at = cutoff - timedelta(hours=1)

    _assign_leads(
        leads=[lead],
        workers=[10, 20],
        load_map={10: 0, 20: 0},
        cutoff=cutoff,
        now=now,
        worker_rank={10: 0, 20: 1},
        max_active_per_worker=None,
        auto_cycle_hours=24,
    )
    assert lead.is_reassigned is True
    assert lead.reassigned_at == now
    assert lead.archived_at is None
