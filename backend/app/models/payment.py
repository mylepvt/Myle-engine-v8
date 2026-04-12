"""Payment model - production-grade source of truth."""

import uuid
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

# SQLite (tests) uses JSON; Postgres uses JSONB — same Python values.
_JSON = JSON().with_variant(JSONB(), "postgresql")
from sqlalchemy.orm import relationship

from app.db.base import Base


class PaymentStatus(str, Enum):
    """Payment status flow - immutable once verified."""
    INITIATED = "initiated"
    SUCCESS = "success"
    FAILED = "failed"
    VERIFIED = "verified"
    REFUNDED = "refunded"
    DISPUTED = "disputed"


class Payment(Base):
    """
    Payment record - SINGLE SOURCE OF TRUTH for conversions.
    
    Rules:
    - Status only changes via Razorpay webhooks
    - Manual updates are BLOCKED (business rule)
    - Once verified, record is LOCKED
    """
    
    __tablename__ = "payments"
    
    # Primary key - UUID for external reference safety
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Relationships
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Razorpay identifiers
    razorpay_order_id = Column(String(255), nullable=False, index=True)
    razorpay_payment_id = Column(String(255), nullable=True, unique=True, index=True)
    
    # Financial details
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="INR")
    
    # Status - controlled by webhooks ONLY
    status = Column(String(50), nullable=False, default=PaymentStatus.INITIATED)
    
    # Gateway data (immutable snapshots)
    gateway_response = Column(_JSON, nullable=True)
    webhook_payload = Column(_JSON, nullable=True)
    
    # Verification tracking
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Lock mechanism - once locked, NO CHANGES allowed
    locked_at = Column(DateTime(timezone=True), nullable=True)
    
    # Idempotency - prevent duplicate processing
    idempotency_key = Column(String(255), nullable=True, unique=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    lead = relationship("Lead", back_populates="payments")
    user = relationship("User", foreign_keys=[user_id], back_populates="payments_initiated")
    verifier = relationship("User", foreign_keys=[verified_by])
    webhook_events = relationship("PaymentWebhookEvent", back_populates="payment")
    
    def is_locked(self) -> bool:
        """Check if payment is locked (immutable)."""
        return self.locked_at is not None or self.status == PaymentStatus.VERIFIED
    
    def can_transition_to(self, new_status: PaymentStatus) -> bool:
        """Check if status transition is valid."""
        valid_transitions = {
            PaymentStatus.INITIATED: [PaymentStatus.SUCCESS, PaymentStatus.FAILED],
            PaymentStatus.SUCCESS: [PaymentStatus.VERIFIED, PaymentStatus.REFUNDED],
            PaymentStatus.FAILED: [PaymentStatus.INITIATED],  # Retry
            PaymentStatus.VERIFIED: [],  # Terminal state
            PaymentStatus.REFUNDED: [],  # Terminal state
            PaymentStatus.DISPUTED: [PaymentStatus.VERIFIED, PaymentStatus.REFUNDED],
        }
        return new_status in valid_transitions.get(self.status, [])
    
    def lock(self):
        """Lock the payment - NO FURTHER CHANGES."""
        self.locked_at = func.now()
    
    def __repr__(self):
        return f"<Payment(id={self.id}, lead={self.lead_id}, status={self.status}, amount={self.amount})>"


class PaymentWebhookEvent(Base):
    """
    Log of all webhook events received.
    
    Purpose:
    - Debugging and replay
    - Audit trail
    - Idempotency check
    """
    
    __tablename__ = "payment_webhook_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Event details
    event_type = Column(String(100), nullable=False)
    event_id = Column(String(255), nullable=False, unique=True, index=True)
    
    # Link to payment (may be null if event received before order created)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True, index=True)
    
    # Raw payload
    payload = Column(_JSON, nullable=False)
    
    # Validation
    signature_valid = Column(Boolean, nullable=False)
    
    # Processing status
    processed = Column(Boolean, nullable=False, default=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationship
    payment = relationship("Payment", back_populates="webhook_events")
    
    def mark_processed(self, error: Optional[str] = None):
        """Mark event as processed."""
        self.processed = True
        self.processed_at = func.now()
        if error:
            self.error_message = error
    
    def __repr__(self):
        return f"<WebhookEvent(event_id={self.event_id}, type={self.event_type}, processed={self.processed})>"
