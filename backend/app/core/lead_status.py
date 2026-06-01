"""Allowed values for ``Lead.status`` (DB + API).

Matches the old Myle Dashboard pipeline exactly — do not reorder, only append.
"""

from __future__ import annotations

# Active pipeline sequence — mirrors the old Myle-Dashboard flow.
# Team scope: new_lead → … → video_watched. Leader/admin scope: day1 → … → converted.
# Handoff at video_watched→day1 (team records the Day-1-live watch, then leader takes over).
# Per-day ownership: day1 = leader, day2 = admin, day3 = leader (closing).
# Removed (root): whatsapp_sent (merged into the Day 1 Live link step), paid/Min-FLP-early
# (FLP billing now wires at Day 3 close), mindset_lock, day4, day5, interview (now a Day 3
# closing sub-step), pending.
LEAD_STATUS_SEQUENCE: tuple[str, ...] = (
    "new_lead",           # Fresh / just claimed → Today's tab
    "contacted",          # Connected on call
    "invited",            # Invitation call done, ready for Day 1
    "video_sent",         # Day 1 Live link shared (single open token link)
    "video_watched",      # Prospect watched the Day 1 link (name+number gate)
    "day1",               # Day 1 live session — leader
    "day2",               # Day 2 live session — admin
    "day3",               # Day 3 closing environment (interview → 2CC → blueprint → stage) — leader
    "converted",          # Closed won → onboarding
    "lost",               # Closed lost
    "retarget",           # Re-engage 1 month later with context
    "inactive",           # No response, on hold
    "training",           # 7-day onboarding training program
    "new",                # Legacy alias kept for backwards compat
)

LEAD_STATUS_SET: frozenset[str] = frozenset(LEAD_STATUS_SEQUENCE)

# Team role cannot PATCH these statuses — all post-handoff (leader/admin) stages.
TEAM_FORBIDDEN_STATUS_SLUGS: frozenset[str] = frozenset(
    {
        "day1",
        "day2",
        "day3",
        "converted",
        "training",
    }
)

# Human-readable labels for API consumers / frontend
LEAD_STATUS_LABELS: dict[str, str] = {
    "new_lead":       "New Lead",
    "contacted":      "Contacted",
    "invited":        "Invited",
    "video_sent":     "Day 1 Live",
    "video_watched":  "Video Watched",
    "day1":           "Day 1",
    "day2":           "Day 2",
    "day3":           "Day 3",
    "converted":      "Converted",
    "lost":           "Lost",
    "retarget":       "Retarget",
    "inactive":       "Inactive",
    "training":       "Training",
    "new":            "New",
}

# Workboard kanban columns — only active pipeline stages
WORKBOARD_COLUMNS: tuple[str, ...] = (
    "new_lead",
    "contacted",
    "invited",
    "video_sent",
    "video_watched",
    "day1",
    "day2",
    "day3",
    "converted",
    "lost",
)

# Legacy → new status remap (used by data migration + defensive normalization).
LEGACY_STATUS_REMAP: dict[str, str] = {
    "whatsapp_sent":  "video_sent",
    "paid":           "day1",
    "mindset_lock":   "day1",
    "day4":           "day3",
    "day5":           "day3",
    "interview":      "day3",
    "day6":           "day3",
    "pending":        "day3",
}


def normalize_status_slug(slug: str | None) -> str:
    """Map any removed/legacy slug onto its active replacement."""
    s = (slug or "").strip()
    return LEGACY_STATUS_REMAP.get(s, s)
