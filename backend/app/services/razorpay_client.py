"""Razorpay client - production-grade with full security."""

import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Any, Dict, Optional

import razorpay
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.payment import Payment, PaymentStatus, PaymentWebhookEvent
from app.models.lead import Lead
from app.core.config import settings

logger = logging.getLogger(__name__)




class RazorpayClient:
    """
    Production-grade Razorpay client.
    
    Features:
    - Signature validation (mandatory)
    - Idempotency handling
    - Comprehensive logging
    - Error handling
    """
    
    def __init__(self):
        self.client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    
    # ==================== ORDER CREATION ====================
    
    async def create_order(
        self,
        amount: Decimal,
        currency: str = "INR",
        receipt: Optional[str] = None,
        notes: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Create Razorpay order.
        
        Args:
            amount: Amount in smallest currency unit (paise for INR)
            currency: ISO currency code
            receipt: Internal reference
            notes: Additional metadata
            
        Returns:
            Razorpay order object
        """
        try:
            # Convert Decimal to paise (multiply by 100)
            amount_in_paise = int(amount * 100)
            
            order_data = {
                "amount": amount_in_paise,
                "currency": currency,
                "receipt": receipt or f"rcpt_{hashlib.md5(str(amount).encode()).hexdigest()[:10]}",
                "notes": notes or {}
            }
            
            order = self.client.order.create(data=order_data)
            logger.info(f"Razorpay order created: {order['id']}")
            return order
            
        except Exception as e:
            logger.error(f"Razorpay order creation failed: {str(e)}")
            raise RazorpayError(f"Order creation failed: {str(e)}")
    
    # ==================== WEBHOOK SECURITY ====================
    
    def verify_webhook_signature(
        self,
        webhook_body: bytes,
        signature: str
    ) -> bool:
        """
        Verify Razorpay webhook signature.
        
        CRITICAL: Never process webhooks without this validation.
        
        Args:
            webhook_body: Raw request body (bytes)
            signature: X-Razorpay-Signature header
            
        Returns:
            True if signature valid, False otherwise
        """
        try:
            expected_signature = hmac.new(
                key=settings.razorpay_webhook_secret.encode(),
                msg=webhook_body,
                digestmod=hashlib.sha256
            ).hexdigest()
            
            is_valid = hmac.compare_digest(expected_signature, signature)
            
            if not is_valid:
                logger.warning("Razorpay webhook signature INVALID - possible attack")
            else:
                logger.info("Razorpay webhook signature VALID")
            
            return is_valid
            
        except Exception as e:
            logger.error(f"Webhook signature verification error: {str(e)}")
            return False
    
    # ==================== WEBHOOK PROCESSING ====================
    
    async def process_webhook(
        self,
        session: AsyncSession,
        event_type: str,
        event_data: Dict,
        event_id: str,
        signature_valid: bool
    ) -> Optional[Payment]:
        """
        Process Razorpay webhook event.
        
        Args:
            session: Database session
            event_type: payment.captured, payment.failed, etc.
            event_data: Event payload
            event_id: Unique event ID for idempotency
            signature_valid: Whether signature passed validation
            
        Returns:
            Updated Payment object or None
        """
        # Log event first (always, for audit)
        webhook_event = PaymentWebhookEvent(
            event_type=event_type,
            event_id=event_id,
            payload=event_data,
            signature_valid=signature_valid
        )
        session.add(webhook_event)
        await session.flush()
        
        # Reject if signature invalid
        if not signature_valid:
            logger.error(f"Webhook {event_id} rejected - invalid signature")
            webhook_event.mark_processed("Signature validation failed")
            return None
        
        # Check idempotency - have we seen this event before?
        existing_event = await session.execute(
            select(PaymentWebhookEvent)
            .where(PaymentWebhookEvent.event_id == event_id)
            .where(PaymentWebhookEvent.processed == True)
        )
        if existing_event.scalar_one_or_none():
            logger.info(f"Webhook {event_id} already processed - skipping (idempotent)")
            webhook_event.mark_processed("Already processed (idempotent)")
            return None
        
        # Extract payment details from event
        payment_id = event_data.get("payload", {}).get("payment", {}).get("entity", {}).get("id")
        order_id = event_data.get("payload", {}).get("payment", {}).get("entity", {}).get("order_id")
        
        if not payment_id or not order_id:
            logger.error(f"Webhook {event_id} missing payment/order ID")
            webhook_event.mark_processed("Missing payment/order ID in payload")
            return None
        
        # Find payment by order_id
        payment_result = await session.execute(
            select(Payment)
            .where(Payment.razorpay_order_id == order_id)
        )
        payment = payment_result.scalar_one_or_none()
        
        if not payment:
            logger.error(f"Payment not found for order {order_id}")
            webhook_event.mark_processed(f"Payment not found for order {order_id}")
            return None
        
        # Link webhook to payment
        webhook_event.payment_id = payment.id
        
        # Check if payment is locked
        if payment.is_locked():
            logger.warning(f"Payment {payment.id} is LOCKED - ignoring webhook")
            webhook_event.mark_processed("Payment is locked")
            return payment
        
        # Process based on event type
        try:
            if event_type == "payment.captured":
                await self._handle_payment_captured(session, payment, event_data)
            elif event_type == "payment.failed":
                await self._handle_payment_failed(session, payment, event_data)
            elif event_type == "refund.processed":
                await self._handle_refund_processed(session, payment, event_data)
            else:
                logger.info(f"Unhandled webhook event type: {event_type}")
                webhook_event.mark_processed(f"Unhandled event type: {event_type}")
                return payment
            
            webhook_event.mark_processed()
            await session.flush()
            
            logger.info(f"Webhook {event_id} processed successfully for payment {payment.id}")
            return payment
            
        except Exception as e:
            logger.error(f"Webhook processing failed: {str(e)}")
            webhook_event.mark_processed(f"Processing error: {str(e)}")
            raise
    
    async def _handle_payment_captured(
        self,
        session: AsyncSession,
        payment: Payment,
        event_data: Dict
    ):
        """Handle successful payment capture."""
        entity = event_data.get("payload", {}).get("payment", {}).get("entity", {})
        
        # Update payment
        payment.razorpay_payment_id = entity.get("id")
        payment.status = PaymentStatus.VERIFIED
        payment.gateway_response = entity
        payment.webhook_payload = event_data
        payment.verified_at = func.now()
        payment.lock()  # LOCK - no further changes
        
        logger.info(f"Payment {payment.id} VERIFIED and LOCKED")
        
        # Trigger lead status update (Day 1)
        await self._trigger_lead_workflow(session, payment)
    
    async def _handle_payment_failed(
        self,
        session: AsyncSession,
        payment: Payment,
        event_data: Dict
    ):
        """Handle failed payment."""
        entity = event_data.get("payload", {}).get("payment", {}).get("entity", {})
        
        payment.status = PaymentStatus.FAILED
        payment.gateway_response = entity
        payment.webhook_payload = event_data
        
        logger.warning(f"Payment {payment.id} FAILED")
    
    async def _handle_refund_processed(
        self,
        session: AsyncSession,
        payment: Payment,
        event_data: Dict
    ):
        """Handle refund."""
        payment.status = PaymentStatus.REFUNDED
        payment.lock()
        
        logger.info(f"Payment {payment.id} REFUNDED")
    
    async def _trigger_lead_workflow(self, session: AsyncSession, payment: Payment):
        """Trigger next step in lead workflow (Day 1)."""
        try:
            lead_result = await session.execute(
                select(Lead).where(Lead.id == payment.lead_id)
            )
            lead = lead_result.scalar_one_or_none()
            
            if lead:
                lead.status = "day1"  # Move to Day 1
                lead.payment_status = "paid"
                logger.info(f"Lead {lead.id} moved to DAY1 after payment")
                
        except Exception as e:
            logger.error(f"Failed to trigger lead workflow: {str(e)}")
            # Don't fail the webhook - payment is still valid
    
    # ==================== FETCH PAYMENT ====================
    
    async def fetch_payment_from_gateway(self, payment_id: str) -> Dict[str, Any]:
        """Fetch payment details from Razorpay API."""
        try:
            return self.client.payment.fetch(payment_id)
        except Exception as e:
            logger.error(f"Failed to fetch payment {payment_id}: {str(e)}")
            raise RazorpayError(f"Payment fetch failed: {str(e)}")


class RazorpayError(Exception):
    """Razorpay-related errors."""
    pass
