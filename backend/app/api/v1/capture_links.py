"""Member-facing lead-capture link management (authed). Mounted under ``/api/v1``."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.capture_categories import category_label
from app.models.lead_capture_link import LeadCaptureLink
from app.schemas.capture import (
    CaptureLinkCreate,
    CaptureLinkListResponse,
    CaptureLinkPublic,
    CategoryOption,
)
from app.services import capture_service as svc

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
    )


@router.get("/categories", response_model=list[CategoryOption])
async def get_categories(_user: Annotated[AuthUser, Depends(require_auth_user)]):
    return [CategoryOption(**c) for c in svc.list_categories()]


@router.get("/links", response_model=CaptureLinkListResponse)
async def list_links(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    links = await svc.list_my_links(session, owner_user_id=user.id)
    return CaptureLinkListResponse(links=[_to_public(link) for link in links])


@router.post("/links", response_model=CaptureLinkPublic, status_code=201)
async def create_link(
    body: CaptureLinkCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        link = await svc.create_link(session, owner_user_id=user.id, category=body.category)
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
        link = await svc.deactivate_link(session, owner_user_id=user.id, link_id=link_id)
    except svc.CaptureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return _to_public(link)
