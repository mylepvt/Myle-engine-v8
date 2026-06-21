from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.core.lead_outcome import (
    DROP_REASON_CHOICES,
    OUTCOME_CHOICES,
    outcome_for_status,
    RECYCLE_REASON_CHOICES,
)
from app.core.lead_status import LEAD_STATUS_SET

_CALL_STATUS_SET = {
    "not_called",
    "called",
    "callback_requested",
    "not_interested",
    "converted",
    # Min. FLP Billing funnel (workboard + team UI)
    "no_answer",
    "interested",
    "follow_up",
    "video_sent",
    "video_watched",
    "payment_done",
    # Dial / line outcomes (CTCS call-outcome picker, right column)
    "call_received",
    "person_block",
    "call_cut",
}

_PAYMENT_STATUS_SET = {"pending", "proof_uploaded", "approved", "rejected"}
_SOURCE_SET = {"facebook", "instagram", "referral", "walk_in", "other"}


class LeadPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: str
    outcome: Optional[str] = None
    created_by_user_id: int
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    created_at: datetime
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    in_pool: bool = False
    pool_price_cents: Optional[int] = None
    pool_type: str = "paid"

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
    assigned_to_role: Optional[str] = None
    leader_user_id: Optional[int] = None
    leader_name: Optional[str] = None
    is_reassigned: bool = False
    reassigned_at: Optional[datetime] = None

    # Post-close onboarding (register link → 7-day training)
    register_token: Optional[str] = None
    register_link_sent_at: Optional[datetime] = None
    registered_user_id: Optional[int] = None
    registered_at: Optional[datetime] = None

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
    day4_completed_at: Optional[datetime] = None
    day5_completed_at: Optional[datetime] = None

    # Day 2 cheat-proof business test
    day2_test_status: str = "pending"
    day2_test_score: Optional[int] = None
    day2_test_attempts: int = 0
    day2_test_completed_at: Optional[datetime] = None

    # Day 3 closing — Stage selection + seat-hold
    stage_selected: Optional[str] = None
    stage_price_cents: Optional[int] = None
    seat_hold_amount_cents: Optional[int] = None
    seat_hold_expiry: Optional[datetime] = None

    # Batch slots (M/A/E)
    d1_morning: bool = False
    d1_afternoon: bool = False
    d1_evening: bool = False
    d2_morning: bool = False
    d2_afternoon: bool = False
    d2_evening: bool = False
    d3_morning: bool = False
    d3_afternoon: bool = False
    d3_evening: bool = False
    d4_morning: bool = False
    d4_afternoon: bool = False
    d4_evening: bool = False
    d5_morning: bool = False
    d5_afternoon: bool = False
    d5_evening: bool = False
    process_tracking: Optional[dict[str, dict[str, bool]]] = None
    no_response_attempt_count: int = 0

    # CTCS fields (nullable for legacy rows until touched)
    last_action_at: Optional[datetime] = None
    next_followup_at: Optional[datetime] = None
    retarget_at: Optional[datetime] = None
    heat_score: int = 0
    drop_reason: Optional[str] = None
    drop_notes: Optional[str] = None
    dropped_at: Optional[datetime] = None
    outcome_changed_at: Optional[datetime] = None
    recycle_reason: Optional[str] = None

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
        if self.status in ("day3", "day4", "day5", "interview", "converted"):
            return "DAY3"
        return "NONE"


class LeadBatchSubmissionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day_number: int
    slot: str
    notes_url: Optional[str] = None
    voice_note_url: Optional[str] = None
    video_url: Optional[str] = None
    notes_text: Optional[str] = None
    submitted_at: datetime


