"""Tests for validate_vl2_status_transition_for_role — team/leader/admin rules.

New pipeline (mirrors old Myle Dashboard):
  new_lead → contacted → invited → video_sent (Enrollment Live) → video_watched
           → day1 → day2 → day3 → converted

Role rules:
  - Team: forward up to and including video_watched; never day1+.
  - Leader: free forward EXCEPT advancing into Day 3 (admin only).
  - Admin: anywhere.
"""
from __future__ import annotations

import pytest

from app.core.pipeline_rules import validate_vl2_status_transition_for_role


def ok(cur, tgt, role):
    result, _msg = validate_vl2_status_transition_for_role(
        current_slug=cur, target_slug=tgt, role=role
    )
    return result


# ── Team: forward jumps up to video_watched ──────────────────────────────────

@pytest.mark.parametrize("cur", ["new_lead", "contacted", "invited", "video_sent"])
def test_team_can_advance_to_video_watched(cur):
    assert ok(cur, "video_watched", "team"), f"team {cur}→video_watched must be allowed"


def test_team_video_sent_to_video_watched():
    """Primary calling-board action — team marks the Day 1 link watched."""
    assert ok("video_sent", "video_watched", "team")


def test_team_cannot_set_day1():
    assert not ok("video_watched", "day1", "team")


def test_team_cannot_set_day2():
    assert not ok("day1", "day2", "team")


def test_team_cannot_set_day3():
    assert not ok("day2", "day3", "team")


def test_team_can_mark_lost_from_video_sent():
    assert ok("video_sent", "lost", "team")


def test_team_can_retarget_from_video_watched():
    assert ok("video_watched", "retarget", "team")


# ── Leader: post-handoff control, Day 3 reserved for admin ────────────────────

def test_leader_video_watched_to_day1():
    assert ok("video_watched", "day1", "leader")


def test_leader_day1_to_day2():
    assert ok("day1", "day2", "leader")


def test_leader_can_advance_to_day3():
    """Leader has full status control and may advance Day 2 → Day 3."""
    assert ok("day2", "day3", "leader")


def test_leader_day3_to_converted():
    assert ok("day3", "converted", "leader")


def test_leader_backward_day3_to_day2_allowed():
    """Backward correction is not gated."""
    assert ok("day3", "day2", "leader")


# ── Admin: unrestricted ───────────────────────────────────────────────────────

def test_admin_can_jump_anywhere():
    assert ok("new_lead", "day3", "admin")
    assert ok("video_sent", "converted", "admin")
    assert ok("day2", "day3", "admin")


# ── Payment gate removed: early FLP-billing status gate is now empty ───────────

def test_payment_required_statuses_now_empty():
    """The old day4/day5/interview ₹1500 entry gate was removed — FLP billing now
    wires at the Day 3 close via the sale-engine, not a status-entry gate."""
    from app.services.leads_service import _PAYMENT_REQUIRED_STATUSES

    assert _PAYMENT_REQUIRED_STATUSES == frozenset()
