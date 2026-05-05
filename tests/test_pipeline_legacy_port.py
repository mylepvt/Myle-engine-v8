"""Tests for ported monolith pipeline helpers (``pipeline_rules``, ``pipeline_legacy``, bridge)."""

from __future__ import annotations

import pytest

from app.core.legacy_status_bridge import legacy_canonical_to_vl2_status
from app.core.pipeline_legacy import (
    flp_billing_execution_blocked_for_role,
    team_status_dropdown_choices,
    team_status_option_selected,
)
from app.core.pipeline_rules import (
    TEAM_FORBIDDEN_STATUSES,
    is_valid_forward_status_transition,
    normalize_flow_status,
)


def test_normalize_flow_status_aliases() -> None:
    assert normalize_flow_status("New") == "New Lead"
    assert normalize_flow_status("Converted") == "Fully Converted"
    assert normalize_flow_status("  Video Watched  ") == "Video Watched"


def test_team_forbidden_statuses_include_pipeline_stages() -> None:
    """Team must not set post-enrollment funnel statuses (blueprint § role gates)."""
    assert "Day 1" in TEAM_FORBIDDEN_STATUSES
    assert "Day 2" in TEAM_FORBIDDEN_STATUSES
    assert "Interview" in TEAM_FORBIDDEN_STATUSES
    assert "Fully Converted" in TEAM_FORBIDDEN_STATUSES
    assert "New Lead" not in TEAM_FORBIDDEN_STATUSES


def test_team_forward_jump_before_paid() -> None:
    assert is_valid_forward_status_transition(
        "New Lead", "Invited", for_team=True
    )
    assert not is_valid_forward_status_transition(
        "New Lead", "Min. FLP Billing", for_team=True
    )
    assert is_valid_forward_status_transition(
        "Video Watched", "Min. FLP Billing", for_team=True
    )


def test_leader_single_step_forward() -> None:
    assert is_valid_forward_status_transition("New Lead", "Contacted", for_team=False)
    assert not is_valid_forward_status_transition(
        "New Lead", "Invited", for_team=False
    )


@pytest.mark.parametrize(
    ("legacy", "vl2"),
    [
        ("Lost", "lost"),
        ("Retarget", "lost"),
        ("New Lead", "new"),
        ("Contacted", "contacted"),
        ("Min. FLP Billing", "qualified"),
        ("Fully Converted", "won"),
    ],
)
def test_legacy_canonical_to_vl2(legacy: str, vl2: str) -> None:
    assert legacy_canonical_to_vl2_status(legacy) == vl2


def test_team_dropdown_readonly() -> None:
    assert team_status_dropdown_choices("Day 1") == ["Day 1"]
    assert "Min. FLP Billing" in team_status_dropdown_choices("New Lead")


def test_team_status_option_selected() -> None:
    assert team_status_option_selected("New", "New Lead")


def test_flp_billing_gate_team_no_proof() -> None:
    row = {"payment_proof_url": "", "payment_status": "pending"}
    blocked, msg = flp_billing_execution_blocked_for_role(
        row,
        role="team",
        acting_user_id=1,
        current_status="Video Watched",
        is_transition_to_flp_billing_funnel=True,
    )
    assert blocked is True
    assert "upload" in msg.lower()


def test_flp_billing_gate_approved_proof() -> None:
    row = {
        "payment_proof_url": "https://x/y.png",
        "payment_status": "approved",
    }
    blocked, _ = flp_billing_execution_blocked_for_role(
        row,
        role="team",
        acting_user_id=1,
        current_status="Video Watched",
        is_transition_to_flp_billing_funnel=True,
    )
    assert blocked is False
