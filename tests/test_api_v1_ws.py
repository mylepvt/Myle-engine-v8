"""WebSocket /api/v1/ws — cookie JWT auth."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.core.passwords import DEV_LOGIN_PASSWORD_PLAIN
from app.core.realtime_hub import hub
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_hub() -> None:
    hub.clear_for_tests()
    yield
    hub.clear_for_tests()


def test_ws_rejects_without_cookie() -> None:
    with pytest.raises(Exception):  # noqa: PT011 — starlette closes the socket
        with client.websocket_connect("/api/v1/ws"):
            pass


def test_ws_accepts_cookie_and_receives_broadcast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.api.deps as deps_mod
    import app.api.v1.auth as auth_mod
    from app.core.config import settings

    patched = settings.model_copy(
        update={"secret_key": "unit-test-jwt-secret-at-least-32-chars!!"},
    )
    monkeypatch.setattr(auth_mod, "settings", patched)
    monkeypatch.setattr(deps_mod, "settings", patched)

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "dev-leader@myle.local", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert login.status_code == 200
    cookie = login.cookies.get("myle_access")
    assert cookie

    with client.websocket_connect("/api/v1/ws", cookies={"myle_access": cookie}) as ws:
        import asyncio

        from app.core.realtime_hub import notify_topics

        asyncio.run(notify_topics("leads"))

        data = ws.receive_text()
        msg = json.loads(data)
        assert msg["type"] == "invalidate"
        assert "leads" in msg["topics"]
