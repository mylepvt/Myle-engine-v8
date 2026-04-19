"""Payment proof upload and approval system."""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from starlette import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.realtime_hub import notify_topics
from app.core.payment_validator import (
    require_admin_role,
    require_approver_role,
    validate_payment_amount,
    validate_image_upload,
)
from app.schemas.payments import PaymentProofResponse
from app.services.payment_service import PaymentService

router = APIRouter()
logger = logging.getLogger(__name__)


def _internal_server_error(message: str, exc: Exception) -> HTTPException:
    logger.exception(message, exc_info=exc)
    return HTTPException(
        status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Internal server error",
    )


@router.post("/payments/proof/upload", response_model=PaymentProofResponse)
async def upload_payment_proof(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    proof_file: UploadFile = File(...),
    lead_id: int = Form(...),
    payment_amount_cents: int = Form(...),
    notes: str = Form(None),
) -> PaymentProofResponse:
    """Upload payment proof for a lead."""
    validate_image_upload(proof_file.content_type)
    validate_payment_amount(payment_amount_cents)

    service = PaymentService(session)

    try:
        proof_url = await service.upload_payment_proof(proof_file, lead_id=lead_id)
        success, message = await service.process_payment_proof(
            lead_id=lead_id,
            payment_amount_cents=payment_amount_cents,
            proof_url=proof_url,
            notes=notes,
            uploaded_by_user_id=user.user_id,
            uploaded_by_role=user.role,
        )

        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )

        await notify_topics("team", "leads")

        return PaymentProofResponse(
            success=True,
            message=message,
            payment_status="proof_uploaded",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except HTTPException:
        raise
    except Exception as e:
        raise _internal_server_error("Failed to upload payment proof", e)


@router.post("/payments/proof/approve")
async def approve_payment_proof(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentProofResponse:
    """Approve payment proof (admin only)."""
    require_admin_role(user)
    service = PaymentService(session)

    try:
        success, message = await service.approve_payment_proof(
            lead_id=lead_id,
            approved_by_user_id=user.user_id,
            approved_by_role=user.role,
        )

        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )

        await notify_topics("team", "leads")

        return PaymentProofResponse(
            success=True,
            message=message,
            payment_status="approved",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _internal_server_error("Failed to approve payment proof", e)


@router.post("/payments/proof/reject")
async def reject_payment_proof(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    rejection_reason: Optional[str] = None,
) -> PaymentProofResponse:
    """Reject payment proof (admin only)."""
    require_admin_role(user)
    service = PaymentService(session)

    try:
        success, message = await service.reject_payment_proof(
            lead_id=lead_id,
            rejection_reason=(rejection_reason or "").strip() or "Rejected by reviewer",
            rejected_by_user_id=user.user_id,
            rejected_by_role=user.role,
        )

        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=message,
            )

        await notify_topics("team", "leads")

        return PaymentProofResponse(
            success=True,
            message=message,
            payment_status="rejected",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _internal_server_error("Failed to reject payment proof", e)


@router.get("/payments/proof/pending")
async def get_pending_payment_proofs(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Get pending payment proofs for approval (leader/admin only)."""
    require_approver_role(user)
    service = PaymentService(session)

    try:
        return await service.get_pending_payment_proofs(user.user_id, user.role)
    except Exception as e:
        raise _internal_server_error("Failed to fetch pending payment proofs", e)

