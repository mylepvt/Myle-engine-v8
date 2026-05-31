"""Allowed values for ``Lead.status`` (DB + API).

Matches the old Myle Dashboard pipeline exactly — do not reorder, only append.
"""

from __future__ import annotations

# Active pipeline sequence — matches the live myle vl2 funnel (order preserved).
# Team scope: new_lead → … → mindset_lock. Leader scope: day2 → … → converted/lost.
# Track-pricing stages (track_selected/seat_hold/level_up/plan_2cc) removed — closing
# is the 5k/2cc model handled by the FLP-billing engine, not seat-hold tracks.
LEAD_STATUS_SEQUENCE: tuple[str, ...] = (
    "new_lead",           # Fresh / just claimed → Today's tab
    "contacted",          # Connected on call
    "invited",            # Invitation call done, ready for Day 1
    "whatsapp_sent",      # Auto WhatsApp Day 1 link sent
    "video_sent",         # Day 1 live-session link shared
    "video_watched",      # Prospect watched the Day 1 link (name+number gate)
    "paid",               # Min. FLP Billing paid & admin-approved
    "mindset_lock",       # Team→leader handoff boundary
    "day1",               # Attending Day 1 live session
    "day2",               # Day 2 live session (leader)
    "day3",               # Day 3 closing environment (leader)
    "day4",               # Day 4 MAE batch
    "day5",               # Day 5 MAE batch
    "interview",          # Day 6 interview / final closing
    "converted",          # Closed won → onboarding
    "lost",               # Closed lost
    "retarget",           # Re-engage 1 month later with context
    "inactive",           # No response, on hold
    "training",           # 7-day onboarding training program
    "pending",            # Awaiting action / review (internal)
    "new",                # Legacy alias kept for backwards compat
)

LEAD_STATUS_SET: frozenset[str] = frozenset(LEAD_STATUS_SEQUENCE)

# Team role cannot PATCH these statuses — all post-handoff (leader) stages.
TEAM_FORBIDDEN_STATUS_SLUGS: frozenset[str] = frozenset(
    {
        "day1",
        "day2",
        "day3",
        "day4",
        "day5",
        "interview",
        "converted",
        "training",
        "pending",
    }
)

# Human-readable labels for API consumers / frontend
LEAD_STATUS_LABELS: dict[str, str] = {
    "new_lead":       "New Lead",
    "contacted":      "Contacted",
    "invited":        "Invited",
    "whatsapp_sent":  "WhatsApp Sent",
    "video_sent":     "Day 1st Live",
    "video_watched":  "Video Watched",
    "paid":           "Min. FLP Billing",
    "mindset_lock":   "Mindset Lock",
    "day1":           "Day 1",
    "day2":           "Day 2",
    "day3":           "Day 3",
    "day4":           "Day 4",
    "day5":           "Day 5",
    "interview":      "Interview",
    "converted":      "Converted",
    "lost":           "Lost",
    "retarget":       "Retarget",
    "inactive":       "Inactive",
    "training":       "Training",
    "pending":        "Pending",
    "new":            "New",
}

# Workboard kanban columns — only active pipeline stages
WORKBOARD_COLUMNS: tuple[str, ...] = (
    "new_lead",
    "contacted",
    "invited",
    "whatsapp_sent",
    "video_sent",
    "video_watched",
    "paid",
    "mindset_lock",
    "day1",
    "day2",
    "day3",
    "day4",
    "day5",
    "interview",
    "converted",
    "lost",
)
