from fastapi.testclient import TestClient

import pytest

from app.core.passwords import DEV_LOGIN_PASSWORD_PLAIN
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def test_password_login_with_username_same_as_legacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy allowed login by exact username when FBO match failed."""
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "TestLeaderDisplay", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 200
    me = client.get("/api/v1/auth/me")
    assert me.json().get("fbo_id") == "fbo-leader-001"


def test_password_login_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["authenticated"] is True
    assert body["role"] == "leader"
    assert body.get("fbo_id") == "fbo-leader-001"


def test_password_login_wrong_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": "wrong"},
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_password_login_unknown_fbo_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    res = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-does-not-exist", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert res.status_code == 401
