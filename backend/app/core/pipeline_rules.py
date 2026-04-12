"""
Legacy-compatible pipeline / status rules (ported from Myle-Dashboard ``services/rule_engine``).

Single source for canonical status strings, team permissions, FSM transitions, and
call-status vocab used when mapping old SQLite data or building UIs that mirror legacy.
vl2 ``Lead.status`` uses a smaller set — see ``legacy_status_bridge``.
"""

from __future__ import annotations

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
    "Video Sent": "prospecting",
    "Video Watched": "prospecting",
    "Paid ₹196": "enrolled",
    "Day 1": "day1",
    "Day 2": "day2",
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
    "day1": "Day 1",
    "day2": "Day 2",
    "day3": "Interview",
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
    "Video Sent",
    "Video Watched",
    "Paid ₹196",
    "Lost",
    "Retarget",
)

# ── Canonical status flow (FSM) ───────────────────────────────────────────────

STATUS_FLOW_ORDER = [
    "New Lead",
    "Contacted",
    "Invited",
    "Video Sent",
    "Video Watched",
    "Paid ₹196",
    "Day 1",
    "Day 2",
    "Interview",
    "Track Selected",
    "Seat Hold Confirmed",
    "Fully Converted",
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

TRACKS = {
    "Slow Track": {"price": 8000, "seat_hold": 2000},
    "Medium Track": {"price": 18000, "seat_hold": 4000},
    "Fast Track": {"price": 38000, "seat_hold": 5000},
}


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
    Canonical FSM flow rules (legacy semantics).
    - Backward / same / statuses outside STATUS_FLOW_ORDER: allowed (legacy/admin fixes).
    - Admin (admin_may_skip_fsm=True): any forward jump within the ordered flow.
    - Leader (default): forward exactly +1 step.
    - Team (for_team=True): any forward jump before Paid ₹196;
      Paid ₹196 only from Video Watched or already Paid ₹196.
    """
    cur = normalize_flow_status(current_status)
    tgt = normalize_flow_status(target_status)
    if not tgt or cur == tgt:
        return True
    flow_idx = {s: i for i, s in enumerate(STATUS_FLOW_ORDER)}
    if cur not in flow_idx or tgt not in flow_idx:
        return True
    if flow_idx[tgt] <= flow_idx[cur]:
        return True
    if admin_may_skip_fsm:
        return True
    if for_team:
        paid_i = flow_idx.get("Paid ₹196")
        if tgt == "Paid ₹196":
            return cur in ("Video Watched", "Paid ₹196")
        if paid_i is not None and flow_idx[tgt] < paid_i:
            return flow_idx[tgt] > flow_idx[cur]
        return False
    return flow_idx[tgt] == flow_idx[cur] + 1


def validate_vl2_status_transition_for_role(
    *,
    current_slug: str,
    target_slug: str,
    role: str,
) -> tuple[bool, str]:
    """
    Validate a ``Lead.status`` change (vl2 slug) using legacy FSM + team forbidden set.

    - Admin: any forward jump within ``STATUS_FLOW_ORDER`` (and backward/same as before).
    - Leader: forward +1 only (unless backward/outside flow).
    - Team: jump rules before ``Paid ₹196``; cannot set ``TEAM_FORBIDDEN_STATUS_SLUGS``.
    """
    from app.core.lead_status import LEAD_STATUS_LABELS, TEAM_FORBIDDEN_STATUS_SLUGS

    if current_slug == target_slug:
        return True, ""
    if role == "team" and target_slug in TEAM_FORBIDDEN_STATUS_SLUGS:
        return False, "Team cannot set this pipeline status"
    cur_label = LEAD_STATUS_LABELS.get(current_slug, current_slug)
    tgt_label = LEAD_STATUS_LABELS.get(target_slug, target_slug)
    cur_h = normalize_flow_status(cur_label)
    tgt_h = normalize_flow_status(tgt_label)
    ok = is_valid_forward_status_transition(
        cur_h,
        tgt_h,
        for_team=(role == "team"),
        admin_may_skip_fsm=(role == "admin"),
    )
    if not ok:
        return False, "Invalid status transition for your role"
    return True, ""


def validate_lead_business_rules(
    status: str,
    payment_done: int,
    payment_amount: float,
    seat_hold_amount: float,
    track_price: float,
) -> tuple[bool, str]:
    """Hard validation before DB write (legacy float rupees + flags)."""
    st = (status or "").strip()
    if int(payment_done or 0) == 1 and float(payment_amount or 0) <= 0:
        return False, "payment_done=1 requires payment_amount > 0"
    if st == "Seat Hold Confirmed" and float(seat_hold_amount or 0) <= 0:
        return False, "Seat Hold Confirmed requires seat_hold_amount > 0"
    if st == "Fully Converted" and float(track_price or 0) <= 0:
        return False, "Fully Converted requires track_price > 0"
    return True, ""
