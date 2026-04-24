"""In-process WebSocket fan-out (single Render instance). Broadcast JSON to all connected clients."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.services.team_tracking import (
    disconnect_presence_session,
    sweep_stale_presence,
    touch_presence_session,
)

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
        await self.broadcast_message(
            {
                "v": _WS_PAYLOAD_VERSION,
                "type": "invalidate",
                "topics": topics,
            }
        )

    async def broadcast_message(self, message: dict[str, Any]) -> None:
        payload = json.dumps(message)
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


def _parse_ws_message(raw: str) -> dict[str, Any] | None:
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001 - tolerate older/plaintext clients
        return None
    return data if isinstance(data, dict) else None


def _presence_message(
    *,
    user_id: int,
    status: str,
    ts: datetime | None = None,
) -> dict[str, Any]:
    seen_at = ts or datetime.now(timezone.utc)
    return {
        "v": _WS_PAYLOAD_VERSION,
        "type": "team_tracking.presence",
        "user_id": user_id,
        "presence_status": status,
        "last_seen_at": seen_at.isoformat(),
    }


async def ws_listen_loop(
    websocket: WebSocket,
    user_id: int,
    *,
    session_factory: async_sessionmaker[AsyncSession],
    session_key: str,
) -> None:
    """Hold connection until client disconnects; accept lightweight presence heartbeats."""
    try:
        while True:
            raw = await websocket.receive_text()
            data = _parse_ws_message(raw)
            action = str((data or {}).get("action") or "").strip().lower()
            last_path = None
            if isinstance((data or {}).get("path"), str):
                last_path = str(data["path"]).strip() or None
            changed = False
            async with session_factory() as session:
                if action in {"ping", "resume"}:
                    changed = await touch_presence_session(
                        session,
                        user_id=user_id,
                        session_key=session_key,
                        status="online",
                        last_path=last_path,
                    )
                elif action == "idle":
                    changed = await touch_presence_session(
                        session,
                        user_id=user_id,
                        session_key=session_key,
                        status="idle",
                        last_path=last_path,
                    )
                swept = await sweep_stale_presence(session)
            if changed or swept:
                await hub.broadcast_topics(["team_tracking", "team_tracking.presence"])
            if changed and action in {"ping", "resume", "idle"}:
                await hub.broadcast_message(
                    _presence_message(
                        user_id=user_id,
                        status="idle" if action == "idle" else "online",
                    )
                )
    except WebSocketDisconnect:
        pass
    finally:
        async with session_factory() as session:
            changed = await disconnect_presence_session(
                session,
                user_id=user_id,
                session_key=session_key,
            )
        hub.unregister(websocket, user_id)
        if changed:
            await hub.broadcast_topics(["team_tracking", "team_tracking.presence"])
            await hub.broadcast_message(
                _presence_message(
                    user_id=user_id,
                    status="offline",
                )
            )
