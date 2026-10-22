"""Myle Bridge, read side: Myle Ledger copies this CRM's books (read-only there).

``POST /api/v1/bridge/ledger-sync`` (signed like every bridge call, ``app.services.ledger_bridge``)
hands back one page of one table, ordered by id:

    {"table": "members" | "wallet" | "recharges" | "invoices", "after_id": 0, "limit": 500}
    → {"table": ..., "rows": [...], "next_after_id": <last id or null>, "done": true | false}

- ``members``   leaders and team members (removed ones too: their wallet money still counts),
                with the nearest leader, so the Ledger can total each team.
- ``wallet``    every wallet ledger line (append-only; balance = sum per member), classified
                the way Finance → Budget export does, plus refunds, rewards and promo credit.
- ``recharges`` recharge requests with UTR and status (they change, so re-read in full).
- ``invoices``  tax invoices, payment receipts and credit notes, with their GST payload.

Amounts are in paise. Same source as Finance → Budget export (``wallet_ledger_entries``), so the
Ledger's balances match what admins see here.
"""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookies import display_name_from_user
from app.models.invoice import Invoice
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.models.wallet_recharge import WalletRecharge
from app.services.user_hierarchy import load_user_hierarchy_entries, nearest_leader_entry

TABLES = ("members", "wallet", "recharges", "invoices")
MAX_LIMIT = 1000
DEFAULT_LIMIT = 500

WalletKind = Literal["recharge", "claim", "refund", "reward", "promo", "adjustment"]

_REWARD_PREFIXES = ("league:", "scratch:", "jackpot:")


def wallet_kind(idempotency_key: str | None, note: str | None) -> WalletKind:
    """What a wallet line is, from its idempotency key / note (see the writers in
    ``api/v1/wallet.py``, ``leads_repository``, ``lead_refunds``, ``rewards_extras``,
    ``process_rewards``)."""
    key = (idempotency_key or "").strip().lower()
    text = (note or "").strip().lower()
    if key.startswith("recharge_") or text.startswith("recharge approved"):
        return "recharge"
    if key.startswith("pool_claim_") or "lead pool claim" in text:
        return "claim"
    if key.startswith("lead_refund_") or text.startswith("refund"):
        return "refund"
    if key.startswith(_REWARD_PREFIXES):
        return "reward"
    if text.startswith("promo"):
        return "promo"
    return "adjustment"


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def _member_status(user: User) -> str:
    if user.removed_at is not None or (user.discipline_status or "").lower() == "removed":
        return "removed"
    if user.access_blocked:
        return "blocked"
    return "active"


async def _members(session: AsyncSession, after_id: int, limit: int) -> list[dict[str, Any]]:
    users = (
        await session.execute(
            select(User)
            .where(User.id > after_id, User.role.in_(("leader", "team")))
            .order_by(User.id)
            .limit(limit)
        )
    ).scalars().all()
    hierarchy = await load_user_hierarchy_entries(session, (u.id for u in users))
    rows = []
    for u in users:
        leader = nearest_leader_entry(int(u.id), hierarchy)
        rows.append(
            {
                "id": int(u.id),
                "name": display_name_from_user(u) or u.fbo_id or f"User #{u.id}",
                "fbo_id": u.fbo_id,
                "phone": (u.phone or "").strip() or None,
                "role": u.role,
                "upline_id": u.upline_user_id,
                "leader_id": int(leader.id) if leader is not None else None,
                "status": _member_status(u),
                "registration_status": u.registration_status,
                "joined_at": _iso(u.created_at),
                "removed_at": _iso(u.removed_at),
            }
        )
    return rows


async def _wallet(session: AsyncSession, after_id: int, limit: int) -> list[dict[str, Any]]:
    entries = (
        await session.execute(
            select(WalletLedgerEntry).where(WalletLedgerEntry.id > after_id).order_by(WalletLedgerEntry.id).limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": int(e.id),
            "member_id": int(e.user_id),
            "amount_paise": int(e.amount_cents),
            "kind": wallet_kind(e.idempotency_key, e.note),
            "ref": e.idempotency_key,
            "note": e.note,
            "created_at": _iso(e.created_at),
        }
        for e in entries
    ]


async def _recharges(session: AsyncSession, after_id: int, limit: int) -> list[dict[str, Any]]:
    recharges = (
        await session.execute(
            select(WalletRecharge).where(WalletRecharge.id > after_id).order_by(WalletRecharge.id).limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": int(r.id),
            "member_id": int(r.user_id),
            "amount_paise": int(r.amount_cents),
            "utr": r.utr_number,
            "status": r.status,
            "admin_note": r.admin_note,
            "created_at": _iso(r.created_at),
            "reviewed_at": _iso(r.reviewed_at),
        }
        for r in recharges
    ]


async def _invoices(session: AsyncSession, after_id: int, limit: int) -> list[dict[str, Any]]:
    invoices = (
        await session.execute(select(Invoice).where(Invoice.id > after_id).order_by(Invoice.id).limit(limit))
    ).scalars().all()
    return [
        {
            "id": int(i.id),
            "number": i.invoice_number,
            "doc_type": i.doc_type,
            "member_id": int(i.user_id),
            "total_paise": int(i.total_cents),
            "issued_at": _iso(i.issued_at),
            "recharge_id": i.wallet_recharge_id,
            "wallet_entry_id": i.wallet_ledger_entry_id,
            "payload": i.payload_json or {},
        }
        for i in invoices
    ]


_READERS = {"members": _members, "wallet": _wallet, "recharges": _recharges, "invoices": _invoices}


def parse_request(body: Any) -> tuple[str, int, int] | None:
    """(table, after_id, limit), or None for a request that names no known table."""
    if not isinstance(body, dict) or body.get("table") not in TABLES:
        return None
    try:
        after_id = max(0, int(body.get("after_id") or 0))
        limit = int(body.get("limit") or DEFAULT_LIMIT)
    except (TypeError, ValueError):
        return None
    return body["table"], after_id, max(1, min(limit, MAX_LIMIT))


async def read_page(session: AsyncSession, table: str, after_id: int, limit: int) -> dict[str, Any]:
    rows = await _READERS[table](session, after_id, limit)
    return {
        "table": table,
        "rows": rows,
        "next_after_id": rows[-1]["id"] if rows else None,
        "done": len(rows) < limit,
    }
