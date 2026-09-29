"""Admin sees unused wallet budget of removed / blocked members."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry

ADMIN, LEADER, REMOVED, BLOCKED, ACTIVE, ZERO = 7600, 7601, 7602, 7603, 7604, 7605
URL = "/api/v1/finance/budget-export/exited-members"


@pytest.fixture
async def ctx():
    from main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with Session() as s:
        s.add_all([
            User(id=ADMIN, fbo_id="F07600", email="a@t.myle", role="admin", name="Admin"),
            User(id=LEADER, fbo_id="F07601", email="l@t.myle", role="leader", name="Leena"),
            User(id=REMOVED, fbo_id="F07602", email="r@t.myle", role="team", name="Rahul",
                 upline_user_id=LEADER, removed_at=now - timedelta(days=2), removed_by_user_id=ADMIN,
                 removal_reason="No calls for 7 days", access_blocked=True, discipline_status="removed"),
            User(id=BLOCKED, fbo_id="F07603", email="b@t.myle", role="team", name="Bina",
                 upline_user_id=LEADER, access_blocked=True),
            User(id=ACTIVE, fbo_id="F07604", email="x@t.myle", role="team", name="Active", upline_user_id=LEADER),
            User(id=ZERO, fbo_id="F07605", email="z@t.myle", role="team", name="Zero",
                 removed_at=now, access_blocked=True),
        ])
        ledger = [
            (REMOVED, 119600), (REMOVED, -30000),   # 896 left
            (BLOCKED, 50000), (BLOCKED, -70000),    # -200 (overspent)
            (ACTIVE, 99900),                        # active — not listed
            (ZERO, 20000), (ZERO, -20000),          # 0 — not listed
        ]
        s.add_all([WalletLedgerEntry(user_id=u, amount_cents=a, note="t") for u, a in ledger])
        await s.commit()

    async def _get_db():
        async with Session() as s:
            yield s

    who = {"user": AuthUser(user_id=ADMIN, role="admin", email="a@t.myle")}
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[require_auth_user] = lambda: who["user"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, who
    app.dependency_overrides = saved
    await engine.dispose()


async def test_admin_sees_unused_budget_of_exited_members(ctx):
    client, _who = ctx
    r = await client.get(URL)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [row["user_id"] for row in body["items"]] == [REMOVED, BLOCKED]
    assert body["total_unused_cents"] == 89600
    assert body["total_negative_cents"] == -20000

    removed = body["items"][0]
    assert removed["exit_status"] == "removed"
    assert removed["balance_cents"] == 89600
    assert removed["total_credited_cents"] == 119600
    assert removed["total_debited_cents"] == 30000
    assert removed["upline_name"] == "Leena"
    assert removed["removed_by_name"] == "Admin"
    assert removed["removal_reason"] == "No calls for 7 days"
    assert body["items"][1]["exit_status"] == "blocked"


async def test_non_admin_forbidden(ctx):
    client, who = ctx
    who["user"] = AuthUser(user_id=LEADER, role="leader", email="l@t.myle")
    assert (await client.get(URL)).status_code == 403
