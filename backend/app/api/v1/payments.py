"""Payment proof upload and approval system."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from starlette import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead import Lead
from app.schemas.payments import PaymentProofResponse
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
    if user.role not in ["leader", "admin"]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only leader and admin can approve payments",
        )
    
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

        return PaymentProofResponse(
            success=True,
            message=message,
            payment_status="approved",
        )
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
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    rejection_reason: Optional[str] = None,
) -> PaymentProofResponse:
    """Reject payment proof (leader/admin only)."""
    if user.role not in ["leader", "admin"]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only leader and admin can reject payments",
        )

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

        return PaymentProofResponse(
            success=True,
            message=message,
            payment_status="rejected",
        )
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
    if user.role not in ["leader", "admin"]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only leader and admin can view pending payments",
        )
    
    service = PaymentService(session)
    
    try:
        pending_proofs = await service.get_pending_payment_proofs(user.user_id, user.role)
        return pending_proofs
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
    from sqlalchemy import select, and_
    from app.models.payment import Payment, PaymentStatus
    from app.services.razorpay_client import RazorpayClient, RazorpayError
    
    FIXED_AMOUNT = Decimal("196.00")  # Enrollment fee
    
    try:
        # Check if lead exists and is assigned to user
        lead_result = await session.execute(
            select(Lead).where(
                and_(
                    Lead.id == lead_id,
                    Lead.assigned_to_user_id == user.user_id
                )
            )
        )
        lead = lead_result.scalar_one_or_none()
        
        if not lead:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Lead not found or not assigned to you"
            )
        
        # Check if payment already exists (active)
        existing_payment = await session.execute(
            select(Payment).where(
                and_(
                    Payment.lead_id == lead_id,
                    Payment.status.in_([PaymentStatus.INITIATED, PaymentStatus.VERIFIED])
                )
            )
        )
        if existing_payment.scalar_one_or_none():
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Payment already exists for this lead"
            )
        
        # Create Razorpay order
        razorpay_client = RazorpayClient()
        order = await razorpay_client.create_order(
            amount=FIXED_AMOUNT,
            currency="INR",
            receipt=f"lead_{lead_id}_{user.user_id}",
            notes={
                "lead_id": lead_id,
                "user_id": user.user_id,
                "purpose": "enrollment_fee"
            }
        )
        
        # Create payment record
        payment = Payment(
            lead_id=lead_id,
            user_id=user.user_id,
            razorpay_order_id=order["id"],
            amount=FIXED_AMOUNT,
            currency="INR",
            status=PaymentStatus.INITIATED,
            gateway_response=order,
            idempotency_key=f"order_{order['id']}"
        )
        session.add(payment)
        await session.commit()
        
        return {
            "success": True,
            "order_id": order["id"],
            "amount": float(FIXED_AMOUNT),
            "currency": "INR",
            "key_id": razorpay_client.client.auth[0],  # Public key
            "payment_id": str(payment.id)
        }
        
    except HTTPException:
        raise
    except RazorpayError as e:
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment gateway error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create payment: {str(e)}"
        )


@router.get("/payments/{payment_id}/status")
async def get_payment_status(
    payment_id: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get payment status (real-time from Razorpay if needed)."""
    from sqlalchemy import select, or_
    from app.models.payment import Payment
    from app.services.razorpay_client import RazorpayClient
    
    try:
        # Find payment
        payment_result = await session.execute(
            select(Payment).where(
                or_(
                    Payment.id == payment_id,
                    Payment.razorpay_order_id == payment_id,
                    Payment.razorpay_payment_id == payment_id
                )
            )
        )
        payment = payment_result.scalar_one_or_none()
        
        if not payment:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="Payment not found"
            )
        
        # Check ownership (user can only see their own, leader/admin can see all)
        if user.role == "team" and payment.user_id != user.user_id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this payment"
            )
        
        # Fetch real-time status from Razorpay if payment_id exists
        gateway_status = None
        if payment.razorpay_payment_id:
            try:
                razorpay_client = RazorpayClient()
                gateway_data = await razorpay_client.fetch_payment_from_gateway(
                    payment.razorpay_payment_id
                )
                gateway_status = gateway_data.get("status")
            except Exception:
                pass  # Use local status if gateway fetch fails
        
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
            "is_locked": payment.is_locked()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get payment status: {str(e)}"
        )


# ==================== WEBHOOK HANDLER ====================

from fastapi import Request, Header

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
    from app.services.razorpay_client import RazorpayClient
    
    try:
        # Get raw body for signature validation
        body = await request.body()
        
        if not x_razorpay_signature:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Missing X-Razorpay-Signature header"
            )
        
        # Validate signature
        razorpay_client = RazorpayClient()
        signature_valid = razorpay_client.verify_webhook_signature(
            webhook_body=body,
            signature=x_razorpay_signature
        )
        
        # Parse payload
        payload = await request.json()
        event_type = payload.get("event")
        event_data = payload.get("payload", {})
        event_id = payload.get("id")  # Unique event ID
        
        if not event_type or not event_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook payload"
            )
        
        # Process webhook (idempotent, logged)
        payment = await razorpay_client.process_webhook(
            session=session,
            event_type=event_type,
            event_data=payload,
            event_id=event_id,
            signature_valid=signature_valid
        )
        
        # Commit transaction
        await session.commit()
        
        if payment:
            return {
                "success": True,
                "payment_id": str(payment.id),
                "status": payment.status,
                "signature_valid": signature_valid
            }
        else:
            return {
                "success": False,
                "reason": "Signature invalid or event already processed",
                "signature_valid": signature_valid
            }
        
    except HTTPException:
        raise
    except Exception as e:
        # Log error but return 200 to prevent Razorpay retries
        # (we've already logged the webhook event)
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Webhook processing error: {str(e)}")
        
        return {
            "success": False,
            "error": "Processing failed (logged)",
            "retry": False  # Don't retry - manual intervention needed
        }