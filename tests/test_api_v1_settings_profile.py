"""Self-service profile edits: name / username / phone / photo save and persist."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.models.user import User
from main import app

from conftest import get_test_session_factory

from util_jwt_patch import patch_jwt_settings

_PROFILE = "/api/v1/settings-enhanced/profile"


def _team_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    return c


def _restore(c: TestClient) -> None:
    c.patch(_PROFILE, json={"name": "", "username": "", "phone": ""})


def test_member_without_phone_or_username_can_save_name(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _team_client(monkeypatch)
    try:
        # Exactly what the Settings page sends when phone/username are empty.
        res = c.patch(_PROFILE, json={"username": "", "phone": "", "name": "  Ravi Kumar "})
        assert res.status_code == 200, res.text

        body = c.get(_PROFILE).json()
        assert body["name"] == "Ravi Kumar"
        assert body["username"] is None
        assert body["phone"] is None
        assert c.get("/api/v1/auth/me").json()["display_name"] == "Ravi Kumar"
    finally:
        _restore(c)


def test_member_can_save_username_and_phone(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _team_client(monkeypatch)
    try:
        res = c.patch(_PROFILE, json={"username": "ravi_k", "phone": "+91 98765 43210", "name": "Ravi"})
        assert res.status_code == 200, res.text
        body = c.get(_PROFILE).json()
        assert body["username"] == "ravi_k"
        assert body["phone"] == "+91 98765 43210"
    finally:
        _restore(c)


def test_profile_validation_messages(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _team_client(monkeypatch)
    try:
        res = c.patch(_PROFILE, json={"phone": "12345"})
        assert res.status_code == 400
        assert "phone" in res.text.lower()

        res = c.patch(_PROFILE, json={"username": "ab"})
        assert res.status_code == 400
        assert "3 characters" in res.text

        # Leader fixture owns "TestLeaderDisplay" — uniqueness is case-insensitive.
        res = c.patch(_PROFILE, json={"username": "testleaderdisplay"})
        assert res.status_code == 400
        assert "already taken" in res.text
    finally:
        _restore(c)


def test_member_cannot_change_admin_only_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _team_client(monkeypatch)
    before = c.get(_PROFILE).json()
    res = c.patch(
        _PROFILE,
        json={"access_blocked": True, "registration_status": "pending", "upline_user_id": 1},
    )
    assert res.status_code == 400
    after = c.get(_PROFILE).json()
    for key in ("access_blocked", "registration_status", "upline_user_id"):
        assert after[key] == before[key]


def test_member_can_upload_avatar(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _team_client(monkeypatch)
    data_url = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=="
    try:
        res = c.post(f"{_PROFILE}/avatar", json={"data_url": data_url})
        assert res.status_code == 200, res.text
        assert c.get(_PROFILE).json()["avatar_url"] == data_url
        assert c.get("/api/v1/auth/me").json()["avatar_url"] == data_url

        res = c.post(f"{_PROFILE}/avatar", json={"data_url": "not-an-image"})
        assert res.status_code == 400
    finally:
        user_id = c.get("/api/v1/auth/me").json()["user_id"]

        async def _clear_avatar() -> None:
            async with get_test_session_factory()() as s:
                u = await s.get(User, user_id)
                u.avatar_url = None
                await s.commit()

        asyncio.run(_clear_avatar())
