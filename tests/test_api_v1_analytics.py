from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_analytics_activity_log_requires_auth() -> None:
    assert client.get("/api/v1/analytics/activity-log").status_code == 401


def test_analytics_activity_log_admin_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    r = c.get("/api/v1/analytics/activity-log")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["note"]


def test_analytics_activity_log_forbidden_leader(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/analytics/activity-log").status_code == 403


def test_analytics_day_2_report_admin_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c.get("/api/v1/analytics/day-2-report").status_code == 200


def test_analytics_export_csv_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.post("/api/v1/analytics/export?format=csv&days=7")
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "analytics-7days.csv" in (r.headers.get("content-disposition") or "")
    assert b"Analytics Export" in r.content


def test_analytics_export_excel_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.post("/api/v1/analytics/export?format=excel&days=7")
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers.get("content-type", "")
    assert ".xlsx" in (r.headers.get("content-disposition") or "")
    assert r.content[:2] == b"PK"  # ZIP / OOXML
