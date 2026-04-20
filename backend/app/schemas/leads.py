from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

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
    assigned_to_name: Optional[str] = None

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
    mindset_started_at: Optional[datetime] = None
    mindset_completed_at: Optional[datetime] = None
    mindset_lock_state: Optional[str] = None

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

    # CTCS fields (nullable for legacy rows until touched)
    last_action_at: Optional[datetime] = None
    next_followup_at: Optional[datetime] = None
    heat_score: int = 0

    @computed_field
    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    @computed_field
    @property
    def stage_day(self) -> str:
        """Pipeline day bucket for CTCS UI (maps canonical ``Lead.status``)."""
        if self.status == "day1":
            return "DAY1"
        if self.status == "day2":
            return "DAY2"
        if self.status in ("day3", "interview", "track_selected", "seat_hold", "converted"):
            return "DAY3"
        return "NONE"


class LeadDetailPublic(LeadPublic):
    """Extended lead detail — same fields as LeadPublic (all included)."""

    pass


class LeadFileImportResponse(BaseModel):
    """Result of POST ``/leads/import-file`` (team / leader PDF import)."""

    imported: int = Field(..., ge=0)
    skipped: int = Field(..., ge=0)
    warnings: list[str] = Field(default_factory=list)


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

    # Assignment (admin / leader only)
    assigned_to_user_id: Optional[int] = Field(
        default=None,
        description="Re-assign lead to another user (admin/leader only)",
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
    next_followup_at: Optional[datetime] = Field(
        default=None,
        description="When to call again (CTCS / follow-up queue)",
    )

    @model_validator(mode="after")
    def at_least_one_field(self) -> LeadUpdate:
        fields_with_values = [
            self.name,
            self.status,
            self.archived,
            self.in_pool,
            self.restored,
            self.assigned_to_user_id,
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
            self.next_followup_at,
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


BatchSlot = Literal[
    "d1_morning",
    "d1_afternoon",
    "d1_evening",
    "d2_morning",
    "d2_afternoon",
    "d2_evening",
]


class BatchShareUrlRequest(BaseModel):
    slot: BatchSlot


class BatchShareUrlResponse(BaseModel):
    ok: bool = True
    watch_url_v1: str
    watch_url_v2: str


_CTCS_ACTIONS = frozenset(
    {
        "not_picked",
        "interested",
        "call_later",
        "not_interested",
        "paid",
    },
)


class LeadCtcsActionRequest(BaseModel):
    """Call-to-close outcome (maps to canonical ``Lead.status`` + side effects)."""

    action: str = Field(..., max_length=32)
    followup_at: Optional[datetime] = Field(
        default=None,
        description="When action is call_later, optional explicit follow-up time (timezone-aware). Omit for +24h default.",
    )

    @field_validator("action")
    @classmethod
    def action_allowed(cls, v: str) -> str:
        s = v.strip()
        if s not in _CTCS_ACTIONS:
            raise ValueError(f"Invalid action; must be one of {sorted(_CTCS_ACTIONS)}")
        return s

    @model_validator(mode="after")
    def followup_at_rules(self) -> "LeadCtcsActionRequest":
        if self.followup_at is not None and self.action != "call_later":
            raise ValueError("followup_at is only allowed when action is call_later")
        if self.followup_at is None:
            return self
        fu = self.followup_at
        if fu.tzinfo is None:
            raise ValueError("followup_at must be timezone-aware (include offset or Z)")
        now = datetime.now(timezone.utc)
        fu_utc = fu.astimezone(timezone.utc)
        if fu_utc < now - timedelta(seconds=30):
            raise ValueError("followup_at must be in the future")
        if fu_utc > now + timedelta(days=60):
            raise ValueError("followup_at is too far in the future")
        self.followup_at = fu_utc
        return self


class MindsetLockPreviewResponse(BaseModel):
    eligible: bool
    minimum_seconds: int = 300
    elapsed_seconds: int
    remaining_seconds: int
    mindset_started_at: Optional[datetime] = None
    leader_user_id: Optional[int] = None
    leader_name: Optional[str] = None


class MindsetLockCompleteResponse(BaseModel):
    status: Literal["assigned"]
    leader_name: str
    leader_user_id: int
    duration_seconds: int
    mindset_started_at: datetime
    mindset_completed_at: datetime


class LeadPoolImportResponse(BaseModel):
    """Admin bulk import into shared lead pool from Excel."""

    ok: bool = True
    created: int = 0
    warnings: list[str] = Field(default_factory=list)


class LeadTransitionRequest(BaseModel):
    target_status: str = Field(..., max_length=32)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("target_status")
    @classmethod
    def target_status_allowed(cls, v: str) -> str:
        s = v.strip()
        if s not in LEAD_STATUS_SET:
            raise ValueError("Invalid lead status")
        return s


class LeadTransitionResponse(BaseModel):
    success: bool
    message: str
    new_status: str


class LeadListResponse(BaseModel):
    items: list[LeadPublic]
    total: int
    limit: int
    offset: int


class AllLeadsResponse(BaseModel):
    today_items: list[LeadPublic]
    history_items: list[LeadPublic]
    today_total: int
    history_total: int
    total: int
    limit: int
    offset: int


class LeadPoolDefaultsResponse(BaseModel):
    """Admin-configured default claim price for new pool leads (import + future rows)."""

    default_pool_price_cents: int


class LeadPoolDefaultsUpdateRequest(BaseModel):
    default_pool_price_cents: int = Field(ge=0, le=999_999_999)


class LeadPoolClaimBatchRequest(BaseModel):
    count: int = Field(ge=1, le=50)


class LeadPoolClaimBatchResponse(BaseModel):
    leads: list[LeadPublic]
    total_price_cents: int = Field(ge=0)
