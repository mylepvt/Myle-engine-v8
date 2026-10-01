"""WebSocket /api/v1/ws — cookie JWT auth."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.passwords import DEV_LOGIN_PASSWORD_PLAIN
from app.api.v1.realtime_ws import WS_CLOSE_AUTH_REQUIRED
from app.core.realtime_hub import hub
from main import app

from util_jwt_patch import patch_jwt_settings

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_hub() -> None:
    hub.clear_for_tests()
    yield
    hub.clear_for_tests()


def test_ws_rejects_without_cookie_with_auth_close_code() -> None:
    with client.websocket_connect("/api/v1/ws") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == WS_CLOSE_AUTH_REQUIRED


def test_ws_accepts_cookie_and_receives_broadcast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_jwt_settings(monkeypatch)

    login = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": DEV_LOGIN_PASSWORD_PLAIN},
    )
    assert login.status_code == 200
    assert login.cookies.get("myle_access")
    # Same TestClient session carries Set-Cookie from login (avoid per-request cookies= deprecation).
    with client.websocket_connect("/api/v1/ws") as ws:
        import asyncio

        from app.core.realtime_hub import notify_topics

        asyncio.run(notify_topics("leads"))

        data = ws.receive_text()
        msg = json.loads(data)
        assert msg["type"] == "invalidate"
        assert "leads" in msg["topics"]
