"""Day 2 prospects as phone contacts (admin only).

Three ways to get them into the admin's iPhone:
- one lead  → ``.vcf`` file ("Save contact" on the Workboard),
- all leads → one ``.vcf`` with every contact ("Add All Contacts"),
- CardDAV   → iPhone keeps a "MYLE Day 2" address book in sync (see app/api/carddav.py).

"Day 2 prospect" = any lead that has reached Day 2 (also later stages), so a contact
does not vanish from the phone when the lead moves on to Day 3 or converts.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead

CONTACT_SUFFIX = "MYLE Day 2"
REACHED_DAY2_STATUSES = ("day2", "day3", "converted", "training")


def reached_day2_clause():
    return or_(
        Lead.status.in_(REACHED_DAY2_STATUSES),
        Lead.d2_morning.is_(True),
        Lead.d2_afternoon.is_(True),
        Lead.d2_evening.is_(True),
        Lead.day2_test_status.in_(("in_progress", "passed", "failed")),
    )


async def day2_contact_leads(session: AsyncSession) -> list[Lead]:
    rows = (
        await session.execute(
            select(Lead)
            .where(reached_day2_clause(), Lead.deleted_at.is_(None), Lead.phone.isnot(None), Lead.phone != "")
            .order_by(Lead.id)
        )
    ).scalars().all()
    return list(rows)


def _esc(value: str) -> str:
    return (
        value.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\r", "").replace("\n", "\\n")
    )


def phone_for_contact(raw: str | None) -> str:
    """Indian 10-digit numbers get +91 so the iPhone dials and matches WhatsApp correctly."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return (raw or "").strip()


def contact_name(lead: Lead) -> str:
    name = " ".join((lead.name or "").split()) or "Prospect"
    return f"{name} – {CONTACT_SUFFIX}"


def _rev(lead: Lead) -> str:
    stamp = getattr(lead, "updated_at", None) or lead.created_at or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def vcard_for_lead(lead: Lead) -> str:
    """vCard 3.0 (what iOS Contacts reads best). CRLF line endings per RFC 2426."""
    full = contact_name(lead)
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"UID:myle-lead-{lead.id}",
        f"FN:{_esc(full)}",
        f"N:;{_esc(full)};;;",
        "ORG:MYLE Community",
        f"TEL;TYPE=CELL:{_esc(phone_for_contact(lead.phone))}",
    ]
    if lead.city:
        lines.append(f"ADR;TYPE=HOME:;;;{_esc(lead.city)};;;")
    lines += [
        f"NOTE:{_esc(f'MYLE lead #{lead.id} (Day 2 prospect)')}",
        "CATEGORIES:MYLE",
        f"REV:{_rev(lead)}",
        "END:VCARD",
    ]
    return "\r\n".join(lines) + "\r\n"


def vcards(leads: list[Lead]) -> str:
    return "".join(vcard_for_lead(lead) for lead in leads)


def etag_for(card: str) -> str:
    return '"' + hashlib.sha256(card.encode()).hexdigest()[:32] + '"'


def safe_filename(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_") or "contact"
