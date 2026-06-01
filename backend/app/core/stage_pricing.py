"""Day 3 closing — Stage (track) pricing + seat-hold.

Mirrors the old Myle-Dashboard ``TRACKS`` (Slow/Medium/Fast) renamed to Stage 1/2/3.
Prices stored in paise (``_cents``) to match the rest of the money columns.

  Stage 1 (Slow)   ₹8,000   seat-hold ₹2,000
  Stage 2 (Medium) ₹18,000  seat-hold ₹4,000
  Stage 3 (Fast)   ₹38,000  seat-hold ₹8,000   (old Fast seat ₹5,000 → ₹8,000)
"""
from __future__ import annotations

STAGE_PRICING: dict[str, dict[str, object]] = {
    "stage1": {"label": "Stage 1 (Slow)", "price_cents": 800_000, "seat_hold_cents": 200_000},
    "stage2": {"label": "Stage 2 (Medium)", "price_cents": 1_800_000, "seat_hold_cents": 400_000},
    "stage3": {"label": "Stage 3 (Fast)", "price_cents": 3_800_000, "seat_hold_cents": 800_000},
}

STAGE_KEYS: frozenset[str] = frozenset(STAGE_PRICING.keys())

# How long a collected seat-hold reserves the seat before it lapses back to open Day 3.
SEAT_HOLD_WINDOW_HOURS: int = 48


def stage_price_cents(stage: str) -> int:
    return int(STAGE_PRICING[stage]["price_cents"])  # type: ignore[arg-type]


def stage_seat_hold_cents(stage: str) -> int:
    return int(STAGE_PRICING[stage]["seat_hold_cents"])  # type: ignore[arg-type]
