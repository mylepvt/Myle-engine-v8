"""Tests for validate_vl2_status_transition_for_role — team/leader FSM transitions."""
from __future__ import annotations

import pytest

from app.core.pipeline_rules import validate_vl2_status_transition_for_role


def ok(cur, tgt, role):
    result, msg = validate_vl2_status_transition_for_role(
        current_slug=cur, target_slug=tgt, role=role
    )
    return result


# ── Team: forward jumps up to mindset_lock ───────────────────────────────────

@pytest.mark.parametrize("cur", ["new_lead", "contacted", "invited", "whatsapp_sent", "video_sent"])
def test_team_can_advance_to_mindset_lock(cur):
    assert ok(cur, "mindset_lock", "team"), f"team {cur}→mindset_lock must be allowed"


def test_team_video_sent_to_mindset_lock():
    """Primary calling-board action — team marks lead ready after Day 1 video sent."""
    assert ok("video_sent", "mindset_lock", "team")


def test_team_cannot_set_day1():
    assert not ok("video_sent", "day1", "team")


def test_team_cannot_set_day2():
    assert not ok("mindset_lock", "day2", "team")


def test_team_cannot_set_day3():
    assert not ok("day2", "day3", "team")


def test_team_can_mark_lost_from_video_sent():
    assert ok("video_sent", "lost", "team")


def test_team_can_retarget_from_mindset_lock():
    assert ok("mindset_lock", "retarget", "team")


# ── Leader: post-mindset-lock control ────────────────────────────────────────

def test_leader_video_sent_to_mindset_lock():
    assert ok("video_sent", "mindset_lock", "leader")


def test_leader_mindset_lock_to_day2():
    assert ok("mindset_lock", "day2", "leader")


def test_leader_day2_to_day3():
    assert ok("day2", "day3", "leader")


def test_leader_can_set_day1():
    assert ok("mindset_lock", "day1", "leader")


# ── Admin: unrestricted ───────────────────────────────────────────────────────

def test_admin_can_jump_anywhere():
    assert ok("new_lead", "day3", "admin")
    assert ok("video_sent", "converted", "admin")


# ── Payment gate: post-Day-3 FLP-billing boundary ─────────────────────────────

def test_payment_required_statuses_gate_day4_onward():
    """Regression: the Day-3 FLP-billing gate must list the post-billing batch
    stages. It was silently emptied once (commit 95506c89 set it to frozenset()),
    which let a leader jump new -> day4 without an approved Rs.1500 payment proof.

    Guards three invariants of _PAYMENT_REQUIRED_STATUSES:
      - day4 / day5 / interview ARE gated (entry + jump-over for non-admins)
      - converted is NOT gated (leader day3 -> converted close stays valid)
      - pre-billing stages are NOT gated (leader free up to Day 3)
    """
    from app.services.leads_service import _PAYMENT_REQUIRED_STATUSES

    assert {"day4", "day5", "interview"} <= _PAYMENT_REQUIRED_STATUSES
    assert "converted" not in _PAYMENT_REQUIRED_STATUSES
    assert _PAYMENT_REQUIRED_STATUSES.isdisjoint(
        {"new_lead", "contacted", "video_sent", "paid", "mindset_lock", "day1", "day2", "day3"}
    )
