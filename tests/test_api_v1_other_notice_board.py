"""Notice board (announcements) API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings


def _client_role(monkeypatch: pytest.MonkeyPatch, role: str) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": role}).status_code == 200
    return c


def test_notice_board_list_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    r = c.get("/api/v1/other/notice-board")
    assert r.status_code == 200
    b = r.json()
    assert b["items"] == []
    assert b["total"] == 0


def test_notice_board_admin_create_list_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    admin = _client_role(monkeypatch, "admin")
    r = admin.post(
        "/api/v1/other/notice-board",
        json={"message": "Hello team", "pin": True},
    )
    assert r.status_code == 201
    row = r.json()
    assert row["message"] == "Hello team"
    assert row["pin"] is True
    aid = row["id"]

    lst = admin.get("/api/v1/other/notice-board")
    assert lst.status_code == 200
    body = lst.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1

    assert admin.delete(f"/api/v1/other/notice-board/{aid}").status_code == 204
    empty = admin.get("/api/v1/other/notice-board").json()
    assert empty["total"] == 0


def test_notice_board_team_cannot_post(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    r = c.post("/api/v1/other/notice-board", json={"message": "x", "pin": False})
    assert r.status_code == 403
