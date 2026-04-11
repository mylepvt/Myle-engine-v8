"""Smoke tests for execution / other / settings stub routers."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings


def _admin(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    return c


def test_execution_at_risk_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    r = c.get("/api/v1/execution/at-risk-leads")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_settings_app_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    assert c.get("/api/v1/settings/app").status_code == 200


def test_other_leaderboard_any_role(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/other/leaderboard").status_code == 200


def test_team_reports_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _admin(monkeypatch)
    assert c.get("/api/v1/team/reports").status_code == 200
