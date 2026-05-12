"""In-process WebSocket fan-out with optional Redis pub/sub for multi-instance deployments.

Single-instance (default): broadcasts via in-process dict.
Multi-instance (REDIS_URL set): also subscribes to Redis pub/sub so invalidation
messages traverse instances (e.g. behind a load balancer).
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.team_tracking import (
    disconnect_presence_session,
    sweep_stale_presence,
    touch_presence_session,
)

logger = logging.getLogger("myle.realtime")

_WS_PAYLOAD_VERSION = 1

_REDIS_SUB_TASK: asyncio.Task[Any] | None = None
_REDIS_CLIENT: Any = None


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
        await self._broadcast_local(
            {
                "v": _WS_PAYLOAD_VERSION,
                "type": "invalidate",
                "topics": topics,
            }
        )
        await _redis_publish(
            json.dumps(
                {
                    "v": _WS_PAYLOAD_VERSION,
                    "type": "invalidate",
                    "topics": topics,
                }
            )
        )

    async def _broadcast_local(self, message: dict[str, Any]) -> None:
        payload = json.dumps(message)
        for _uid, sockets in list(self._by_user.items()):
            for ws in list(sockets):
                await self._safe_send_text(ws, payload)

    async def broadcast_message(self, message: dict[str, Any]) -> None:
        payload = json.dumps(message)
        await self._broadcast_local(message)
        await _redis_publish(payload)

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


# ── Redis pub/sub for multi-instance deployments ────────────────────────────


async def _redis_publish(message: str) -> None:
    client = await _get_redis_client()
    if client is None:
        return
    try:
        await client.publish("myle:realtime", message)
    except Exception as exc:
        logger.debug("Redis publish skipped: %s", exc)


async def _get_redis_client() -> Any | None:
    global _REDIS_CLIENT
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    url = (settings.redis_url or "").strip()
    if not url:
        return None
    try:
        import redis.asyncio as aioredis

        _REDIS_CLIENT = aioredis.from_url(
            url, socket_connect_timeout=2, socket_timeout=2
        )
        await _REDIS_CLIENT.ping()
        logger.info("Realtime Redis pub/sub connected: %s", url)
    except Exception as exc:
        _REDIS_CLIENT = None
        logger.warning("Realtime Redis unavailable; single-instance mode: %s", exc)
    return _REDIS_CLIENT


async def _redis_listener() -> None:
    client = await _get_redis_client()
    if client is None:
        return
    try:
        pubsub = client.pubsub()
        await pubsub.subscribe("myle:realtime")
        logger.info("Realtime Redis listener started on myle:realtime")
        async for msg in pubsub.listen():
            if msg["type"] != "message":
                continue
            try:
                data = json.loads(msg["data"])
            except Exception:
                continue
            if isinstance(data, dict) and "type" in data:
                await hub._broadcast_local(data)
    except Exception as exc:
        logger.warning("Redis listener stopped: %s", exc)
    finally:
        try:
            await pubsub.unsubscribe("myle:realtime")
        except Exception:
            pass


async def start_redis_listener() -> None:
    global _REDIS_SUB_TASK
    url = (settings.redis_url or "").strip()
    if not url:
        return
    _REDIS_SUB_TASK = asyncio.create_task(_redis_listener())


async def stop_redis_listener() -> None:
    global _REDIS_SUB_TASK, _REDIS_CLIENT
    if _REDIS_SUB_TASK is not None:
        _REDIS_SUB_TASK.cancel()
        _REDIS_SUB_TASK = None
    if _REDIS_CLIENT is not None:
        try:
            await _REDIS_CLIENT.close()
        except Exception:
            pass
        _REDIS_CLIENT = None
