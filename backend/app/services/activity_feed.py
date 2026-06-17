from __future__ import annotations

"""
Admin activity feed — ring buffer + SSE broadcasting.

Architecture:
─────────────
observation_logger.emit_observation()
    │
    ├─ stdout (logs)
    │
    └─ activity_feed.write_event()
        │
        ├─ Ring buffer (memory, last 1000)
        └─ SSE broadcast to connected admins
           │
           ├─ GET /api/v1/admin/activity-feed (initial load from DB)
           └─ GET /api/v1/admin/activity-stream (SSE, realtime push)
"""

import asyncio
import json
from collections import deque
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_activity_feed import AdminActivityFeed


def _get_event_loop() -> asyncio.AbstractEventLoop | None:
    """Get running event loop safely."""
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        return None


class ActivityFeedBuffer:
    """Ring buffer (in-memory) for fast reads. Backs activity-feed endpoint."""

    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self.buffer: deque[dict[str, Any]] = deque(maxlen=max_size)
        self._lock = asyncio.Lock()

    async def add(self, event: dict[str, Any]) -> None:
        """Add event to ring buffer."""
        async with self._lock:
            self.buffer.append(event)

    async def get_since(self, since_id: int | None, limit: int = 50) -> list[dict[str, Any]]:
        """Get events since ID (from buffer + DB fallback).

        Returns newest-first to match the DB path (``order_by(desc(id))``) and
        the frontend, which assumes index 0 = newest.
        """
        async with self._lock:
            if since_id is None:
                # Last `limit` events, newest-first
                return list(self.buffer)[-limit:][::-1]

            # Events with id > since_id, newest-first
            return [e for e in self.buffer if e.get("id", 0) > since_id][-limit:][::-1]

    async def get_all(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get last N events, newest-first."""
        async with self._lock:
            return list(self.buffer)[-limit:][::-1]


# Global buffer instance
_buffer = ActivityFeedBuffer()

# SSE subscribers — one queue per *connection*, not per admin.
# Keyed by a unique connection id so multiple tabs (same admin) each get events.
_sse_subscribers: dict[str, asyncio.Queue[str]] = {}
_subscribers_lock = asyncio.Lock()

# Monotonic id for buffer events so since_id polling / latest_id work in-memory.
_event_seq = 0

# Monotonic id for SSE connections — disambiguates multiple tabs per admin.
_conn_seq = 0


async def write_event(
    *,
    event_type: str,
    lead_id: int | None = None,
    actor_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Write event to activity feed.

    Called from observation_logger after emit_observation().
    """
    global _event_seq
    _event_seq += 1
    event = {
        "id": _event_seq,
        "event_type": event_type,
        "lead_id": lead_id,
        "actor_id": actor_id,
        "payload": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Add to ring buffer
    await _buffer.add(event)

    # Broadcast to SSE subscribers
    await _broadcast_event(event)

    # Persist to DB (fire-and-forget — survives service restarts, backs initial load)
    asyncio.create_task(_persist_to_db(event_type, lead_id, actor_id, metadata))


async def _persist_to_db(
    event_type: str,
    lead_id: int | None,
    actor_id: int | None,
    metadata: dict[str, Any] | None,
) -> None:
    """Save event to admin_activity_feed table.  Non-blocking — silently ignores errors."""
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.admin_activity_feed import AdminActivityFeed as _FeedModel
        async with AsyncSessionLocal() as session:
            session.add(_FeedModel(
                event_type=event_type,
                lead_id=lead_id,
                actor_id=actor_id,
                payload=metadata or {},
            ))
            await session.commit()
    except Exception:
        pass


async def _broadcast_event(event: dict[str, Any]) -> None:
    """Send event to all connected SSE subscribers (one queue per connection)."""
    async with _subscribers_lock:
        event_json = json.dumps(event)
        dead_connections = []

        for conn_id, queue in _sse_subscribers.items():
            try:
                queue.put_nowait(event_json)
            except asyncio.QueueFull:
                # Subscriber queue overflowing — likely disconnected
                dead_connections.append(conn_id)

        # Clean up dead connections
        for conn_id in dead_connections:
            del _sse_subscribers[conn_id]


async def subscribe_sse(admin_id: int) -> AsyncIterator[str]:
    """Generator for SSE subscriber. Yields JSON events as they arrive.

    Each connection gets its own queue under a unique id, so multiple tabs
    for the same admin all receive events (no overwrite/orphaning).
    """
    global _conn_seq
    _conn_seq += 1
    conn_id = f"{admin_id}:{_conn_seq}"
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)

    async with _subscribers_lock:
        _sse_subscribers[conn_id] = queue

    try:
        while True:
            try:
                # Wait for next event (timeout to detect disconnects)
                event_json = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield f"data: {event_json}\n\n"
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                yield ": heartbeat\n\n"
    finally:
        # Cleanup on disconnect — only this connection's queue
        async with _subscribers_lock:
            _sse_subscribers.pop(conn_id, None)


async def get_recent_events(
    db: AsyncSession,
    since_id: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Get recent events from DB + buffer.

    If since_id provided, return events since that ID (for polling).
    Otherwise return last `limit` events.
    """
    # Try buffer first (faster)
    buffered = await _buffer.get_since(since_id, limit)
    if buffered:
        return buffered

    # Fallback to DB
    stmt = select(AdminActivityFeed).order_by(desc(AdminActivityFeed.id)).limit(limit)
    if since_id is not None:
        stmt = stmt.where(AdminActivityFeed.id > since_id)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "id": row.id,
            "event_type": row.event_type,
            "lead_id": row.lead_id,
            "actor_id": row.actor_id,
            "payload": row.payload,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