class LeadDetailPublic(LeadPublic):
    """Extended lead detail — same fields as LeadPublic (all included)."""

    batch_submissions: list[LeadBatchSubmissionPublic] = Field(default_factory=list)


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
    d3_morning: Optional[bool] = Field(default=None, description="Day 3 morning batch")
    d3_afternoon: Optional[bool] = Field(default=None, description="Day 3 afternoon batch")
    d3_evening: Optional[bool] = Field(default=None, description="Day 3 evening batch")
    d4_morning: Optional[bool] = Field(default=None, description="Day 4 morning batch")
    d4_afternoon: Optional[bool] = Field(default=None, description="Day 4 afternoon batch")
    d4_evening: Optional[bool] = Field(default=None, description="Day 4 evening batch")
    d5_morning: Optional[bool] = Field(default=None, description="Day 5 morning batch")
    d5_afternoon: Optional[bool] = Field(default=None, description="Day 5 afternoon batch")
    d5_evening: Optional[bool] = Field(default=None, description="Day 5 evening batch")
    d6_6pm: Optional[bool] = Field(default=None, description="Day 6 6 PM batch")
    d6_8pm: Optional[bool] = Field(default=None, description="Day 6 8 PM batch")
    process_stage: Optional[str] = Field(default=None, max_length=64)
    process_task: Optional[str] = Field(default=None, max_length=128)
    process_task_done: Optional[bool] = Field(default=None)
    # Day 3 closing — Stage picker + seat-hold (leader/admin)
    stage_selected: Optional[str] = Field(
        default=None, description="Stage track: 'stage1' | 'stage2' | 'stage3' (price auto-set)"
    )
    collect_seat_hold: Optional[bool] = Field(
        default=None,
        description="True = start the seat-hold reserve window (needs a selected stage)",
    )
    no_response_attempt_count: Optional[int] = Field(default=None, ge=0, description="Optional counter")
    next_followup_at: Optional[datetime] = Field(
        default=None,
        description="When to call again (CTCS / follow-up queue)",
    )
    drop_reason: Optional[str] = Field(default=None, max_length=32)
    drop_notes: Optional[str] = Field(default=None, max_length=2000)

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
            self.d3_morning,
            self.d3_afternoon,
            self.d3_evening,
            self.d4_morning,
            self.d4_afternoon,
            self.d4_evening,
            self.d5_morning,
            self.d5_afternoon,
            self.d5_evening,
            self.d6_6pm,
            self.d6_8pm,
            self.process_stage,
            self.process_task,
            self.process_task_done,
            self.stage_selected,
            self.collect_seat_hold,
            self.no_response_attempt_count,
            self.next_followup_at,
        ]
        if all(f is None for f in fields_with_values):
            raise ValueError("At least one field must be provided for update")
        if self.restored is False:
            raise ValueError("restored must be true or omitted")
        return self

    @model_validator(mode="after")
    def process_task_fields_coherent(self) -> LeadUpdate:
        trio = (self.process_stage, self.process_task, self.process_task_done)
        if any(v is not None for v in trio) and not all(v is not None for v in trio):
            raise ValueError("process_stage, process_task, and process_task_done must be provided together")
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


    @field_validator("drop_reason")
    @classmethod
    def drop_reason_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in DROP_REASON_CHOICES:
            raise ValueError(f"Invalid drop_reason; must be one of {DROP_REASON_CHOICES}")
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
    "d3_morning",
    "d3_afternoon",
    "d3_evening",
    "d4_morning",
    "d4_afternoon",
    "d4_evening",
    "d5_morning",
    "d5_afternoon",
    "d5_evening",
    "d6_6pm",
    "d6_8pm",
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
    drop_reason: Optional[str] = Field(
        default=None, max_length=32,
        description="Required when target outcome is dead",
    )
    drop_notes: Optional[str] = Field(default=None, max_length=2000)
    recycle_reason: Optional[str] = Field(
        default=None, max_length=32,
        description="Required when target outcome is recycle",
    )

    @field_validator("target_status")
    @classmethod
    def target_status_allowed(cls, v: str) -> str:
        s = v.strip()
        if s not in LEAD_STATUS_SET:
            raise ValueError("Invalid lead status")
        return s

    @field_validator("drop_reason")
    @classmethod
    def drop_reason_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in DROP_REASON_CHOICES:
            raise ValueError(f"Invalid drop_reason; must be one of {DROP_REASON_CHOICES}")
        return s

    @field_validator("recycle_reason")
    @classmethod
    def recycle_reason_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in RECYCLE_REASON_CHOICES:
            raise ValueError(f"Invalid recycle_reason; must be one of {RECYCLE_REASON_CHOICES}")
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


class LeadPoolBatchPreviewResponse(BaseModel):
    requested_count: int = Field(ge=1, le=50)
    claim_count: int = Field(ge=0, le=50)
    available_count: int = Field(ge=0)
    total_price_cents: int = Field(ge=0)


class LeadPoolClaimBatchResponse(BaseModel):
    leads: list[LeadPublic]
    total_price_cents: int = Field(ge=0)
