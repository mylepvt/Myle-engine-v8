import secrets
from datetime import datetime, timezone
from typing import Annotated, Optional
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import get_db
from app.api.deps import AuthUser, require_auth_user
from app.core.realtime_hub import notify_topics
from app.models.app_setting import AppSetting
from app.models.batch_share_link import BatchShareLink
from app.models.lead import Lead
from app.schemas.call_events import CallEventCreate, CallEventListResponse, CallEventPublic
from app.schemas.leads import (
    AllLeadsResponse,
    BatchShareUrlRequest,
    BatchShareUrlResponse,
    LeadCreate,
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
from app.services.all_leads_service import AllLeadsService, get_all_leads_service
from app.services.leads_service import LeadsService, get_leads_service
from app.services.downline import is_user_in_downline_of
from app.services.leads_service import _sync_batch_completion_timestamps
from app.api.v1.crm_sync import sync_lead_created, sync_lead_claimed
from app.core.auth_cookie import MYLE_ACCESS_COOKIE

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
_YOUTUBE_ID_RE = re.compile(r"(?:youtu\.be/|v=|/embed/|/shorts/)([A-Za-z0-9_-]{11})")


async def _get_setting_value(session: AsyncSession, key: str) -> str:
    row = (
        await session.execute(select(AppSetting.value).where(AppSetting.key == key))
    ).scalar_one_or_none()
    return str(row or "").strip()


def _youtube_embed_url(raw_url: str) -> str | None:
    m = _YOUTUBE_ID_RE.search(raw_url)
    if not m:
        return None
    vid = m.group(1)
    return f"https://www.youtube.com/embed/{vid}?autoplay=1&enablejsapi=1&rel=0"


async def _actor_may_share_batch_link(
    *,
    session: AsyncSession,
    user: AuthUser,
    lead: Lead,
    slot: str,
) -> bool:
    if user.role == "admin":
        return True
    if slot.startswith("d2_"):
        return False
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
    )


@router.post("", response_model=LeadPublic, status_code=http_status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    lead = await service.create_lead(body=body, user=user)
    token = request.cookies.get(MYLE_ACCESS_COOKIE, "")
    if token:
        background_tasks.add_task(
            sync_lead_created,
            legacy_id=lead.id,
            name=lead.name,
            phone=getattr(lead, "phone", None),
            pipeline_kind="PERSONAL",
            token=token,
        )
    return lead


@router.post("/{lead_id}/claim", response_model=LeadPublic)
async def claim_lead(
    lead_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    lead = await service.claim_lead(lead_id=lead_id, user=user)
    token = request.cookies.get(MYLE_ACCESS_COOKIE, "")
    if token:
        import secrets as _secrets
        background_tasks.add_task(
            sync_lead_claimed,
            legacy_id=lead_id,
            idempotency_key=f"claim-{lead_id}-{user.user_id}-{_secrets.token_hex(6)}",
            pipeline_kind="PERSONAL",
            token=token,
        )
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
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.complete_mindset_lock(lead_id=lead_id, user=user)


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
        watch_url_v1=f"{base}/api/v1/watch/batch/{slot}/1?token={token}",
        watch_url_v2=f"{base}/api/v1/watch/batch/{slot}/2?token={token}",
    )


@router.patch("/{lead_id}", response_model=LeadPublic)
async def update_lead(
    lead_id: int,
    body: LeadUpdate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.update_lead(lead_id=lead_id, body=body, user=user)


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
    return await service.transition_lead_status(lead_id=lead_id, body=body, user=user)


@watch_router.get("/watch/batch/{slot}/{v}")
async def watch_batch_video(
    slot: str,
    v: int,
    session: Annotated[AsyncSession, Depends(get_db)],
    token: str | None = Query(default=None),
) -> RedirectResponse:
    if slot not in _BATCH_SLOTS or v not in (1, 2):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid link")

    video_url = await _get_setting_value(session, f"batch_{slot}_v{v}")
    if not video_url and v == 1:
        video_url = await _get_setting_value(session, f"batch_{slot}_v2")
    if not video_url:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Video not configured")
    embed_url = _youtube_embed_url(video_url)
    if not embed_url:
        return RedirectResponse(url=video_url, status_code=http_status.HTTP_307_TEMPORARY_REDIRECT)
    tok = (token or "").strip()
    html = f"""<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:900px;margin:16px auto;padding:0 12px">
    <h3 style="margin:0 0 10px 0">Batch video</h3>
    <div id="player"></div>
    <p id="state" style="opacity:.8;font-size:13px">Watch complete hone par auto mark ho jayega.</p>
  </div>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    const token = {tok!r};
    const slot = {slot!r};
    let marked = false;
    function markComplete() {{
      if (marked || !token) return;
      marked = true;
      fetch('/api/v1/watch/batch/complete', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ token, slot }})
      }}).then(r => r.json()).then(() => {{
        const el = document.getElementById('state');
        if (el) el.textContent = 'Completed ✅';
      }}).catch(() => {{
        const el = document.getElementById('state');
        if (el) el.textContent = 'Completion update failed. Please retry.';
      }});
    }}
    window.onYouTubeIframeAPIReady = function() {{
      new YT.Player('player', {{
        width: '100%',
        videoId: {embed_url.split('/embed/')[1].split('?')[0]!r},
        playerVars: {{ autoplay: 1, rel: 0 }},
        events: {{
          onStateChange: function(ev) {{
            if (ev.data === YT.PlayerState.ENDED) markComplete();
          }}
        }}
      }});
    }};
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)


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
            select(BatchShareLink).where(
                BatchShareLink.token == token,
                BatchShareLink.used.is_(False),
            )
        )
    ).scalar_one_or_none()
    if link is None or link.slot != slot:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid token")
    lead = await session.get(Lead, link.lead_id)
    if lead is None or lead.deleted_at is not None or lead.in_pool:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    setattr(lead, slot, True)
    _sync_batch_completion_timestamps(lead, datetime.now(timezone.utc))
    link.used = True
    link.used_at = datetime.now(timezone.utc)
    await session.commit()
    await notify_topics("leads", "workboard")
    return {"ok": True}
