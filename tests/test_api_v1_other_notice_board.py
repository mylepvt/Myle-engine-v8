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


def test_notice_board_react_toggle(monkeypatch: pytest.MonkeyPatch) -> None:
    admin = _client_role(monkeypatch, "admin")
    r = admin.post("/api/v1/other/notice-board", json={"message": "React test", "pin": False})
    assert r.status_code == 201
    aid = r.json()["id"]

    team = _client_role(monkeypatch, "team")
    r1 = team.post(f"/api/v1/other/notice-board/{aid}/react", json={"emoji": "👍"})
    assert r1.status_code == 200
    body = r1.json()
    thumbs = [rr for rr in body["reactions"] if rr["emoji"] == "👍"]
    assert len(thumbs) == 1
    assert thumbs[0]["count"] == 1
    assert thumbs[0]["reacted_by_me"] is True

    r2 = team.post(f"/api/v1/other/notice-board/{aid}/react", json={"emoji": "👍"})
    assert r2.status_code == 200
    body2 = r2.json()
    thumbs2 = [rr for rr in body2["reactions"] if rr["emoji"] == "👍"]
    assert len(thumbs2) == 1
    assert thumbs2[0]["count"] == 0
    assert thumbs2[0]["reacted_by_me"] is False

    admin2 = _client_role(monkeypatch, "admin")
    r3 = admin2.post(f"/api/v1/other/notice-board/{aid}/react", json={"emoji": "👍"})
    assert r3.status_code == 200
    body3 = r3.json()
    thumbs3 = [rr for rr in body3["reactions"] if rr["emoji"] == "👍"]
    assert len(thumbs3) == 1
    assert thumbs3[0]["count"] == 1
    assert thumbs3[0]["reacted_by_me"] is True


def test_notice_board_react_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    r = c.post("/api/v1/other/notice-board/999999/react", json={"emoji": "❤️"})
    assert r.status_code == 404
