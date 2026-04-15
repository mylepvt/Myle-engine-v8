"""CTCS heat score helpers (single place for clamp + contacted bonus)."""

from __future__ import annotations

from app.models.lead import Lead

CONTACTED_HEAT_BONUS = 10


def clamp_ctcs_heat(value: int) -> int:
    return max(0, min(100, int(value)))


def bump_heat_on_entering_contacted(lead: Lead, previous_status: str) -> None:
    """Charter: +10 when lead first reaches ``contacted`` (idempotent if already contacted)."""
    if lead.status != "contacted":
        return
    if previous_status == "contacted":
        return
    lead.heat_score = clamp_ctcs_heat(int(lead.heat_score or 0) + CONTACTED_HEAT_BONUS)
