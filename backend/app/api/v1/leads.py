import secrets
from datetime import datetime, timezone
from typing import Annotated, Optional
import re
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import get_db
from app.api.deps import AuthUser, require_auth_user
from app.core.realtime_hub import notify_topics
from app.models.app_setting import AppSetting
from app.models.batch_day_submission import BatchDaySubmission
from app.models.batch_share_link import BatchShareLink
from app.models.lead import Lead
from app.schemas.call_events import CallEventCreate, CallEventListResponse, CallEventPublic
from app.schemas.leads import (
    AllLeadsResponse,
    BatchShareUrlRequest,
    BatchShareUrlResponse,
    LeadCreate,
    LeadFileImportResponse,
    LeadCtcsActionRequest,
    LeadDetailPublic,
    LeadListResponse,
    LeadPublic,
    MindsetLockCompleteResponse,
    MindsetLockPreviewResponse,
    LeadTransitionRequest,
    LeadTransitionResponse,
    LeadUpdate,
)
from app.schemas.watch import BatchWatchPageData, BatchWatchSubmissionPublic
from app.services.all_leads_service import AllLeadsService, get_all_leads_service
from app.services.batch_watch_uploads import (
    save_batch_submission_notes_file,
    save_batch_submission_video_file,
    save_batch_submission_voice_file,
)
from app.services.lead_file_import import run_personal_lead_import
from app.services.leads_service import LeadsService, get_leads_service, _PAYMENT_REQUIRED_STATUSES
from app.services.downline import is_user_in_downline_of
from app.services.leads_service import _sync_batch_completion_timestamps
from app.db.session import AsyncSessionLocal
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.push_service import send_push_to_user_bg

router = APIRouter()
watch_router = APIRouter()

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50
_BATCH_SLOTS = frozenset(
    {
        "d1_morning",
        "d1_afternoon",
        "d1_evening",
        "d2_morning",
        "d2_afternoon",
        "d2_evening",
    }
)
_YOUTUBE_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:.*?&)?v=|embed/|shorts/|live/|v/))([A-Za-z0-9_-]{11})",
    re.IGNORECASE,
)
_YOUTUBE_ID_ONLY_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


async def _get_setting_value(session: AsyncSession, key: str) -> str:
    row = (
        await session.execute(select(AppSetting.value).where(AppSetting.key == key))
    ).scalar_one_or_none()
    return str(row or "").strip()


def _youtube_video_id(raw_url: str) -> str | None:
    candidate = (raw_url or "").strip()
    if not candidate:
        return None
    if _YOUTUBE_ID_ONLY_RE.fullmatch(candidate):
        return candidate

    try:
        parsed = urlparse(candidate)
        hostname = parsed.hostname or ""
        hostname = re.sub(r"^(www|m|music)\.", "", hostname.lower())

        if hostname == "youtu.be":
            first_segment = next((segment for segment in parsed.path.split("/") if segment), "")
            if _YOUTUBE_ID_ONLY_RE.fullmatch(first_segment):
                return first_segment

        if hostname in {"youtube.com", "youtube-nocookie.com"}:
            query_video_id = parse_qs(parsed.query).get("v", [None])[0]
            if query_video_id and _YOUTUBE_ID_ONLY_RE.fullmatch(query_video_id):
                return query_video_id

            path_segments = [segment for segment in parsed.path.split("/") if segment]
            if len(path_segments) >= 2 and path_segments[0] in {"embed", "shorts", "live", "v"}:
                if _YOUTUBE_ID_ONLY_RE.fullmatch(path_segments[1]):
                    return path_segments[1]
    except ValueError:
        pass

    match = _YOUTUBE_ID_RE.search(candidate)
    if not match:
        return None
    return match.group(1)


def _youtube_embed_url(raw_url: str) -> str | None:
    vid = _youtube_video_id(raw_url)
    if not vid:
        return None
    return f"https://www.youtube-nocookie.com/embed/{vid}?autoplay=1&enablejsapi=1&rel=0&playsinline=1"


