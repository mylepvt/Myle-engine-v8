"""System section — training (DB-backed), coaching stubs; decision engine uses `shell_insights`."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.training_day_note import TrainingDayNote
from app.models.training_progress import TrainingProgress
from app.models.training_question import TrainingQuestion
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.training_video import TrainingVideo
from app.models.user import User
from app.schemas.system_surface import (
    SystemStubResponse,
    TestDeliveryResponse,
    TrainingSurfaceResponse,
)
from app.schemas.training_test import (
    MarkTrainingDayBody,
    TrainingTestQuestionPublic,
    TrainingTestResultPublic,
    TrainingTestSubmitBody,
)
from app.core.realtime_hub import notify_topics
from app.services.shell_insights import build_decision_engine_snapshot
from app.services.training_surface import build_training_surface
from app.services.training_uploads import save_training_notes_image

router = APIRouter()

PASS_MARK_PERCENT = 60


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_admin_or_leader(user: AuthUser) -> None:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _ensure_training_day_exists(session: AsyncSession, day_number: int) -> None:
    exists = await session.execute(
        select(TrainingVideo.id).where(TrainingVideo.day_number == day_number)
    )
    if exists.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Invalid training day",
        )


async def _ensure_day_unlocked_for_user(
    session: AsyncSession,
    *,
    user_id: int,
    day_number: int,
) -> None:
    if day_number <= 1:
        return
    previous = await session.execute(
        select(TrainingProgress.id).where(
            TrainingProgress.user_id == user_id,
            TrainingProgress.day_number == day_number - 1,
            TrainingProgress.completed.is_(True),
        )
    )
    if previous.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Complete Day {day_number - 1} first",
        )


@router.get("/training", response_model=TrainingSurfaceResponse)
async def system_training(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TrainingSurfaceResponse:
    """7-day training catalog + caller's completion rows (legacy training home data)."""
    return await build_training_surface(session, user.user_id)


