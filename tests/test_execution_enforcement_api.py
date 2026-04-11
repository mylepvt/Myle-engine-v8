"""Smoke tests for execution enforcement routes (vl2 service port)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_team_funnel_requires_team_role(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    assert c.get("/api/v1/execution/personal-funnel").status_code == 403


def test_team_funnel_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/execution/personal-funnel")
    assert r.status_code == 200
    body = r.json()
    assert "claimed" in body
    assert body["claimed"] == 0


def test_leader_downline_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.get("/api/v1/execution/downline-stats")
    assert r.status_code == 200
    data = r.json()
    assert "stats" in data
    assert "bottleneck_tags" in data


def test_admin_surfaces(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "admin"}).status_code == 200
    assert c.get("/api/v1/execution/at-risk-leads").status_code == 200
    assert c.get("/api/v1/execution/weak-members").status_code == 200
    assert c.get("/api/v1/execution/leak-map").status_code == 200
    stale = c.post("/api/v1/execution/stale-redistribute")
    assert stale.status_code == 200
    assert stale.json()["implemented"] is False


def test_team_cannot_admin_leak_map(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    assert c.get("/api/v1/execution/leak-map").status_code == 403
