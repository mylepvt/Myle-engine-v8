"""Member-facing lead-capture link management (authed). Mounted under ``/api/v1``."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.capture_categories import category_label, category_message
from app.models.lead_capture_link import LeadCaptureLink
from app.schemas.capture import (
    CaptureLinkCreate,
    CaptureLinkListResponse,
    CaptureLinkPublic,
    CaptureMessageUpdate,
    CategoryOption,
)
from app.services import capture_service as svc
from app.services.capture_poster_storage import save_capture_poster_file

router = APIRouter(prefix="/capture", tags=["capture-links"])


def _to_public(link: LeadCaptureLink) -> CaptureLinkPublic:
    return CaptureLinkPublic(
        id=link.id,
        token=link.token,
        category=link.category,
        category_label=category_label(link.category),
        active=link.active,
        leads_count=link.leads_count or 0,
        created_at=link.created_at,
        poster_url=link.poster_url,
        views=link.views or 0,
        custom_message=link.custom_message,
        share_message=link.custom_message or category_message(link.category),
    )


@router.get("/categories", response_model=list[CategoryOption])
async def get_categories(_user: Annotated[AuthUser, Depends(require_auth_user)]):
    return [CategoryOption(**c) for c in svc.list_categories()]


@router.get("/links", response_model=CaptureLinkListResponse)
async def list_links(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    links = await svc.list_my_links(session, owner_user_id=user.user_id)
    return CaptureLinkListResponse(links=[_to_public(link) for link in links])


@router.post("/links", response_model=CaptureLinkPublic, status_code=201)
async def create_link(
    body: CaptureLinkCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        link = await svc.create_link(session, owner_user_id=user.user_id, category=body.category)
    except svc.CaptureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return _to_public(link)


@router.delete("/links/{link_id}", response_model=CaptureLinkPublic)
async def deactivate_link(
    link_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        link = await svc.deactivate_link(session, owner_user_id=user.user_id, link_id=link_id)
    except svc.CaptureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return _to_public(link)


@router.post("/links/{link_id}/poster", response_model=CaptureLinkPublic)
async def upload_poster(
    link_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    poster: UploadFile = File(...),
):
    try:
        link = await svc.get_owned_link(session, owner_user_id=user.user_id, link_id=link_id)
    except svc.CaptureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    ok, result = await save_capture_poster_file(link_id=link.id, file=poster)
    if not ok:
        raise HTTPException(status_code=400, detail=result)
    link = await svc.set_poster_url(session, link=link, poster_url=result)
    return _to_public(link)


@router.patch("/links/{link_id}/message", response_model=CaptureLinkPublic)
async def update_message(
    link_id: int,
    body: CaptureMessageUpdate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        link = await svc.set_custom_message(
            session, owner_user_id=user.user_id, link_id=link_id, message=body.message
        )
    except svc.CaptureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return _to_public(link)
