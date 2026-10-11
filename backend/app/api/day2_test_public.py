"""Public (no-auth) Day 2 cheat-proof test endpoints — driven by a unique link token.

Mounted under ``/api/test/d2`` (NOT ``/api/v1``). The prospect opens these on their own
phone; it unlocks only with the lead's own number and then stays on that phone (a device
cookie, see prospect_links). All anti-cheat + scoring is server-side (see day2_test_service).

The ``/api`` prefix is deliberate: in the unified deploy the browser-facing page lives at
``/test/d2/{token}`` (served by the SPA fallback → React ``Day2TestPage``). Keeping the data
API under ``/api/...`` avoids a path collision where the API would otherwise intercept the
page navigation and return raw JSON to the prospect.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import day2_test_service as svc
from app.services import prospect_links

router = APIRouter(prefix="/api/test/d2", tags=["day2-test-public"])


class StartBody(BaseModel):
    name: str = Field(..., max_length=255)
    phone: str = Field(..., max_length=32)


class AnswerBody(BaseModel):
    question_index: int = Field(..., ge=0)
    choice_index: int = Field(..., ge=0, le=3)


class EventBody(BaseModel):
    type: str = Field(..., max_length=16)


def _handle(exc: svc.Day2TestError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _prospect_device(request: Request) -> str | None:
    """The prospect's device; a browser logged in to Myle is staff and may not take the test."""
    if prospect_links.is_staff_browser(request):
        raise HTTPException(status_code=403, detail=prospect_links.STAFF_MESSAGE)
    return prospect_links.device_id(request)


@router.get("/{token}", include_in_schema=False)
async def get_state(
    token: str, request: Request, session: Annotated[AsyncSession, Depends(get_db)]
):
    device = _prospect_device(request)
    try:
        return await svc.get_state(session, token, device=device)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/start", include_in_schema=False)
async def start(
    token: str,
    body: StartBody,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    _prospect_device(request)
    device = prospect_links.ensure_device_cookie(request, response)
    try:
        return await svc.start(
            session, token, prospect_name=body.name, prospect_phone=body.phone, device=device
        )
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/answer", include_in_schema=False)
async def answer(
    token: str,
    body: AnswerBody,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    device = _prospect_device(request)
    try:
        return await svc.answer(
            session,
            token,
            question_index=body.question_index,
            choice_index=body.choice_index,
            device=device,
        )
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/event", include_in_schema=False)
async def event(
    token: str,
    body: EventBody,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    device = _prospect_device(request)
    try:
        return await svc.record_event(session, token, event_type=body.type, device=device)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/finalize", include_in_schema=False)
async def finalize(
    token: str, request: Request, session: Annotated[AsyncSession, Depends(get_db)]
):
    device = _prospect_device(request)
    try:
        return await svc.finalize(session, token, device=device)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.get("/{token}/certificate", include_in_schema=False)
async def certificate(
    token: str, request: Request, session: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        pdf, filename = await svc.certificate_pdf(session, token, base_url=str(request.base_url))
    except svc.Day2TestError as exc:
        raise _handle(exc)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
