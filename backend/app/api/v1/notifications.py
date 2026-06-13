"""Web Push notification endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.notification import Notification
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


# ---------------------------------------------------------------------------
# In-app notification feed (the bell)
# ---------------------------------------------------------------------------

class NotificationItem(BaseModel):
    id: int
    title: str
    body: str
    url: str
    category: str
    read: bool
    created_at: datetime


class NotificationFeedResponse(BaseModel):
    items: list[NotificationItem]
    unread: int
    total: int


class UnreadCountResponse(BaseModel):
    unread: int


@router.get("/feed", response_model=NotificationFeedResponse)
async def list_notifications(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NotificationFeedResponse:
    """Return the current user's notification feed, newest first."""
    rows = (
        await session.execute(
            select(Notification)
            .where(Notification.user_id == user.user_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    total = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.user_id)
        )
    ).scalar_one()

    unread = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user.user_id,
                Notification.read_at.is_(None),
            )
        )
    ).scalar_one()

    items = [
        NotificationItem(
            id=row.id,
            title=row.title,
            body=row.body,
            url=row.url,
            category=row.category,
            read=row.read_at is not None,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return NotificationFeedResponse(items=items, unread=int(unread), total=int(total))


@router.get("/feed/unread-count", response_model=UnreadCountResponse)
async def notifications_unread_count(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UnreadCountResponse:
    """Cheap badge count for the bell — number of unread notifications."""
    unread = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user.user_id,
                Notification.read_at.is_(None),
            )
        )
    ).scalar_one()
    return UnreadCountResponse(unread=int(unread))


@router.post("/feed/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Mark a single notification as read."""
    row = (
        await session.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user.user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        await session.commit()
    return {"ok": True}


@router.post("/feed/read-all")
async def mark_all_notifications_read(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Mark every unread notification for the user as read."""
    result = await session.execute(
        update(Notification)
        .where(
            Notification.user_id == user.user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    await session.commit()
    return {"ok": True, "updated": result.rowcount or 0}
