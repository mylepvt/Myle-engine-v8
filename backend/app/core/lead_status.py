"""Allowed values for ``Lead.status`` (DB + API).

Matches the old Myle Dashboard pipeline exactly — do not reorder, only append.
"""

from __future__ import annotations

# Full pipeline sequence — mirrors old app statuses exactly.
LEAD_STATUS_SEQUENCE: tuple[str, ...] = (
    "new_lead",           # Fresh / just added
    "contacted",          # Called / WhatsApp sent
    "invited",            # Invited to watch enrollment video
    "whatsapp_sent",      # WhatsApp message sent before video share
    "video_sent",         # Enrollment link shared
    "video_watched",      # Prospect watched the video
    "paid",               # Min. FLP Billing paid & approved
    "mindset_lock",       # 5-minute mindset lock before leader handoff
    "day1",               # Attending Day 1 session
    "day2",               # Attending Day 2 session
    "day3",               # Day 3 closer stage
    "interview",          # Post Day2 interview stage
    "track_selected",     # Chose Slow/Medium/Fast track
    "seat_hold",          # Seat hold amount paid
    "converted",          # Fully converted / closed won
    "lost",               # Closed lost
    "retarget",           # Re-engage after lost/inactive
    "inactive",           # No response, on hold
    "training",           # In 7-day training program
    "plan_2cc",           # 2-call coaching plan
    "level_up",           # Upsell / level-up stage
    "pending",            # Awaiting action / review
    "new",                # Legacy alias kept for backwards compat
)

LEAD_STATUS_SET: frozenset[str] = frozenset(LEAD_STATUS_SEQUENCE)

# Team role cannot PATCH these statuses (legacy ``TEAM_FORBIDDEN_STATUSES`` — vl2 slugs).
TEAM_FORBIDDEN_STATUS_SLUGS: frozenset[str] = frozenset(
    {
        "day1",
        "day2",
        "day3",
        "interview",
        "track_selected",
        "seat_hold",
        "converted",
        "level_up",
        "training",
        "pending",
        "plan_2cc",
    }
)

# Human-readable labels for API consumers / frontend
LEAD_STATUS_LABELS: dict[str, str] = {
    "new_lead":       "New Lead",
    "contacted":      "Contacted",
    "invited":        "Invited",
    "whatsapp_sent":  "WhatsApp Sent",
    "video_sent":     "Video Sent",
    "video_watched":  "Video Watched",
    "paid":           "Min. FLP Billing",
    "mindset_lock":   "Mindset Lock",
    "day1":           "Day 1",
    "day2":           "Day 2",
    "day3":           "Day 3",
    "interview":      "Interview",
    "track_selected": "Track Selected",
    "seat_hold":      "Seat Hold",
    "converted":      "Converted",
    "lost":           "Lost",
    "retarget":       "Retarget",
    "inactive":       "Inactive",
    "training":       "Training",
    "plan_2cc":       "2CC Plan",
    "level_up":       "Level Up",
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
    "interview",
    "track_selected",
    "seat_hold",
    "converted",
    "lost",
)
