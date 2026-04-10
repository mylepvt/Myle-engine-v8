"""In-process WebSocket fan-out (single Render instance). Broadcast JSON to all connected clients."""

from __future__ import annotations

import json
import logging
from starlette.websockets import WebSocket, WebSocketDisconnect

logger = logging.getLogger("myle.realtime")

_WS_PAYLOAD_VERSION = 1


class RealtimeHub:
    """user_id -> set of WebSocket connections (multiple tabs)."""

    def __init__(self) -> None:
        self._by_user: dict[int, set[WebSocket]] = {}

    def clear_for_tests(self) -> None:
        self._by_user.clear()

    async def register(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self._by_user.setdefault(user_id, set()).add(websocket)

    def unregister(self, websocket: WebSocket, user_id: int) -> None:
        if user_id not in self._by_user:
            return
        self._by_user[user_id].discard(websocket)
        if not self._by_user[user_id]:
            del self._by_user[user_id]

    async def broadcast_topics(self, topics: list[str]) -> None:
        if not topics:
            return
        payload = json.dumps(
            {
                "v": _WS_PAYLOAD_VERSION,
                "type": "invalidate",
                "topics": topics,
            }
        )
        for _uid, sockets in list(self._by_user.items()):
            for ws in list(sockets):
                await self._safe_send_text(ws, payload)

    async def _safe_send_text(self, websocket: WebSocket, text: str) -> None:
        try:
            await websocket.send_text(text)
        except Exception as e:  # noqa: BLE001 — disconnect races
            logger.debug("websocket send skipped: %s", e)


hub = RealtimeHub()


async def notify_topics(*topics: str) -> None:
    await hub.broadcast_topics(list(topics))


async def ws_listen_loop(websocket: WebSocket, user_id: int) -> None:
    """Hold connection until client disconnects (server is push-only)."""
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.unregister(websocket, user_id)
