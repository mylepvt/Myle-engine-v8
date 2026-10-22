from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WalletLedgerEntryPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    amount_cents: int
    currency: str
    note: Optional[str] = None
    created_at: datetime
    invoice_number: Optional[str] = None


class WalletSummaryResponse(BaseModel):
    balance_cents: int
    currency: str
    recent_entries: list[WalletLedgerEntryPublic]


class WalletLedgerListResponse(BaseModel):
    items: list[WalletLedgerEntryPublic]
    total: int
    limit: int
    offset: int


class WalletAdjustmentCreate(BaseModel):
    user_id: int = Field(ge=1)
    amount_cents: int
    idempotency_key: str = Field(min_length=8, max_length=128)
    note: Optional[str] = Field(default=None, max_length=512)
    # "promo" = free / waived credit (Myle Ledger books it apart from paid recharges).
    kind: Literal["adjustment", "promo"] = "adjustment"


# ── Recharge request schemas ─────────────────────────────────────────────────

_RECHARGE_STATUS_SET = {"pending", "approved", "rejected"}


class WalletRechargeCreate(BaseModel):
    amount_cents: int = Field(ge=1)
    utr_number: str = Field(min_length=4, max_length=50)
    proof_url: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: Optional[str] = Field(default=None, max_length=128)


class WalletRechargeReview(BaseModel):
    status: str
    admin_note: Optional[str] = Field(default=None, max_length=512)

    @field_validator("status")
    @classmethod
    def status_allowed(cls, v: str) -> str:
        s = v.strip()
        if s not in {"approved", "rejected"}:
            raise ValueError("status must be 'approved' or 'rejected'")
        return s


class WalletRechargePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    member_name: Optional[str] = None
    member_fbo_id: Optional[str] = None
    amount_cents: int
    utr_number: Optional[str]
    proof_url: Optional[str]
    status: str
    admin_note: Optional[str]
    reviewed_by_user_id: Optional[int]
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime]
    created_at: datetime
    invoice_number: Optional[str] = None


class WalletRechargeListResponse(BaseModel):
    items: list[WalletRechargePublic]
    total: int
    limit: int
    offset: int


class WalletRechargeInstructionsResponse(BaseModel):
    upi_id: str
    qr_image_url: Optional[str] = None


# ── Free recharge request schemas (leader asks, admin decides) ───────────────

# ₹1,00,000 in paise — a free credit above this is a typo, not a request.
FREE_RECHARGE_MAX_CENTS = 10_000_000


class FreeRechargeCreate(BaseModel):
    user_id: int = Field(ge=1)
    amount_cents: int = Field(ge=100, le=FREE_RECHARGE_MAX_CENTS)
    reason: str = Field(min_length=2, max_length=200)
    idempotency_key: Optional[str] = Field(default=None, max_length=128)

    @field_validator("reason")
    @classmethod
    def reason_trimmed(cls, v: str) -> str:
        s = " ".join(v.split())
        if len(s) < 2:
            raise ValueError("Give a reason")
        return s


class FreeRechargePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    member_name: Optional[str] = None
    member_fbo_id: Optional[str] = None
    requested_by_user_id: int
    requested_by_name: Optional[str] = None
    amount_cents: int
    reason: str
    status: str
    admin_note: Optional[str]
    reviewed_by_user_id: Optional[int]
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime]
    created_at: datetime


class FreeRechargeListResponse(BaseModel):
    items: list[FreeRechargePublic]
    total: int
    limit: int
    offset: int
