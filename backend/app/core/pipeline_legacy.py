"""
Legacy pipeline constants and pure helpers (ported from monolith ``helpers.py``).

Database-heavy routines (metrics, discipline SQL, enrichment) stay in import scripts or
future ``app.services`` modules — this file is the **stateless** surface aligned with
``pipeline_rules`` and vl2 lead fields.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.pipeline_rules import (
    STATUS_TO_STAGE,
    TEAM_ALLOWED_STATUSES,
    normalize_flow_status,
)
from app.core.row_utils import mapping_get

# ── Inactivity / discipline tiers (hours since last app activity) ───────────────

INACTIVITY_WARN_HOURS = 24
INACTIVITY_BLOCK_CLAIM_HOURS = 48
INACTIVITY_LOCK_HOURS = 72

# ── Daily call / claim discipline (IST) ───────────────────────────────────────

DAILY_CALL_TARGET_DEFAULT = 15
DAILY_CALL_WARN_CAP = 15
DAILY_CALL_ENFORCE_START_HOUR_IST = 21
LOW_PERF_CALL_THRESHOLD = 6
LOW_PERF_STREAK_BLOCK = 2
LOW_PERF_STREAK_REMOVE = 3
GRACE_MAX_PER_30_DAYS = 2
GRACE_REPEAT_THRESHOLD = 2

# ── Quality / effort (legacy Step 5) ─────────────────────────────────────────

QUALITY_TREND_WINDOW_DAYS = 5
QUALITY_TREND_MIN_GOOD_DAYS = 3
LOW_EFFORT_BLOCK_STREAK = 2
QUALITY_MARKET_COLD_MIN_TOUCHED = 5
QUALITY_MARKET_COLD_NO_RESPONSE_RATIO = 0.55

# ── Full legacy status list (display / import) ─────────────────────────────────

STATUSES = [
    "New Lead",
    "New",
    "Contacted",
    "Invited",
    "Video Sent",
    "Video Watched",
    "Paid ₹196",
    "Day 1",
    "Day 2",
    "Interview",
    "2cc Plan",
    "Track Selected",
    "Seat Hold Confirmed",
    "Pending",
    "Level Up",
    "Fully Converted",
    "Training",
    "Converted",
    "Lost",
    "Retarget",
    "Inactive",
]

WORKING_ENROLLMENT_STATUSES = (
    "New Lead",
    "New",
    "Contacted",
    "Invited",
    "Video Sent",
    "Video Watched",
)
WORKING_ENROLLED_STATUSES = ("Paid ₹196",)
WORKING_SIDE_PIPELINE_STATUSES = (
    "Retarget",
    "Inactive",
    "2cc Plan",
    "Level Up",
    "Training",
)
WORKING_BOARD_HOME_STATUSES = frozenset(
    list(WORKING_ENROLLMENT_STATUSES)
    + list(WORKING_ENROLLED_STATUSES)
    + [
        "Day 1",
        "Day 2",
        "Interview",
        "Track Selected",
        "Seat Hold Confirmed",
        "Fully Converted",
        "Converted",
        "Lost",
    ]
    + list(WORKING_SIDE_PIPELINE_STATUSES)
)

ADMIN_PIPELINE_BUCKET_ENROLLMENT = (
    "New Lead",
    "Contacted",
    "Invited",
    "Video Sent",
    "Video Watched",
    "Paid ₹196",
)
ADMIN_PIPELINE_BUCKET_TRAINING = (
    "Day 1",
    "Day 2",
    "Interview",
    "Track Selected",
    "2cc Plan",
    "Seat Hold Confirmed",
)
ADMIN_PIPELINE_BUCKET_CLOSING = ("Pending", "Converted", "Fully Converted")

TEAM_MY_LEADS_READONLY_STATUSES = frozenset(
    {
        "Day 1",
        "Day 2",
        "Interview",
        "Track Selected",
        "Seat Hold Confirmed",
        "Fully Converted",
        "Converted",
        "Pending",
        "2cc Plan",
        "Level Up",
        "Training",
    }
)

PRE_DAY1_PIPELINE_STAGES = frozenset({"prospecting", "enrolled", "enrollment"})

# ── Call result tags (after-call reason) ───────────────────────────────────────

CALL_RESULT_TAGS = [
    "",
    "No Answer",
    "Switched Off",
    "Busy",
    "Call Later",
    "Not Interested",
    "Follow-up Needed",
    "Hot Lead",
]

CALL_RESULT_LEGACY = frozenset(
    {
        "Missed Follow-up",
        "Call Not Picked",
        "Phone Switched Off",
        "Not Reachable",
        "Follow Up Later",
        "Callback Requested",
        "Wrong Number",
        "Interested",
        "Connected",
        "Spoke to lead",
        "Already Forever Living Distributor",
        "Already in Another Network",
        "Underage",
        "Language Barrier",
    }
)

RETARGET_TAGS = (
    "No Answer",
    "Switched Off",
    "Busy",
    "Call Later",
    "Follow-up Needed",
    "Call Not Picked",
    "Phone Switched Off",
    "Not Reachable",
    "Follow Up Later",
    "Callback Requested",
)

FOLLOWUP_TAGS = (
    "Call Later",
    "Follow-up Needed",
    "No Answer",
    "Switched Off",
    "Busy",
    "Hot Lead",
    "Follow Up Later",
    "Callback Requested",
    "Call Not Picked",
    "Phone Switched Off",
    "Not Reachable",
)

SOURCES = [
    "WhatsApp",
    "Facebook",
    "Instagram",
    "LinkedIn",
    "Referral",
    "Walk-in",
    "Other",
]


def team_my_leads_status_readonly(status: str) -> bool:
    return (status or "").strip() in TEAM_MY_LEADS_READONLY_STATUSES


def team_status_dropdown_choices(current_status: str) -> list[str]:
    """Team dropdown = TEAM_ALLOWED_STATUSES; readonly pipeline → single current value."""
    cur = (current_status or "").strip()
    cur_n = normalize_flow_status(cur)
    if cur_n in TEAM_MY_LEADS_READONLY_STATUSES:
        return [cur]
    if cur_n and cur_n not in TEAM_ALLOWED_STATUSES:
        return [cur]
    return list(TEAM_ALLOWED_STATUSES)


def team_status_option_selected(option: str, lead_status: str) -> bool:
    return normalize_flow_status(option or "") == normalize_flow_status(lead_status or "")


def pipeline_stage_for_legacy_status(status: str) -> str:
    """Infer monolith ``pipeline_stage`` column from canonical lead status."""
    return STATUS_TO_STAGE.get(normalize_flow_status((status or "").strip()), "prospecting")


def team_in_pre_day1_execution(lead_row: Any) -> bool:
    """
    True when lead is in pre–Day 1 funnel (prospecting / enrollment stages).

    Uses ``pipeline_stage`` on the row when present; otherwise derives from ``status``.
    """
    raw = mapping_get(lead_row, "pipeline_stage")
    if raw is not None and str(raw).strip():
        st = str(raw).strip()
    else:
        st = pipeline_stage_for_legacy_status(str(mapping_get(lead_row, "status") or ""))
    return st in PRE_DAY1_PIPELINE_STAGES


def call_result_allowed(tag: str) -> bool:
    return (tag in CALL_RESULT_TAGS) or (tag in CALL_RESULT_LEGACY)


def leader_own_assigned_lead(row: Any, acting_user_id: Optional[int]) -> bool:
    """True when acting user is the assigned owner (legacy + vl2 column names)."""
    if acting_user_id is None:
        return False
    raw = mapping_get(row, "assigned_to_user_id")
    if raw is None:
        raw = mapping_get(row, "assigned_user_id")
    try:
        aid = int(raw or 0)
    except (TypeError, ValueError):
        return False
    return aid == int(acting_user_id)


def payment_proof_approval_status_value(row: Any) -> str:
    """Normalized approval: ``pending`` | ``rejected`` | ``approved``."""
    legacy = mapping_get(row, "payment_proof_approval_status")
    if legacy is not None and str(legacy).strip():
        s = str(legacy).strip().lower()
        if s in ("pending", "rejected", "approved"):
            return s
    # vl2 Lead.payment_status
    ps = mapping_get(row, "payment_status")
    if ps is not None:
        t = str(ps).strip().lower()
        if t == "proof_uploaded":
            return "pending"
        if t in ("pending", "rejected", "approved"):
            return t
    return "pending"


def _proof_on_file(row: Any) -> bool:
    path = (mapping_get(row, "payment_proof_url") or mapping_get(row, "payment_proof_path") or "").strip()
    return bool(path) and payment_proof_approval_status_value(row) == "approved"


def rupees_196_execution_blocked_for_role(
    row: Any,
    *,
    role: str,
    acting_user_id: Optional[int],
    current_status: str,
    is_transition_to_paid_196_funnel: bool,
    gate_enabled: bool = True,
) -> tuple[bool, str]:
    """
    ₹196 gate: proof + approval before entering Paid ₹196 funnel (legacy messages).

    Works with legacy rows and vl2 ``Lead``-shaped dicts (``payment_proof_url``,
    ``payment_status``).
    """
    if not gate_enabled:
        return False, ""
    if not is_transition_to_paid_196_funnel:
        return False, ""
    if role == "admin":
        return False, ""

    cur_n = normalize_flow_status((current_status or "").strip())
    proof = (mapping_get(row, "payment_proof_url") or mapping_get(row, "payment_proof_path") or "").strip()
    ap = payment_proof_approval_status_value(row)

    if _proof_on_file(row):
        return False, ""

    if role == "team":
        if cur_n == "Paid ₹196":
            return False, ""
        if not proof:
            return True, "₹196 payment proof screenshot upload karo, phir Paid ₹196 set karo."
        if ap != "approved":
            if ap == "pending":
                return True, (
                    "Apne leader se ₹196 proof approve hone ka wait karo — tab hi Paid / Payment Done allowed."
                )
            return True, (
                "₹196 proof reject ho chuka hai — naya screenshot upload karo aur leader se dubara approve karwao."
            )
        return False, ""

    if role == "leader" and leader_own_assigned_lead(row, acting_user_id):
        if cur_n == "Paid ₹196":
            return False, ""
        if not proof:
            return True, (
                "₹196 payment proof screenshot upload karo (leader — apni claimed / import / quick-add lead)."
            )
        if ap != "approved":
            if ap == "pending":
                return True, (
                    "Admin se ₹196 proof approve hone ka wait karo — tab hi Paid / Day 1 / Payment Done allowed."
                )
            return True, (
                "₹196 proof reject ho chuka hai — naya screenshot upload karo aur dubara admin se approve karwao."
            )
        return False, ""

    return False, ""
