"""Authenticated WebSocket: push ``invalidate`` topics; clients refetch via React Query."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import get_db, optional_auth_user_from_token
from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.realtime_hub import hub, ws_listen_loop
from app.services.team_tracking import connect_presence_session, sweep_stale_presence

router = APIRouter()


@router.websocket("/ws")
async def realtime_socket(
    websocket: WebSocket,
    session: AsyncSession = Depends(get_db),
) -> None:
    """Same cookie JWT as REST plus lightweight presence heartbeats."""
    raw = websocket.cookies.get(MYLE_ACCESS_COOKIE)
    user = optional_auth_user_from_token(raw)
    if user is None:
        await websocket.close(code=1008)
        return
    session_key = secrets.token_urlsafe(18)
    bind = session.bind
    if bind is None:
        await websocket.close(code=1011)
        return
    session_factory = async_sessionmaker(
        bind,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    await hub.register(websocket, user.user_id)
    async with session_factory() as presence_session:
        changed = await connect_presence_session(
            presence_session,
            user_id=user.user_id,
            session_key=session_key,
            last_path=None,
            user_agent=str(websocket.headers.get("user-agent") or "").strip() or None,
        )
        swept = await sweep_stale_presence(presence_session)
    if changed or swept:
        await hub.broadcast_topics(["team_tracking", "team_tracking.presence"])
    await ws_listen_loop(
        websocket,
        user.user_id,
        session_factory=session_factory,
        session_key=session_key,
    )
