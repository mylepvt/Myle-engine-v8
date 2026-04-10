"""Authenticated WebSocket: push ``invalidate`` topics; clients refetch via React Query."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

from app.api.deps import optional_auth_user_from_token
from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.realtime_hub import hub, ws_listen_loop

router = APIRouter()


@router.websocket("/ws")
async def realtime_socket(websocket: WebSocket) -> None:
    """Same cookie JWT as REST. Push-only; server reads client messages to detect disconnect."""
    raw = websocket.cookies.get(MYLE_ACCESS_COOKIE)
    user = optional_auth_user_from_token(raw)
    if user is None:
        await websocket.close(code=1008)
        return
    await hub.register(websocket, user.user_id)
    await ws_listen_loop(websocket, user.user_id)
