"""Daily reports API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings


def _team(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    return c


def test_reports_daily_mine_missing_returns_null(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _team(monkeypatch)
    r = c.get("/api/v1/reports/daily/mine?report_date=2030-01-01")
    assert r.status_code == 200
    assert r.json() is None


def test_reports_daily_mine_requires_team_or_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c.get("/api/v1/reports/daily/mine?report_date=2030-01-01").status_code == 403
