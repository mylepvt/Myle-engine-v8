"""WebSocket /api/v1/ws — cookie JWT auth."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.core.passwords import DEV_LOGIN_PASSWORD_PLAIN
from app.core.realtime_hub import hub
from main import app

from util_jwt_patch import patch_jwt_settings

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
    patch_jwt_settings(monkeypatch)

    login = client.post(
        "/api/v1/auth/login",
        json={"fbo_id": "fbo-leader-001", "password": DEV_LOGIN_PASSWORD_PLAIN},
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
