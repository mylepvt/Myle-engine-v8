"""Finance nav — recharges screen uses wallet POST; other routes are read summaries."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.models.wallet_ledger import WalletLedgerEntry
from app.schemas.system_surface import SystemStubResponse

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_leader_or_team(user: AuthUser) -> None:
    if user.role not in ("leader", "team"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/recharges", response_model=SystemStubResponse)
async def finance_recharges_stub(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    _require_admin(user)
    q = await session.execute(
        select(WalletLedgerEntry).order_by(WalletLedgerEntry.created_at.desc()).limit(25)
    )
    rows = q.scalars().all()
    items = [
        {
            "title": f"User #{e.user_id} · ₹{e.amount_cents / 100:,.2f}",
            "detail": (e.note or "ledger") + (f" · {e.idempotency_key}" if e.idempotency_key else ""),
        }
        for e in rows
    ]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Recent `wallet_ledger_entries` (newest first). Credits use POST /api/v1/wallet/adjustments with idempotency.",
    )


@router.get("/budget-export", response_model=SystemStubResponse)
async def finance_budget_export(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    _require_admin(user)
    cutoff = datetime.now(timezone.utc) - timedelta(days=400)
    q = await session.execute(
        select(WalletLedgerEntry).where(WalletLedgerEntry.created_at >= cutoff)
    )
    rows = q.scalars().all()
    by_month: dict[str, int] = defaultdict(int)
    for e in rows:
        key = e.created_at.strftime("%Y-%m")
        by_month[key] += int(e.amount_cents or 0)
    items: list[dict] = []
    for m in sorted(by_month.keys(), reverse=True):
        cents = by_month[m]
        rupees = cents / 100.0
        items.append(
            {
                "title": f"{m} · net ledger (INR)",
                "detail": f"Sum of wallet_ledger_entries.amount_cents for the month bucket: ₹{rupees:,.2f}",
            }
        )
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Month buckets are derived in the API from ledger `created_at` (UTC). Export CSV can be added later.",
    )


@router.get("/monthly-targets", response_model=SystemStubResponse)
async def finance_monthly_targets(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    _require_admin(user)
    rq = await session.execute(
        select(AppSetting).where(AppSetting.key.like("monthly_target_%")).order_by(AppSetting.key.asc())
    )
    rows = rq.scalars().all()
    items = [
        {
            "title": r.key.replace("monthly_target_", "").replace("_", "-"),
            "detail": (r.value or "").strip() or "—",
        }
        for r in rows
    ]
    if not items:
        items = [
            {
                "title": "Example key",
                "detail": "Create `app_settings` rows like `monthly_target_2026_04` = target description or INR amount.",
            }
        ]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Targets are free-form rows in `app_settings` with keys prefixed `monthly_target_`.",
    )


@router.get("/lead-pool", response_model=SystemStubResponse)
async def finance_lead_pool_purchase(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SystemStubResponse:
    """Billing-oriented view — operational claiming stays under Work → Lead pool."""
    _require_leader_or_team(user)
    n_pool = int(
        (await session.execute(select(func.count()).select_from(Lead).where(Lead.in_pool.is_(True)))).scalar_one()
    )
    priced = int(
        (
            await session.execute(
                select(func.count()).select_from(Lead).where(
                    Lead.in_pool.is_(True),
                    Lead.pool_price_cents.is_not(None),
                    Lead.pool_price_cents > 0,
                )
            )
        ).scalar_one()
    )
    items = [
        {
            "title": "Leads currently in shared pool",
            "detail": f"{n_pool} rows with in_pool=true (see Work → Lead pool to claim).",
            "count": n_pool,
        },
        {
            "title": "Priced pool offers (admin-set paise > 0)",
            "detail": f"{priced} leads carry a non-zero pool_price_cents.",
            "count": priced,
        },
    ]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Wallet debits on claim are recorded in `wallet_ledger_entries`; paid bulk purchases are product-specific.",
    )
