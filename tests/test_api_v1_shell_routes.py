"""Smoke tests for execution / other / settings stub routers."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.models.invoice import Invoice
from main import app

from conftest import get_test_session_factory
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from util_jwt_patch import patch_jwt_settings


def _admin(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    return c


async def _reset_wallet_tables() -> None:
    factory = get_test_session_factory()
    async with factory() as session:
        await session.execute(delete(Invoice))
        await session.execute(delete(WalletRecharge))
        await session.execute(delete(WalletLedgerEntry))
        await session.commit()


def test_execution_at_risk_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    r = c.get("/api/v1/execution/at-risk-leads")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_settings_app_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    assert c.get("/api/v1/settings/app").status_code == 200


def test_settings_enhanced_mounted_unauthenticated_is_401_not_404() -> None:
    """Regression: router must include settings_enhanced — missing mount was 404 for all FE calls."""
    c = TestClient(app)
    r = c.get("/api/v1/settings-enhanced/profile")
    assert r.status_code == 401


def test_other_leaderboard_any_role(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/other/leaderboard").status_code == 200


def test_team_reports_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    r = c.get("/api/v1/team/reports")
    assert r.status_code == 200
    b = r.json()
    assert "live_summary" in b
    assert b["live_summary"]["day1_total"] == 0


def test_execution_lead_ledger_stub_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    r = c.get("/api/v1/execution/lead-ledger")
    assert r.status_code == 200
    b = r.json()
    assert "items" in b and "total" in b and "note" in b


def test_other_training_matches_system_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/other/training")
    assert r.status_code == 200
    b = r.json()
    assert "videos" in b and "progress" in b


def test_finance_recharges_stub_uses_member_display_name(monkeypatch: pytest.MonkeyPatch) -> None:
    factory = get_test_session_factory()
    asyncio.run(_reset_wallet_tables())

    async def seed_name() -> None:
        async with factory() as session:
            team = await session.get(User, 3)
            assert team is not None
            team.name = "Claim Owner"
            await session.commit()

    try:
        asyncio.run(seed_name())

        c = _admin(monkeypatch)
        seeded = c.post(
            "/api/v1/wallet/adjustments",
            json={
                "user_id": 3,
                "amount_cents": 5000,
                "idempotency_key": "finance-stub-name-001",
                "note": "pool_claim",
            },
        )
        assert seeded.status_code == 201

        r = c.get("/api/v1/finance/recharges")
        assert r.status_code == 200
        body = r.json()
        assert body["items"]
        assert "Claim Owner" in body["items"][0]["title"]
        assert "User #3" not in body["items"][0]["title"]
    finally:
        asyncio.run(_reset_wallet_tables())
