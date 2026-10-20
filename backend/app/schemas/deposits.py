from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ConsentLinkCreate(BaseModel):
    amount_rupees: int = Field(..., ge=1, le=1000)


class ConsentPublic(BaseModel):
    """What staff see about a lead's consent (the link token only while it can be answered)."""

    id: int
    state: str
    amount_rupees: int
    token: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    given_at: Optional[datetime] = None
    typed_name: Optional[str] = None
    withdrawn_at: Optional[datetime] = None


class ReceiptPublic(BaseModel):
    receipt_number: str
    lead_id: int
    lead_name: Optional[str] = None
    lead_phone: Optional[str] = None
    lead_city: Optional[str] = None
    amount_rupees: int
    paid_at: datetime
    payment_mode: str
    payment_mode_label: str
    payment_ref: str
    status: str
    issued_at: datetime
    refunded_at: Optional[datetime] = None
    refund_ref: Optional[str] = None
    refund_note: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    consent_id: int
    consent_state: Optional[str] = None
    share_token: str
    pdf_path: str


class LeadDepositState(BaseModel):
    gate_enabled: bool
    min_rupees: int
    max_rupees: int
    payment_modes: dict[str, str]
    consent: Optional[ConsentPublic] = None
    receipt: Optional[ReceiptPublic] = None


class ReceiptCreate(BaseModel):
    payment_mode: str = Field(..., max_length=24)
    payment_ref: str = Field(..., max_length=64)
    paid_at: datetime


class RefundCreate(BaseModel):
    refunded_at: datetime
    refund_ref: str = Field(..., max_length=64)
    note: Optional[str] = Field(default=None, max_length=300)


class ReceiptList(BaseModel):
    items: list[ReceiptPublic]
    total: int


class DepositSettings(BaseModel):
    gate_enabled: bool
    business_name: str
    support_email: str
    operated_by: str


class DepositSettingsUpdate(BaseModel):
    gate_enabled: Optional[bool] = None
    business_name: Optional[str] = Field(default=None, max_length=120)
    support_email: Optional[str] = Field(default=None, max_length=120, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    operated_by: Optional[str] = Field(default=None, max_length=120)


# ── public (the lead) ─────────────────────────────────────────────────────────


class PhoneIn(BaseModel):
    phone: str = Field(..., max_length=32)


class ConsentLinkInfo(BaseModel):
    business_name: str
    support_email: str
    amount_rupees: int
    masked_phone: str
    state: str


class ConsentTerms(BaseModel):
    state: str
    terms_text: str
    terms_sha256: str
    terms_version: str
    given_at: Optional[datetime] = None
    typed_name: Optional[str] = None


class ConsentAccept(BaseModel):
    phone: str = Field(..., max_length=32)
    typed_name: str = Field(..., max_length=200)
    agreed: bool
    terms_sha256: str = Field(..., max_length=64)


class ReceiptLinkInfo(BaseModel):
    receipt_number: str
    business_name: str
    support_email: str
    masked_phone: str
    status: str