def _batch_day_number(slot: str) -> int:
    if slot.startswith("d1_"):
        return 1
    if slot.startswith("d2_"):
        return 2
    raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid slot")


def _batch_slot_label(slot: str) -> str:
    return slot.split("_", 1)[1].replace("_", " ").title()


def _to_batch_submission_public(
    submission: BatchDaySubmission | None,
) -> BatchWatchSubmissionPublic | None:
    if submission is None:
        return None
    return BatchWatchSubmissionPublic(
        notes_url=submission.notes_url,
        voice_note_url=submission.voice_note_url,
        video_url=submission.video_url,
        notes_text=submission.notes_text,
        submitted_at=submission.submitted_at,
    )


async def _resolve_batch_watch_context(
    *,
    session: AsyncSession,
    slot: str,
    token: str,
) -> tuple[BatchShareLink, Lead]:
    token = token.strip()
    if not token:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Missing token")

    link = (
        await session.execute(select(BatchShareLink).where(BatchShareLink.token == token))
    ).scalar_one_or_none()
    if link is None or link.slot != slot:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid link")

    lead = await session.get(Lead, link.lead_id)
    if lead is None or lead.deleted_at is not None or lead.in_pool:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return link, lead


async def _resolve_batch_video_url(session: AsyncSession, slot: str, v: int) -> str:
    video_url = await _get_setting_value(session, f"batch_{slot}_v{v}")
    if not video_url and v == 1:
        video_url = await _get_setting_value(session, f"batch_{slot}_v2")
    if not video_url:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video not configured")
    return video_url


async def _actor_may_share_batch_link(
    *,
    session: AsyncSession,
    user: AuthUser,
    lead: Lead,
    slot: str,
) -> bool:
    if user.role == "admin":
        return True
    if user.role != "leader":
        return False
    if lead.assigned_to_user_id == user.user_id:
        return True
    if lead.assigned_to_user_id is not None:
        return await is_user_in_downline_of(session, lead.assigned_to_user_id, user.user_id)
    if lead.created_by_user_id == user.user_id:
        return True
    return await is_user_in_downline_of(session, lead.created_by_user_id, user.user_id)


@router.get("/all", response_model=AllLeadsResponse)
async def list_all_leads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[AllLeadsService, Depends(get_all_leads_service)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None, max_length=200, description="Case-insensitive name substring"),
    status: Optional[str] = Query(default=None, max_length=32, description="Exact status"),
    archived_only: bool = Query(default=False),
    deleted_only: bool = Query(default=False),
) -> AllLeadsResponse:
    return await service.get_all(
        user=user,
        limit=limit,
        offset=offset,
        q=q,
        status=status,
        archived_only=archived_only,
        deleted_only=deleted_only,
    )


@router.get("", response_model=LeadListResponse)
async def list_leads(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None, max_length=200, description="Case-insensitive name substring"),
    status: Optional[str] = Query(default=None, max_length=32, description="Exact status"),
    archived_only: bool = Query(
        default=False,
        description="If true, only archived leads; if false (default), only active (non-archived)",
    ),
    deleted_only: bool = Query(
        default=False,
        description="If true, soft-deleted leads (recycle bin) — admin only",
    ),
    ctcs_filter: str | None = Query(
        default=None,
        description="Call-to-close tab filter: all|today|followups|hot|converted",
    ),
    ctcs_priority_sort: bool = Query(
        default=False,
        description="When true, order leads for calling (new → follow-ups → hot → old).",
    ),
    pre_enrollment_only: bool = Query(
        default=False,
        description="When true, only return leads in pre-enrollment statuses (calling board clean mode).",
    ),
) -> LeadListResponse:
    return await service.list_leads(
        user=user,
        limit=limit,
        offset=offset,
        q=q,
        status=status,
        archived_only=archived_only,
        deleted_only=deleted_only,
        ctcs_filter=ctcs_filter,
        ctcs_priority_sort=ctcs_priority_sort,
        pre_enrollment_only=pre_enrollment_only,
    )


