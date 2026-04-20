"""Ledger-backed wallet: balance from sum(lines); idempotent admin adjustments."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.auth_cookies import display_name_from_user
from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.config import settings
from app.core.realtime_hub import notify_topics
from app.models.invoice import Invoice
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from app.services.invoice_records import create_payment_receipt_for_positive_adjustment, create_payment_receipt_for_recharge
from app.schemas.wallet import (
    WalletAdjustmentCreate,
    WalletLedgerEntryPublic,
    WalletLedgerListResponse,
    WalletRechargeCreate,
    WalletRechargeInstructionsResponse,
    WalletRechargeListResponse,
    WalletRechargePublic,
    WalletRechargeReview,
    WalletSummaryResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50
_RECENT = 10


async def _invoice_numbers_for_ledger_ids(session: AsyncSession, ledger_ids: list[int]) -> dict[int, str]:
    if not ledger_ids:
        return {}
    stmt = select(Invoice.wallet_ledger_entry_id, Invoice.invoice_number).where(
        Invoice.wallet_ledger_entry_id.in_(ledger_ids)
    )
    rows = (await session.execute(stmt)).all()
    return {int(lid): str(num) for lid, num in rows if lid is not None}


async def _invoice_numbers_for_recharge_ids(session: AsyncSession, recharge_ids: list[int]) -> dict[int, str]:
    if not recharge_ids:
        return {}
    stmt = select(Invoice.wallet_recharge_id, Invoice.invoice_number).where(
        Invoice.wallet_recharge_id.in_(recharge_ids)
    )
    rows = (await session.execute(stmt)).all()
    return {int(rid): str(num) for rid, num in rows if rid is not None}


async def _user_display_by_ids(
    session: AsyncSession, user_ids: list[int]
) -> dict[int, tuple[Optional[str], Optional[str]]]:
    """user_id -> (display_name, fbo_id) for API labels."""
    ids = list({int(i) for i in user_ids if i})
    if not ids:
        return {}
    stmt = select(User).where(User.id.in_(ids))
    rows = (await session.execute(stmt)).scalars().all()
    return {
        int(row.id): (display_name_from_user(row) or row.fbo_id or None, row.fbo_id)
        for row in rows
    }


async def _wallet_recharge_public_response(
    session: AsyncSession, row: WalletRecharge
) -> WalletRechargePublic:
    inv_map = await _invoice_numbers_for_recharge_ids(session, [row.id])
    umeta = await _user_display_by_ids(
        session,
        [row.user_id, row.reviewed_by_user_id] if row.reviewed_by_user_id else [row.user_id],
    )
    name, fbo = umeta.get(row.user_id, (None, None))
    reviewed_by_name, _reviewed_by_fbo = umeta.get(row.reviewed_by_user_id or 0, (None, None))
    return WalletRechargePublic.model_validate(row).model_copy(
        update={
            "invoice_number": inv_map.get(row.id),
            "member_name": name,
            "member_fbo_id": fbo,
            "reviewed_by_name": reviewed_by_name,
        }
    )


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _balance_for_user(session: AsyncSession, user_id: int) -> tuple[int, str]:
    cur_stmt = (
        select(WalletLedgerEntry.currency)
        .where(WalletLedgerEntry.user_id == user_id)
        .order_by(WalletLedgerEntry.created_at.desc())
        .limit(1)
    )
    cur_r = await session.execute(cur_stmt)
    currency = cur_r.scalar_one_or_none() or "INR"

    sum_stmt = select(func.coalesce(func.sum(WalletLedgerEntry.amount_cents), 0)).where(
        WalletLedgerEntry.user_id == user_id,
    )
    bal = int((await session.execute(sum_stmt)).scalar_one())
    return bal, currency


@router.get("/me", response_model=WalletSummaryResponse)
async def wallet_me(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WalletSummaryResponse:
    """Current user's balance and last few ledger lines."""
    bal, currency = await _balance_for_user(session, user.user_id)
    recent_q = (
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.user_id == user.user_id)
        .order_by(WalletLedgerEntry.created_at.desc())
        .limit(_RECENT)
    )
    rows = (await session.execute(recent_q)).scalars().all()
    inv_map = await _invoice_numbers_for_ledger_ids(session, [r.id for r in rows])
    recent_entries = [
        WalletLedgerEntryPublic.model_validate(r).model_copy(
            update={"invoice_number": inv_map.get(r.id)}
        )
        for r in rows
    ]
    return WalletSummaryResponse(
        balance_cents=bal,
        currency=currency,
        recent_entries=recent_entries,
    )


