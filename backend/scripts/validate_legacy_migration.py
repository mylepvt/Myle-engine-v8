#!/usr/bin/env python3
"""Validate a legacy SQLite import against vl2 PostgreSQL.

Run from ``backend/``:
  python scripts/validate_legacy_migration.py --legacy-db /path/to/leads.db
"""
from __future__ import annotations

import argparse
import asyncio
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import func, select

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.db.session import AsyncSessionLocal
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_recharge import WalletRecharge


def _legacy_count(conn: sqlite3.Connection, table: str) -> int:
    row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
    return int(row[0]) if row else 0


def _legacy_status_counts(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute(
        "SELECT lower(trim(status)) as s, count(*) as c FROM leads GROUP BY lower(trim(status))",
    ).fetchall()
    return {str(r[0] or ""): int(r[1]) for r in rows}


async def _vl2_counts() -> dict[str, int]:
    async with AsyncSessionLocal() as session:
        users_total = await session.scalar(select(func.count(User.id)))
        leads_total = await session.scalar(select(func.count(Lead.id)))
        wallet_total = await session.scalar(select(func.count(WalletRecharge.id)))
        leads_deleted = await session.scalar(
            select(func.count(Lead.id)).where(Lead.deleted_at.is_not(None)),
        )
        return {
            "users": int(users_total or 0),
            "leads": int(leads_total or 0),
            "wallet_recharges": int(wallet_total or 0),
            "deleted_leads": int(leads_deleted or 0),
        }


async def _vl2_wallet_sum_cents() -> int:
    async with AsyncSessionLocal() as session:
        val = await session.scalar(select(func.coalesce(func.sum(WalletRecharge.amount_cents), 0)))
        return int(val or 0)


def _legacy_wallet_sum_cents(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT coalesce(sum(amount), 0) FROM wallet_recharges").fetchone()
    rupees = float(row[0] or 0.0) if row else 0.0
    return int(round(rupees * 100))


async def main() -> int:
    parser = argparse.ArgumentParser(description="Validate legacy SQLite -> vl2 migration quality")
    parser.add_argument("--legacy-db", required=True, help="Path to legacy SQLite DB")
    parser.add_argument(
        "--max-count-drift",
        type=int,
        default=0,
        help="Allowed absolute drift for users/leads/wallet row counts",
    )
    args = parser.parse_args()

    legacy_path = Path(args.legacy_db).expanduser().resolve()
    if not legacy_path.exists():
        print(f"Legacy DB not found: {legacy_path}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(str(legacy_path))
    try:
        legacy = {
            "users": _legacy_count(conn, "users"),
            "leads": _legacy_count(conn, "leads"),
            "wallet_recharges": _legacy_count(conn, "wallet_recharges"),
            "status_groups": len(_legacy_status_counts(conn)),
            "wallet_sum_cents": _legacy_wallet_sum_cents(conn),
        }
    finally:
        conn.close()

    vl2 = await _vl2_counts()
    vl2["wallet_sum_cents"] = await _vl2_wallet_sum_cents()

    print("Legacy:", legacy)
    print("VL2:", vl2)

    failures: list[str] = []
    for key in ("users", "leads", "wallet_recharges"):
        drift = abs(vl2[key] - legacy[key])
        if drift > args.max_count_drift:
            failures.append(f"{key} drift={drift} (legacy={legacy[key]} vl2={vl2[key]})")

    wallet_drift = abs(vl2["wallet_sum_cents"] - legacy["wallet_sum_cents"])
    if wallet_drift > 0:
        failures.append(
            "wallet sum mismatch "
            f"(legacy={legacy['wallet_sum_cents']} vl2={vl2['wallet_sum_cents']})",
        )

    if failures:
        print("FAILED")
        for f in failures:
            print(f"- {f}")
        return 1

    print("OK: migration reconciliation checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
