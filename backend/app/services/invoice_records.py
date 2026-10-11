"""Create invoice rows (idempotent where possible)."""

from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.invoice import Invoice
from app.models.user import User
from app.services.invoice_alloc import allocate_invoice_number
from app.services.invoice_html import (
    GST_MODE_KEY,
    SELLER,
    build_tax_payload_for_claims,
    buyer_snapshot,
    gst_split,
    issued_on_ist,
)


async def _issue_snapshot(session: AsyncSession, user_id: int) -> dict[str, Any]:
    """Who sold to whom, and when — frozen into the document as it is issued."""
    member = await session.get(User, user_id)
    out: dict[str, Any] = {"seller": dict(SELLER), "issued_on": issued_on_ist()}
    if member is not None:
        out["buyer"] = buyer_snapshot(member)
    return out


async def _gst_mode(session: AsyncSession) -> str:
    row = await session.get(AppSetting, GST_MODE_KEY)
    return (row.value or "igst").strip() if row is not None else "igst"


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
    invn = await allocate_invoice_number(session, "payment_receipt")
    payload = {
        **(await _issue_snapshot(session, user_id)),
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
    invn = await allocate_invoice_number(session, "payment_receipt")
    payload = {
        **(await _issue_snapshot(session, user_id)),
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
    lead_ref: Optional[str] = None,
) -> Optional[Invoice]:
    return await create_tax_invoice_for_pool_claims(
        session,
        user_id=user_id,
        claims=[
            {
                "lead_ref": lead_ref or f"Lead #{lead_index}",
                "total_cents": total_cents,
            }
        ],
        wallet_ledger_entry_id=wallet_ledger_entry_id,
        crm_claim_idempotency_key=crm_claim_idempotency_key,
    )


async def create_tax_invoice_for_pool_claims(
    session: AsyncSession,
    *,
    user_id: int,
    claims: Iterable[dict[str, Any]],
    wallet_ledger_entry_id: Optional[int],
    crm_claim_idempotency_key: Optional[str],
) -> Optional[Invoice]:
    normalized_claims = [dict(claim) for claim in claims if int(claim.get("total_cents") or 0) > 0]
    total_cents = sum(int(claim.get("total_cents") or 0) for claim in normalized_claims)
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

    invn = await allocate_invoice_number(session, "tax_invoice")
    split = gst_split(mode=await _gst_mode(session), buyer_state_code=None)
    payload = {
        **(await _issue_snapshot(session, user_id)),
        **build_tax_payload_for_claims(claims=normalized_claims, split=split),
        "place_of_supply": f"{SELLER['state']} ({SELLER['state_code']})" if split == "cgst_sgst" else None,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
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


async def create_credit_note(
    session: AsyncSession,
    *,
    original: Invoice,
    lines: list[tuple[str, int]],
    reason: str,
    wallet_ledger_entry_id: int,
) -> Invoice:
    """Credit note against a tax invoice — one line per refunded lead (ref, GST-inclusive
    cents), same GST split as the original."""
    split = "cgst_sgst" if "cgst_rupees" in (original.payload_json or {}) else "igst"
    payload = {
        **(await _issue_snapshot(session, original.user_id)),
        **build_tax_payload_for_claims(
            claims=[
                {"lead_ref": ref, "total_cents": cents, "description": "Refund — Digital Lead Generation Services"}
                for ref, cents in lines
            ],
            split=split,
        ),
        "against_invoice": original.invoice_number,
        "reason": reason,
    }
    inv = Invoice(
        invoice_number=await allocate_invoice_number(session, "credit_note"),
        doc_type="credit_note",
        user_id=original.user_id,
        total_cents=sum(cents for _, cents in lines),
        currency="INR",
        payload_json=payload,
        wallet_recharge_id=None,
        wallet_ledger_entry_id=wallet_ledger_entry_id,
    )
    session.add(inv)
    await session.flush()
    return inv


async def load_member_for_invoice(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)
