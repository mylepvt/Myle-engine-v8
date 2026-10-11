"""Meta Ads customer-list CSV export (admin only).

Builds a CSV in Meta's customer-list format (``phone, email, fn, ln, ct, country,
gen, age``) from lead quality signals:

* ``bad``  — not interested, switched off / unreachable, wrong number, lost/dead.
  Upload as a Custom Audience and use it as an **exclusion** audience so ads stop
  reaching (and finding look-alikes of) poor-quality people.
* ``interested`` — leads a team member / leader tagged *Interested* (call status
  or the CTCS "Interested" button). Upload as a Custom Audience and build the
  **Lookalike** from this list to get better-quality leads.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Iterable, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead

SEGMENT_BAD = "bad"
SEGMENT_INTERESTED = "interested"
SEGMENTS = (SEGMENT_BAD, SEGMENT_INTERESTED)

# Reason buckets (shown in the optional ``reason`` column).
REASON_NOT_INTERESTED = "not_interested"
REASON_SWITCH_OFF = "switch_off_unreachable"
REASON_WRONG_NUMBER = "wrong_number"
REASON_LOST = "lost_dead"

# Current vl2 slugs + legacy (old dashboard) strings that may still be on imported rows.
_NOT_INTERESTED_CALL = {"not_interested", "called - not interested"}
_SWITCH_OFF_CALL = {
    "no_answer",
    "call_cut",
    "person_block",
    "called - switch off",
    "called - no answer",
    "called - busy",
}
_WRONG_NUMBER_CALL = {"wrong_number", "wrong number"}

_BAD_DROP_REASONS = {"not_interested", "wrong_number", "no_budget"}
_BAD_STATUSES = {"lost"}

_CONVERTED_STATUSES = {"converted"}
# Call statuses meaning "tagged Interested" (vl2 slug + legacy string).
_INTERESTED_CALL = {"interested", "called - interested"}
_INTERESTED_CALL_DB = ("interested", "Called - Interested")
# Activity written by the CTCS "Interested" button.
CTCS_INTERESTED_ACTION = "ctcs.interested"

CSV_HEADER = ["phone", "email", "fn", "ln", "ct", "country", "gen", "age"]
CSV_DETAIL_HEADER = ["reason", "status", "call_status", "drop_reason", "source", "ad_name"]


def normalize_phone_in(raw: Optional[str]) -> str:
    """Return an E.164-style digits-only Indian number (``91XXXXXXXXXX``) or ``""``."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    if len(digits) == 10:
        return "91" + digits
    if len(digits) == 11 and digits.startswith("0"):
        return "91" + digits[1:]
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    if len(digits) == 13 and digits.startswith("091"):
        return digits[1:]
    # Unknown format (foreign number or junk) — keep if plausibly international.
    return digits if 11 <= len(digits) <= 15 else ""


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _gender(raw: Optional[str]) -> str:
    g = _norm(raw)
    if g in {"m", "male", "man", "boy"}:
        return "m"
    if g in {"f", "female", "woman", "girl"}:
        return "f"
    return ""


def _split_name(name: Optional[str]) -> tuple[str, str]:
    parts = (name or "").strip().split()
    if not parts:
        return "", ""
    return parts[0].lower(), (" ".join(parts[1:])).lower()


def bad_reason(lead: Lead) -> Optional[str]:
    """Why a lead counts as poor quality, or ``None`` if it does not."""
    status = _norm(lead.status)
    if status in _CONVERTED_STATUSES:
        return None
    call = _norm(lead.call_status)
    drop = _norm(lead.drop_reason)
    if call in _WRONG_NUMBER_CALL or drop == "wrong_number":
        return REASON_WRONG_NUMBER
    if call in _NOT_INTERESTED_CALL or drop in {"not_interested", "no_budget"}:
        return REASON_NOT_INTERESTED
    if call in _SWITCH_OFF_CALL:
        return REASON_SWITCH_OFF
    if status in _BAD_STATUSES or _norm(lead.outcome) == "dead":
        return REASON_LOST
    return None


def interested_reason(lead: Lead, *, ctcs_interested_ids: frozenset[int] = frozenset()) -> Optional[str]:
    """``"interested"`` if the team tagged this lead Interested and it has not since gone bad."""
    if bad_reason(lead) is not None:
        return None
    if _norm(lead.call_status) in _INTERESTED_CALL or lead.id in ctcs_interested_ids:
        return "interested"
    return None


async def fetch_ctcs_interested_ids(session: AsyncSession) -> frozenset[int]:
    stmt = (
        select(ActivityLog.entity_id)
        .where(ActivityLog.action == CTCS_INTERESTED_ACTION)
        .where(ActivityLog.entity_type == "lead")
        .where(ActivityLog.entity_id.is_not(None))
        .distinct()
    )
    return frozenset(int(i) for i in (await session.execute(stmt)).scalars().all())


def _bad_condition():
    legacy_call = {"Called - Not Interested", "Called - Switch Off", "Called - No Answer", "Called - Busy", "Wrong Number"}
    return or_(
        Lead.status.in_(_BAD_STATUSES),
        Lead.outcome == "dead",
        Lead.drop_reason.in_(_BAD_DROP_REASONS),
        Lead.call_status.in_(_NOT_INTERESTED_CALL | _SWITCH_OFF_CALL | _WRONG_NUMBER_CALL | legacy_call),
    )


async def fetch_segment_leads(
    session: AsyncSession,
    segment: str,
    *,
    ctcs_interested_ids: frozenset[int] = frozenset(),
) -> list[Lead]:
    if segment == SEGMENT_INTERESTED:
        cond = Lead.call_status.in_(_INTERESTED_CALL_DB)
        if ctcs_interested_ids:
            cond = or_(cond, Lead.id.in_(ctcs_interested_ids))
    else:
        cond = _bad_condition()
    stmt = select(Lead).where(Lead.deleted_at.is_(None)).where(cond).order_by(Lead.id.desc())
    return list((await session.execute(stmt)).scalars().all())


def build_csv(
    leads: Iterable[Lead],
    *,
    segment: str,
    reasons: Optional[set[str]] = None,
    with_details: bool = False,
    ctcs_interested_ids: frozenset[int] = frozenset(),
) -> tuple[str, int]:
    """Return ``(csv_text, row_count)``. Rows are de-duplicated by phone/email."""
    if segment == SEGMENT_INTERESTED:
        def classify(lead: Lead) -> Optional[str]:
            return interested_reason(lead, ctcs_interested_ids=ctcs_interested_ids)
    else:
        classify = bad_reason
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADER + (CSV_DETAIL_HEADER if with_details else []))
    seen: set[str] = set()
    count = 0
    for lead in leads:
        reason = classify(lead)
        if reason is None or (reasons and reason not in reasons):
            continue
        phone = normalize_phone_in(lead.phone)
        email = _norm(lead.email)
        if not phone and not email:
            continue  # Meta can't match a row without an identifier.
        key = phone or email
        if key in seen:
            continue
        seen.add(key)
        fn, ln = _split_name(lead.name)
        row = [
            phone,
            email,
            fn,
            ln,
            _norm(lead.city),
            "in",
            _gender(lead.gender),
            str(lead.age) if lead.age and 13 <= lead.age <= 100 else "",
        ]
        if with_details:
            row += [
                reason,
                lead.status or "",
                lead.call_status or "",
                lead.drop_reason or "",
                lead.source or "",
                lead.ad_name or "",
            ]
        writer.writerow(row)
        count += 1
    return buf.getvalue(), count
