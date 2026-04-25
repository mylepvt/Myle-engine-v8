"""Web Push notification endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.push_subscription import PushSubscription
from app.services.push_service import get_vapid_public_key

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class VapidKeyResponse(BaseModel):
    public_key: str
    publicKey: str
    enabled: bool
    detail: str | None = None


class PushSubscribeKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeBody(BaseModel):
    endpoint: str
    keys: PushSubscribeKeys


class PushUnsubscribeBody(BaseModel):
    endpoint: str | None = None
    clear_all: bool = False


class PushStatusResponse(BaseModel):
    subscribed: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/vapid-key", response_model=VapidKeyResponse)
async def get_vapid_key(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> VapidKeyResponse:
    """Return VAPID public key for client-side push subscription. No auth required."""
    public_key = await get_vapid_public_key(session)
    enabled = bool(public_key)
    return VapidKeyResponse(
        public_key=public_key,
        publicKey=public_key,
        enabled=enabled,
        detail=(
            None
            if enabled
            else "Push delivery is not configured on the server yet. Install the push dependencies and redeploy."
        ),
    )


@router.post("/subscribe", status_code=http_status.HTTP_201_CREATED)
async def subscribe_push(
    body: PushSubscribeBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Save a push subscription for the authenticated user."""
    # Check if already exists (upsert-style: delete then re-add)
    existing = (
        await session.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == user.user_id,
                PushSubscription.endpoint == body.endpoint,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.keys_p256dh = body.keys.p256dh
        existing.keys_auth = body.keys.auth
        await session.commit()
        return {"ok": True, "created": False}

    sub = PushSubscription(
        user_id=user.user_id,
        endpoint=body.endpoint,
        keys_p256dh=body.keys.p256dh,
        keys_auth=body.keys.auth,
    )
    session.add(sub)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        # Race condition — already inserted, that's fine
    return {"ok": True, "created": True}


@router.delete("/unsubscribe")
async def unsubscribe_push(
    body: PushUnsubscribeBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Remove a push subscription for the authenticated user."""
    if body.clear_all or not body.endpoint:
        rows = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id == user.user_id)
            )
        ).scalars().all()
        for row in rows:
            await session.delete(row)
        await session.commit()
        return {"ok": True, "deleted": len(rows)}

    row = (
        await session.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == user.user_id,
                PushSubscription.endpoint == body.endpoint,
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Subscription not found"
        )

    await session.delete(row)
    await session.commit()
    return {"ok": True, "deleted": 1}


@router.get("/status", response_model=PushStatusResponse)
async def push_status(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PushStatusResponse:
    """Check whether the current user has any active push subscriptions."""
    count_result = await session.execute(
        select(PushSubscription).where(PushSubscription.user_id == user.user_id).limit(1)
    )
    sub = count_result.scalar_one_or_none()
    return PushStatusResponse(subscribed=sub is not None)
