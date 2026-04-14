"""Payment proof request/response schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PaymentProofRequest(BaseModel):
    """Request to upload payment proof."""

    lead_id: int = Field(..., description="Lead ID")
    payment_amount_cents: int = Field(..., description="Payment amount in cents")
    proof_url: str = Field(..., description="URL to payment proof image/document")
    notes: Optional[str] = Field(None, description="Additional notes")


class PaymentProofResponse(BaseModel):
    """Response for payment proof upload."""

    success: bool
    message: str
    payment_status: str
