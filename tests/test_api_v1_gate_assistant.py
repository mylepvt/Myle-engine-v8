from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _authed(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    import app.api.deps as deps_mod
    import app.api.v1.auth as auth_mod
    from app.core.config import settings

    patched = settings.model_copy(
        update={
            "auth_dev_login_enabled": True,
            "secret_key": "unit-test-jwt-secret-at-least-32-chars!!",
        },
    )
    monkeypatch.setattr(auth_mod, "settings", patched)
    monkeypatch.setattr(deps_mod, "settings", patched)
    return TestClient(app)


def test_gate_assistant_requires_auth() -> None:
    assert client.get("/api/v1/gate-assistant").status_code == 401


def test_gate_assistant_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _authed(monkeypatch)
    assert c.post("/api/v1/auth/dev-login", json={"role": "leader"}).status_code == 200
    r = c.get("/api/v1/gate-assistant")
    assert r.status_code == 200
    body = r.json()
    assert body["risk_level"] in ("green", "yellow", "red")
    assert body["progress_total"] >= 1
    assert isinstance(body["checklist"], list)
    assert "next_action" in body
    assert body["open_follow_ups"] >= 0