@router.get("/recharge-instructions", response_model=WalletRechargeInstructionsResponse)
async def wallet_recharge_instructions(
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> WalletRechargeInstructionsResponse:
    """Return UPI/QR instructions for manual recharge requests."""
    return WalletRechargeInstructionsResponse(
        upi_id=settings.recharge_upi_id.strip(),
        qr_image_url=settings.recharge_qr_image_url.strip() or None,
    )


@router.get("/ledger", response_model=WalletLedgerListResponse)
async def wallet_ledger(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user_id: Optional[int] = Query(default=None, ge=1, description="Admin only: filter to this user"),
) -> WalletLedgerListResponse:
    """Paginated ledger for self, or for another user when admin."""
    target_uid = user.user_id
    if user_id is not None:
        _require_admin(user)
        target_uid = user_id

    count_stmt = select(func.count()).select_from(WalletLedgerEntry).where(
        WalletLedgerEntry.user_id == target_uid,
    )
    total = int((await session.execute(count_stmt)).scalar_one())

    list_q = (
        select(WalletLedgerEntry)
        .where(WalletLedgerEntry.user_id == target_uid)
        .order_by(WalletLedgerEntry.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(list_q)).scalars().all()
    inv_map = await _invoice_numbers_for_ledger_ids(session, [r.id for r in rows])
    items = [
        WalletLedgerEntryPublic.model_validate(r).model_copy(update={"invoice_number": inv_map.get(r.id)})
        for r in rows
    ]
    return WalletLedgerListResponse(items=items, total=total, limit=limit, offset=offset)


async def _sync_adjustment_to_crm(
    *,
    user_id: int,
    amount_cents: int,
    idempotency_key: str,
    note: str | None,
    internal_secret: str,
    crm_api_url: str,
) -> None:
    """Background task: mirror a wallet adjustment to CRM's /wallet/credit endpoint."""
    try:
        async with httpx.AsyncClient(
            base_url=crm_api_url,
            timeout=httpx.Timeout(10.0),
        ) as client:
            r = await client.post(
                "/api/v1/wallet/credit",
                json={
                    "userId": user_id,
                    "amountCents": amount_cents,
                    "idempotencyKey": idempotency_key,
                    "note": note,
                },
                headers={"x-internal-secret": internal_secret},
            )
            if r.status_code >= 400:
                logger.warning(
                    "CRM wallet sync failed (HTTP %s): %s", r.status_code, r.text[:200]
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("CRM wallet sync error for idempotency_key %s: %s", idempotency_key, exc)


async def _fastapi_wallet_adjustment(
    *,
    body: WalletAdjustmentCreate,
    user: AuthUser,
    session: AsyncSession,
) -> WalletLedgerEntryPublic:
    """Fallback: write adjustment directly to FastAPI DB when CRM is unreachable."""
    existing = await session.execute(
        select(WalletLedgerEntry).where(WalletLedgerEntry.idempotency_key == body.idempotency_key),
    )
    hit = existing.scalar_one_or_none()
    if hit is not None:
        return WalletLedgerEntryPublic.model_validate(hit)

    target = await session.get(User, body.user_id)
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    entry = WalletLedgerEntry(
        user_id=body.user_id,
        amount_cents=body.amount_cents,
        currency="INR",
        idempotency_key=body.idempotency_key,
        note=body.note,
        created_by_user_id=user.user_id,
    )
    session.add(entry)
    try:
        await session.flush()
        if body.amount_cents > 0:
            await create_payment_receipt_for_positive_adjustment(
                session,
                user_id=body.user_id,
                amount_cents=body.amount_cents,
                wallet_ledger_entry_id=entry.id,
            )
        await session.commit()
        await session.refresh(entry)
    except IntegrityError:
        await session.rollback()
        again = await session.execute(
            select(WalletLedgerEntry).where(WalletLedgerEntry.idempotency_key == body.idempotency_key),
        )
        replay = again.scalar_one_or_none()
        if replay is None:
            raise
        entry = replay
    await notify_topics("wallet", "leads")
    return WalletLedgerEntryPublic.model_validate(entry)


@router.post("/adjustments", response_model=WalletLedgerEntryPublic, status_code=http_status.HTTP_201_CREATED)
async def wallet_create_adjustment(
    body: WalletAdjustmentCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WalletLedgerEntryPublic:
    """Admin-only wallet adjustment — single writer is CRM."""
    _require_admin(user)
    token = request.cookies.get(MYLE_ACCESS_COOKIE, "")

    if token and settings.crm_api_url and settings.crm_internal_secret:
        try:
            async with httpx.AsyncClient(
                base_url=settings.crm_api_url,
                timeout=httpx.Timeout(10.0),
            ) as client:
                r = await client.post(
                    "/api/v1/wallet/credit",
                    json={
                        "amountCents": body.amount_cents,
                        "idempotencyKey": body.idempotency_key,
                        "note": body.note,
                    },
                    headers={
                        "Authorization": f"Bearer {token}",
                        "x-internal-secret": settings.crm_internal_secret,
                    },
                )
                if r.status_code < 400:
                    crm_data = r.json()
                    return WalletLedgerEntryPublic(
                        id=crm_data.get("id", 0),
                        user_id=body.user_id,
                        amount_cents=body.amount_cents,
                        currency="INR",
                        note=body.note,
                        created_at=crm_data.get("createdAt", ""),
                    )
        except Exception as exc:  # noqa: BLE001
            logger.warning("CRM wallet adjustment failed: %s", exc)

    # Fallback: write to FastAPI DB (CRM unreachable)
    return await _fastapi_wallet_adjustment(body=body, user=user, session=session)


# ── Wallet Recharge Requests ─────────────────────────────────────────────────

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


@router.post(
    "/recharge-requests",
    response_model=WalletRechargePublic,
    status_code=http_status.HTTP_201_CREATED,
)
async def create_recharge_request(
    body: WalletRechargeCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WalletRechargePublic:
    """Submit a wallet recharge request; idempotent via idempotency_key."""
    # Idempotency check
    if body.idempotency_key is not None:
        existing = await session.execute(
            select(WalletRecharge).where(
                WalletRecharge.idempotency_key == body.idempotency_key,
                WalletRecharge.user_id == user.user_id,
            )
        )
        hit = existing.scalar_one_or_none()
        if hit is not None:
            return await _wallet_recharge_public_response(session, hit)

    recharge = WalletRecharge(
        user_id=user.user_id,
        amount_cents=body.amount_cents,
        utr_number=body.utr_number,
        proof_url=body.proof_url,
        idempotency_key=body.idempotency_key,
        status="pending",
    )
    session.add(recharge)
    try:
        await session.commit()
        await session.refresh(recharge)
    except IntegrityError:
        await session.rollback()
        # Race condition on idempotency_key unique constraint
        if body.idempotency_key is not None:
            again = await session.execute(
                select(WalletRecharge).where(
                    WalletRecharge.idempotency_key == body.idempotency_key
                )
            )
            replay = again.scalar_one_or_none()
            if replay is not None:
                return await _wallet_recharge_public_response(session, replay)
        raise

    await notify_topics("wallet")
    return await _wallet_recharge_public_response(session, recharge)


@router.get("/recharge-requests", response_model=WalletRechargeListResponse)
async def list_recharge_requests(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None, max_length=20, description="Filter by status"),
) -> WalletRechargeListResponse:
    """List recharge requests; admin sees all, others see only their own."""
    base_where = []
    if user.role != "admin":
        base_where.append(WalletRecharge.user_id == user.user_id)
    if status is not None and status.strip():
        base_where.append(WalletRecharge.status == status.strip())

    from sqlalchemy import and_

    cond = and_(*base_where) if base_where else None

    count_stmt = select(func.count()).select_from(WalletRecharge)
    if cond is not None:
        count_stmt = count_stmt.where(cond)
    total = int((await session.execute(count_stmt)).scalar_one())

    list_stmt = (
        select(WalletRecharge)
        .order_by(WalletRecharge.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if cond is not None:
        list_stmt = list_stmt.where(cond)

    rows = (await session.execute(list_stmt)).scalars().all()
    inv_map = await _invoice_numbers_for_recharge_ids(session, [r.id for r in rows])
    umeta = await _user_display_by_ids(
        session,
        [*(r.user_id for r in rows), *(r.reviewed_by_user_id for r in rows if r.reviewed_by_user_id is not None)],
    )
    items = [
        WalletRechargePublic.model_validate(r).model_copy(
            update={
                "invoice_number": inv_map.get(r.id),
                "member_name": umeta.get(r.user_id, (None, None))[0],
                "member_fbo_id": umeta.get(r.user_id, (None, None))[1],
                "reviewed_by_name": umeta.get(r.reviewed_by_user_id or 0, (None, None))[0],
            }
        )
        for r in rows
    ]
    return WalletRechargeListResponse(items=items, total=total, limit=limit, offset=offset)


@router.patch("/recharge-requests/{request_id}", response_model=WalletRechargePublic)
async def review_recharge_request(
    request_id: int,
    body: WalletRechargeReview,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WalletRechargePublic:
    """Admin-only: approve or reject a recharge request. Idempotent."""
    _require_admin(user)

    recharge = await session.get(WalletRecharge, request_id)
    if recharge is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Recharge request not found",
        )

    # Idempotent: already reviewed with same outcome
    if recharge.status in {"approved", "rejected"}:
        return await _wallet_recharge_public_response(session, recharge)

    if recharge.status != "pending":
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot review a request in status '{recharge.status}'",
        )

    now = datetime.now(timezone.utc)
    recharge.status = body.status
    recharge.admin_note = body.admin_note
    recharge.reviewed_by_user_id = user.user_id
    recharge.reviewed_at = now

    if body.status == "approved":
        idem_key = f"recharge_{recharge.id}"
        # Check idempotency before inserting ledger entry
        existing_entry = await session.execute(
            select(WalletLedgerEntry).where(WalletLedgerEntry.idempotency_key == idem_key)
        )
        if existing_entry.scalar_one_or_none() is None:
            ledger_entry = WalletLedgerEntry(
                user_id=recharge.user_id,
                amount_cents=recharge.amount_cents,
                currency="INR",
                note=f"Recharge approved #{recharge.id}",
                idempotency_key=idem_key,
                created_by_user_id=user.user_id,
            )
            session.add(ledger_entry)
            await session.flush()
            await create_payment_receipt_for_recharge(
                session,
                recharge_id=recharge.id,
                user_id=recharge.user_id,
                amount_cents=recharge.amount_cents,
                utr_number=recharge.utr_number,
                wallet_ledger_entry_id=ledger_entry.id,
            )

    await session.commit()
    await session.refresh(recharge)
    await notify_topics("wallet")
    return await _wallet_recharge_public_response(session, recharge)
