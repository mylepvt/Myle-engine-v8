from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api.v1 import notifications as notifications_api
from app.models.push_subscription import PushSubscription
from conftest import get_test_session_factory
from main import app
from util_jwt_patch import patch_jwt_settings


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _count_subscriptions_for_user(user_id: int) -> int:
    async def _run() -> int:
        async with get_test_session_factory()() as session:
            return int(
                (
                    await session.execute(
                        select(func.count(PushSubscription.id)).where(
                            PushSubscription.user_id == user_id
                        )
                    )
                ).scalar_one()
            )

    return asyncio.run(_run())


def test_vapid_key_returns_compat_fields(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_vapid_public_key(_session: object) -> str:
        return "AQID"

    monkeypatch.setattr(notifications_api, "get_vapid_public_key", fake_get_vapid_public_key)

    res = client.get("/api/v1/notifications/vapid-key")
    assert res.status_code == 200
    assert res.json() == {
        "public_key": "AQID",
        "publicKey": "AQID",
        "enabled": True,
        "detail": None,
    }


def test_subscribe_status_and_clear_all(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)

    login = client.post("/api/v1/auth/dev-login", json={"role": "team"})
    assert login.status_code == 200

    first = client.post(
        "/api/v1/notifications/subscribe",
        json={
            "endpoint": "https://push.example/sub-1",
            "keys": {"p256dh": "p-key-1", "auth": "auth-1"},
        },
    )
    assert first.status_code == 201
    assert first.json()["ok"] is True

    second = client.post(
        "/api/v1/notifications/subscribe",
        json={
            "endpoint": "https://push.example/sub-2",
            "keys": {"p256dh": "p-key-2", "auth": "auth-2"},
        },
    )
    assert second.status_code == 201

    status = client.get("/api/v1/notifications/status")
    assert status.status_code == 200
    assert status.json() == {"subscribed": True}
    assert _count_subscriptions_for_user(3) == 2

    clear = client.request(
        "DELETE",
        "/api/v1/notifications/unsubscribe",
        json={"clear_all": True},
    )
    assert clear.status_code == 200
    assert clear.json() == {"ok": True, "deleted": 2}
    assert _count_subscriptions_for_user(3) == 0
