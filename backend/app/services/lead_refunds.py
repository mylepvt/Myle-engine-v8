"""Refund claimed leads: money back to the wallet + a GST credit note against the original
tax invoice (+ optionally the lead goes back to the pool). Admin only.

A lead can be refunded once per invoice: the credit-note ledger key is unique per
(invoice, lead), so a second refund of the same lead is refused, never paid twice.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.models.invoice import Invoice
from app.models.lead import Lead
from app.models.wallet_ledger import WalletLedgerEntry
from app.services.invoice_records import create_credit_note
from app.services.wallet_guard import lock_wallet

_LEAD_REF = re.compile(r"#(\d+)")


def invoice_lead_ids(inv: Invoice) -> list[int]:
    out = []
    for line in (inv.payload_json or {}).get("lines") or []:
        m = _LEAD_REF.search(str(line.get("lead_ref") or ""))
        if m:
            out.append(int(m.group(1)))
    return out


def _refund_key(inv: Invoice, lead_id: int) -> str:
    return f"lead_refund_{inv.id}_{lead_id}"


async def refunded_lead_ids(session: AsyncSession, inv: Invoice) -> set[int]:
    keys = (
        await session.execute(
            select(WalletLedgerEntry.idempotency_key).where(
                WalletLedgerEntry.idempotency_key.like(f"lead_refund_{inv.id}\\_%", escape="\\")
            )
        )
    ).scalars().all()
    return {int(k.rsplit("_", 1)[1]) for k in keys}


async def _paid_for(session: AsyncSession, inv: Invoice, lead_id: int) -> int:
    """What the member paid for this lead on this invoice (the debit nearest the invoice)."""
    base = f"pool_claim_{lead_id}_{inv.user_id}"
    debits = (
        await session.execute(
            select(WalletLedgerEntry).where(
                WalletLedgerEntry.user_id == inv.user_id,
                WalletLedgerEntry.amount_cents < 0,
                (WalletLedgerEntry.idempotency_key == base)
                | WalletLedgerEntry.idempotency_key.like(f"{base}\\_%", escape="\\"),
            )
        )
    ).scalars().all()
    if not debits:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"No wallet payment found for Lead #{lead_id} on this invoice.",
        )

    def _aware(dt: datetime) -> datetime:
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    issued = _aware(inv.issued_at)
    nearest = min(debits, key=lambda d: abs((_aware(d.created_at) - issued).total_seconds()))
    return -int(nearest.amount_cents)


async def refund_invoice_leads(
    session: AsyncSession,
    *,
    invoice_number: str,
    lead_ids: list[int],
    reason: str,
    return_to_pool: bool,
    admin_user_id: int,
) -> Invoice:
    """Refund some/all leads of a tax invoice. Commits nothing — the caller commits."""
    reason = reason.strip()
    if not reason:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="A reason is required.")
    inv = (
        await session.execute(select(Invoice).where(Invoice.invoice_number == invoice_number))
    ).scalar_one_or_none()
    if inv is None or inv.doc_type != "tax_invoice":
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Tax invoice not found")
    wanted = sorted(set(lead_ids))
    on_invoice = set(invoice_lead_ids(inv))
    if not wanted or not set(wanted) <= on_invoice:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Pick leads that are on this invoice.",
        )
    await lock_wallet(session, inv.user_id)
    already = await refunded_lead_ids(session, inv) & set(wanted)
    if already:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Already refunded: " + ", ".join(f"Lead #{i}" for i in sorted(already)),
        )

    amounts = {lead_id: await _paid_for(session, inv, lead_id) for lead_id in wanted}
    entries = []
    for lead_id in wanted:
        entry = WalletLedgerEntry(
            user_id=inv.user_id,
            amount_cents=amounts[lead_id],
            currency="INR",
            idempotency_key=_refund_key(inv, lead_id),
            note=f"Refund — Lead #{lead_id} ({inv.invoice_number}): {reason}"[:512],
            created_by_user_id=admin_user_id,
        )
        session.add(entry)
        entries.append(entry)
    await session.flush()

    note = await create_credit_note(
        session,
        original=inv,
        lines=[(f"Lead #{i}", amounts[i]) for i in wanted],
        reason=reason,
        wallet_ledger_entry_id=entries[0].id,
    )

    if return_to_pool:
        for lead_id in wanted:
            lead = await session.get(Lead, lead_id)
            if lead is not None and lead.deleted_at is None and lead.owner_user_id == inv.user_id:
                lead.in_pool = True
                lead.archived_at = None
    await session.flush()
    return note
