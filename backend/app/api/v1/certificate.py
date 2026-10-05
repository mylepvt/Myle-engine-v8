"""Training certificate generation and download."""

from __future__ import annotations

import re
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.time_ist import IST
from app.models.training_progress import TrainingProgress
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.user import User
from app.services.certificate import certificate_number, generate_certificate_pdf
from app.services.certificate_verify import verification_code, verify_url

router = APIRouter()


def _printable(text: str | None) -> str:
    """Collapse spaces; empty when the certificate fonts can't draw it (e.g. Devanagari)."""
    cleaned = " ".join((text or "").split())
    try:
        cleaned.encode("latin-1")
    except UnicodeEncodeError:
        return ""
    return cleaned


def certificate_display_name(user: User) -> str:
    """Real name first (all-lower/all-upper typing fixed); else username / FBO ID."""
    name = _printable(user.name)
    if name:
        return name.title() if name.islower() or name.isupper() else name
    return _printable(user.username) or _printable(user.fbo_id) or f"Member {user.id}"


async def _latest_passed_attempt(session: AsyncSession, user_id: int) -> TrainingTestAttempt | None:
    return (
        await session.execute(
            select(TrainingTestAttempt)
            .where(TrainingTestAttempt.user_id == user_id, TrainingTestAttempt.passed.is_(True))
            .order_by(TrainingTestAttempt.attempted_at.desc(), TrainingTestAttempt.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


@router.get("/training/certificate")
async def download_training_certificate(
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """
    Generate and download training certificate PDF.
    
    Requirements:
    - User must have completed all 7 training days
    - User must have passed the training test (60% score)
    - Returns PDF file with certificate details
    """
    # Get user details
    user_row = await session.get(User, user.user_id)
    if not user_row:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # Check if training is completed
    if user_row.training_status != "completed":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Training not completed. Complete all training days and pass the test first.",
        )
    
    # Get training progress to verify completion
    progress_rows = await session.execute(
        select(TrainingProgress).where(
            TrainingProgress.user_id == user.user_id,
            TrainingProgress.completed.is_(True),
        )
    )
    completed_days = set(p.day_number for p in progress_rows.scalars().all())
    
    # Verify all 7 days are completed
    if not all(day in completed_days for day in range(1, 8)):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="All 7 training days must be completed before downloading certificate.",
        )
    
    latest_test = await _latest_passed_attempt(session, user.user_id)
    if latest_test is None:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Training test must be passed with 60% score before downloading certificate.",
        )

    issued_on = latest_test.attempted_at
    if issued_on.tzinfo is None:  # stored as UTC; some drivers hand it back naive
        issued_on = issued_on.replace(tzinfo=timezone.utc)
    issued_on = issued_on.astimezone(IST)
    name = certificate_display_name(user_row)
    cert_no = certificate_number(user_row.id, issued_on)
    pdf_bytes = await generate_certificate_pdf(
        name=name,
        fbo_id=user_row.fbo_id,
        completion_date=issued_on,
        test_score=latest_test.score,
        test_total=latest_test.total_questions,
        cert_no=cert_no,
        verify_link=verify_url(str(request.base_url), cert_no),
        verify_code=verification_code(cert_no),
    )
    slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or str(user_row.id)
    filename = f"Myle_Training_Certificate_{slug}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/training/certificate/status")
async def get_certificate_status(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Check if user is eligible for certificate download.
    
    Returns eligibility status and any missing requirements.
    """
    # Get user details
    user_row = await session.get(User, user.user_id)
    if not user_row:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # Get training progress
    progress_rows = await session.execute(
        select(TrainingProgress).where(
            TrainingProgress.user_id == user.user_id,
            TrainingProgress.completed.is_(True),
        )
    )
    completed_days = set(p.day_number for p in progress_rows.scalars().all())
    
    # Latest attempt (a member may have several: failed first, passed later)
    latest_test = (
        await session.execute(
            select(TrainingTestAttempt)
            .where(TrainingTestAttempt.user_id == user.user_id)
            .order_by(TrainingTestAttempt.attempted_at.desc(), TrainingTestAttempt.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    
    # Check eligibility
    all_days_completed = all(day in completed_days for day in range(1, 8))
    test_passed = await _latest_passed_attempt(session, user.user_id) is not None
    training_completed = user_row.training_status == "completed"
    
    eligible = all_days_completed and test_passed and training_completed
    
    return {
        "eligible": eligible,
        "requirements": {
            "all_days_completed": all_days_completed,
            "test_passed": test_passed,
            "training_completed": training_completed,
        },
        "completed_days": sorted(list(completed_days)),
        "total_days": 7,
        "latest_test_score": latest_test.score if latest_test else None,
        "latest_test_total": latest_test.total_questions if latest_test else None,
        "latest_test_passed": bool(latest_test and latest_test.passed),
    }
