"""Payment proof upload and approval system."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile, File, Form
from starlette import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.payment_validator import (
    STANDARD_AMOUNT_CENTS,
    require_approver_role,
    validate_image_upload,
)
from app.models.payment import Payment, PaymentStatus
from app.repositories.payment_repository import PaymentRepository
from app.schemas.pipeline import PaymentProofRequest, PaymentProofResponse
from app.services.payment_service import PaymentService

router = APIRouter()


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

    service = PaymentService(session)

    try:
        proof_url = await service.upload_payment_proof(proof_file)

        success, message = await service.process_payment_proof(
            lead_id=lead_id,
            payment_amount_cents=payment_amount_cents,
            proof_url=proof_url,
            notes=notes,
            uploaded_by_user_id=user.user_id,
        )

        if not success:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=message)

        return PaymentProofResponse(
            success=True,
            message=message,
            payment_status="pending_approval",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload payment proof: {str(e)}",
        )


@router.post("/payments/proof/approve")
async def approve_payment_proof(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentProofResponse:
    """Approve payment proof (leader/admin only)."""
    require_approver_role(user)
    service = PaymentService(session)

    try:
        success, message = await service.approve_payment_proof(
            lead_id=lead_id,
            approved_by_user_id=user.user_id,
        )

        if not success:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=message)

        return PaymentProofResponse(success=True, message=message, payment_status="approved")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve payment proof: {str(e)}",
        )


@router.post("/payments/proof/reject")
async def reject_payment_proof(
    lead_id: int,
    rejection_reason: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentProofResponse:
    """Reject payment proof (leader/admin only)."""
    require_approver_role(user)
    service = PaymentService(session)

    try:
        success, message = await service.reject_payment_proof(
            lead_id=lead_id,
            rejection_reason=rejection_reason,
            rejected_by_user_id=user.user_id,
        )

        if not success:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=message)

        return PaymentProofResponse(success=True, message=message, payment_status="rejected")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject payment proof: {str(e)}",
        )


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
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pending payments: {str(e)}",
        )


@router.post("/payments/create")
async def create_payment_order(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Create Razorpay order for payment.

    Rules:
    - Lead must be assigned to user
    - No active payment already exists
    - Amount is fixed (₹196 enrollment fee)
    """
    from decimal import Decimal

    from app.services.razorpay_client import RazorpayClient, RazorpayError

    repo = PaymentRepository(session)

    try:
        lead = await repo.get_lead_assigned_to_user(lead_id, user.user_id)
        if not lead:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Lead not found or not assigned to you",
            )

        if await repo.get_active_payment(lead_id):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Payment already exists for this lead",
            )

        fixed_amount = Decimal(STANDARD_AMOUNT_CENTS) / 100  # ₹196.00

        razorpay_client = RazorpayClient()
        order = await razorpay_client.create_order(
            amount=fixed_amount,
            currency="INR",
            receipt=f"lead_{lead_id}_{user.user_id}",
            notes={"lead_id": lead_id, "user_id": user.user_id, "purpose": "enrollment_fee"},
        )

        payment = await repo.save(
            Payment(
                lead_id=lead_id,
                user_id=user.user_id,
                razorpay_order_id=order["id"],
                amount=fixed_amount,
                currency="INR",
                status=PaymentStatus.INITIATED,
                gateway_response=order,
                idempotency_key=f"order_{order['id']}",
            )
        )
        await session.commit()

        return {
            "success": True,
            "order_id": order["id"],
            "amount": float(fixed_amount),
            "currency": "INR",
            "key_id": razorpay_client.client.auth[0],
            "payment_id": str(payment.id),
        }

    except HTTPException:
        raise
    except RazorpayError as e:
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment gateway error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create payment: {str(e)}",
        )


@router.get("/payments/{payment_id}/status")
async def get_payment_status(
    payment_id: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get payment status (real-time from Razorpay if needed)."""
    from app.services.razorpay_client import RazorpayClient

    repo = PaymentRepository(session)

    try:
        payment = await repo.get_payment_by_any_id(payment_id)
        if not payment:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="Payment not found",
            )

        if user.role == "team" and payment.user_id != user.user_id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this payment",
            )

        gateway_status = None
        if payment.razorpay_payment_id:
            try:
                razorpay_client = RazorpayClient()
                gateway_data = await razorpay_client.fetch_payment_from_gateway(
                    payment.razorpay_payment_id
                )
                gateway_status = gateway_data.get("status")
            except Exception:
                pass

        return {
            "payment_id": str(payment.id),
            "razorpay_order_id": payment.razorpay_order_id,
            "razorpay_payment_id": payment.razorpay_payment_id,
            "status": payment.status,
            "gateway_status": gateway_status,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
            "verified_at": payment.verified_at.isoformat() if payment.verified_at else None,
            "is_locked": payment.is_locked(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get payment status: {str(e)}",
        )


@router.post("/payments/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    x_razorpay_signature: str = Header(None, alias="X-Razorpay-Signature"),
) -> dict:
    """
    Razorpay webhook handler.

    CRITICAL:
    - Signature validation is MANDATORY
    - Idempotent processing
    - No manual updates allowed

    Events handled:
    - payment.captured → success → verified → locked
    - payment.failed → failed
    - refund.processed → refunded
    """
    import logging

    from app.services.razorpay_client import RazorpayClient

    try:
        body = await request.body()

        if not x_razorpay_signature:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Missing X-Razorpay-Signature header",
            )

        razorpay_client = RazorpayClient()
        signature_valid = razorpay_client.verify_webhook_signature(
            webhook_body=body,
            signature=x_razorpay_signature,
        )

        payload = await request.json()
        event_type = payload.get("event")
        event_id = payload.get("id")

        if not event_type or not event_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook payload",
            )

        payment = await razorpay_client.process_webhook(
            session=session,
            event_type=event_type,
            event_data=payload,
            event_id=event_id,
            signature_valid=signature_valid,
        )

        await session.commit()

        if payment:
            return {
                "success": True,
                "payment_id": str(payment.id),
                "status": payment.status,
                "signature_valid": signature_valid,
            }
        return {
            "success": False,
            "reason": "Signature invalid or event already processed",
            "signature_valid": signature_valid,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Webhook processing error: {str(e)}")
        return {"success": False, "error": "Processing failed (logged)", "retry": False}
