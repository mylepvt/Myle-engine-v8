"""Gate Assistant — one GET, server-computed checklist (see `app.services.gate_assistant`)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.gate_assistant import GateAssistantResponse
from app.services.gate_assistant import build_gate_assistant

router = APIRouter()


@router.get("", response_model=GateAssistantResponse)
async def get_gate_assistant(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> GateAssistantResponse:
    return await build_gate_assistant(session, user)
