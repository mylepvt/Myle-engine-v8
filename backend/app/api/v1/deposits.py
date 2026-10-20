"""Refundable security deposit — staff side (``app.services.deposits``).

Members: send the consent link, see the lead's consent + receipt, generate / download /
share the receipt. Admin: all receipts (search), refunds, settings, consent evidence.
"""

from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.deposit import DepositConsent, DepositReceipt
from app.models.lead import Lead
from app.schemas.deposits import (
    ConsentLinkCreate,
    ConsentPublic,
    DepositSettings,
    DepositSettingsUpdate,
    LeadDepositState,
    ReceiptCreate,
    ReceiptList,
    ReceiptPublic,
    RefundCreate,
)
from app.services import deposits as svc
from app.services.deposit_receipt_pdf import receipt_filename, render_receipt_pdf
from app.services.lead_scope import user_can_access_lead, user_can_mutate_lead

router = APIRouter()

Session = Annotated[AsyncSession, Depends(get_db)]
User = Annotated[AuthUser, Depends(require_auth_user)]


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _lead(session: AsyncSession, user: AuthUser, lead_id: int, *, mutate: bool, for_update: bool = False) -> Lead:
    stmt = select(Lead).where(Lead.id == lead_id)
    if for_update:
        stmt = stmt.with_for_update()
    lead = (await session.execute(stmt)).scalar_one_or_none()
    if lead is None or lead.deleted_at is not None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    allowed = await (user_can_mutate_lead if mutate else user_can_access_lead)(session, user, lead)
    # The member who collected the deposit keeps seeing its receipt after the Day 1 handoff
    # (they're the one sharing it with the lead). Deposit pages only; lead access is unchanged.
    if not allowed and not mutate:
        allowed = user.user_id in (lead.owner_user_id, lead.enrollment_proof_by_user_id)
    if not allowed:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return lead


def consent_public(c: DepositConsent) -> ConsentPublic:
    state = svc.consent_state(c)
    return ConsentPublic(
        id=c.id,
        state=state,
        amount_rupees=c.amount_cents // 100,
        token=c.token if state == "pending" else None,
        created_at=c.created_at,
        expires_at=c.expires_at,
        given_at=c.given_at,
        typed_name=c.typed_name,
        withdrawn_at=c.withdrawn_at,
    )


def receipt_public(r: DepositReceipt, *, lead: Lead | None = None, consent: DepositConsent | None = None) -> ReceiptPublic:
    payer = (r.payload_json or {}).get("payer") or {}
    return ReceiptPublic(
        receipt_number=r.receipt_number,
        lead_id=r.lead_id,
        lead_name=payer.get("name") or (lead.name if lead else None),
        lead_phone=payer.get("phone") or (lead.phone if lead else None),
        lead_city=payer.get("city") or (lead.city if lead else None),
        amount_rupees=r.amount_cents // 100,
        paid_at=r.paid_at,
        payment_mode=r.payment_mode,
        payment_mode_label=svc.PAYMENT_MODES.get(r.payment_mode, r.payment_mode),
        payment_ref=r.payment_ref,
        status=r.status,
        issued_at=r.issued_at,
        refunded_at=r.refunded_at,
        refund_ref=r.refund_ref,
        refund_note=r.refund_note,
        cancelled_at=r.cancelled_at,
        cancel_reason=r.cancel_reason,
        consent_id=r.consent_id,
        consent_state=svc.consent_state(consent) if consent else None,
        share_token=r.share_token,
        pdf_path=f"/api/v1/deposits/receipts/{r.receipt_number}/pdf",
    )


async def _receipt(session: AsyncSession, number: str) -> DepositReceipt:
    r = (
        await session.execute(select(DepositReceipt).where(DepositReceipt.receipt_number == number.strip()))
    ).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return r


async def _state(session: AsyncSession, lead: Lead) -> LeadDepositState:
    consent = await svc.latest_consent(session, lead.id)
    receipt = await svc.live_receipt(session, lead.id)
    receipt_consent = await session.get(DepositConsent, receipt.consent_id) if receipt else None
    return LeadDepositState(
        gate_enabled=await svc.gate_enabled(session),
        min_rupees=svc.MIN_RUPEES,
        max_rupees=svc.MAX_RUPEES,
        payment_modes=svc.PAYMENT_MODES,
        consent=consent_public(consent) if consent else None,
        receipt=receipt_public(receipt, lead=lead, consent=receipt_consent) if receipt else None,
    )


@router.get("/leads/{lead_id}", response_model=LeadDepositState)
async def lead_deposit_state(lead_id: int, user: User, session: Session) -> LeadDepositState:
    lead = await _lead(session, user, lead_id, mutate=False)
    return await _state(session, lead)


