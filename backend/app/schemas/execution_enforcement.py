"""API shapes for execution enforcement (funnel, at-risk, weak members, leak map)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class TeamPersonalFunnelOut(BaseModel):
    """Team enrollment funnel — vl2-adapted buckets (see service docstring)."""

    claimed: int
    video_reached: int
    proof_pending: int
    paid_flp: int
    enrolled_total: int
    pct_video_vs_claimed: float
    pct_proof_vs_video: float
    pct_enrolled_vs_video: float
    pct_enrolled_vs_claimed: float


class TeamTodayStatsOut(BaseModel):
    """Legacy-style team dashboard day counters (IST day window)."""

    claimed_today: int
    fresh_leads_today: int = 0
    calls_today: int
    call_target: int = 0
    enrolled_today: int


class FollowUpAttackRow(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    follow_up_date: Optional[str] = None
    status: str
    call_result: Optional[str] = None


class MemberExecutionStats(BaseModel):
    total_active: int
    enrollments: int
    proof_pend: int
    fu_due: int
    conv_pct: float
    calls_today: int = 0
    fresh_leads_today: int = 0
    call_target: int = 0
    call_gate_met: bool = True


class DownlineExecutionStatsOut(BaseModel):
    """Map assignee user_id → aggregates + bottleneck tags."""

    stats: dict[str, MemberExecutionStats] = Field(default_factory=dict)
    bottleneck_tags: dict[str, list[str]] = Field(default_factory=dict)


class AtRiskLeadRow(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    status: str
    updated_at: Optional[datetime] = None
    assignee: Optional[str] = None
    team_member_display: str = ""
    leader_username: Optional[str] = None
    days_stuck: float = 0.0
    proof_state: str = "none"


class WeakMemberRow(BaseModel):
    username: Optional[str] = None
    role: str
    total_leads: int
    enrollments: int
    fu_pending: int
    conv_pct: float


class StatusHistogramRow(BaseModel):
    status: str
    count: int


class FunnelDropRow(BaseModel):
    from_status: str
    to_status: str
    from_count: int
    to_count: int
    drop_pct: float


class LeakMapOut(BaseModel):
    histogram: list[StatusHistogramRow]
    funnel_drops: list[FunnelDropRow]


class StaleRedistributeOut(BaseModel):
    implemented: bool = False
    message: str = ""
    assigned: int = 0
    skipped: int = 0
    assignments: list[list[Any]] = Field(default_factory=list)
    worker_counts: dict[str, int] = Field(default_factory=dict)
    worker_pool_size: int = 0
    source_bucket: str = ""
    max_active_per_worker: int = 50


class LeadControlAssignableUser(BaseModel):
    user_id: int
    display_name: str
    role: str
    fbo_id: str
    username: Optional[str] = None
    active_leads_count: int = 0
    xp_total: int = 0


class LeadControlQueueLead(BaseModel):
    lead_id: int
    lead_name: str
    phone: Optional[str] = None
    status: str
    owner_user_id: Optional[int] = None
    owner_name: str = ""
    assigned_to_user_id: Optional[int] = None
    assigned_to_name: str = ""
    archived_at: datetime
    watch_completed_at: Optional[datetime] = None
    last_action_at: Optional[datetime] = None


class LeadControlHistorySummaryRow(BaseModel):
    user_id: int
    display_name: str
    role: str
    total_received: int = 0
    manual_received: int = 0
    auto_received: int = 0
    last_received_at: Optional[datetime] = None


class LeadControlHistoryRow(BaseModel):
    activity_id: int
    occurred_at: datetime
    mode: Literal["manual", "auto"]
    lead_id: int
    lead_name: str
    previous_assignee_user_id: Optional[int] = None
    previous_assignee_name: Optional[str] = None
    assigned_to_user_id: Optional[int] = None
    assigned_to_name: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    actor_name: str
    reason: Optional[str] = None


class Day2ReviewSubmissionRow(BaseModel):
    submission_id: int
    lead_id: int
    lead_name: str
    slot: str
    submitted_at: datetime
    assigned_to_user_id: Optional[int] = None
    assigned_to_name: str = ""
    owner_user_id: Optional[int] = None
    owner_name: str = ""
    notes_text_preview: Optional[str] = None
    notes_url: Optional[str] = None
    voice_note_url: Optional[str] = None
    video_url: Optional[str] = None


class LeadControlOut(BaseModel):
    note: Optional[str] = None
    queue: list[LeadControlQueueLead] = Field(default_factory=list)
    queue_total: int = 0
    incubation_queue: list[LeadControlQueueLead] = Field(default_factory=list)
    incubation_total: int = 0
    assignable_users: list[LeadControlAssignableUser] = Field(default_factory=list)
    history_summary: list[LeadControlHistorySummaryRow] = Field(default_factory=list)
    history: list[LeadControlHistoryRow] = Field(default_factory=list)
    history_total: int = 0


class Day2ReviewOut(BaseModel):
    note: Optional[str] = None
    submissions: list[Day2ReviewSubmissionRow] = Field(default_factory=list)
    total: int = 0
    notes_count: int = 0
    voice_count: int = 0
    video_count: int = 0


class LeadControlManualReassignIn(BaseModel):
    lead_id: int = Field(ge=1)
    to_user_id: int = Field(ge=1)
    reason: Optional[str] = Field(default=None, max_length=500)


class LeadControlManualReassignOut(BaseModel):
    success: bool = True
    message: str
    lead_id: int
    previous_assignee_user_id: Optional[int] = None
    previous_assignee_name: Optional[str] = None
    assigned_to_user_id: int
    assigned_to_name: str
    owner_user_id: Optional[int] = None
    owner_name: str = ""


class LeadControlBulkReassignIn(BaseModel):
    lead_ids: list[int] = Field(min_length=1, max_length=100)
    to_user_id: int = Field(ge=1)
    reason: Optional[str] = Field(default=None, max_length=500)


class LeadControlBulkReassignOut(BaseModel):
    success: bool = True
    message: str
    reassigned_count: int
    lead_ids: list[int] = Field(default_factory=list)
    assigned_to_user_id: int
    assigned_to_name: str


class LosMemberRow(BaseModel):
    user_id: int
    name: str
    username: Optional[str] = None
    calls_today: int
    call_target: int
    call_gate_met: bool
    enrollments: int
    fu_due: int
    is_active: bool
    downline_count: int = 0


class LosSnapshotOut(BaseModel):
    """Leader Operating System daily snapshot — team execution aggregate."""

    date: str
    active_count: int
    inactive_count: int
    total_members: int
    total_calls_today: int
    calls_team_target: int
    activations_today: int
    activations_target: int
    billing_today_rupees: int
    follow_ups_pending: int
    members: list[LosMemberRow] = Field(default_factory=list)
    leader_score: int
    leader_tier: Literal["strong", "average", "at_risk"]
    basics_streak: int = 0
