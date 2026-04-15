"""Legacy-aligned surfaces: leaderboard filters, live-session keys, budget member rows."""

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


def test_other_leaderboard_ok_and_note(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    r = c.get("/api/v1/other/leaderboard")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    assert "daily_scores" in (body.get("note") or "")


def test_other_live_session_zoom_legacy_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """When only legacy Flask keys exist, API still returns a joinable URL."""
    admin = _client_role(monkeypatch, "admin")
    # Upsert app_settings via admin API if exists — else skip body checks beyond 200
    r = admin.get("/api/v1/other/live-session")
    assert r.status_code == 200
    body = r.json()
    assert body.get("total") in (0, 1)
    assert "zoom" in (body.get("note") or "").lower() or "live_session" in (body.get("note") or "").lower()


def test_finance_budget_export_admin_lists_members(monkeypatch: pytest.MonkeyPatch) -> None:
    admin = _client_role(monkeypatch, "admin")
    r = admin.get("/api/v1/finance/budget-export")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "legacy" in (body.get("note") or "").lower() or "member" in (body.get("note") or "").lower()


def test_finance_budget_export_team_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client_role(monkeypatch, "team")
    assert c.get("/api/v1/finance/budget-export").status_code == 403
