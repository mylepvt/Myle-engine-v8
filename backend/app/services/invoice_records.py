"""Create invoice rows (idempotent where possible)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.user import User
from app.services.invoice_alloc import allocate_invoice_number
from app.services.invoice_html import build_tax_payload_for_single_lead


async def create_payment_receipt_for_recharge(
    session: AsyncSession,
    *,
    recharge_id: int,
    user_id: int,
    amount_cents: int,
    utr_number: Optional[str],
    wallet_ledger_entry_id: int,
) -> Optional[Invoice]:
    existing = await session.execute(
        select(Invoice).where(Invoice.wallet_recharge_id == recharge_id)
    )
    if existing.scalar_one_or_none():
        return None
    invn = await allocate_invoice_number(session)
    payload = {
        "payment_reference": (utr_number or "").strip() or "—",
    }
    inv = Invoice(
        invoice_number=invn,
        doc_type="payment_receipt",
        user_id=user_id,
        total_cents=amount_cents,
        currency="INR",
        payload_json=payload,
        wallet_recharge_id=recharge_id,
        wallet_ledger_entry_id=wallet_ledger_entry_id,
    )
    session.add(inv)
    await session.flush()
    return inv


async def create_payment_receipt_for_positive_adjustment(
    session: AsyncSession,
    *,
    user_id: int,
    amount_cents: int,
    wallet_ledger_entry_id: int,
) -> Optional[Invoice]:
    existing = await session.execute(
        select(Invoice).where(Invoice.wallet_ledger_entry_id == wallet_ledger_entry_id)
    )
    if existing.scalar_one_or_none():
        return None
    invn = await allocate_invoice_number(session)
    payload = {
        "payment_reference": "Admin Adjustment",
        "receipt_description": "Administrative wallet credit — Myle Community Dashboard",
    }
    inv = Invoice(
        invoice_number=invn,
        doc_type="payment_receipt",
        user_id=user_id,
        total_cents=amount_cents,
        currency="INR",
        payload_json=payload,
        wallet_recharge_id=None,
        wallet_ledger_entry_id=wallet_ledger_entry_id,
    )
    session.add(inv)
    await session.flush()
    return inv


async def create_tax_invoice_for_pool_claim(
    session: AsyncSession,
    *,
    user_id: int,
    total_cents: int,
    wallet_ledger_entry_id: Optional[int],
    crm_claim_idempotency_key: Optional[str],
    lead_index: int = 1,
) -> Optional[Invoice]:
    if total_cents <= 0:
        return None
    if crm_claim_idempotency_key:
        hit = await session.execute(
            select(Invoice).where(Invoice.crm_claim_idempotency_key == crm_claim_idempotency_key)
        )
        if hit.scalar_one_or_none():
            return None
    if wallet_ledger_entry_id is not None:
        hit = await session.execute(
            select(Invoice).where(Invoice.wallet_ledger_entry_id == wallet_ledger_entry_id)
        )
        if hit.scalar_one_or_none():
            return None

    invn = await allocate_invoice_number(session)
    payload = build_tax_payload_for_single_lead(total_cents=total_cents, lead_index=lead_index)
    inv = Invoice(
        invoice_number=invn,
        doc_type="tax_invoice",
        user_id=user_id,
        total_cents=total_cents,
        currency="INR",
        payload_json=payload,
        wallet_recharge_id=None,
        wallet_ledger_entry_id=wallet_ledger_entry_id,
        crm_claim_idempotency_key=crm_claim_idempotency_key,
    )
    session.add(inv)
    await session.flush()
    return inv


async def load_member_for_invoice(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)
