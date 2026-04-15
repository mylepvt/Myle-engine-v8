"""Finance nav — recharges screen uses wallet POST; other routes are read summaries."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
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
    """Per-member wallet summary — mirrors legacy ``/admin/budget-export`` *row intent*.

    Legacy CSV columns (Flask ``app.admin_budget_export``): recharges, pool spend, balance,
    claimed leads, admin adjustments. vl2 uses ledger + ``wallet_recharges``; pool spend is not
    split here (see Work → Lead pool + ledger notes). One row per approved team member, or all
    approved users when no team rows (same empty-org fallback idea as leaderboard).
    """
    _require_admin(user)
    team_ct = int(
        (
            await session.execute(
                select(func.count()).select_from(User).where(
                    User.role == "team",
                    User.registration_status == "approved",
                )
            )
        ).scalar_one()
    )
    member_conds = [User.registration_status == "approved"]
    if team_ct > 0:
        member_conds.append(User.role == "team")

    members = (
        (
            await session.execute(
                select(User)
                .where(and_(*member_conds))
                .order_by(User.fbo_id.asc())
            )
        )
        .scalars()
        .all()
    )

    if not members:
        return SystemStubResponse(
            items=[],
            total=0,
            note="No approved members to list (legacy budget export would also be empty).",
        )

    ids = [m.id for m in members]

    bal_rows = await session.execute(
        select(WalletLedgerEntry.user_id, func.coalesce(func.sum(WalletLedgerEntry.amount_cents), 0))
        .where(WalletLedgerEntry.user_id.in_(ids))
        .group_by(WalletLedgerEntry.user_id)
    )
    bal_map = {int(r[0]): int(r[1]) for r in bal_rows.all()}

    utr_not_admin = or_(
        WalletRecharge.utr_number.is_(None),
        ~WalletRecharge.utr_number.like("ADMIN-ADJUST%"),
    )
    rech_rows = await session.execute(
        select(WalletRecharge.user_id, func.coalesce(func.sum(WalletRecharge.amount_cents), 0))
        .where(
            WalletRecharge.user_id.in_(ids),
            WalletRecharge.status == "approved",
            utr_not_admin,
        )
        .group_by(WalletRecharge.user_id)
    )
    rech_map = {int(r[0]): int(r[1]) for r in rech_rows.all()}

    adj_rows = await session.execute(
        select(WalletRecharge.user_id, func.coalesce(func.sum(WalletRecharge.amount_cents), 0))
        .where(
            WalletRecharge.user_id.in_(ids),
            WalletRecharge.status == "approved",
            WalletRecharge.utr_number.is_not(None),
            WalletRecharge.utr_number.like("ADMIN-ADJUST%"),
        )
        .group_by(WalletRecharge.user_id)
    )
    adj_map = {int(r[0]): int(r[1]) for r in adj_rows.all()}

    lead_rows = await session.execute(
        select(Lead.assigned_to_user_id, func.count())
        .where(
            Lead.assigned_to_user_id.in_(ids),
            Lead.in_pool.is_(False),
            Lead.deleted_at.is_(None),
        )
        .group_by(Lead.assigned_to_user_id)
    )
    lead_map = {int(r[0]): int(r[1]) for r in lead_rows.all() if r[0] is not None}

    items: list[dict] = []
    for rank, m in enumerate(members, start=1):
        uid = m.id
        bal = bal_map.get(uid, 0)
        rec = rech_map.get(uid, 0)
        adj = adj_map.get(uid, 0)
        n_leads = lead_map.get(uid, 0)
        handle = (m.username or "").strip() or m.fbo_id
        phone = (m.phone or "").strip() or "—"
        items.append(
            {
                "title": handle,
                "detail": (
                    f"{m.email} · FBO {m.fbo_id} · phone {phone} · "
                    f"balance ₹{bal / 100:,.2f} · recharged ₹{rec / 100:,.2f} · "
                    f"admin adj ₹{adj / 100:,.2f} · assigned active leads {n_leads}"
                ),
                "count": rank,
            }
        )

    scope = "approved team" if team_ct > 0 else "all approved users (empty-team fallback)"
    return SystemStubResponse(
        items=items,
        total=len(items),
        note=(
            f"Per-member wallet snapshot ({scope}) — aligned with legacy "
            "``/admin/budget-export`` member rows; pool spend / date filters differ in vl2. "
            "See ``myle_dashboard/app.py`` admin_budget_export."
        ),
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
