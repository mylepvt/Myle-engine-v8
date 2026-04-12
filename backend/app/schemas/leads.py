from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.lead_status import LEAD_STATUS_SET

_CALL_STATUS_SET = {
    "not_called",
    "called",
    "callback_requested",
    "not_interested",
    "converted",
    # Enrollment funnel (workboard + team UI)
    "no_answer",
    "interested",
    "follow_up",
    "video_sent",
    "video_watched",
    "payment_done",
}

_PAYMENT_STATUS_SET = {"pending", "proof_uploaded", "approved", "rejected"}

_SOURCE_SET = {"facebook", "instagram", "referral", "walk_in", "other"}


class LeadPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: str
    created_by_user_id: int
    created_at: datetime
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    in_pool: bool = False
    pool_price_cents: Optional[int] = None

    # Contact info
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    ad_name: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None

    # Assignment
    assigned_to_user_id: Optional[int] = None

    # Call tracking
    call_status: Optional[str] = None
    call_count: int = 0
    last_called_at: Optional[datetime] = None
    whatsapp_sent_at: Optional[datetime] = None

    # Payment tracking
    payment_status: Optional[str] = None
    payment_amount_cents: Optional[int] = None
    payment_proof_url: Optional[str] = None
    payment_proof_uploaded_at: Optional[datetime] = None

    # Day completion
    day1_completed_at: Optional[datetime] = None
    day2_completed_at: Optional[datetime] = None
    day3_completed_at: Optional[datetime] = None

    # Batch slots (M/A/E)
    d1_morning: bool = False
    d1_afternoon: bool = False
    d1_evening: bool = False
    d2_morning: bool = False
    d2_afternoon: bool = False
    d2_evening: bool = False
    no_response_attempt_count: int = 0


class LeadDetailPublic(LeadPublic):
    """Extended lead detail — same fields as LeadPublic (all included)."""

    pass


class LeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    status: str = Field(default="new", max_length=32)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=320)
    city: Optional[str] = Field(default=None, max_length=100)
    source: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("status")
    @classmethod
    def status_allowed(cls, v: str) -> str:
        s = v.strip()
        if s not in LEAD_STATUS_SET:
            raise ValueError("Invalid lead status")
        return s

    @field_validator("source")
    @classmethod
    def source_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in _SOURCE_SET:
            raise ValueError(f"Invalid source; must be one of {sorted(_SOURCE_SET)}")
        return s


class LeadUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    status: Optional[str] = Field(default=None, max_length=32)
    archived: Optional[bool] = Field(
        default=None,
        description="True = archive now (sets archived_at); False = restore (clears archived_at)",
    )
    in_pool: Optional[bool] = Field(
        default=None,
        description="Admin only: release to shared pool (true) or remove from pool without assigning (false)",
    )
    pool_price_cents: Optional[int] = Field(
        default=None,
        ge=0,
        description="Admin only: price in paise to claim from pool; 0 or null = free",
    )
    restored: Optional[bool] = Field(
        default=None,
        description="Admin only: true = undo soft-delete (clears deleted_at)",
    )

    # Contact fields
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=320)
    city: Optional[str] = Field(default=None, max_length=100)
    source: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=5000)

    # Call tracking
    call_status: Optional[str] = Field(default=None, max_length=32)
    whatsapp_sent: Optional[bool] = Field(
        default=None,
        description="True = set whatsapp_sent_at to now; False = clear it",
    )

    # Payment
    payment_status: Optional[str] = Field(default=None, max_length=32)

    # Day completion flags
    day1_completed: Optional[bool] = Field(
        default=None,
        description="True = set day1_completed_at to now; False = clear it",
    )
    day2_completed: Optional[bool] = Field(
        default=None,
        description="True = set day2_completed_at to now; False = clear it",
    )
    day3_completed: Optional[bool] = Field(
        default=None,
        description="True = set day3_completed_at to now; False = clear it",
    )

    d1_morning: Optional[bool] = Field(default=None, description="Day 1 morning batch (leader/admin)")
    d1_afternoon: Optional[bool] = Field(default=None, description="Day 1 afternoon batch (leader/admin)")
    d1_evening: Optional[bool] = Field(default=None, description="Day 1 evening batch (leader/admin)")
    d2_morning: Optional[bool] = Field(default=None, description="Day 2 morning batch")
    d2_afternoon: Optional[bool] = Field(default=None, description="Day 2 afternoon batch")
    d2_evening: Optional[bool] = Field(default=None, description="Day 2 evening batch")
    no_response_attempt_count: Optional[int] = Field(default=None, ge=0, description="Optional counter")

    @model_validator(mode="after")
    def at_least_one_field(self) -> LeadUpdate:
        fields_with_values = [
            self.name,
            self.status,
            self.archived,
            self.in_pool,
            self.restored,
            self.phone,
            self.email,
            self.city,
            self.source,
            self.notes,
            self.call_status,
            self.whatsapp_sent,
            self.payment_status,
            self.day1_completed,
            self.day2_completed,
            self.day3_completed,
            self.pool_price_cents,
            self.d1_morning,
            self.d1_afternoon,
            self.d1_evening,
            self.d2_morning,
            self.d2_afternoon,
            self.d2_evening,
            self.no_response_attempt_count,
        ]
        if all(f is None for f in fields_with_values):
            raise ValueError("At least one field must be provided for update")
        if self.restored is False:
            raise ValueError("restored must be true or omitted")
        return self

    @field_validator("status")
    @classmethod
    def status_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in LEAD_STATUS_SET:
            raise ValueError("Invalid lead status")
        return s

    @field_validator("call_status")
    @classmethod
    def call_status_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in _CALL_STATUS_SET:
            raise ValueError(f"Invalid call_status; must be one of {sorted(_CALL_STATUS_SET)}")
        return s

    @field_validator("payment_status")
    @classmethod
    def payment_status_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in _PAYMENT_STATUS_SET:
            raise ValueError(
                f"Invalid payment_status; must be one of {sorted(_PAYMENT_STATUS_SET)}"
            )
        return s

    @field_validator("source")
    @classmethod
    def source_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in _SOURCE_SET:
            raise ValueError(f"Invalid source; must be one of {sorted(_SOURCE_SET)}")
        return s


class LeadPoolImportResponse(BaseModel):
    """Admin bulk import into shared lead pool from Excel."""

    ok: bool = True
    created: int = 0
    warnings: list[str] = Field(default_factory=list)


class LeadListResponse(BaseModel):
    items: list[LeadPublic]
    total: int
    limit: int
    offset: int


class LeadPoolDefaultsResponse(BaseModel):
    """Admin-configured default claim price for new pool leads (import + future rows)."""

    default_pool_price_cents: int


class LeadPoolDefaultsUpdateRequest(BaseModel):
    default_pool_price_cents: int = Field(ge=0, le=999_999_999)
