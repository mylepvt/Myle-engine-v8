from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.schemas.automation import (
    AutomationActionLogPublic,
    AutomationEvaluateResponse,
    AutomationRuleCreate,
    AutomationRulePublic,
    AutomationRuleUpdate,
)
from app.services import automation_service as svc

router = APIRouter()


# ── RULES CRUD ──────────────────────────────────────────────────────────────

@router.get("/admin/automation-rules", response_model=list[AutomationRulePublic])
async def list_rules(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.list_rules(session)


@router.post("/admin/automation-rules", response_model=AutomationRulePublic, status_code=http_status.HTTP_201_CREATED)
async def create_rule(
    body: AutomationRuleCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.create_rule(session, body.model_dump())


@router.patch("/admin/automation-rules/{rule_id}", response_model=AutomationRulePublic)
async def update_rule(
    rule_id: int,
    body: AutomationRuleUpdate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    result = await svc.update_rule(session, rule_id, body.model_dump(exclude_unset=True))
    if result is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return result


@router.delete("/admin/automation-rules/{rule_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    if not await svc.delete_rule(session, rule_id):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Rule not found")


# ── EVALUATION ──────────────────────────────────────────────────────────────

@router.post("/admin/automation/evaluate", response_model=AutomationEvaluateResponse)
async def evaluate_all(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.evaluate_all_rules(session)


# ── ACTION LOGS ─────────────────────────────────────────────────────────────

@router.get("/admin/automation/logs", response_model=list[AutomationActionLogPublic])
async def list_logs(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
):
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")
    return await svc.list_action_logs(session, limit)
