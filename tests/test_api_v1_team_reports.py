"""Team reports (admin metrics)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings


def _client(monkeypatch: pytest.MonkeyPatch, role: str) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    c = TestClient(app)
    assert c.post("/api/v1/auth/dev-login", json={"role": role}).status_code == 200
    return c


def test_team_reports_requires_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "leader")
    assert c.get("/api/v1/team/reports").status_code == 403


def test_team_reports_invalid_date(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "admin")
    r = c.get("/api/v1/team/reports?date=not-a-date")
    assert r.status_code == 422


def test_team_reports_admin_json_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch, "admin")
    r = c.get("/api/v1/team/reports?date=2026-01-15")
    assert r.status_code == 200
    b = r.json()
    assert b["date"] == "2026-01-15"
    assert b["timezone"] == "Asia/Kolkata"
    ls = b["live_summary"]
    for k in (
        "leads_claimed_today",
        "calls_made_today",
        "enrolled_today",
        "day1_total",
        "day2_total",
        "converted_total",
    ):
        assert k in ls
