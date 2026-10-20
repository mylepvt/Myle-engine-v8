"""Public (no-login) deposit pages for the lead — consent and receipt.

Mounted under ``/api/deposit`` (not ``/api/v1``); the lead opens ``/deposit/consent/{token}``
or ``/deposit/receipt/{token}`` in the SPA. Both ask for the lead's registered mobile first.
A browser signed in to Myle is staff and can't give or withdraw consent for the lead.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import get_db
from app.models.deposit import DepositReceipt
from app.schemas.deposits import ConsentAccept, ConsentLinkInfo, ConsentTerms, PhoneIn, ReceiptLinkInfo
from app.services import deposits as svc
from app.services.deposit_receipt_pdf import receipt_filename, render_receipt_pdf
from app.services.prospect_links import is_staff_browser

router = APIRouter(prefix="/api/deposit", tags=["deposit-public"])

Session = Annotated[AsyncSession, Depends(get_db)]


def _terms(c) -> ConsentTerms:
    return ConsentTerms(
        state=svc.consent_state(c),
        terms_text=c.terms_text,
        terms_sha256=c.terms_sha256,
        terms_version=c.terms_version,
        given_at=c.given_at,
        typed_name=c.typed_name,
    )


def _refuse_staff(request: Request) -> None:
    if is_staff_browser(request):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only the lead can answer this. Open the link on the lead's phone, not on a Myle login.",
        )


@router.get("/consent/{token}", response_model=ConsentLinkInfo, include_in_schema=False)
async def consent_info(token: str, session: Session) -> ConsentLinkInfo:
    c = await svc.consent_by_token(session, token)
    return ConsentLinkInfo(
        business_name=(await svc.business_details(session))["name"],
        amount_rupees=c.amount_cents // 100,
        masked_phone=svc.mask_phone(c.payer_phone),
        state=svc.consent_state(c),
    )


@router.post("/consent/{token}/verify", response_model=ConsentTerms, include_in_schema=False)
async def consent_verify(token: str, body: PhoneIn, session: Session) -> ConsentTerms:
    c = await svc.consent_by_token(session, token, for_update=True)
    await svc.check_consent_phone(session, c, body.phone)
    return _terms(c)


@router.post("/consent/{token}/accept", response_model=ConsentTerms, include_in_schema=False)
async def consent_accept(token: str, body: ConsentAccept, request: Request, session: Session) -> ConsentTerms:
    _refuse_staff(request)
    c = await svc.consent_by_token(session, token, for_update=True)
    await svc.check_consent_phone(session, c, body.phone)
    await svc.accept_consent(
        session,
        consent=c,
        typed_name=body.typed_name,
        agreed=body.agreed,
        terms_sha256=body.terms_sha256,
        ip=svc.client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await session.commit()
    return _terms(c)


@router.post("/consent/{token}/withdraw", response_model=ConsentTerms, include_in_schema=False)
async def consent_withdraw(token: str, body: PhoneIn, request: Request, session: Session) -> ConsentTerms:
    _refuse_staff(request)
    c = await svc.consent_by_token(session, token, for_update=True)
    await svc.check_consent_phone(session, c, body.phone)
    await svc.withdraw_consent(session, consent=c, ip=svc.client_ip(request), user_agent=request.headers.get("user-agent"))
    await session.commit()
    return _terms(c)


async def _receipt_by_token(session: AsyncSession, token: str) -> DepositReceipt:
    r = (
        await session.execute(select(DepositReceipt).where(DepositReceipt.share_token == (token or "").strip()))
    ).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="This link is not valid.")
    return r


@router.get("/receipt/{token}", response_model=ReceiptLinkInfo, include_in_schema=False)
async def receipt_info(token: str, session: Session) -> ReceiptLinkInfo:
    r = await _receipt_by_token(session, token)
    return ReceiptLinkInfo(
        receipt_number=r.receipt_number,
        business_name=((r.payload_json or {}).get("business") or {}).get("name") or svc.DEFAULT_BUSINESS_NAME,
        masked_phone=svc.mask_phone(((r.payload_json or {}).get("payer") or {}).get("phone")),
        status=r.status,
    )


@router.post("/receipt/{token}/pdf", include_in_schema=False)
async def receipt_pdf(token: str, body: PhoneIn, session: Session) -> Response:
    r = await _receipt_by_token(session, token)
    if svc.phone10(body.phone) != svc.phone10(((r.payload_json or {}).get("payer") or {}).get("phone")):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="This number doesn't match the receipt.")
    pdf = render_receipt_pdf(r, current_business=await svc.business_details(session))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{receipt_filename(r)}"'},
    )
