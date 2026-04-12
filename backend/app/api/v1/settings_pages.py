"""Settings nav — app key/value from ``app_settings``; help + org tree."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.app_setting import AppSetting
from app.models.user import User
from app.schemas.system_surface import SystemStubResponse

router = APIRouter()

_HELP_ARTICLES: list[dict[str, str]] = [
    {
        "title": "Sign-in & passwords",
        "detail": "Use your registered email and password. Self-serve registration may require admin approval before access.",
    },
    {
        "title": "Roles",
        "detail": "Admin sees org-wide data; leaders see their line; team members work assigned leads within scope rules.",
    },
    {
        "title": "Wallet & pool",
        "detail": "Wallet balance is the sum of ledger lines. Lead pool claims debit wallet when a price is set.",
    },
    {
        "title": "Support",
        "detail": "Product help content can be extended via CMS later; operational policy stays with your admin team.",
    },
]


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/app", response_model=SystemStubResponse)
async def settings_app(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    _require_admin(user)
    rows = (await session.execute(select(AppSetting.key, AppSetting.value))).all()
    items = [{"key": k, "value": v} for k, v in rows]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="App-wide key/value rows from `app_settings`; environment still comes from server config.",
    )


@router.get("/help", response_model=SystemStubResponse)
async def settings_help(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> SystemStubResponse:
    _require_admin(user)
    return SystemStubResponse(
        items=list(_HELP_ARTICLES),
        total=len(_HELP_ARTICLES),
        note="Static help articles bundled with the API; replace with CMS when available.",
    )


@router.get("/all-members", response_model=SystemStubResponse)
async def settings_all_members(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> SystemStubResponse:
    _require_admin(user)
    return SystemStubResponse(
        note="For live directory use Team → Members (GET /api/v1/team/members).",
    )


@router.get("/org-tree", response_model=SystemStubResponse)
async def settings_org_tree(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Flat upline listing from ``users.upline_user_id`` (admin)."""
    _require_admin(user)
    uq = await session.execute(select(User).order_by(User.id.asc()))
    users = uq.scalars().all()
    by_id = {u.id: u for u in users}

    def _label(u: User) -> str:
        return (u.username or "").strip() or u.email.split("@", 1)[0]

    items: list[dict] = []
    for u in sorted(users, key=lambda x: x.id):
        up = by_id.get(u.upline_user_id) if u.upline_user_id else None
        items.append(
            {
                "title": f"{_label(u)} ({u.role})",
                "detail": f"FBO {u.fbo_id} · upline: {_label(up) if up else '—'}",
            }
        )
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Tree depth hint via indentation; full graph uses `upline_user_id`.",
    )