@router.get("/training/day/{day_number}/embed")
async def training_day_embed(
    day_number: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    """Auth-gated YouTube embed redirect — URL never exposed to client JS."""
    row = (
        await session.execute(select(TrainingVideo).where(TrainingVideo.day_number == day_number))
    ).scalar_one_or_none()
    if row is None or not row.youtube_url:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video not available")
    raw = row.youtube_url.strip()
    # Normalise: support watch?v= and youtu.be/ forms
    if "youtu.be/" in raw:
        vid_id = raw.split("youtu.be/")[-1].split("?")[0].split("&")[0]
    elif "watch?v=" in raw:
        vid_id = raw.split("watch?v=")[-1].split("&")[0]
    elif "embed/" in raw:
        vid_id = raw.split("embed/")[-1].split("?")[0]
    else:
        vid_id = raw.split("/")[-1].split("?")[0]
    params = "controls=0&modestbranding=1&rel=0&disablekb=1&fs=0&iv_load_policy=3"
    embed_url = f"https://www.youtube.com/embed/{vid_id}?{params}"
    return RedirectResponse(url=embed_url, status_code=302)


@router.post("/training/days/{day_number}/notes")
async def upload_training_notes(
    day_number: int,
    file: Annotated[UploadFile, File()],
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Upload notes image for one training day from the system training surface."""
    await _ensure_training_day_exists(session, day_number)
    await _ensure_day_unlocked_for_user(session, user_id=user.user_id, day_number=day_number)
    try:
        image_path = await save_training_notes_image(user.user_id, day_number, file)
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing = (
        await session.execute(
            select(TrainingDayNote).where(
                TrainingDayNote.user_id == user.user_id,
                TrainingDayNote.day_number == day_number,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.image_url = image_path
    else:
        session.add(
            TrainingDayNote(
                user_id=user.user_id,
                day_number=day_number,
                image_url=image_path,
            )
        )
    await session.commit()
    return {"day_number": day_number, "image_url": image_path}


@router.post("/training/mark-day", response_model=TrainingSurfaceResponse)
async def mark_training_day(
    body: MarkTrainingDayBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TrainingSurfaceResponse:
    """Mark one training day complete (legacy day-by-day). All catalog days done → training gate cleared."""
    await _ensure_training_day_exists(session, body.day_number)

    # Get current progress to enforce sequential and calendar rules
    current_progress = await session.execute(
        select(TrainingProgress).where(TrainingProgress.user_id == user.user_id)
    )
    progress_rows = current_progress.scalars().all()
    
    # Check sequential completion (must complete previous days first)
    if body.day_number > 1:
        previous_completed = any(
            p.day_number == body.day_number - 1 and p.completed 
            for p in progress_rows
        )
        if not previous_completed:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Complete Day {body.day_number - 1} first",
            )
    
    # Check calendar enforcement for days 2-7
    if body.day_number > 1:
        day1_progress = next((p for p in progress_rows if p.day_number == 1), None)
        if day1_progress and day1_progress.completed_at:
            days_since_day1 = (datetime.now(timezone.utc) - day1_progress.completed_at).days
            min_days_required = body.day_number - 1
            if days_since_day1 < min_days_required:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Day {body.day_number} unlocks {min_days_required} days after completing Day 1",
                )

    # Require notes upload before marking complete
    note_row = await session.execute(
        select(TrainingDayNote).where(
            TrainingDayNote.user_id == user.user_id,
            TrainingDayNote.day_number == body.day_number,
        )
    )
    if note_row.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Please upload your notes before completing this day",
        )

    now = datetime.now(timezone.utc)
    existing = await session.execute(
        select(TrainingProgress).where(
            TrainingProgress.user_id == user.user_id,
            TrainingProgress.day_number == body.day_number,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.completed = True
        row.completed_at = now
    else:
        session.add(
            TrainingProgress(
                user_id=user.user_id,
                day_number=body.day_number,
                completed=True,
                completed_at=now,
            )
        )
    await session.flush()

    catalog = (
        await session.execute(
            select(TrainingVideo.day_number).order_by(TrainingVideo.day_number.asc())
        )
    ).scalars().all()
    if catalog:
        done_rows = await session.execute(
            select(TrainingProgress.day_number).where(
                TrainingProgress.user_id == user.user_id,
                TrainingProgress.completed.is_(True),
            )
        )
        done_set = set(done_rows.scalars().all())
        if all(d in done_set for d in catalog):
            urow = await session.get(User, user.user_id)
            if urow is not None and urow.training_status != "completed":
                # Mark all days done — awaiting certificate upload to fully unlock
                urow.training_status = "all_days_done"

    await session.commit()
    return await build_training_surface(session, user.user_id)


@router.post("/training/certificate/upload")
async def upload_training_certificate(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict:
    """Upload training certificate image → unlocks full dashboard (sets training_status=completed)."""
    urow = await session.get(User, user.user_id)
    if urow is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check all days completed first
    catalog = (
        await session.execute(
            select(TrainingVideo.day_number).order_by(TrainingVideo.day_number.asc())
        )
    ).scalars().all()
    if catalog:
        done_rows = await session.execute(
            select(TrainingProgress.day_number).where(
                TrainingProgress.user_id == user.user_id,
                TrainingProgress.completed.is_(True),
            )
        )
        done_set = set(done_rows.scalars().all())
        if not all(d in done_set for d in catalog):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Complete all 7 training days before uploading certificate",
            )

    # Save file
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "training_certificates")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "cert.jpg")[1] or ".jpg"
    filename = f"user_{user.user_id}{ext}"
    file_path = os.path.join(upload_dir, filename)
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    cert_url = f"/uploads/training_certificates/{filename}"
    urow.certificate_url = cert_url
    urow.training_status = "completed"
    urow.training_required = False
    await session.commit()

    return {"ok": True, "certificate_url": cert_url}


@router.get("/training-test/questions", response_model=list[TrainingTestQuestionPublic])
async def training_test_questions(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[TrainingTestQuestionPublic]:
    """MCQ bank for certification (answers verified server-side on submit)."""
    _ = user
    q = await session.execute(select(TrainingQuestion).order_by(TrainingQuestion.sort_order.asc()))
    rows = q.scalars().all()
    return [
        TrainingTestQuestionPublic(
            id=r.id,
            question=r.question,
            options={
                "a": r.option_a,
                "b": r.option_b,
                "c": r.option_c,
                "d": r.option_d,
            },
        )
        for r in rows
    ]


@router.post("/training-test/submit", response_model=TrainingTestResultPublic)
async def training_test_submit(
    body: TrainingTestSubmitBody,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TrainingTestResultPublic:
    """Score answers; pass at ``PASS_MARK_PERCENT``; persist attempt row."""
    q = await session.execute(select(TrainingQuestion).order_by(TrainingQuestion.sort_order.asc()))
    questions = q.scalars().all()
    if not questions:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="No training questions configured",
        )

    total = len(questions)
    score = 0
    for tq in questions:
        raw = body.answers.get(str(tq.id))
        if raw is None:
            continue
        if raw.strip().lower() == tq.correct_answer.strip().lower():
            score += 1

    percent = int(100 * score / total) if total else 0
    passed = percent >= PASS_MARK_PERCENT
    now = datetime.now(timezone.utc)
    attempt = TrainingTestAttempt(
        user_id=user.user_id,
        score=score,
        total_questions=total,
        passed=passed,
        attempted_at=now,
    )
    session.add(attempt)
    await session.flush()

    training_completed = False
    if passed:
        urow = await session.get(User, user.user_id)
        if urow is not None:
            urow.training_status = "completed"
            urow.training_required = False
            training_completed = True

    await session.commit()
    await session.refresh(attempt)

    return TrainingTestResultPublic(
        score=score,
        total_questions=total,
        percent=percent,
        passed=passed,
        pass_mark_percent=PASS_MARK_PERCENT,
        attempted_at=attempt.attempted_at,
        training_completed=training_completed,
    )


@router.get("/decision-engine", response_model=SystemStubResponse)
async def system_decision_engine(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Admin — pipeline signals (stale new leads, pool depth)."""
    _require_admin(user)
    return await build_decision_engine_snapshot(session, user)


@router.get("/coaching", response_model=SystemStubResponse)
async def system_coaching(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> SystemStubResponse:
    """Coaching panel data placeholder — admin and leader roles."""
    _require_admin_or_leader(user)
    return SystemStubResponse(
        note="Coaching tasks and metrics will be API-driven; V1 returns an empty list.",
    )


@router.post("/test-delivery", response_model=TestDeliveryResponse)
async def system_test_delivery(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> TestDeliveryResponse:
    """Admin: trigger a realtime cache invalidation (WebSocket) and report email/push status.

    Browser clients subscribed to ``/api/v1/ws`` should refetch data. Email and web push
    require separate SMTP/VAPID configuration in production.
    """
    _require_admin(user)
    await notify_topics("leads")
    return TestDeliveryResponse(
        realtime="Broadcast invalidate topic “leads” to connected dashboards.",
        email="SMTP not wired in API — use ops mailer or connect provider when ready.",
        web_push="Service worker is install-only; add VAPID + push handler for browser push.",
    )
