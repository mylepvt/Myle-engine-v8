from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CcPersonRow(BaseModel):
    """Closed / Pending person row — name + CCs + state + next task."""

    name: str = Field(default="", max_length=200)
    ccs: float = Field(default=0.0, ge=0)
    current_state: str = Field(default="", max_length=200)
    next_task: str = Field(default="", max_length=200)


class EnrollmentRow(BaseModel):
    name: str = Field(default="", max_length=200)
    fresh_lead: int = Field(default=0, ge=0)
    old_lead: int = Field(default=0, ge=0)

    @property
    def total(self) -> int:
        return self.fresh_lead + self.old_lead


class LeadCycleRow(BaseModel):
    name: str = Field(default="", max_length=200)
    enrollment: int = Field(default=0, ge=0)
    budget_check: bool = False
    checked: bool = False


class EnrollmentTrackingRow(BaseModel):
    name: str = Field(default="", max_length=200)
    current_state: str = Field(default="", max_length=200)
    drop_continue: str = Field(default="", max_length=20)  # "drop" | "continue" | ""
    day1: str = Field(default="", max_length=60)


class CurrentCcSheetUpsert(BaseModel):
    subject_user_id: int
    sheet_date: date
    target_ccs: Optional[float] = Field(default=None, ge=0)

    direct_persons: List[str] = Field(default_factory=list, max_length=50)
    direct_total_ccs: Optional[float] = Field(default=None, ge=0)
    real_active_persons: List[str] = Field(default_factory=list, max_length=50)
    light_active_persons: List[str] = Field(default_factory=list, max_length=50)

    closed_persons: List[CcPersonRow] = Field(default_factory=list, max_length=100)
    pending_persons: List[CcPersonRow] = Field(default_factory=list, max_length=100)

    enrollment_rows: List[EnrollmentRow] = Field(default_factory=list, max_length=100)

    lead_cycle_rows: List[LeadCycleRow] = Field(default_factory=list, max_length=100)
    lead_covered: Optional[str] = Field(default=None, max_length=8000)
    process_check: Optional[str] = Field(default=None, max_length=8000)

    enrollment_tracking_rows: List[EnrollmentTrackingRow] = Field(
        default_factory=list, max_length=100
    )
    drop_reason_remarks: Optional[str] = Field(default=None, max_length=8000)

    improvement_area: Optional[str] = Field(default=None, max_length=8000)


class CurrentCcActuals(BaseModel):
    """Reliable activity numbers for the subject on the sheet date (the 'sach').

    NOTE: the app's own CC read (OCR'd invoices) is unreliable, so CC is NOT pulled
    here — the sheet is the source of truth for CCs. We only surface activity that is
    logged directly from app usage (calls / leads / follow-ups).
    """

    calls: int = 0
    leads_added: int = 0
    followups: int = 0

    @property
    def activity_total(self) -> int:
        return self.calls + self.leads_added + self.followups


class CurrentCcMatchItem(BaseModel):
    metric: str
    label: str
    claimed: float = 0.0
    actual: float = 0.0
    # "match" (green) | "partial" (amber) | "mismatch" (red) | "none" (nothing claimed)
    status: str = "none"


class CurrentCcMatch(BaseModel):
    overall: str = "none"  # worst of the items
    flagged: bool = False  # True when any item is a mismatch (admin alert)
    items: List[CurrentCcMatchItem] = Field(default_factory=list)


class CurrentCcSheetPublic(BaseModel):
    id: int
    subject_user_id: int
    subject_name: str
    sheet_date: date
    filled_by_user_id: Optional[int] = None
    filled_by_name: Optional[str] = None
    target_ccs: Optional[float] = None

    direct_persons: List[str]
    direct_total_ccs: Optional[float] = None
    real_active_persons: List[str]
    light_active_persons: List[str]

    closed_persons: List[CcPersonRow]
    pending_persons: List[CcPersonRow]

    enrollment_rows: List[EnrollmentRow]

    lead_cycle_rows: List[LeadCycleRow]
    lead_covered: Optional[str] = None
    process_check: Optional[str] = None

    enrollment_tracking_rows: List[EnrollmentTrackingRow]
    drop_reason_remarks: Optional[str] = None

    improvement_area: Optional[str] = None

    # Server-computed totals.
    closed_total_ccs: float = 0.0
    pending_total_ccs: float = 0.0
    current_ccs: float = 0.0  # closed CCs achieved so far
    enrollment_total: int = 0
    lead_cycle_checked: int = 0
    lead_cycle_total: int = 0

    can_edit: bool = True
    updated_at: Optional[datetime] = None

    actuals: CurrentCcActuals = Field(default_factory=CurrentCcActuals)
    match: CurrentCcMatch = Field(default_factory=CurrentCcMatch)


