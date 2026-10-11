"""Wallet safety: one writer per member at a time, and a balance that never goes below zero.

Every path that takes money out of a wallet (lead claims, admin debits) must:
1. ``lock_wallet`` — row-lock the member so concurrent claims queue instead of both
   reading the same balance (Postgres; SQLite ignores the lock, tests run serially);
2. check the balance and write its debit;
3. ``ensure_not_negative`` after flushing — a last guard that rolls the whole
   transaction back if anything still slipped through.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry


async def lock_wallet(session: AsyncSession, user_id: int) -> None:
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def wallet_balance_cents(session: AsyncSession, user_id: int) -> int:
    stmt = select(func.coalesce(func.sum(WalletLedgerEntry.amount_cents), 0)).where(
        WalletLedgerEntry.user_id == user_id
    )
    return int((await session.execute(stmt)).scalar_one())


async def ensure_not_negative(session: AsyncSession, user_id: int) -> None:
    await session.flush()
    if await wallet_balance_cents(session, user_id) < 0:
        raise HTTPException(
            status_code=http_status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient wallet balance.",
        )
