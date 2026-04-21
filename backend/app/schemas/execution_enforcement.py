"""API shapes for execution enforcement (funnel, at-risk, weak members, leak map)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class TeamPersonalFunnelOut(BaseModel):
    """Team enrollment funnel — vl2-adapted buckets (see service docstring)."""

    claimed: int
    video_reached: int
    proof_pending: int
    paid_196: int
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
