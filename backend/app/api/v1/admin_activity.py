"""
Admin Activity Feed — SSE realtime stream + REST initial load.

GET /api/v1/admin/activity-feed     → Initial load (last 50 events from DB)
GET /api/v1/admin/activity-stream   → SSE stream (realtime push, EventSource)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.config import settings
from app.services import activity_feed

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")


def _require_feature_enabled() -> None:
    if not settings.admin_activity_feed_enabled:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Activity feed not enabled",
        )


@router.get("/activity-feed")
async def get_activity_feed(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    since_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    """Return the last N activity events (initial load for admin feed)."""
    _require_feature_enabled()
    _require_admin(user)

    events = await activity_feed.get_recent_events(db, since_id=since_id, limit=limit)
    latest_id: int | None = events[-1].get("id") if events else None

    return {"events": events, "latest_id": latest_id}


@router.get("/activity-stream")
async def activity_stream(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> StreamingResponse:
    """SSE endpoint — streams realtime activity events to connected admin clients."""
    _require_feature_enabled()
    _require_admin(user)

    async def event_generator():
        async for chunk in activity_feed.subscribe_sse(user.user_id):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
