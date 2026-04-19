from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.services.org_tree_service import OrgTreeService

router = APIRouter()


class OrgTreeNode(BaseModel):
    id: int
    name: str
    fbo_id: str
    role: str
    team_size: int = 0  # total descendants count
    children: list["OrgTreeNode"] = Field(default_factory=list)


OrgTreeNode.model_rebuild()


class OrgTreeResponse(BaseModel):
    items: list[OrgTreeNode] = Field(default_factory=list)
    total: int = 0


@router.get("/tree", response_model=OrgTreeResponse)
async def get_org_tree(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = Query(
        default=False,
        description="Include blocked/non-approved/non-active users in the org tree.",
    ),
) -> OrgTreeResponse:
    if user.role not in ("admin", "leader", "team"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )

    service = OrgTreeService(session)
    items = await service.get_tree_for_user(
        actor_user_id=user.user_id,
        actor_role=user.role,
        include_inactive=include_inactive,
    )
    return OrgTreeResponse(
        items=[OrgTreeNode.model_validate(item) for item in items],
        total=len(items),
    )
