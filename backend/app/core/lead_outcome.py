"""Lead Outcome Engine — collapses 14-status pipeline into 4 business outcomes.

Pipeline = work (new_lead → contacted → ... → day3)
Outcome  = result (ACTIVE | CONVERTED | DEAD | RECYCLE)
"""

from __future__ import annotations

OUTCOME_ACTIVE: str = "active"
OUTCOME_CONVERTED: str = "converted"
OUTCOME_DEAD: str = "dead"
OUTCOME_RECYCLE: str = "recycle"

OUTCOME_CHOICES: tuple[str, ...] = (
    OUTCOME_ACTIVE,
    OUTCOME_CONVERTED,
    OUTCOME_DEAD,
    OUTCOME_RECYCLE,
)

OUTCOME_LABELS: dict[str, str] = {
    OUTCOME_ACTIVE: "Active",
    OUTCOME_CONVERTED: "Converted",
    OUTCOME_DEAD: "Dead",
    OUTCOME_RECYCLE: "Recycle",
}

# Map every lead status to its outcome bucket.
OUTCOME_BY_STATUS: dict[str, str] = {
    "new_lead": OUTCOME_ACTIVE,
    "contacted": OUTCOME_ACTIVE,
    "invited": OUTCOME_ACTIVE,
    "video_sent": OUTCOME_ACTIVE,
    "video_watched": OUTCOME_ACTIVE,
    "day1": OUTCOME_ACTIVE,
    "day2": OUTCOME_ACTIVE,
    "day3": OUTCOME_ACTIVE,
    "training": OUTCOME_ACTIVE,
    "new": OUTCOME_ACTIVE,
    "converted": OUTCOME_CONVERTED,
    "lost": OUTCOME_DEAD,
    "retarget": OUTCOME_RECYCLE,
    "inactive": OUTCOME_RECYCLE,
}

# Terminal outcomes — once reached, the lead is no longer in active pipeline.
TERMINAL_OUTCOMES: frozenset[str] = frozenset({
    OUTCOME_CONVERTED,
    OUTCOME_DEAD,
    OUTCOME_RECYCLE,
})

# Valid reasons when outcome = dead
DROP_REASON_CHOICES: tuple[str, ...] = (
    "no_budget",
    "not_interested",
    "wrong_number",
    "known_zone_miss",
    "no_show_day1",
    "no_show_day2",
    "no_show_day3",
    "duplicate",
    "other",
)

DROP_REASON_LABELS: dict[str, str] = {
    "no_budget": "No Budget",
    "not_interested": "Not Interested",
    "wrong_number": "Wrong Number",
    "known_zone_miss": "Known Zone Miss",
    "no_show_day1": "No Show — Day 1",
    "no_show_day2": "No Show — Day 2",
    "no_show_day3": "No Show — Day 3",
    "duplicate": "Duplicate",
    "other": "Other",
}

# Recycle reasons
RECYCLE_REASON_CHOICES: tuple[str, ...] = (
    "no_response",
    "not_now",
    "follow_up_later",
    "other",
)


def outcome_for_status(status: str) -> str:
    return OUTCOME_BY_STATUS.get(status, OUTCOME_ACTIVE)


def is_terminal_outcome(outcome: str) -> bool:
    return outcome in TERMINAL_OUTCOMES
