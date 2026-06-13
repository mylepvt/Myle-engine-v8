"""Schemas for the CC/sale billing engine (Phase 3)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

BillingStage = Literal["day3", "day6"]
SaleStatus = Literal["pending", "approved", "rejected"]


class SaleManualFields(BaseModel):
    """Optional manual entry / override of invoice fields (used when OCR is unsure)."""

    case_credits: Optional[Decimal] = Field(default=None, ge=0)
    amount_cents: Optional[int] = Field(default=None, ge=0)
    cgst_cents: Optional[int] = Field(default=None, ge=0)
    sgst_cents: Optional[int] = Field(default=None, ge=0)
    invoice_number: Optional[str] = Field(default=None, max_length=64)
    fbo_id: Optional[str] = Field(default=None, max_length=32)
    sponsor_id: Optional[str] = Field(default=None, max_length=32)
    order_count: Optional[int] = Field(default=None, ge=0)
    invoice_date: Optional[date] = None


class LeadSalePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lead_id: int
    billing_stage: BillingStage
    case_credits: Optional[Decimal] = None
    amount_cents: Optional[int] = None
    cgst_cents: Optional[int] = None
    sgst_cents: Optional[int] = None
    invoice_number: Optional[str] = None
    fbo_id: Optional[str] = None
    sponsor_id: Optional[str] = None
    order_count: Optional[int] = None
    invoice_date: Optional[date] = None
    proof_url: Optional[str] = None
    ocr_confidence: Optional[Decimal] = None
    auto_verified: bool = False
    verify_notes: Optional[str] = None
    status: SaleStatus
    submitted_by_user_id: int
    owner_user_id: Optional[int] = None
    approved_by_user_id: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SaleSubmitResponse(BaseModel):
    """Returned after an upload — tells the UI whether it auto-approved."""

    sale: LeadSalePublic
    auto_approved: bool
    message: str


class SaleListResponse(BaseModel):
    items: list[LeadSalePublic]
    total: int


class SaleRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=512)


class SaleApproveRequest(BaseModel):
    """Optional value corrections applied at approval time.

    When OCR can't read an invoice it lands ``pending`` — the admin then enters
    the real CC / amount here so the approved sale books the right numbers
    (otherwise approving a blank-OCR invoice would count 0 CC / ₹0).
    """

    case_credits: Optional[Decimal] = Field(default=None, ge=0)
    amount_cents: Optional[int] = Field(default=None, ge=0)
    cgst_cents: Optional[int] = Field(default=None, ge=0)
    sgst_cents: Optional[int] = Field(default=None, ge=0)
    invoice_number: Optional[str] = Field(default=None, max_length=64)


class SaleDashboardRow(BaseModel):
    """Per-owner CC + revenue rollup (approved sales only)."""

    owner_user_id: Optional[int] = None
    owner_username: Optional[str] = None
    sale_count: int = 0
    total_case_credits: Decimal = Decimal("0")
    total_amount_cents: int = 0
    # Personal-sale commission for this owner: (amount − CGST − SGST) × 25%.
    commission_cents: int = 0


class SaleDashboardResponse(BaseModel):
    scope: Literal["self", "downline", "all"]
    sale_count: int = 0
    total_case_credits: Decimal = Decimal("0")
    total_amount_cents: int = 0
    pending_count: int = 0
    # Viewer's own PERSONAL-sale commission (approx cheque) — leads they own
    # themselves only, never downline/team billing. Same for every role.
    personal_commission_cents: int = 0
    rows: list[SaleDashboardRow] = Field(default_factory=list)


class SaleTrendPoint(BaseModel):
    """One IST calendar day of approved CC + approx cheque."""

    date: str
    case_credits: Decimal = Decimal("0")
    cheque_cents: int = 0


class SaleTrendResponse(BaseModel):
    scope: Literal["self", "downline", "all"]
    days: int
    points: list[SaleTrendPoint] = Field(default_factory=list)
    total_case_credits: Decimal = Decimal("0")
    total_cheque_cents: int = 0
