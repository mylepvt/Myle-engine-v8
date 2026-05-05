"""
Map legacy canonical pipeline status strings ↔ vl2 ``Lead.status`` values.

vl2 uses a small closed set (``app.core.lead_status``). Legacy dashboards used
long Hindi/English pipeline labels — normalize via ``normalize_flow_status`` first.
"""

from __future__ import annotations

from app.core.lead_status import LEAD_STATUS_SEQUENCE
from app.core.pipeline_rules import normalize_flow_status

VL2_NEW = "new"
VL2_CONTACTED = "contacted"
VL2_QUALIFIED = "qualified"
VL2_WON = "won"
VL2_LOST = "lost"

# Explicit buckets after alias normalization (see pipeline_rules.normalize_flow_status)
_LEGACY_VL2_NEW = frozenset({"New Lead"})
_LEGACY_VL2_CONTACTED = frozenset(
    {"Contacted", "Invited", "WhatsApp Sent", "Video Sent", "Video Watched"},
)
_LEGACY_VL2_QUALIFIED = frozenset(
    {
        "Min. FLP Billing",
        "Day 1",
        "Day 2",
        "Interview",
        "Track Selected",
        "Seat Hold Confirmed",
        "Pending",
        "2cc Plan",
        "Level Up",
        "Training",
    },
)
_LEGACY_VL2_WON = frozenset({"Fully Converted"})
_LEGACY_VL2_LOST = frozenset({"Lost", "Inactive", "Retarget"})


def legacy_canonical_to_vl2_status(legacy_status: str) -> str:
    """
    Best-effort bucket for a legacy pipeline ``status`` string → vl2 status.

    Used by import tools and mixed-data UIs. Unknown strings default to ``qualified``
    if they look mid-funnel, else ``new``.
    """
    s = normalize_flow_status((legacy_status or "").strip())
    if not s:
        return VL2_NEW
    if s in _LEGACY_VL2_LOST:
        return VL2_LOST
    if s in _LEGACY_VL2_WON:
        return VL2_WON
    if s in _LEGACY_VL2_NEW:
        return VL2_NEW
    if s in _LEGACY_VL2_CONTACTED:
        return VL2_CONTACTED
    if s in _LEGACY_VL2_QUALIFIED:
        return VL2_QUALIFIED
    return VL2_QUALIFIED


def vl2_status_labels() -> tuple[str, ...]:
    """Allowed vl2 API/DB status strings."""
    return LEAD_STATUS_SEQUENCE
