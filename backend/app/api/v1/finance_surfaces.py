"""Finance nav — recharges screen uses wallet POST; other routes are read summaries."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.auth_cookies import display_name_from_user
from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.schemas.system_surface import SystemStubResponse
from app.services.user_hierarchy import (
    load_user_hierarchy_entries,
    nearest_leader_entry,
)

router = APIRouter()

_BudgetPeriod = Literal["day", "week", "month", "custom"]


class BudgetUserFilterOption(BaseModel):
    user_id: int
    label: str
    role: str
    fbo_id: str
    leader_user_id: int | None = None
    leader_name: str | None = None


class BudgetFilterOptions(BaseModel):
    leaders: list[BudgetUserFilterOption] = Field(default_factory=list)
    members: list[BudgetUserFilterOption] = Field(default_factory=list)


class BudgetUserRow(BaseModel):
    user_id: int
    role: str
    display_name: str
    email: str
    fbo_id: str
    phone: str | None = None
    leader_user_id: int | None = None
    leader_name: str | None = None
    current_balance_cents: int = 0
    period_recharge_cents: int = 0
    period_spend_cents: int = 0
    period_adjustment_cents: int = 0
    period_net_change_cents: int = 0
    active_leads_count: int = 0


class BudgetLeaderGroup(BaseModel):
    leader: BudgetUserRow
    team_member_count: int = 0
    team_balance_cents: int = 0
    team_recharge_cents: int = 0
    team_spend_cents: int = 0
    team_adjustment_cents: int = 0
    team_net_change_cents: int = 0
    combined_balance_cents: int = 0
    combined_period_net_change_cents: int = 0
    members: list[BudgetUserRow] = Field(default_factory=list)


class BudgetGrandTotals(BaseModel):
    total_visible_users: int = 0
    total_visible_leaders: int = 0
    total_visible_team_members: int = 0
    current_balance_cents: int = 0
    team_balance_cents: int = 0
    leader_personal_balance_cents: int = 0
    period_recharge_cents: int = 0
    period_spend_cents: int = 0
    period_adjustment_cents: int = 0
    period_net_change_cents: int = 0


class BudgetExportResponse(BaseModel):
    items: list[dict] = Field(default_factory=list)
    total: int = 0
    note: str | None = None
    period: _BudgetPeriod
    reference_date: date
    date_from: date
    date_to: date
    selected_leader_user_id: int | None = None
    selected_member_user_id: int | None = None
    filter_options: BudgetFilterOptions
    grand_totals: BudgetGrandTotals
    leaders: list[BudgetLeaderGroup] = Field(default_factory=list)
    unlinked_members: list[BudgetUserRow] = Field(default_factory=list)


class BudgetHistoryEntry(BaseModel):
    entry_id: int
    created_at: datetime
    kind: Literal["recharge", "spend", "adjustment"]
    direction: Literal["credit", "debit"]
    amount_cents: int
    note: str | None = None
    idempotency_key: str | None = None
    created_by_user_id: int | None = None
    created_by_name: str | None = None


class BudgetHistoryResponse(BaseModel):
    subject: BudgetUserRow
    period: _BudgetPeriod
    reference_date: date
    date_from: date
    date_to: date
    total: int = 0
    history: list[BudgetHistoryEntry] = Field(default_factory=list)
    note: str | None = None


@dataclass
class _BudgetWindow:
    period: _BudgetPeriod
    reference_date: date
    date_from: date
    date_to: date


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_leader_or_team(user: AuthUser) -> None:
    if user.role not in ("leader", "team"):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _finance_recharge_title(
    *,
    user_id: int,
    amount_cents: int,
    user_map: dict[int, dict[str, str | None]],
) -> str:
    meta = user_map.get(user_id, {"display_name": f"User #{user_id}", "fbo_id": None})
    display_name = meta.get("display_name") or f"User #{user_id}"
    fbo_id = meta.get("fbo_id")
    fbo_suffix = f" · {fbo_id}" if fbo_id and display_name != fbo_id else ""
    return f"{display_name}{fbo_suffix} · ₹{amount_cents / 100:,.2f}"


def _normalize_budget_window(
    *,
    period: _BudgetPeriod,
    reference_date: date | None,
    date_from: date | None,
    date_to: date | None,
) -> _BudgetWindow:
    anchor = reference_date or date.today()
    if period == "day":
        return _BudgetWindow(period=period, reference_date=anchor, date_from=anchor, date_to=anchor)
    if period == "week":
        start = anchor - timedelta(days=anchor.weekday())
        end = start + timedelta(days=6)
        return _BudgetWindow(period=period, reference_date=anchor, date_from=start, date_to=end)
    if period == "month":
        start = anchor.replace(day=1)
        end = anchor.replace(day=calendar.monthrange(anchor.year, anchor.month)[1])
        return _BudgetWindow(period=period, reference_date=anchor, date_from=start, date_to=end)

    start = date_from or anchor
    end = date_to or start
    if end < start:
        start, end = end, start
    return _BudgetWindow(period=period, reference_date=anchor, date_from=start, date_to=end)


def _budget_entry_kind(entry: WalletLedgerEntry) -> Literal["recharge", "spend", "adjustment"]:
    idem = (entry.idempotency_key or "").strip().lower()
    note = (entry.note or "").strip().lower()
    if idem.startswith("recharge_") or note.startswith("recharge approved"):
        return "recharge"
    if idem.startswith("pool_claim_") or "lead pool claim" in note:
        return "spend"
    return "adjustment"


def _display_name(user: User) -> str:
    return display_name_from_user(user) or user.fbo_id or f"User #{user.id}"


def _flatten_budget_item(row: BudgetUserRow, *, scope: str, leader_name: str | None = None) -> dict:
    leader_part = leader_name or row.leader_name or "—"
    phone = row.phone or "—"
    return {
        "title": row.display_name,
        "detail": (
            f"{scope} · {row.role} · {row.email} · FBO {row.fbo_id} · phone {phone} · "
            f"leader {leader_part} · balance ₹{row.current_balance_cents / 100:,.2f} · "
            f"period recharge ₹{row.period_recharge_cents / 100:,.2f} · "
            f"period spend ₹{row.period_spend_cents / 100:,.2f} · "
            f"period adj ₹{row.period_adjustment_cents / 100:,.2f} · "
            f"period net ₹{row.period_net_change_cents / 100:,.2f} · "
            f"active leads {row.active_leads_count}"
        ),
        "count": row.user_id,
    }


async def _load_budget_directory(
    session: AsyncSession,
) -> tuple[list[User], dict[int, User], dict[int, int | None], BudgetFilterOptions]:
    users = (
        (
            await session.execute(
                select(User)
                .where(
                    User.registration_status == "approved",
                    User.role.in_(("leader", "team")),
                    User.removed_at.is_(None),
                )
                .order_by(User.role.asc(), User.fbo_id.asc())
            )
        )
        .scalars()
        .all()
    )
    user_by_id = {int(user.id): user for user in users}
    hierarchy = await load_user_hierarchy_entries(session, user_by_id.keys())
    leader_lookup: dict[int, int | None] = {}
    for user in users:
        leader = nearest_leader_entry(int(user.id), hierarchy)
        leader_lookup[int(user.id)] = int(leader.id) if leader is not None else None

    leaders = [user for user in users if user.role == "leader"]
    filter_options = BudgetFilterOptions(
        leaders=[
            BudgetUserFilterOption(
                user_id=int(user.id),
                label=_display_name(user),
                role=user.role,
                fbo_id=user.fbo_id,
                leader_user_id=int(user.id),
                leader_name=_display_name(user),
            )
            for user in leaders
        ],
        members=[
            BudgetUserFilterOption(
                user_id=int(user.id),
                label=_display_name(user),
                role=user.role,
                fbo_id=user.fbo_id,
                leader_user_id=leader_lookup.get(int(user.id)),
                leader_name=(
                    _display_name(user_by_id[leader_lookup[int(user.id)]])
                    if leader_lookup.get(int(user.id)) in user_by_id
                    else None
                ),
            )
            for user in users
            if user.role == "team"
        ],
    )
    return users, user_by_id, leader_lookup, filter_options


async def _build_budget_rows(
    session: AsyncSession,
    *,
    visible_ids: list[int],
    user_by_id: dict[int, User],
    leader_lookup: dict[int, int | None],
    window: _BudgetWindow,
) -> dict[int, BudgetUserRow]:
    if not visible_ids:
        return {}

    balance_rows = await session.execute(
        select(WalletLedgerEntry.user_id, func.coalesce(func.sum(WalletLedgerEntry.amount_cents), 0))
        .where(WalletLedgerEntry.user_id.in_(visible_ids))
        .group_by(WalletLedgerEntry.user_id)
    )
    balance_map = {int(user_id): int(balance_cents) for user_id, balance_cents in balance_rows.all()}

    period_entries = (
        (
            await session.execute(
                select(WalletLedgerEntry)
                .where(
                    WalletLedgerEntry.user_id.in_(visible_ids),
                    func.date(WalletLedgerEntry.created_at) >= window.date_from,
                    func.date(WalletLedgerEntry.created_at) <= window.date_to,
                )
                .order_by(WalletLedgerEntry.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    active_lead_rows = await session.execute(
        select(Lead.assigned_to_user_id, func.count())
        .where(
            Lead.assigned_to_user_id.in_(visible_ids),
            Lead.in_pool.is_(False),
            Lead.deleted_at.is_(None),
        )
        .group_by(Lead.assigned_to_user_id)
    )
    active_lead_map = {
        int(user_id): int(count)
        for user_id, count in active_lead_rows.all()
        if user_id is not None
    }

    metric_map: dict[int, dict[str, int]] = {
        uid: {
            "period_recharge_cents": 0,
            "period_spend_cents": 0,
            "period_adjustment_cents": 0,
            "period_net_change_cents": 0,
        }
        for uid in visible_ids
    }

    for entry in period_entries:
        uid = int(entry.user_id)
        metrics = metric_map.setdefault(
            uid,
            {
                "period_recharge_cents": 0,
                "period_spend_cents": 0,
                "period_adjustment_cents": 0,
                "period_net_change_cents": 0,
            },
        )
        amount_cents = int(entry.amount_cents)
        metrics["period_net_change_cents"] += amount_cents
        kind = _budget_entry_kind(entry)
        if kind == "recharge":
            metrics["period_recharge_cents"] += max(amount_cents, 0)
        elif kind == "spend":
            metrics["period_spend_cents"] += max(-amount_cents, 0)
        else:
            metrics["period_adjustment_cents"] += amount_cents

    rows: dict[int, BudgetUserRow] = {}
    for uid in visible_ids:
        user = user_by_id[uid]
        leader_user_id = leader_lookup.get(uid)
        leader_name = None
        if leader_user_id is not None and leader_user_id in user_by_id:
            leader_name = _display_name(user_by_id[leader_user_id])
        metrics = metric_map.get(uid, {})
        rows[uid] = BudgetUserRow(
            user_id=uid,
            role=user.role,
            display_name=_display_name(user),
            email=user.email,
            fbo_id=user.fbo_id,
            phone=(user.phone or "").strip() or None,
            leader_user_id=leader_user_id,
            leader_name=leader_name,
            current_balance_cents=balance_map.get(uid, 0),
            period_recharge_cents=int(metrics.get("period_recharge_cents", 0)),
            period_spend_cents=int(metrics.get("period_spend_cents", 0)),
            period_adjustment_cents=int(metrics.get("period_adjustment_cents", 0)),
            period_net_change_cents=int(metrics.get("period_net_change_cents", 0)),
            active_leads_count=active_lead_map.get(uid, 0),
        )
    return rows


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
    user_rows = (
        await session.execute(
            select(User).where(User.id.in_([row.user_id for row in rows]))
        )
    ).scalars().all()
    user_map = {
        int(row.id): {
            "display_name": display_name_from_user(row) or row.fbo_id or f"User #{row.id}",
            "fbo_id": row.fbo_id,
        }
        for row in user_rows
    }
    items = [
        {
            "title": _finance_recharge_title(
                user_id=e.user_id,
                amount_cents=e.amount_cents,
                user_map=user_map,
            ),
            "detail": (e.note or "ledger") + (f" · {e.idempotency_key}" if e.idempotency_key else ""),
        }
        for e in rows
    ]
    return SystemStubResponse(
        items=items,
        total=len(items),
        note="Recent `wallet_ledger_entries` (newest first). Credits use POST /api/v1/wallet/adjustments with idempotency.",
    )


@router.get("/budget-export", response_model=BudgetExportResponse)
async def finance_budget_export(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    period: Annotated[_BudgetPeriod, Query()] = "month",
    reference_date: Annotated[date | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    leader_user_id: Annotated[int | None, Query()] = None,
    member_user_id: Annotated[int | None, Query()] = None,
) -> BudgetExportResponse:
    """Hierarchy-first budget export for admin finance review."""
    _require_admin(user)
    window = _normalize_budget_window(
        period=period,
        reference_date=reference_date,
        date_from=date_from,
        date_to=date_to,
    )

    users, user_by_id, leader_lookup, filter_options = await _load_budget_directory(session)
    if not users:
        return BudgetExportResponse(
            items=[],
            total=0,
            note="No approved leaders or members are available for budget export.",
            period=window.period,
            reference_date=window.reference_date,
            date_from=window.date_from,
            date_to=window.date_to,
            selected_leader_user_id=leader_user_id,
            selected_member_user_id=member_user_id,
            filter_options=filter_options,
            grand_totals=BudgetGrandTotals(),
            leaders=[],
            unlinked_members=[],
        )

    if leader_user_id is not None:
        leader_hit = user_by_id.get(int(leader_user_id))
        if leader_hit is None or leader_hit.role != "leader":
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Leader not found")
    if member_user_id is not None and int(member_user_id) not in user_by_id:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Member not found")
    if leader_user_id is not None and member_user_id is not None:
        member_leader_id = leader_lookup.get(int(member_user_id))
        if int(member_user_id) != int(leader_user_id) and member_leader_id != int(leader_user_id):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Selected member does not belong to the selected leader.",
            )

    visible_ids = {int(user.id) for user in users}
    if leader_user_id is not None:
        selected_leader_id = int(leader_user_id)
        visible_ids = {
            uid
            for uid in visible_ids
            if uid == selected_leader_id or leader_lookup.get(uid) == selected_leader_id
        }
    if member_user_id is not None:
        selected_member_id = int(member_user_id)
        member_visible_ids = {selected_member_id}
        member_leader_id = leader_lookup.get(selected_member_id)
        if member_leader_id is not None:
            member_visible_ids.add(member_leader_id)
        visible_ids = visible_ids & member_visible_ids if leader_user_id is not None else member_visible_ids

    ordered_visible_ids = [
        int(user.id)
        for user in users
        if int(user.id) in visible_ids
    ]
    rows_by_id = await _build_budget_rows(
        session,
        visible_ids=ordered_visible_ids,
        user_by_id=user_by_id,
        leader_lookup=leader_lookup,
        window=window,
    )

    visible_users = [user_by_id[uid] for uid in ordered_visible_ids if uid in rows_by_id]
    visible_leaders = [user for user in visible_users if user.role == "leader"]

    leader_groups: list[BudgetLeaderGroup] = []
    unlinked_members: list[BudgetUserRow] = []
    flat_items: list[dict] = []

    for leader in sorted(visible_leaders, key=lambda row: _display_name(row).lower()):
        leader_row = rows_by_id[int(leader.id)]
        members = sorted(
            [
                rows_by_id[int(user.id)]
                for user in visible_users
                if int(user.id) != int(leader.id) and leader_lookup.get(int(user.id)) == int(leader.id)
            ],
            key=lambda row: (row.role != "leader", row.display_name.lower()),
        )
        team_balance = sum(member.current_balance_cents for member in members)
        team_recharge = sum(member.period_recharge_cents for member in members)
        team_spend = sum(member.period_spend_cents for member in members)
        team_adjustment = sum(member.period_adjustment_cents for member in members)
        team_net = sum(member.period_net_change_cents for member in members)
        leader_groups.append(
            BudgetLeaderGroup(
                leader=leader_row,
                team_member_count=len(members),
                team_balance_cents=team_balance,
                team_recharge_cents=team_recharge,
                team_spend_cents=team_spend,
                team_adjustment_cents=team_adjustment,
                team_net_change_cents=team_net,
                combined_balance_cents=leader_row.current_balance_cents + team_balance,
                combined_period_net_change_cents=leader_row.period_net_change_cents + team_net,
                members=members,
            )
        )
        flat_items.append(_flatten_budget_item(leader_row, scope="leader-summary", leader_name=leader_row.display_name))
        flat_items.extend(
            _flatten_budget_item(member, scope="team-member", leader_name=leader_row.display_name)
            for member in members
        )

    for user in visible_users:
        uid = int(user.id)
        if user.role == "leader":
            continue
        leader_id = leader_lookup.get(uid)
        if leader_id is not None and any(group.leader.user_id == leader_id for group in leader_groups):
            continue
        row = rows_by_id[uid]
        unlinked_members.append(row)
        flat_items.append(_flatten_budget_item(row, scope="unlinked-member"))

    leader_rows = [group.leader for group in leader_groups]
    visible_member_rows = [rows_by_id[int(user.id)] for user in visible_users if user.role == "team"]
    grand_totals = BudgetGrandTotals(
        total_visible_users=len(visible_users),
        total_visible_leaders=len(leader_rows),
        total_visible_team_members=len(visible_member_rows),
        current_balance_cents=sum(row.current_balance_cents for row in rows_by_id.values()),
        team_balance_cents=sum(row.current_balance_cents for row in visible_member_rows),
        leader_personal_balance_cents=sum(row.current_balance_cents for row in leader_rows),
        period_recharge_cents=sum(row.period_recharge_cents for row in rows_by_id.values()),
        period_spend_cents=sum(row.period_spend_cents for row in rows_by_id.values()),
        period_adjustment_cents=sum(row.period_adjustment_cents for row in rows_by_id.values()),
        period_net_change_cents=sum(row.period_net_change_cents for row in rows_by_id.values()),
    )

    return BudgetExportResponse(
        items=flat_items,
        total=len(flat_items),
        note=(
            f"Hierarchy budget view for {window.date_from.isoformat()} to {window.date_to.isoformat()} "
            "(current balance is lifetime wallet balance; period figures show activity inside the selected window)."
        ),
        period=window.period,
        reference_date=window.reference_date,
        date_from=window.date_from,
        date_to=window.date_to,
        selected_leader_user_id=leader_user_id,
        selected_member_user_id=member_user_id,
        filter_options=filter_options,
        grand_totals=grand_totals,
        leaders=leader_groups,
        unlinked_members=sorted(unlinked_members, key=lambda row: row.display_name.lower()),
    )


@router.get("/budget-export/history", response_model=BudgetHistoryResponse)
async def finance_budget_export_history(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Query()],
    period: Annotated[_BudgetPeriod, Query()] = "month",
    reference_date: Annotated[date | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> BudgetHistoryResponse:
    _require_admin(user)
    window = _normalize_budget_window(
        period=period,
        reference_date=reference_date,
        date_from=date_from,
        date_to=date_to,
    )
    _, user_by_id, leader_lookup, _ = await _load_budget_directory(session)
    target = user_by_id.get(int(user_id))
    if target is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    rows_by_id = await _build_budget_rows(
        session,
        visible_ids=[int(user_id)],
        user_by_id=user_by_id,
        leader_lookup=leader_lookup,
        window=window,
    )
    subject = rows_by_id[int(user_id)]

    ledger_rows = (
        (
            await session.execute(
                select(WalletLedgerEntry)
                .where(
                    WalletLedgerEntry.user_id == int(user_id),
                    func.date(WalletLedgerEntry.created_at) >= window.date_from,
                    func.date(WalletLedgerEntry.created_at) <= window.date_to,
                )
                .order_by(WalletLedgerEntry.created_at.desc(), WalletLedgerEntry.id.desc())
            )
        )
        .scalars()
        .all()
    )
    creator_ids = {
        int(row.created_by_user_id)
        for row in ledger_rows
        if row.created_by_user_id is not None
    }
    creator_rows = (
        (
            await session.execute(
                select(User).where(User.id.in_(creator_ids))
            )
        )
        .scalars()
        .all()
        if creator_ids
        else []
    )
    creator_names = {
        int(row.id): _display_name(row)
        for row in creator_rows
    }
    history = [
        BudgetHistoryEntry(
            entry_id=int(row.id),
            created_at=row.created_at,
            kind=_budget_entry_kind(row),
            direction="credit" if int(row.amount_cents) >= 0 else "debit",
            amount_cents=int(row.amount_cents),
            note=(row.note or "").strip() or None,
            idempotency_key=(row.idempotency_key or "").strip() or None,
            created_by_user_id=int(row.created_by_user_id) if row.created_by_user_id is not None else None,
            created_by_name=(
                creator_names.get(int(row.created_by_user_id))
                if row.created_by_user_id is not None
                else None
            ),
        )
        for row in ledger_rows
    ]

    return BudgetHistoryResponse(
        subject=subject,
        period=window.period,
        reference_date=window.reference_date,
        date_from=window.date_from,
        date_to=window.date_to,
        total=len(history),
        history=history,
        note=(
            f"Wallet movement history for {subject.display_name} inside "
            f"{window.date_from.isoformat()} to {window.date_to.isoformat()}."
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
