"""HTTP tests for ``/api/v1/pipeline/*`` (router prefix + path alignment)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    patch_jwt_settings(monkeypatch, auth_dev_login_enabled=True)
    return TestClient(app)


def test_pipeline_view_requires_auth() -> None:
    assert client.get("/api/v1/pipeline/view").status_code == 401


def test_pipeline_metrics_requires_auth() -> None:
    assert client.get("/api/v1/pipeline/metrics").status_code == 401


def test_pipeline_view_team_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/pipeline/view")
    assert r.status_code == 200
    body = r.json()
    assert "columns" in body
    assert "leads_by_status" in body
    assert "total_leads" in body
    assert "user_role" in body
    assert body["user_role"] == "team"


def test_pipeline_metrics_team_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/pipeline/metrics?days=30")
    assert r.status_code == 200
    body = r.json()
    assert "period" in body
    assert "total_leads" in body


def test_pipeline_statuses_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "team"}).status_code == 200
    r = c.get("/api/v1/pipeline/statuses")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_pipeline_not_double_prefixed() -> None:
    """Regression: must not be ``/api/v1/pipeline/pipeline/view``."""
    assert client.get("/api/v1/pipeline/pipeline/view").status_code == 404
