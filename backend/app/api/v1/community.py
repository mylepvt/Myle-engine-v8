"""Community live pulse — who is on the app and what the community did today."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.services.community_live import get_live_snapshot

router = APIRouter()


@router.get("/live")
async def get_community_live(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    snapshot = await get_live_snapshot(session)
    if user.role != "admin":
        # Totals (calls / new leads / follow-ups / members working) are admin-only;
        # team and leaders still see who is online, the 15+ club and the feed.
        return {**snapshot, "today": None, "week": None}
    return snapshot
