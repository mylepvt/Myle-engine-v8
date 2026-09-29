"""Calling Board Today/Retarget tabs, no timer auto-archive for team stages, pool claim gate."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.execution_enforcement import auto_archive_general_pipeline_leads

MEMBER_ID = 7301


def _now() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        s.add(User(id=MEMBER_ID, fbo_id="F07301", email="m7301@t.myle", role="team", name="Cover Member"))
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: AuthUser(
        user_id=MEMBER_ID, role="team", email="m7301@t.myle"
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, Session
    app.dependency_overrides = saved
    await engine.dispose()


async def _claimed_lead(Session, *, name: str, status: str, claimed_days_ago: int) -> int:
    claimed_at = _now() - timedelta(days=claimed_days_ago)
    async with Session() as s:
        lead = Lead(
            name=name,
            phone=f"98{abs(hash(name)) % 10**8:08d}",
            status=status,
            created_by_user_id=MEMBER_ID,
            owner_user_id=MEMBER_ID,
            assigned_to_user_id=MEMBER_ID,
            in_pool=False,
            last_action_at=claimed_at,
            outcome="active",
        )
        s.add(lead)
        await s.flush()
        s.add(
            ActivityLog(
                user_id=MEMBER_ID, action="lead.claimed", entity_type="lead",
                entity_id=lead.id, created_at=claimed_at,
            )
        )
        await s.commit()
        return lead.id


async def _pool_lead(Session) -> None:
    async with Session() as s:
        s.add(Lead(name="Pool Lead", status="new_lead", created_by_user_id=MEMBER_ID,
                   in_pool=True, pool_type="paid", pool_price_cents=0, outcome="active"))
        await s.commit()


async def _ids(client: AsyncClient, ctcs_filter: str) -> set[int]:
    r = await client.get("/api/v1/leads", params={"ctcs_filter": ctcs_filter, "limit": 100})
    assert r.status_code == 200, r.text
    return {row["id"] for row in r.json()["items"]}


async def test_uncovered_lead_from_yesterday_blocks_claim(ctx):
    client, Session = ctx
    lead_id = await _claimed_lead(Session, name="Old Fresh", status="new_lead", claimed_days_ago=1)
    await _pool_lead(Session)

    gate = (await client.get("/api/v1/lead-pool/claim-gate")).json()
    assert gate["blocked"] is True
    assert [row["id"] for row in gate["uncovered_leads"]] == [lead_id]
    assert "Claim blocked" in gate["message"]

    r = await client.post("/api/v1/lead-pool/claim", json={"count": 1})
    assert r.status_code == 409, r.text

    # Covering it (any status update past New Lead) unblocks claiming.
    async with Session() as s:
        lead = await s.get(Lead, lead_id)
        lead.status = "contacted"
        await s.commit()
    gate = (await client.get("/api/v1/lead-pool/claim-gate")).json()
    assert gate == {"blocked": False, "message": None, "uncovered_leads": []}
    r = await client.post("/api/v1/lead-pool/claim", json={"count": 1})
    assert r.status_code == 200, r.text


async def test_leads_claimed_today_do_not_block(ctx):
    client, Session = ctx
    await _claimed_lead(Session, name="Today Fresh", status="new_lead", claimed_days_ago=0)
    gate = (await client.get("/api/v1/lead-pool/claim-gate")).json()
    assert gate["blocked"] is False


async def test_today_tab_keeps_claimed_leads_and_retarget_tab_takes_retarget(ctx):
    client, Session = ctx
    old_working = await _claimed_lead(Session, name="Three Days", status="contacted", claimed_days_ago=3)
    fresh = await _claimed_lead(Session, name="Fresh", status="new_lead", claimed_days_ago=0)
    retarget = await _claimed_lead(Session, name="Later", status="retarget", claimed_days_ago=2)

    today = await _ids(client, "today")
    assert {old_working, fresh} <= today
    assert retarget not in today

    assert await _ids(client, "retarget") == {retarget}


async def test_team_stages_are_not_auto_archived_on_timer(ctx):
    _client, Session = ctx
    kept = await _claimed_lead(Session, name="Idle Fresh", status="new_lead", claimed_days_ago=5)
    kept2 = await _claimed_lead(Session, name="Idle Invited", status="invited", claimed_days_ago=5)
    async with Session() as s:
        await auto_archive_general_pipeline_leads(s, now=_now())
    async with Session() as s:
        assert (await s.get(Lead, kept)).archived_at is None
        assert (await s.get(Lead, kept2)).archived_at is None
