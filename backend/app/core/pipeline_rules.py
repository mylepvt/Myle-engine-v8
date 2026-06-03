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
#   day3   = leader/admin (leader has full status control over their leads)
#   converted = leader/admin (Day 3 close)
DAY_ADVANCE_ALLOWED_ROLES: dict[str, frozenset[str]] = {
    "day1": frozenset({"leader", "admin"}),
    "day2": frozenset({"leader", "admin"}),
    "day3": frozenset({"leader", "admin"}),
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
