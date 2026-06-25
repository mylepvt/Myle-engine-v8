"""Standalone member feedback — submitted from the dashboard, read by admin only."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.member_feedback import MemberFeedback
from app.models.user import User
from app.schemas.feedback import FeedbackPublic, FeedbackSubmit
from app.services.push_service import send_push_to_role

router = APIRouter()


def _display_name(user: User) -> str:
    name = (user.username or "").strip()
    return name or user.fbo_id or user.email


def _to_public(row: MemberFeedback, author: User) -> FeedbackPublic:
    return FeedbackPublic(
        id=row.id,
        user_id=row.user_id,
        member_name=_display_name(author),
        member_role=author.role,
        message=row.message,
        created_at=row.created_at,
    )


@router.post("", response_model=FeedbackPublic, status_code=http_status.HTTP_201_CREATED)
async def submit_feedback(
    body: FeedbackSubmit,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackPublic:
    """Any signed-in member shares private feedback; only admins can read it."""
    if user.role not in ("team", "leader", "admin"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Feedback is only for team, leader, or admin accounts.",
        )
    message = body.message.strip()
    if not message:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Feedback message cannot be empty.",
        )

    row = MemberFeedback(
        user_id=user.user_id,
        message=message,
        created_at=datetime.now(timezone.utc),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    author = (
        await session.execute(select(User).where(User.id == user.user_id))
    ).scalar_one()

    if user.role != "admin":
        try:
            await send_push_to_role(
                session, "admin",
                title="🔒 New feedback received",
                body="A team member shared private feedback from the dashboard.",
                url="/dashboard",
            )
        except Exception:
            pass

    return _to_public(row, author)


@router.get("", response_model=list[FeedbackPublic])
async def list_feedback(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
) -> list[FeedbackPublic]:
    """Admin-only: every member's feedback, newest first."""
    if user.role != "admin":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only admins can read member feedback.",
        )
    rows = (
        await session.execute(
            select(MemberFeedback, User)
            .join(User, User.id == MemberFeedback.user_id)
            .order_by(MemberFeedback.created_at.desc(), MemberFeedback.id.desc())
            .limit(limit)
        )
    ).all()
    return [_to_public(row, author) for row, author in rows]
