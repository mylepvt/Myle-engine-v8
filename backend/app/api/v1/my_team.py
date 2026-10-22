"""Leader: their own team's wallets, recharges and leads (read-only)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.user import User
from app.services import leader_team
from app.services.downline import is_user_in_downline_of

router = APIRouter()


def _require_leader(user: AuthUser) -> None:
    if user.role != "leader":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Leaders only")


@router.get("")
async def my_team_overview(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """The leader's own numbers, every member under them, and the team's lead pipeline."""
    _require_leader(user)
    return await leader_team.overview(session, user.user_id)


@router.get("/claims")
async def my_team_claims(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    period: str = Query(default="30d", pattern="^(today|7d|30d|month|all)$"),
) -> dict[str, Any]:
    """Leads taken by the team in a period: paid and free, overall, day by day and per member."""
    _require_leader(user)
    return await leader_team.claims_report(session, user.user_id, period)


async def _team_member(session: AsyncSession, user: AuthUser, member_id: int) -> User:
    if member_id != user.user_id and not await is_user_in_downline_of(session, member_id, user.user_id):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not in your team")
    member = await session.get(User, member_id)
    if member is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not in your team")
    return member


@router.get("/{member_id}/claims")
async def my_team_member_claims(
    member_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    period: str = Query(default="30d", pattern="^(today|7d|30d|month|all)$"),
) -> dict[str, Any]:
    """Every lead one member took in the period: when, paid or free, how, and its stage now."""
    _require_leader(user)
    return await leader_team.member_claims(session, await _team_member(session, user, member_id), period)


@router.get("/{member_id}")
async def my_team_member(
    member_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """One member of the leader's team (or the leader): recharge history, wallet lines, leads."""
    _require_leader(user)
    return await leader_team.member_detail(session, await _team_member(session, user, member_id))
