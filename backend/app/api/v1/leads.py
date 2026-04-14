from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from starlette import status as http_status

from app.api.deps import AuthUser, require_auth_user
from app.schemas.call_events import CallEventCreate, CallEventListResponse, CallEventPublic
from app.schemas.leads import (
    AllLeadsResponse,
    LeadCreate,
    LeadDetailPublic,
    LeadListResponse,
    LeadPublic,
    LeadTransitionRequest,
    LeadTransitionResponse,
    LeadUpdate,
)
from app.services.all_leads_service import AllLeadsService, get_all_leads_service
from app.services.leads_service import LeadsService, get_leads_service

router = APIRouter()

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


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
) -> LeadListResponse:
    return await service.list_leads(
        user=user,
        limit=limit,
        offset=offset,
        q=q,
        status=status,
        archived_only=archived_only,
        deleted_only=deleted_only,
    )


@router.post("", response_model=LeadPublic, status_code=http_status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.create_lead(body=body, user=user)


@router.post("/{lead_id}/claim", response_model=LeadPublic)
async def claim_lead(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    service: Annotated[LeadsService, Depends(get_leads_service)],
):
    return await service.claim_lead(lead_id=lead_id, user=user)


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
