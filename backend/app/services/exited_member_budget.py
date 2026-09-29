"""Unused wallet budget left with members who were removed / blocked from the app.

The regular budget export only covers active members, so money still sitting in
an exited member's wallet was invisible to the admin. This lists every leader /
team member who is removed (``removed_at``), access-blocked, or discipline-
removed and still has a non-zero wallet balance.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookies import display_name_from_user
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry


class ExitedMemberBudgetRow(BaseModel):
    user_id: int
    display_name: str
    fbo_id: Optional[str] = None
    phone: Optional[str] = None
    role: str
    exit_status: str  # "removed" | "blocked"
    removed_at: Optional[datetime] = None
    removal_reason: Optional[str] = None
    removed_by_name: Optional[str] = None
    upline_name: Optional[str] = None
    balance_cents: int
    total_credited_cents: int
    total_debited_cents: int
    last_wallet_activity_at: Optional[datetime] = None


class ExitedMemberBudgetResponse(BaseModel):
    total_members: int
    total_unused_cents: int = Field(description="Sum of positive balances (money still owed / unused).")
    total_negative_cents: int = Field(description="Sum of negative balances (members who overspent).")
    items: list[ExitedMemberBudgetRow]


def _name(user: User | None) -> Optional[str]:
    if user is None:
        return None
    return display_name_from_user(user) or user.fbo_id or f"User #{user.id}"


def _exited_clause():
    return or_(
        User.removed_at.is_not(None),
        User.access_blocked.is_(True),
        func.lower(User.discipline_status) == "removed",
    )


async def exited_member_budget(session: AsyncSession) -> ExitedMemberBudgetResponse:
    balance = func.coalesce(func.sum(WalletLedgerEntry.amount_cents), 0)
    credited = func.coalesce(
        func.sum(case((WalletLedgerEntry.amount_cents > 0, WalletLedgerEntry.amount_cents), else_=0)), 0
    )
    debited = func.coalesce(
        func.sum(case((WalletLedgerEntry.amount_cents < 0, -WalletLedgerEntry.amount_cents), else_=0)), 0
    )
    rows = (
        await session.execute(
            select(User, balance, credited, debited, func.max(WalletLedgerEntry.created_at))
            .join(WalletLedgerEntry, WalletLedgerEntry.user_id == User.id)
            .where(User.role.in_(("leader", "team")), _exited_clause())
            .group_by(User.id)
            .having(balance != 0)
            .order_by(balance.desc(), User.id.asc())
        )
    ).all()

    related_ids = {
        uid
        for user, *_ in rows
        for uid in (user.upline_user_id, user.removed_by_user_id)
        if uid is not None
    }
    related: dict[int, User] = {}
    if related_ids:
        related = {
            u.id: u
            for u in (await session.execute(select(User).where(User.id.in_(related_ids)))).scalars().all()
        }

    items = [
        ExitedMemberBudgetRow(
            user_id=user.id,
            display_name=_name(user) or f"User #{user.id}",
            fbo_id=user.fbo_id,
            phone=user.phone,
            role=user.role,
            exit_status="removed"
            if (user.removed_at is not None or (user.discipline_status or "").lower() == "removed")
            else "blocked",
            removed_at=user.removed_at,
            removal_reason=user.removal_reason,
            removed_by_name=_name(related.get(user.removed_by_user_id)) if user.removed_by_user_id else None,
            upline_name=_name(related.get(user.upline_user_id)) if user.upline_user_id else None,
            balance_cents=int(bal),
            total_credited_cents=int(cred),
            total_debited_cents=int(deb),
            last_wallet_activity_at=last_at,
        )
        for user, bal, cred, deb, last_at in rows
    ]
    return ExitedMemberBudgetResponse(
        total_members=len(items),
        total_unused_cents=sum(i.balance_cents for i in items if i.balance_cents > 0),
        total_negative_cents=sum(i.balance_cents for i in items if i.balance_cents < 0),
        items=items,
    )
