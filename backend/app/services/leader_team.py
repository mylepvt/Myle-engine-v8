"""A leader's own team in one place: each member's wallet, recharges and leads.

Scope is the leader plus their downline (every level under them in the upline tree),
never anyone else's team.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.auth_cookies import display_name_from_user
from app.core.lead_status import LEAD_STATUS_LABELS, LEAD_STATUS_SEQUENCE
from app.models.activity_log import ActivityLog
from app.models.free_recharge_request import FreeRechargeRequest
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from app.services.claim_gate import ist_day_start_utc
from app.services.ledger_sync import wallet_kind
from app.services.member_purge import PURGED_FBO_PREFIX
from app.services.user_hierarchy import recursive_downline_user_ids

# Who is working a lead right now: the assignee, else its owner (see lead_personal_scope_clause).
_HOLDER = func.coalesce(Lead.assigned_to_user_id, Lead.owner_user_id, Lead.created_by_user_id)
_CLAIM_ACTIONS = ("lead.claimed", "lead.claimed_free")

KIND_LABELS = {
    "recharge": "Recharge",
    "claim": "Leads bought",
    "refund": "Lead refund",
    "reward": "Reward",
    "promo": "Free credit",
    "adjustment": "Admin adjustment",
}


def status_label(slug: str | None) -> str:
    s = slug or ""
    return LEAD_STATUS_LABELS.get(s, s.replace("_", " ").title())


def _member_state(u: User) -> str:
    if u.removed_at is not None or (u.discipline_status or "").lower() == "removed":
        return "removed"
    if u.access_blocked:
        return "blocked"
    return "active"


def _active_leads():
    return (Lead.deleted_at.is_(None), Lead.archived_at.is_(None), Lead.in_pool.is_(False))


async def team_user_ids(session: AsyncSession, leader_id: int) -> list[int]:
    """The leader first, then their whole downline."""
    return [leader_id, *await recursive_downline_user_ids(session, leader_id)]


async def overview(session: AsyncSession, leader_id: int) -> dict[str, Any]:
    ids = await team_user_ids(session, leader_id)
    Upline = aliased(User, name="upline")
    users = (
        await session.execute(
            select(User, Upline)
            .outerjoin(Upline, User.upline_user_id == Upline.id)
            .where(User.id.in_(ids), ~User.fbo_id.startswith(PURGED_FBO_PREFIX))
        )
    ).all()

    key = func.coalesce(WalletLedgerEntry.idempotency_key, "")
    note = func.lower(func.coalesce(WalletLedgerEntry.note, ""))
    wallet = {
        int(uid): (int(bal or 0), int(free or 0), int(spent or 0))
        for uid, bal, free, spent in (
            await session.execute(
                select(
                    WalletLedgerEntry.user_id,
                    func.sum(WalletLedgerEntry.amount_cents),
                    func.sum(case((note.like("promo%"), WalletLedgerEntry.amount_cents), else_=0)),
                    func.sum(
                        case(
                            (key.like("pool\\_claim\\_%", escape="\\"), WalletLedgerEntry.amount_cents),
                            (key.like("lead\\_refund\\_%", escape="\\"), WalletLedgerEntry.amount_cents),
                            else_=0,
                        )
                    ),
                )
                .where(WalletLedgerEntry.user_id.in_(ids))
                .group_by(WalletLedgerEntry.user_id)
            )
        ).all()
    }

    recharged: dict[int, int] = defaultdict(int)
    pending: dict[int, int] = defaultdict(int)
    last: dict[int, tuple[datetime, int]] = {}
    for uid, amount, st, created in (
        await session.execute(
            select(WalletRecharge.user_id, WalletRecharge.amount_cents, WalletRecharge.status, WalletRecharge.created_at)
            .where(WalletRecharge.user_id.in_(ids), WalletRecharge.status.in_(("approved", "pending")))
        )
    ).all():
        if st == "pending":
            pending[uid] += 1
            continue
        recharged[uid] += int(amount)
        if uid not in last or created > last[uid][0]:
            last[uid] = (created, int(amount))

    statuses: dict[int, dict[str, int]] = defaultdict(dict)
    for holder, st, n in (
        await session.execute(
            select(_HOLDER, Lead.status, func.count())
            .where(_HOLDER.in_(ids), *_active_leads())
            .group_by(_HOLDER, Lead.status)
        )
    ).all():
        statuses[int(holder)][st] = int(n)

    today = {
        int(uid): int(n)
        for uid, n in (
            await session.execute(
                select(ActivityLog.user_id, func.count())
                .where(
                    ActivityLog.user_id.in_(ids),
                    ActivityLog.action.in_(_CLAIM_ACTIONS),
                    ActivityLog.created_at >= ist_day_start_utc(),
                )
                .group_by(ActivityLog.user_id)
            )
        ).all()
    }

    def row(u: User, upline: User | None) -> dict[str, Any]:
        bal, free, spent = wallet.get(u.id, (0, 0, 0))
        st = statuses.get(u.id, {})
        lr = last.get(u.id)
        return {
            "user_id": u.id,
            "name": display_name_from_user(u) or u.fbo_id,
            "fbo_id": u.fbo_id,
            "role": u.role,
            "phone": u.phone,
            "state": _member_state(u),
            "is_direct": u.upline_user_id == leader_id,
            "upline_name": (display_name_from_user(upline) or upline.fbo_id) if upline is not None else None,
            "wallet_cents": bal,
            "recharged_cents": recharged.get(u.id, 0),
            "free_credit_cents": free,
            "spent_on_leads_cents": -spent,
            "pending_recharges": pending.get(u.id, 0),
            "last_recharge_at": lr[0] if lr else None,
            "last_recharge_cents": lr[1] if lr else None,
            "leads_active": sum(st.values()),
            "leads_claimed_today": today.get(u.id, 0),
            "status_counts": st,
        }

    rows = {u.id: row(u, up) for u, up in users}
    me = rows.pop(leader_id, None)
    members = sorted(rows.values(), key=lambda r: (r["state"] != "active", r["name"].lower()))

    team_status: dict[str, int] = defaultdict(int)
    for r in members:
        for st, n in r["status_counts"].items():
            team_status[st] += n
    return {
        "me": me,
        "members": members,
        "totals": {
            "members": len(members),
            "active_members": sum(1 for r in members if r["state"] == "active"),
            "wallet_cents": sum(r["wallet_cents"] for r in members),
            "recharged_cents": sum(r["recharged_cents"] for r in members),
            "leads_active": sum(r["leads_active"] for r in members),
            "leads_claimed_today": sum(r["leads_claimed_today"] for r in members),
        },
        "team_status_counts": status_rows(team_status),
    }


def status_rows(counts: dict[str, int]) -> list[dict[str, Any]]:
    """Pipeline order, then anything unknown, zero counts left out."""
    order = {s: i for i, s in enumerate(LEAD_STATUS_SEQUENCE)}
    return [
        {"status": s, "label": status_label(s), "count": n}
        for s, n in sorted(counts.items(), key=lambda kv: (order.get(kv[0], 999), kv[0]))
        if n
    ]


async def member_detail(session: AsyncSession, member: User) -> dict[str, Any]:
    uid = member.id
    recharges = (
        await session.execute(
            select(WalletRecharge)
            .where(WalletRecharge.user_id == uid)
            .order_by(WalletRecharge.created_at.desc(), WalletRecharge.id.desc())
            .limit(50)
        )
    ).scalars().all()
    free = (
        await session.execute(
            select(FreeRechargeRequest)
            .where(FreeRechargeRequest.user_id == uid)
            .order_by(FreeRechargeRequest.created_at.desc(), FreeRechargeRequest.id.desc())
            .limit(50)
        )
    ).scalars().all()
    lines = (
        await session.execute(
            select(WalletLedgerEntry)
            .where(WalletLedgerEntry.user_id == uid)
            .order_by(WalletLedgerEntry.created_at.desc(), WalletLedgerEntry.id.desc())
            .limit(40)
        )
    ).scalars().all()
    leads = (
        await session.execute(
            select(Lead)
            .where(_HOLDER == uid, *_active_leads())
            .order_by(func.coalesce(Lead.last_action_at, Lead.created_at).desc(), Lead.id.desc())
            .limit(200)
        )
    ).scalars().all()

    return {
        "recharges": [
            {
                "id": r.id,
                "amount_cents": r.amount_cents,
                "status": r.status,
                "utr_number": r.utr_number,
                "admin_note": r.admin_note,
                "created_at": r.created_at,
                "reviewed_at": r.reviewed_at,
            }
            for r in recharges
        ],
        "free_recharges": [
            {
                "id": r.id,
                "amount_cents": r.amount_cents,
                "status": r.status,
                "reason": r.reason,
                "admin_note": r.admin_note,
                "created_at": r.created_at,
                "reviewed_at": r.reviewed_at,
            }
            for r in free
        ],
        "wallet_lines": [
            {
                "id": e.id,
                "amount_cents": e.amount_cents,
                "kind": (k := wallet_kind(e.idempotency_key, e.note)),
                "kind_label": KIND_LABELS.get(k, "Adjustment"),
                "note": e.note,
                "created_at": e.created_at,
            }
            for e in lines
        ],
        "leads": [
            {
                "id": l.id,
                "name": l.name,
                "phone": l.phone,
                "city": l.city,
                "status": l.status,
                "status_label": status_label(l.status),
                "call_status": l.call_status,
                "free": bool(l.waived_reason),
                "created_at": l.created_at,
                "last_action_at": l.last_action_at,
            }
            for l in leads
        ],
    }


# ── Leads taken: paid vs free, per member and overall (lead_claim_records) ───

PERIODS = ("today", "7d", "30d", "month", "all")
SOURCE_LABELS = {
    "pool": "Bought from pool",
    "booking": "Bought (booking)",
    "free_pool": "Free from pool",
    "admin_gift": "Given free by admin",
}


def period_start(period: str, now: datetime | None = None) -> datetime | None:
    """Start of the period in UTC (IST calendar days); None = all time."""
    from datetime import timedelta, timezone

    from app.core.time_ist import IST

    today = ist_day_start_utc(now)
    if period == "today":
        return today
    if period == "7d":
        return today - timedelta(days=6)
    if period == "30d":
        return today - timedelta(days=29)
    if period == "month":
        ist = (now or datetime.now(timezone.utc)).astimezone(IST)
        return ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    return None


def _ist_day(ts: datetime) -> str:
    from datetime import timezone

    from app.core.time_ist import IST

    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(IST).date().isoformat()


def _blank() -> dict[str, Any]:
    return {
        "taken": 0,
        "paid": 0,
        "paid_cents": 0,
        "refunded": 0,
        "refund_cents": 0,
        "free": 0,
        "free_admin": 0,
        "free_pool": 0,
        "first_at": None,
        "last_at": None,
        "days": set(),
    }


def _add(agg: dict[str, Any], r: Any) -> None:
    agg["taken"] += 1
    if r.kind == "paid":
        agg["paid"] += 1
        agg["paid_cents"] += int(r.price_cents or 0)
        if r.refunded_at is not None:
            agg["refunded"] += 1
            agg["refund_cents"] += int(r.refund_cents or 0)
    else:
        agg["free"] += 1
        agg["free_admin" if r.source == "admin_gift" else "free_pool"] += 1
    if agg["first_at"] is None or r.claimed_at < agg["first_at"]:
        agg["first_at"] = r.claimed_at
    if agg["last_at"] is None or r.claimed_at > agg["last_at"]:
        agg["last_at"] = r.claimed_at
    agg["days"].add(_ist_day(r.claimed_at))


def _finish(agg: dict[str, Any]) -> dict[str, Any]:
    days = agg.pop("days")
    agg["active_days"] = len(days)
    agg["net_paid_cents"] = agg["paid_cents"] - agg["refund_cents"]
    return agg


async def claims_report(session: AsyncSession, leader_id: int, period: str) -> dict[str, Any]:
    from app.models.lead_claim_record import LeadClaimRecord

    ids = await team_user_ids(session, leader_id)
    users = (
        await session.execute(select(User).where(User.id.in_(ids), ~User.fbo_id.startswith(PURGED_FBO_PREFIX)))
    ).scalars().all()
    start = period_start(period)

    q = select(LeadClaimRecord).where(LeadClaimRecord.user_id.in_(ids))
    if start is not None:
        q = q.where(LeadClaimRecord.claimed_at >= start)
    records = (await session.execute(q)).scalars().all()

    credit_q = select(WalletLedgerEntry.user_id, func.sum(WalletLedgerEntry.amount_cents)).where(
        WalletLedgerEntry.user_id.in_(ids),
        func.lower(func.coalesce(WalletLedgerEntry.note, "")).like("promo%"),
        WalletLedgerEntry.amount_cents > 0,
    )
    if start is not None:
        credit_q = credit_q.where(WalletLedgerEntry.created_at >= start)
    credit = {int(u): int(s or 0) for u, s in (await session.execute(credit_q.group_by(WalletLedgerEntry.user_id))).all()}

    per: dict[int, dict[str, Any]] = defaultdict(_blank)
    overall = _blank()
    by_day: dict[str, dict[str, int]] = defaultdict(lambda: {"paid": 0, "free": 0})
    for r in records:
        _add(per[r.user_id], r)
        _add(overall, r)
        by_day[_ist_day(r.claimed_at)][r.kind if r.kind in ("paid", "free") else "free"] += 1

    members = []
    for u in users:
        row = _finish(per[u.id]) if u.id in per else _finish(_blank())
        members.append(
            {
                "user_id": u.id,
                "name": display_name_from_user(u) or u.fbo_id,
                "fbo_id": u.fbo_id,
                "role": u.role,
                "is_me": u.id == leader_id,
                "state": _member_state(u),
                "free_credit_cents": credit.get(u.id, 0),
                **row,
            }
        )
    members.sort(key=lambda m: (-m["taken"], m["name"].lower()))
    totals = _finish(overall)
    totals["members_taking"] = sum(1 for m in members if m["taken"])
    totals["free_credit_cents"] = sum(credit.values())
    return {
        "period": period,
        "since": start,
        "totals": totals,
        "members": members,
        "days": [{"date": d, **v} for d, v in sorted(by_day.items(), reverse=True)],
    }


async def member_claims(session: AsyncSession, member: User, period: str) -> dict[str, Any]:
    from app.models.lead_claim_record import LeadClaimRecord

    start = period_start(period)
    q = (
        select(LeadClaimRecord, Lead.name, Lead.status)
        .outerjoin(Lead, Lead.id == LeadClaimRecord.lead_id)
        .where(LeadClaimRecord.user_id == member.id)
        .order_by(LeadClaimRecord.claimed_at.desc(), LeadClaimRecord.id.desc())
        .limit(1000)
    )
    if start is not None:
        q = q.where(LeadClaimRecord.claimed_at >= start)
    rows = (await session.execute(q)).all()
    giver_ids = {r.given_by_user_id for r, _, _ in rows if r.given_by_user_id}
    givers = (
        {
            u.id: display_name_from_user(u) or u.fbo_id
            for u in (await session.execute(select(User).where(User.id.in_(giver_ids)))).scalars()
        }
        if giver_ids
        else {}
    )
    agg = _blank()
    for r, _, _ in rows:
        _add(agg, r)
    return {
        "period": period,
        "summary": _finish(agg),
        "claims": [
            {
                "id": r.id,
                "lead_id": r.lead_id,
                "lead_name": name or f"Lead #{r.lead_id}",
                "status_label": status_label(st) if st else None,
                "kind": r.kind,
                "source": r.source,
                "source_label": SOURCE_LABELS.get(r.source, r.source),
                "price_cents": r.price_cents,
                "reason": r.reason,
                "given_by": givers.get(r.given_by_user_id or 0),
                "claimed_at": r.claimed_at,
                "day": _ist_day(r.claimed_at),
                "refunded": r.refunded_at is not None,
                "refund_cents": r.refund_cents,
            }
            for r, name, st in rows
        ],
    }
