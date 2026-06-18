"""Single source of truth for *who* should appear in — or receive — automated
reports, reminders, alerts and management summaries.

A member must NOT be tracked, listed, or messaged by any automated reporting
surface when they are:

* not an approved active member (``registration_status != 'approved'``),
* not a reporting role (only ``team`` / ``leader`` are tracked),
* **removed** from the org (``removed_at`` is set),
* **access-blocked** (``access_blocked`` is true),
* still **in onboarding/training** — either ``training_required`` is set, the
  ``training_status`` is not finished, or they are inside their 7-day training
  gate window (``training_gate_until >= today``).
* **in active grace** — ``discipline_status == "grace"`` and their grace window
  hasn't expired yet (``grace_end_date >= today``).

Historically each report builder re-implemented this check by hand and several
of them drifted out of sync (missing the ``access_blocked`` and/or
``training_gate_until`` filters), which leaked removed / blocked / brand-new
trainees into performance reports, integrity alerts and "inactive member"
lists. Every reporting surface should now use the helpers below so the rule is
defined exactly once.
"""

from __future__ import annotations

from datetime import date
from typing import Iterable

from sqlalchemy import or_
from sqlalchemy.sql.elements import ColumnElement

from app.core.time_ist import today_ist
from app.models.user import User

# Roles that participate in daily reporting / compliance tracking.
ELIGIBLE_REPORT_ROLES: frozenset[str] = frozenset({"team", "leader"})

# training_status values that mean "onboarding is done, treat as a normal member".
_FINISHED_TRAINING_STATUSES: frozenset[str] = frozenset({"completed", "not_required"})


def _normalize_roles(roles: Iterable[str] | None) -> set[str]:
    if roles is None:
        return {r.lower() for r in ELIGIBLE_REPORT_ROLES}
    return {str(r).strip().lower() for r in roles}


def report_eligibility_conditions(
    today: date | None = None,
    *,
    roles: Iterable[str] | None = None,
) -> list[ColumnElement[bool]]:
    """SQLAlchemy ``WHERE`` conditions selecting report-eligible members.

    Splat the result into a ``select(...).where(*conditions)`` call::

        select(User).where(*report_eligibility_conditions())

    ``today`` defaults to the current IST date (the timezone the whole app
    reports in). ``roles`` defaults to ``team`` + ``leader``.
    """
    today = today or today_ist()
    role_list = sorted(_normalize_roles(roles))
    return [
        User.role.in_(role_list),
        User.registration_status == "approved",
        User.access_blocked.is_(False),
        User.removed_at.is_(None),
        User.training_required.is_(False),
        User.training_status.in_(sorted(_FINISHED_TRAINING_STATUSES)),
        or_(
            User.training_gate_until.is_(None),
            User.training_gate_until < today,
        ),
        or_(
            User.discipline_status != "grace",
            User.grace_end_date.is_(None),
            User.grace_end_date < today,
        ),
    ]


def is_user_report_eligible(
    user: User,
    today: date | None = None,
    *,
    roles: Iterable[str] | None = None,
) -> bool:
    """In-memory predicate mirroring :func:`report_eligibility_conditions`.

    Use this to filter a list of already-loaded ``User`` objects. It is tolerant
    of whitespace / casing in the string columns, which is why both a SQL and a
    Python form exist — they must stay behaviourally identical.
    """
    today = today or today_ist()
    allowed_roles = _normalize_roles(roles)

    if (user.role or "").strip().lower() not in allowed_roles:
        return False
    if (user.registration_status or "").strip().lower() != "approved":
        return False
    if user.access_blocked:
        return False
    if user.removed_at is not None:
        return False
    if user.training_required:
        return False
    if (user.training_status or "").strip().lower() not in _FINISHED_TRAINING_STATUSES:
        return False
    if user.training_gate_until is not None and user.training_gate_until >= today:
        return False
    if (user.discipline_status or "").strip().lower() == "grace" and user.grace_end_date is not None and user.grace_end_date >= today:
        return False
    return True
