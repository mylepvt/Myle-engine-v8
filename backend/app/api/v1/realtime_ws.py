"""Authenticated WebSocket: push ``invalidate`` topics; clients refetch via React Query."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import optional_auth_user_from_token
from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.auth_login_guards import ensure_may_issue_session_cookies
from app.core.realtime_hub import hub, ws_listen_loop
from app.db.session import get_session_factory
from app.models.user import User
from app.services.member_compliance import ensure_user_compliance_snapshot
from app.services.team_tracking import connect_presence_session, sweep_stale_presence

router = APIRouter()


@router.websocket("/ws")
async def realtime_socket(
    websocket: WebSocket,
    session_factory: async_sessionmaker[AsyncSession] = Depends(get_session_factory),
) -> None:
    """Same cookie JWT as REST plus lightweight presence heartbeats."""
    raw = websocket.cookies.get(MYLE_ACCESS_COOKIE)
    user = optional_auth_user_from_token(raw)
    if user is None:
        await websocket.close(code=1008)
        return
    session_key = secrets.token_urlsafe(18)
    async with session_factory() as auth_session:
        await ensure_user_compliance_snapshot(auth_session, user_id=user.user_id, apply_actions=True)
        row = (
            await auth_session.execute(select(User).where(User.id == user.user_id))
        ).scalar_one_or_none()
        if row is None:
            await websocket.close(code=1008)
            return
        try:
            ensure_may_issue_session_cookies(row)
        except Exception:
            await websocket.close(code=1008)
            return
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