@router.post("", response_model=LeadPublic, status_code=http_status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreate,
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    lead = await service.create_lead(body=body, user=user)
    return lead


@router.post("/import-file", response_model=LeadFileImportResponse)
async def import_leads_file(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    source_tag: str = Form("Import"),
) -> LeadFileImportResponse:
    """Team / leader: bulk-create leads from a PDF (calling board; legacy table/text layout)."""
    if user.role not in ("leader", "team"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only team and leader can import leads from a file",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )
    result = await run_personal_lead_import(
        session,
        user_id=user.user_id,
        file_bytes=raw,
        filename=file.filename or "upload",
        source_tag=(source_tag or "").strip() or "Import",
    )
    await notify_topics("leads")
    return LeadFileImportResponse(
        imported=result.imported,
        skipped=result.skipped,
        warnings=result.warnings,
    )


@router.post("/{lead_id}/claim", response_model=LeadPublic)
async def claim_lead(
    lead_id: int,
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    lead = await service.claim_lead(lead_id=lead_id, user=user)
    return lead


@router.get("/{lead_id}/mindset-lock-preview", response_model=MindsetLockPreviewResponse)
async def mindset_lock_preview(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.preview_mindset_lock(lead_id=lead_id, user=user)


@router.post("/{lead_id}/mindset-lock-complete", response_model=MindsetLockCompleteResponse)
async def mindset_lock_complete(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.complete_mindset_lock(lead_id=lead_id, user=user)


@router.post("/{lead_id}/stage-clock-reset", response_model=LeadPublic)
async def stage_clock_reset(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.reset_stage_clock(lead_id=lead_id, user=user)


@router.post("/{lead_id}/batch-share-url", response_model=BatchShareUrlResponse)
async def generate_batch_share_url(
    lead_id: int,
    body: BatchShareUrlRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BatchShareUrlResponse:
    slot = body.slot
    if slot not in _BATCH_SLOTS:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid slot")
    lead = await session.get(Lead, lead_id)
    if lead is None or lead.deleted_at is not None or lead.in_pool:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if not await _actor_may_share_batch_link(session=session, user=user, lead=lead, slot=slot):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
    existing = (
        await session.execute(
            select(BatchShareLink).where(
                BatchShareLink.lead_id == lead_id,
                BatchShareLink.slot == slot,
                BatchShareLink.used.is_(False),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        token = existing.token
    else:
        token = secrets.token_urlsafe(16)
        session.add(
            BatchShareLink(
                token=token,
                lead_id=lead_id,
                slot=slot,
                created_by_user_id=user.user_id,
            )
        )
        await session.commit()

    base = str(request.base_url).rstrip("/")
    return BatchShareUrlResponse(
        watch_url_v1=f"{base}/watch/batch/{slot}/1?token={token}",
        watch_url_v2=f"{base}/watch/batch/{slot}/2?token={token}",
    )


@router.patch("/{lead_id}", response_model=LeadPublic)
async def update_lead(
    lead_id: int,
    body: LeadUpdate,
    background_tasks: BackgroundTasks,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    lead = await service.update_lead(lead_id=lead_id, body=body, user=user)
    # Notify newly assigned user (skip if assigning to self). LeadUpdate may omit assignment;
    # only fire when the schema includes an explicit assignee change.
    assigned_uid = getattr(lead, "assigned_to_user_id", None)
    assign_in_body = getattr(body, "assigned_to_user_id", None)
    if (
        assign_in_body is not None
        and assigned_uid is not None
        and assigned_uid != user.user_id
    ):
        background_tasks.add_task(
            send_push_to_user_bg,
            AsyncSessionLocal,
            assigned_uid,
            title="New Lead Assigned",
            body=f"Lead '{lead.name}' has been assigned to you",
            url="/dashboard/work/leads",
        )
    return lead


@router.delete("/{lead_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> None:
    await service.delete_lead(lead_id=lead_id, user=user)


@router.delete("/{lead_id}/permanent-delete", status_code=http_status.HTTP_204_NO_CONTENT)
async def permanent_delete_lead(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> None:
    await service.permanent_delete_lead(lead_id=lead_id, user=user)


@router.post("/{lead_id}/action", response_model=LeadPublic)
async def ctcs_lead_action(
    lead_id: int,
    body: LeadCtcsActionRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
    background_tasks: BackgroundTasks,
) -> LeadPublic:
    lead = await service.apply_ctcs_action(
        lead_id=lead_id,
        body=body,
        user=user,
        background_tasks=background_tasks,
    )
    return LeadPublic.model_validate(lead)


@router.post(
    "/{lead_id}/call-log",
    response_model=CallEventPublic,
    status_code=http_status.HTTP_201_CREATED,
)
async def ctcs_call_log(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> CallEventPublic:
    return await service.log_call_attempt(lead_id=lead_id, user=user)


@router.get("/{lead_id}", response_model=LeadDetailPublic)
async def get_lead(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> LeadDetailPublic:
    return await service.get_lead_detail(lead_id=lead_id, user=user)


@router.post(
    "/{lead_id}/calls",
    response_model=CallEventPublic,
    status_code=http_status.HTTP_201_CREATED,
)
async def log_call(
    lead_id: int,
    body: CallEventCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> CallEventPublic:
    return await service.log_call(lead_id=lead_id, body=body, user=user)


@router.get("/{lead_id}/calls", response_model=CallEventListResponse)
async def list_calls(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> CallEventListResponse:
    return await service.list_calls(
        lead_id=lead_id,
        user=user,
        limit=limit,
        offset=offset,
    )


@router.get("/{lead_id}/transitions", response_model=list[str])
async def get_available_transitions(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> list[str]:
    return await service.get_available_transitions(lead_id=lead_id, user=user)


@router.post("/{lead_id}/transition", response_model=LeadTransitionResponse)
async def transition_lead_status(
    lead_id: int,
    body: LeadTransitionRequest,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
) -> LeadTransitionResponse:
    """Canonical lead lifecycle transition. FastAPI is the single writer for lead status."""
    lead = await service._get_lead_or_404(lead_id)
    if not await service._repository.can_mutate_lead(user, lead):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Only entering Paid ₹196 is payment-gated here; later stages must stay unlocked.
    if body.target_status in _PAYMENT_REQUIRED_STATUSES and user.role != "admin":
        if lead.payment_status != "approved":
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Payment proof must be approved before moving to this status.",
            )

    result = await service.transition_lead_status(lead_id=lead_id, body=body, user=user)
    return result


@watch_router.get("/watch/batch/{slot}/{v}/payload", response_model=BatchWatchPageData)
async def watch_batch_video_payload(
    slot: str,
    v: int,
    session: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(...),
) -> BatchWatchPageData:
    if slot not in _BATCH_SLOTS or v not in (1, 2):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid link")

    link, lead = await _resolve_batch_watch_context(session=session, slot=slot, token=token)
    video_url = await _resolve_batch_video_url(session, slot, v)
    day_number = _batch_day_number(slot)
    submission = (
        await session.execute(
            select(BatchDaySubmission).where(
                BatchDaySubmission.lead_id == lead.id,
                BatchDaySubmission.slot == slot,
            )
        )
    ).scalar_one_or_none()
    day2_evaluation_ready = bool(
        day_number == 2 and getattr(lead, "d2_morning", False) and getattr(lead, "d2_afternoon", False) and getattr(lead, "d2_evening", False)
    )

    lead_first_name = (lead.name or "").split()[0] if lead.name else "there"
    slot_label = _batch_slot_label(slot)
    return BatchWatchPageData(
        token=link.token,
        slot=slot,
        version=v,
        day_number=day_number,
        slot_label=slot_label,
        title=f"Day {day_number} {slot_label} Batch",
        subtitle=(
            "Watch both videos inside Myle and upload your notes, voice note, video, or message here. After the final Day 2 batch, the business evaluation link is shared separately."
            if day_number == 2
            else "Watch your batch inside Myle with the same premium experience throughout."
        ),
        lead_name=lead_first_name,
        youtube_url=video_url,
        video_id=_youtube_video_id(video_url),
        watch_complete=bool(getattr(lead, slot, False)),
        day2_evaluation_ready=day2_evaluation_ready,
        submission_enabled=day_number == 2,
        submission=_to_batch_submission_public(submission),
    )


@watch_router.get("/watch/batch/{slot}/{v}")
async def watch_batch_video(
    slot: str,
    v: int,
    token: str | None = Query(default=None),
) -> RedirectResponse:
    if slot not in _BATCH_SLOTS or v not in (1, 2):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid link")
    query = f"?token={token.strip()}" if token and token.strip() else ""
    return RedirectResponse(url=f"/watch/batch/{slot}/{v}{query}", status_code=http_status.HTTP_307_TEMPORARY_REDIRECT)


@watch_router.post("/watch/batch/{slot}/submission", response_model=BatchWatchSubmissionPublic)
async def submit_batch_day_submission(
    slot: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(...),
    notes_text: str | None = Form(default=None),
    notes_file: UploadFile | None = File(default=None),
    voice_file: UploadFile | None = File(default=None),
    video_file: UploadFile | None = File(default=None),
) -> BatchWatchSubmissionPublic:
    if slot not in _BATCH_SLOTS:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid slot")

    day_number = _batch_day_number(slot)
    if day_number != 2:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Submissions are available only on Day 2 batch pages",
        )

    clean_text = (notes_text or "").strip()
    if not clean_text and not notes_file and not voice_file and not video_file:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Add notes, voice, or video before submitting",
        )

    link, lead = await _resolve_batch_watch_context(session=session, slot=slot, token=token)
    submission = (
        await session.execute(
            select(BatchDaySubmission).where(
                BatchDaySubmission.lead_id == lead.id,
                BatchDaySubmission.slot == slot,
            )
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if submission is None:
        submission = BatchDaySubmission(
            lead_id=lead.id,
            batch_share_link_id=link.id,
            day_number=day_number,
            slot=slot,
            submitted_at=now,
        )
        session.add(submission)
    else:
        submission.batch_share_link_id = link.id
        submission.submitted_at = now

    if notes_file is not None:
        submission.notes_url = await save_batch_submission_notes_file(lead.id, slot, notes_file)
    if voice_file is not None:
        submission.voice_note_url = await save_batch_submission_voice_file(lead.id, slot, voice_file)
    if video_file is not None:
        submission.video_url = await save_batch_submission_video_file(lead.id, slot, video_file)
    if clean_text:
        submission.notes_text = clean_text

    await session.commit()
    return _to_batch_submission_public(submission) or BatchWatchSubmissionPublic()


@watch_router.post("/watch/batch/complete")
async def complete_batch_video_watch(
    payload: dict,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    token = str(payload.get("token") or "").strip()
    slot = str(payload.get("slot") or "").strip()
    if not token or slot not in _BATCH_SLOTS:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid payload")
    link = (
        await session.execute(
            select(BatchShareLink).where(BatchShareLink.token == token)
        )
    ).scalar_one_or_none()
    if link is None or link.slot != slot:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid token")
    lead = await session.get(Lead, link.lead_id)
    if lead is None or lead.deleted_at is not None or lead.in_pool:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")

    now = datetime.now(timezone.utc)
    changed = False
    if not bool(getattr(lead, slot, False)):
        setattr(lead, slot, True)
        _sync_batch_completion_timestamps(lead, now)
        enqueue_lead_shadow_upsert(session, lead)
        changed = True
    if not link.used:
        link.used = True
        link.used_at = now
        changed = True

    if changed:
        await session.flush()
        await session.commit()
        await notify_topics("leads", "workboard")
    return {"ok": True}
