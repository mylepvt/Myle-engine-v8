from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from main import app

from conftest import get_test_session_factory
from app.models.user import User
from util_jwt_patch import patch_jwt_settings


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_wallet_me_requires_auth() -> None:
    assert TestClient(app).get("/api/v1/wallet/me").status_code == 401


def test_wallet_me_zero_balance(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/wallet/me")
    assert r.status_code == 200
    body = r.json()
    assert body["balance_cents"] == 0
    assert body["recent_entries"] == []


def test_wallet_adjustment_admin_then_balance(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    p = c.post(
        "/api/v1/wallet/adjustments",
        json={
            "user_id": 3,
            "amount_cents": 5000,
            "idempotency_key": "test-recharge-001",
            "note": "Test credit",
        },
    )
    assert p.status_code == 201
    assert p.json()["amount_cents"] == 5000

    c2 = _authed(monkeypatch)
    assert c2.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    me = c2.get("/api/v1/wallet/me").json()
    assert me["balance_cents"] == 5000


def test_wallet_adjustment_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    body = {"user_id": 2, "amount_cents": 100, "idempotency_key": "idem-xyz-12345"}
    a = c.post("/api/v1/wallet/adjustments", json=body)
    b = c.post("/api/v1/wallet/adjustments", json=body)
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["id"] == b.json()["id"]


def test_wallet_adjustment_forbidden_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.post(
        "/api/v1/wallet/adjustments",
        json={"user_id": 3, "amount_cents": 1, "idempotency_key": "nope-12345"},
    )
    assert r.status_code == 403


def test_wallet_ledger_admin_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    c.post(
        "/api/v1/wallet/adjustments",
        json={"user_id": 3, "amount_cents": 50, "idempotency_key": "ledger-a-unique-key"},
    )
    r = c.get("/api/v1/wallet/ledger", params={"user_id": 3})
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_wallet_recharge_responses_include_display_names(monkeypatch: pytest.MonkeyPatch) -> None:
    factory = get_test_session_factory()

    async def seed_names() -> None:
        async with factory() as session:
            admin = await session.get(User, 1)
            team = await session.get(User, 3)
            assert admin is not None and team is not None
            admin.name = "Admin Reviewer"
            team.name = "Claim Owner"
            await session.commit()

    asyncio.run(seed_names())

    c_team = _authed(monkeypatch)
    assert c_team.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    created = c_team.post(
        "/api/v1/wallet/recharge-requests",
        json={
            "amount_cents": 19900,
            "utr_number": "UTR-CLAIM-001",
            "idempotency_key": "wallet-recharge-name-001",
        },
    )
    assert created.status_code == 201
    assert created.json()["member_name"] == "Claim Owner"
    assert created.json()["member_fbo_id"] == "fbo-team-001"

    c_admin = _authed(monkeypatch)
    assert c_admin.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200

    listed = c_admin.get("/api/v1/wallet/recharge-requests")
    assert listed.status_code == 200
    first = listed.json()["items"][0]
    assert first["member_name"] == "Claim Owner"
    assert first["member_fbo_id"] == "fbo-team-001"

    reviewed = c_admin.patch(
        f"/api/v1/wallet/recharge-requests/{first['id']}",
        json={"status": "approved"},
    )
    assert reviewed.status_code == 200
    body = reviewed.json()
    assert body["reviewed_by_user_id"] == 1
    assert body["reviewed_by_name"] == "Admin Reviewer"