@router.post("/leads/{lead_id}/consent-link", response_model=LeadDepositState)
async def create_consent_link(lead_id: int, body: ConsentLinkCreate, user: User, session: Session) -> LeadDepositState:
    lead = await _lead(session, user, lead_id, mutate=True, for_update=True)
    await svc.create_consent_link(session, lead=lead, amount_rupees=body.amount_rupees, actor_id=user.user_id)
    await session.commit()
    return await _state(session, lead)


@router.post("/leads/{lead_id}/receipt", response_model=LeadDepositState)
async def generate_receipt(lead_id: int, body: ReceiptCreate, user: User, session: Session) -> LeadDepositState:
    """Manual "Generate Receipt" on an enrollment that has none yet."""
    lead = await _lead(session, user, lead_id, mutate=True, for_update=True)
    if not lead.enrollment_amount_cents:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="No enrollment payment on this lead yet. Use “Send to Day 1” to upload it.",
        )
    await svc.issue_receipt(
        session,
        lead=lead,
        amount_cents=int(lead.enrollment_amount_cents),
        payment_mode=body.payment_mode,
        payment_ref=body.payment_ref,
        paid_at=body.paid_at,
        actor_id=user.user_id,
    )
    await session.commit()
    return await _state(session, lead)


@router.get("/receipts", response_model=ReceiptList)
async def list_receipts(
    user: User,
    session: Session,
    q: Optional[str] = Query(default=None, max_length=100),
    status: Optional[str] = Query(default=None, pattern="^(held|refunded|cancelled)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ReceiptList:
    _require_admin(user)
    rows, total = await svc.search_receipts(session, q=q, status=status, limit=limit, offset=offset)
    consent_ids = {r.consent_id for r in rows}
    consents = {
        c.id: c
        for c in (
            await session.execute(select(DepositConsent).where(DepositConsent.id.in_(consent_ids)))
        ).scalars()
    } if consent_ids else {}
    return ReceiptList(items=[receipt_public(r, consent=consents.get(r.consent_id)) for r in rows], total=total)


@router.get("/receipts/{receipt_number}/pdf", include_in_schema=False)
async def receipt_pdf(receipt_number: str, user: User, session: Session) -> Response:
    r = await _receipt(session, receipt_number)
    if user.role != "admin":
        await _lead(session, user, r.lead_id, mutate=False)
    pdf = render_receipt_pdf(r, current_business=await svc.business_details(session))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{receipt_filename(r)}"'},
    )


@router.post("/receipts/{receipt_number}/refund", response_model=ReceiptPublic)
async def refund_receipt(receipt_number: str, body: RefundCreate, user: User, session: Session) -> ReceiptPublic:
    _require_admin(user)
    r = await _receipt(session, receipt_number)
    await svc.mark_refunded(
        session, receipt=r, refunded_at=body.refunded_at, refund_ref=body.refund_ref, note=body.note, actor_id=user.user_id
    )
    await session.commit()
    return receipt_public(r, consent=await session.get(DepositConsent, r.consent_id))


@router.get("/consents/{consent_id}/evidence")
async def consent_evidence(consent_id: int, user: User, session: Session) -> dict[str, Any]:
    """Admin: the full consent record — what was shown, who agreed, when, from where —
    and whether it still matches its seal."""
    _require_admin(user)
    c = await session.get(DepositConsent, consent_id)
    if c is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Not found")
    record = svc.consent_record(c)
    record["terms_hash_matches"] = svc.sha256_hex(c.terms_text) == c.terms_sha256
    record["evidence_seal_matches"] = bool(c.evidence_sha256) and svc.evidence_hash(c) == c.evidence_sha256
    return record


async def _settings(session: AsyncSession) -> DepositSettings:
    biz = await svc.business_details(session)
    return DepositSettings(
        gate_enabled=await svc.gate_enabled(session),
        business_name=biz["name"],
        support_email=biz["email"],
        operated_by=biz["operated_by"],
    )


@router.get("/settings", response_model=DepositSettings)
async def get_settings(user: User, session: Session) -> DepositSettings:
    _require_admin(user)
    return await _settings(session)


@router.put("/settings", response_model=DepositSettings)
async def put_settings(body: DepositSettingsUpdate, user: User, session: Session) -> DepositSettings:
    _require_admin(user)
    await svc.save_settings(
        session,
        {
            svc.SETTING_GATE: None if body.gate_enabled is None else ("1" if body.gate_enabled else "0"),
            svc.SETTING_BUSINESS_NAME: body.business_name,
            svc.SETTING_SUPPORT_EMAIL: body.support_email,
            svc.SETTING_OPERATED_BY: body.operated_by,
        },
    )
    await session.commit()
    return await _settings(session)
