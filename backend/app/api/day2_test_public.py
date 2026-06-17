"""Public (no-auth) Day 2 cheat-proof test endpoints — driven by a unique link token.

Mounted under ``/api/test/d2`` (NOT ``/api/v1``). The prospect opens these on their own
phone; there is no session/cookie. All anti-cheat + scoring is server-side (see
day2_test_service).

The ``/api`` prefix is deliberate: in the unified deploy the browser-facing page lives at
``/test/d2/{token}`` (served by the SPA fallback → React ``Day2TestPage``). Keeping the data
API under ``/api/...`` avoids a path collision where the API would otherwise intercept the
page navigation and return raw JSON to the prospect.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import day2_test_service as svc

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


@router.get("/{token}", include_in_schema=False)
async def get_state(token: str, session: Annotated[AsyncSession, Depends(get_db)]):
    try:
        return await svc.get_state(session, token)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/start", include_in_schema=False)
async def start(
    token: str, body: StartBody, session: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        return await svc.start(session, token, prospect_name=body.name, prospect_phone=body.phone)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/answer", include_in_schema=False)
async def answer(
    token: str, body: AnswerBody, session: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        return await svc.answer(
            session, token, question_index=body.question_index, choice_index=body.choice_index
        )
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/event", include_in_schema=False)
async def event(
    token: str, body: EventBody, session: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        return await svc.record_event(session, token, event_type=body.type)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.post("/{token}/finalize", include_in_schema=False)
async def finalize(token: str, session: Annotated[AsyncSession, Depends(get_db)]):
    try:
        return await svc.finalize(session, token)
    except svc.Day2TestError as exc:
        raise _handle(exc)


@router.get("/{token}/certificate", include_in_schema=False)
async def certificate(token: str, session: Annotated[AsyncSession, Depends(get_db)]):
    try:
        pdf, filename = await svc.certificate_pdf(session, token)
    except svc.Day2TestError as exc:
        raise _handle(exc)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
