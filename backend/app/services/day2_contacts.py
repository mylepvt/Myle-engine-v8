"""Day 2 prospects as phone contacts (admin only).

Contacts are named "<prospect> – <leader> – MYLE". Three ways to get them into
the admin's iPhone:
- one lead  → ``.vcf`` file ("Save contact" on the Workboard),
- all leads → one ``.vcf`` with every contact ("Add All Contacts"),
- Google    → synced into the admin's Google Contacts, which the iPhone already syncs
              (see app/services/google_contacts.py).

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
from app.services.lead_payloads import _response_owner_user_id
from app.services.user_hierarchy import load_user_hierarchy_entries, nearest_leader_entry

BOOK_NAME = "MYLE Day 2"  # the iPhone list / address book
BRAND = "MYLE"
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


async def leader_names(session: AsyncSession, leads: list[Lead]) -> dict[int, str | None]:
    """Lead id → its leader's name (same rule as the Workboard: owner's nearest leader)."""
    owners = {lead.id: _response_owner_user_id(lead) for lead in leads}
    entries = await load_user_hierarchy_entries(session, owners.values())
    out: dict[int, str | None] = {}
    for lead_id, owner_id in owners.items():
        leader = nearest_leader_entry(owner_id, entries)
        out[lead_id] = " ".join(leader.display_name.split()) if leader is not None else None
    return out


def contact_name(lead: Lead, leader: str | None = None) -> str:
    """"Prospect – Leader – MYLE" (leader left out when the lead has none)."""
    name = " ".join((lead.name or "").split()) or "Prospect"
    return " – ".join(part for part in (name, leader, BRAND) if part)


def _rev(lead: Lead) -> str:
    stamp = getattr(lead, "updated_at", None) or lead.created_at or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def vcard_for_lead(lead: Lead, leader: str | None = None) -> str:
    """vCard 3.0 (what iOS Contacts reads best). CRLF line endings per RFC 2426."""
    full = contact_name(lead, leader)
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
        f"NOTE:{_esc(f'MYLE lead #{lead.id} (Day 2 prospect)' + (f' · Leader: {leader}' if leader else ''))}",
        "CATEGORIES:MYLE",
        f"REV:{_rev(lead)}",
        "END:VCARD",
    ]
    return "\r\n".join(lines) + "\r\n"


async def contact_cards(session: AsyncSession, leads: list[Lead]) -> dict[int, str]:
    """Lead id → vCard, with each lead's leader in the contact name."""
    leaders = await leader_names(session, leads)
    return {lead.id: vcard_for_lead(lead, leaders.get(lead.id)) for lead in leads}


def etag_for(card: str) -> str:
    return '"' + hashlib.sha256(card.encode()).hexdigest()[:32] + '"'


def safe_filename(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_") or "contact"