class CurrentCcOverviewRow(BaseModel):
    subject_user_id: int
    subject_name: str
    filled: bool = False
    current_ccs: float = 0.0
    target_ccs: float = 0.0
    gap: float = 0.0  # target - current
    activity_total: int = 0  # calls + leads + follow-ups that day (reliable)
    match_overall: str = "none"
    flagged: bool = False


class CurrentCcOverviewResponse(BaseModel):
    sheet_date: date
    rows: List[CurrentCcOverviewRow] = Field(default_factory=list)
    flagged_count: int = 0
    not_filled_count: int = 0


class CurrentCcActivityBreakdown(BaseModel):
    """Exact, app-logged activity for the subject on the day — counted from
    ``activity_log`` + ``call_events`` (not the member's claim). Each lead action
    is a distinct logged event, so these numbers cannot be inflated by hand."""

    leads_created: int = 0   # action="lead.created"
    leads_uploaded: int = 0  # action in lead.pool_import / lead.free_pool_import
    leads_claimed: int = 0   # action in lead.claimed / lead.claimed_free
    calls_total: int = 0     # rows in call_events
    retarget_calls: int = 0  # call_events on recycle/retarget leads (subset of calls)


class CurrentCcAuto(BaseModel):
    """System-computed Tracking Report — everything derivable from real data.

    Mirrors the manual sheet sections so the form can prefill from it and the
    admin can compare "system computed" vs "member wrote". Two sections are NOT
    here because they are pure human judgement: Process Check (leader's diagnosis)
    and Improvement Area (leader's solution).
    """

    subject_user_id: int
    sheet_date: date

    # 1 — direct downline (children in the org tree)
    direct_persons: List[str] = Field(default_factory=list)
    direct_count: int = 0
    recruitment_low: bool = False  # True when the direct team is below a healthy size

    # 2 / 3 — team activity buckets (this month)
    real_active_persons: List[str] = Field(default_factory=list)
    light_active_persons: List[str] = Field(default_factory=list)

    # 4 — closed leads with realised CCs (approved LeadSale.case_credits)
    closed_persons: List[CcPersonRow] = Field(default_factory=list)
    closed_total_ccs: float = 0.0

    # 5 — seat-held but not yet closed
    pending_persons: List[CcPersonRow] = Field(default_factory=list)

    # 6 — enrollment video shares (per member), fresh/old split is best-effort
    enrollment_rows: List[EnrollmentRow] = Field(default_factory=list)
    enrollment_total: int = 0
    enrollment_split_approx: bool = False

    # 7 — lead cycle: enrollment count + budget recharge submitted/approved
    lead_cycle_rows: List[LeadCycleRow] = Field(default_factory=list)
    lead_covered: Optional[str] = None  # informational summary, leader confirms

    # 8 — today's enrollment movement (state / drop-continue / day-1)
    enrollment_tracking_rows: List[EnrollmentTrackingRow] = Field(default_factory=list)
    drop_reason_remarks: Optional[str] = None

    actuals: CurrentCcActuals = Field(default_factory=CurrentCcActuals)
    activity_breakdown: CurrentCcActivityBreakdown = Field(
        default_factory=CurrentCcActivityBreakdown
    )


class TeamMemberOption(BaseModel):
    user_id: int
    name: str


class CurrentCcTrendPoint(BaseModel):
    date: date
    direct: int = 0
    real_active: int = 0
    light_active: int = 0
    closed: int = 0
    closed_ccs: float = 0.0
    enrollment_total: int = 0
    target_ccs: float = 0.0
    # Reliable activity (DailyMemberStat) for the same day.
    calls: int = 0
    leads_added: int = 0
    followups: int = 0


class CurrentCcTrendResponse(BaseModel):
    subject_user_id: int
    points: List[CurrentCcTrendPoint] = Field(default_factory=list)


class CcComparePeriod(BaseModel):
    label: str  # "Last 7 days" / "Last 30 days"
    # CC is a running snapshot → compare latest value in each window (not a sum).
    cc_current: float = 0.0
    cc_previous: float = 0.0
    cc_pct: Optional[float] = None  # None when previous is 0 (can't divide)
    # Activity is a daily count → sum over the window.
    activity_current: int = 0
    activity_previous: int = 0
    activity_pct: Optional[float] = None


class CcCompareResponse(BaseModel):
    subject_user_id: int
    week: CcComparePeriod
    month: CcComparePeriod
