"""
Legacy-compatible pipeline / status rules (ported from Myle-Dashboard ``services/rule_engine``).

Single source for canonical status strings, team permissions, FSM transitions, and
call-status vocab used when mapping old SQLite data or building UIs that mirror legacy.
vl2 ``Lead.status`` uses a smaller set — see ``legacy_status_bridge``.

Merged from ``pipeline_legacy.py`` (deleted) — all legacy constants and helpers live here.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.row_utils import mapping_get

# ── Call classification buckets (discipline / analytics) ──────────────────────

CALL_STATUS_NOT_INTERESTED_BUCKET = frozenset({"Called - Not Interested"})

CALL_STATUS_NO_RESPONSE_BUCKET = frozenset(
    {
        "Called - No Answer",
        "Called - Switch Off",
        "Called - Busy",
    }
)

CALL_STATUS_INTERESTED_BUCKET = frozenset(
    {
        "Called - Interested",
        "Called - Follow Up",
        "Call Back",
        "Video Sent",
        "Video Watched",
        "Payment Done",
    }
)

# ── Claim gate ────────────────────────────────────────────────────────────────

CLAIM_GATE_EXIT_STATUSES = ("Lost", "Retarget", "Converted", "Fully Converted")

# ── Pipeline stage rules ──────────────────────────────────────────────────────

PIPELINE_AUTO_EXPIRE_STATUSES = [
    "Day 1",
    "Day 2",
    "Interview",
    "2cc Plan",
    "Track Selected",
    "Seat Hold Confirmed",
    "Level Up",
]

SLA_SOFT_WATCH_EXCLUDE = (
    "Lost",
    "Retarget",
    "Inactive",
    "Converted",
)

STATUS_TO_STAGE = {
    "New Lead": "prospecting",
    "New": "prospecting",
    "Contacted": "prospecting",
    "Invited": "prospecting",
    "WhatsApp Sent": "prospecting",
    "Video Sent": "prospecting",
    "Min. FLP Billing": "enrolled",
    "Day 1": "day1",
    "Day 2": "day2",
    "Day 3": "day3",
    "Interview": "day3",
    "2cc Plan": "plan_2cc",
    "Track Selected": "day3",
    "Seat Hold Confirmed": "seat_hold",
    "Pending": "pending",
    "Level Up": "level_up",
    "Fully Converted": "closing",
    "Training": "training",
    "Converted": "complete",
    "Lost": "lost",
    "Retarget": "prospecting",
    "Inactive": "inactive",
}

STAGE_TO_DEFAULT_STATUS = {
    "enrollment": "New Lead",
    "enrolled": "Min. FLP Billing",
    "day1": "Day 1",
    "day2": "Day 2",
    "day3": "Day 3",
    "seat_hold": "Seat Hold Confirmed",
    "closing": "Fully Converted",
    "training": "Training",
    "complete": "Converted",
    "lost": "Lost",
}

# ── Role-based status permissions ─────────────────────────────────────────────

TEAM_FORBIDDEN_STATUSES = frozenset(
    [
        "Day 1",
        "Day 2",
        "Day 3",
        "Interview",
        "Track Selected",
        "Seat Hold Confirmed",
        "Fully Converted",
        "Level Up",
        "Training",
        "Converted",
        "Pending",
        "2cc Plan",
    ]
)

TEAM_ALLOWED_STATUSES = (
    "New Lead",
    "Contacted",
    "Invited",
    "WhatsApp Sent",
    "Video Sent",
    "Video Watched",
    "Min. FLP Billing",
    "Lost",
    "Retarget",
)

# ── Canonical status flow (FSM) ───────────────────────────────────────────────

# Canonical FSM flow — labels MUST mirror ``LEAD_STATUS_LABELS`` exactly so the
# slug→label lookup in ``validate_vl2_status_transition_for_role`` lands in-flow.
# Team forward scope ends at "Video Watched"; "Day 1"+ are post-handoff (leader/admin).
STATUS_FLOW_ORDER = [
    "New Lead",          # new_lead
    "Contacted",         # contacted
    "Invited",           # invited
    "Enrollment Live",   # video_sent  (single open token link, replaces enrollment)
    "Video Watched",     # video_watched  ← team forward boundary
    "Day 1",             # day1   (post-handoff / leader)
    "Day 2",             # day2   (admin advances)
    "Day 3",             # day3   (closing — leader)
    "Fully Converted",   # converted (normalize maps "Converted" → here)
]

CALL_STATUS_VALUES = [
    "Not Called Yet",
    "Called - No Answer",
    "Called - Interested",
    "Called - Not Interested",
    "Called - Follow Up",
    "Called - Switch Off",
    "Called - Busy",
    "Call Back",
    "Wrong Number",
    "Video Sent",
    "Video Watched",
    "Payment Done",
    "Already forever",
    "Retarget",
]

TEAM_CALL_STATUS_VALUES = [
    "Not Called Yet",
    "Called - No Answer",
    "Called - Interested",
    "Called - Not Interested",
    "Called - Follow Up",
    "Called - Switch Off",
    "Called - Busy",
    "Call Back",
    "Wrong Number",
]

def normalize_flow_status(status: str) -> str:
    """Normalize legacy status aliases to canonical names."""
    s = (status or "").strip()
    if s == "New":
        return "New Lead"
    if s == "Converted":
        return "Fully Converted"
    return s


def is_valid_forward_status_transition(
    current_status: str,
    target_status: str,
    *,
    for_team: bool = False,
    admin_may_skip_fsm: bool = False,
) -> bool:
    """
    Canonical FSM flow rules.
    - Backward / same / statuses outside STATUS_FLOW_ORDER: allowed.
    - Admin & Leader (admin_may_skip_fsm=True): any forward jump.
    - Team: forward jumps only up to and including Video Watched; blocked beyond.
    Flow: New Lead → … → Enrollment Live → Video Watched →
          Day 1 → Day 2 → Day 3 → Fully Converted
    """
    cur = normalize_flow_status(current_status)
    tgt = normalize_flow_status(target_status)
    if not tgt or cur == tgt:
        return True
    flow_idx = {s: i for i, s in enumerate(STATUS_FLOW_ORDER)}
    if cur not in flow_idx or tgt not in flow_idx:
        return True
    if flow_idx[tgt] <= flow_idx[cur]:
        return True  # same / backward always allowed
    if admin_may_skip_fsm:
        return True  # admin & leader: free forward jumps
    if for_team:
        team_boundary = flow_idx.get("Video Watched", len(STATUS_FLOW_ORDER) - 1)
        return flow_idx[tgt] <= team_boundary
    return True


# ── Per-day advance role gate (mirrors old-app ACTION_MAP) ────────────────────
# Who is allowed to ADVANCE a lead INTO each post-handoff stage. Backward moves
# and same-stage edits are not gated here. Team is already blocked beyond
# Video Watched by ``TEAM_FORBIDDEN_STATUS_SLUGS``.
#   day1   = leader/admin (handoff: team records video_watched, leader takes over)
#   day2   = leader/admin
#   day3   = leader/admin/team (team members may advance once batches+test gate is met)
#   converted = leader/admin (Day 3 close)
DAY_ADVANCE_ALLOWED_ROLES: dict[str, frozenset[str]] = {
    "day1": frozenset({"leader", "admin"}),
    "day2": frozenset({"leader", "admin"}),
    "day3": frozenset({"leader", "admin", "team"}),
    "converted": frozenset({"leader", "admin"}),
}


def validate_vl2_status_transition_for_role(
    *,
    current_slug: str,
    target_slug: str,
    role: str,
) -> tuple[bool, str]:
    """
    Validate a ``Lead.status`` change (vl2 slug) using FSM + team forbidden set
    + per-day advance role gate.

    - Admin: any forward jump.
    - Leader: full control — any forward jump including Day 3.
    - Team: free jumps up to Video Watched; cannot set ``TEAM_FORBIDDEN_STATUS_SLUGS``.
    """
    from app.core.lead_status import (
        LEAD_STATUS_LABELS,
        LEAD_STATUS_SEQUENCE,
        TEAM_FORBIDDEN_STATUS_SLUGS,
    )

    if current_slug == target_slug:
        return True, ""
    if role == "team" and target_slug in TEAM_FORBIDDEN_STATUS_SLUGS:
        return False, "Team cannot set this pipeline status"

    # Per-day advance gate — only on a genuine FORWARD move into the gated stage.
    seq_idx = {s: i for i, s in enumerate(LEAD_STATUS_SEQUENCE)}
    is_forward = (
        current_slug in seq_idx
        and target_slug in seq_idx
        and seq_idx[target_slug] > seq_idx[current_slug]
    )
    if is_forward:
        allowed = DAY_ADVANCE_ALLOWED_ROLES.get(target_slug)
        if allowed is not None and role not in allowed:
            if target_slug == "day3":
                return False, "Only an admin can advance a lead to Day 3"
            return False, "You are not allowed to advance the lead to this stage"

    # Team may advance day2→day3 once the batch+test gate is satisfied
    # (checked in leads_service). Skip the FSM boundary restriction for this path.
    if role == "team" and current_slug == "day2" and target_slug == "day3":
        pass
    else:
        cur_label = LEAD_STATUS_LABELS.get(current_slug, current_slug)
        tgt_label = LEAD_STATUS_LABELS.get(target_slug, target_slug)
        cur_h = normalize_flow_status(cur_label)
        tgt_h = normalize_flow_status(tgt_label)
        ok = is_valid_forward_status_transition(
            cur_h,
            tgt_h,
            for_team=(role == "team"),
            admin_may_skip_fsm=(role in ("admin", "leader")),
        )
        if not ok:
            return False, "Invalid status transition for your role"
    return True, ""


def validate_lead_business_rules(
    status: str,
    payment_done: int,
    payment_amount: float,
) -> tuple[bool, str]:
    """Hard validation before DB write (Min. FLP Billing payment flag)."""
    if int(payment_done or 0) == 1 and float(payment_amount or 0) <= 0:
        return False, "payment_done=1 requires payment_amount > 0"
    return True, ""


# ═══════════════════════════════════════════════════════════════════════════════
# Legacy constants & helpers (merged from pipeline_legacy.py)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Inactivity / discipline tiers ──────────────────────────────────────────────

INACTIVITY_WARN_HOURS = 24
INACTIVITY_BLOCK_CLAIM_HOURS = 48
INACTIVITY_LOCK_HOURS = 72

# ── Daily call / claim discipline (IST) ────────────────────────────────────────

DAILY_CALL_TARGET_DEFAULT = 15
DAILY_CALL_WARN_CAP = 15
DAILY_CALL_ENFORCE_START_HOUR_IST = 21
LOW_PERF_CALL_THRESHOLD = 6
LOW_PERF_STREAK_BLOCK = 2
LOW_PERF_STREAK_REMOVE = 3
GRACE_MAX_PER_30_DAYS = 2
GRACE_REPEAT_THRESHOLD = 2

# ── Quality / effort ───────────────────────────────────────────────────────────

QUALITY_TREND_WINDOW_DAYS = 5
QUALITY_TREND_MIN_GOOD_DAYS = 3
LOW_EFFORT_BLOCK_STREAK = 2
QUALITY_MARKET_COLD_MIN_TOUCHED = 5
QUALITY_MARKET_COLD_NO_RESPONSE_RATIO = 0.55

# ── Full legacy status list (display / import) ─────────────────────────────────

STATUSES = [
    "New Lead", "New", "Contacted", "Invited", "WhatsApp Sent",
    "Video Sent", "Video Watched", "Min. FLP Billing", "Mindset Lock",
    "Day 1", "Day 2", "Day 3", "Interview", "2cc Plan",
    "Track Selected", "Seat Hold Confirmed", "Pending", "Level Up",
    "Fully Converted", "Training", "Converted", "Lost", "Retarget", "Inactive",
]

WORKING_ENROLLMENT_STATUSES = (
    "New Lead", "New", "Contacted", "Invited", "WhatsApp Sent",
    "Video Sent", "Video Watched",
)
WORKING_ENROLLED_STATUSES = ("Min. FLP Billing", "Mindset Lock")
WORKING_SIDE_PIPELINE_STATUSES = ("Retarget", "Inactive", "2cc Plan", "Level Up", "Training")
WORKING_BOARD_HOME_STATUSES = frozenset(
    list(WORKING_ENROLLMENT_STATUSES)
    + list(WORKING_ENROLLED_STATUSES)
    + ["Day 1", "Day 2", "Day 3", "Interview", "Track Selected",
       "Seat Hold Confirmed", "Fully Converted", "Converted", "Lost"]
    + list(WORKING_SIDE_PIPELINE_STATUSES)
)

ADMIN_PIPELINE_BUCKET_ENROLLMENT = (
    "New Lead", "Contacted", "Invited", "WhatsApp Sent",
    "Video Sent", "Video Watched", "Min. FLP Billing", "Mindset Lock",
)
ADMIN_PIPELINE_BUCKET_TRAINING = (
    "Day 1", "Day 2", "Day 3", "Interview",
    "Track Selected", "2cc Plan", "Seat Hold Confirmed",
)
ADMIN_PIPELINE_BUCKET_CLOSING = ("Pending", "Converted", "Fully Converted")

TEAM_MY_LEADS_READONLY_STATUSES = frozenset({
    "Day 1", "Day 2", "Day 3", "Interview", "Track Selected",
    "Seat Hold Confirmed", "Fully Converted", "Converted", "Pending",
    "2cc Plan", "Level Up", "Training",
})

PRE_DAY1_PIPELINE_STAGES = frozenset({"prospecting", "enrolled", "enrollment"})

# ── Call result tags ──────────────────────────────────────────────────────────

CALL_RESULT_TAGS = [
    "", "No Answer", "Switched Off", "Busy", "Call Later",
    "Not Interested", "Follow-up Needed", "Hot Lead",
]

CALL_RESULT_LEGACY = frozenset({
    "Missed Follow-up", "Call Not Picked", "Phone Switched Off",
    "Not Reachable", "Follow Up Later", "Callback Requested",
    "Wrong Number", "Interested", "Connected", "Spoke to lead",
    "Already Forever Living Distributor", "Already in Another Network",
    "Underage", "Language Barrier",
})

RETARGET_TAGS = (
    "No Answer", "Switched Off", "Busy", "Call Later", "Follow-up Needed",
    "Call Not Picked", "Phone Switched Off", "Not Reachable",
    "Follow Up Later", "Callback Requested",
)

FOLLOWUP_TAGS = (
    "Call Later", "Follow-up Needed", "No Answer", "Switched Off", "Busy",
    "Hot Lead", "Follow Up Later", "Callback Requested", "Call Not Picked",
    "Phone Switched Off", "Not Reachable",
)

SOURCES = ["WhatsApp", "Facebook", "Instagram", "LinkedIn", "Referral", "Walk-in", "Other"]


def team_my_leads_status_readonly(status: str) -> bool:
    return (status or "").strip() in TEAM_MY_LEADS_READONLY_STATUSES


def team_status_dropdown_choices(current_status: str) -> list[str]:
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
    return STATUS_TO_STAGE.get(normalize_flow_status((status or "").strip()), "prospecting")


def team_in_pre_day1_execution(lead_row: Any) -> bool:
    raw = mapping_get(lead_row, "pipeline_stage")
    if raw is not None and str(raw).strip():
        st = str(raw).strip()
    else:
        st = pipeline_stage_for_legacy_status(str(mapping_get(lead_row, "status") or ""))
    return st in PRE_DAY1_PIPELINE_STAGES


def call_result_allowed(tag: str) -> bool:
    return (tag in CALL_RESULT_TAGS) or (tag in CALL_RESULT_LEGACY)


def leader_own_assigned_lead(row: Any, acting_user_id: Optional[int]) -> bool:
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
    legacy = mapping_get(row, "payment_proof_approval_status")
    if legacy is not None and str(legacy).strip():
        s = str(legacy).strip().lower()
        if s in ("pending", "rejected", "approved"):
            return s
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


def flp_billing_execution_blocked_for_role(
    row: Any,
    *,
    role: str,
    acting_user_id: Optional[int],
    current_status: str,
    is_transition_to_flp_billing_funnel: bool,
    gate_enabled: bool = True,
) -> tuple[bool, str]:
    if not gate_enabled:
        return False, ""
    if not is_transition_to_flp_billing_funnel:
        return False, ""
    if role == "admin":
        return False, ""

    cur_n = normalize_flow_status((current_status or "").strip())
    proof = (mapping_get(row, "payment_proof_url") or mapping_get(row, "payment_proof_path") or "").strip()
    ap = payment_proof_approval_status_value(row)

    if _proof_on_file(row):
        return False, ""

    if role == "team":
        if cur_n in ("Min. FLP Billing",):
            return False, ""
        if not proof:
            return True, "₹1500 payment proof screenshot upload karo, phir Min. FLP Billing set karo."
        if ap != "approved":
            if ap == "pending":
                return True, "Apne leader se ₹1500 proof approve hone ka wait karo — tab hi Paid / Payment Done allowed."
            return True, "₹1500 proof reject ho chuka hai — naya screenshot upload karo aur leader se dubara approve karwao."
        return False, ""

    if role == "leader" and leader_own_assigned_lead(row, acting_user_id):
        if cur_n in ("Min. FLP Billing",):
            return False, ""
        if not proof:
            return True, "₹1500 payment proof screenshot upload karo (leader — apni claimed / import / quick-add lead)."
        if ap != "approved":
            if ap == "pending":
                return True, "Admin se ₹1500 proof approve hone ka wait karo — tab hi Paid / Day 1 / Payment Done allowed."
            return True, "₹1500 proof reject ho chuka hai — naya screenshot upload karo aur dubara admin se approve karwao."
        return False, ""

    return False, ""
