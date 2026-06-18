"""Single chokepoint deciding *whether a user should receive a message*.

This is the app's "common sense" layer for outbound messaging. Historically each
sender (push, WhatsApp reminders, insights) re-checked "is this user removed /
blocked?" by hand, so a single missed check leaked messages to people who had
left the org. Every member-facing sender should now ask this module instead, so
the rule lives in exactly one place and a brand-new sender is protected by
default.

Two distinct rules, because "is this a live account" and "should this member get
automated nudges" are not the same thing:

* :func:`is_account_active` — minimal liveness: not removed, not access-blocked.
  Use for any message to the account itself (push, transactional notices).
* :func:`can_receive_automated_message` — the full report-eligibility rule
  (approved + active role + not removed/blocked + onboarding finished). Use for
  recurring automated nudges and broadcasts (daily report reminder, insights,
  management broadcasts) so brand-new trainees and exited members are excluded.
"""
from __future__ import annotations

from datetime import date

from app.models.user import User
from app.services.report_eligibility import is_user_report_eligible


def is_account_active(user: User | None) -> bool:
    """True when the account is live enough to receive *any* message.

    Mirrors the filters every push/WhatsApp sender used to inline: the user
    exists, is not access-blocked and has not been removed.
    """
    if user is None:
        return False
    if user.access_blocked:
        return False
    if user.removed_at is not None:
        return False
    if (user.discipline_status or "").strip().lower() == "removed":
        return False
    return True


def account_block_reason(user: User | None) -> str | None:
    """Human-readable reason the account cannot be messaged, or ``None``."""
    if user is None:
        return "user_not_found"
    if user.removed_at is not None or (user.discipline_status or "").strip().lower() == "removed":
        return "removed"
    if user.access_blocked:
        return "access_blocked"
    return None


def can_receive_automated_message(user: User | None, today: date | None = None) -> bool:
    """True when the member should receive recurring automated nudges/broadcasts.

    This is the full report-eligibility rule, so it also excludes members still
    inside their onboarding/training window — they get a gentler onboarding flow,
    not the standard daily-report machine.
    """
    if user is None:
        return False
    return is_user_report_eligible(user, today)


def automated_block_reason(user: User | None, today: date | None = None) -> str | None:
    """Reason the member is excluded from automated messaging, or ``None``."""
    if user is None:
        return "user_not_found"
    # Liveness reasons take priority — they are the most important to surface.
    live_reason = account_block_reason(user)
    if live_reason is not None:
        return live_reason
    if can_receive_automated_message(user, today):
        return None
    if (user.registration_status or "").strip().lower() != "approved":
        return "not_approved"
    if (user.role or "").strip().lower() not in {"team", "leader"}:
        return "role_not_messaged"
    if (user.discipline_status or "").strip().lower() == "grace":
        return "in_grace"
    return "in_onboarding"
