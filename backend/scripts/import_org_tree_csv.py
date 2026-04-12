#!/usr/bin/env python3
"""
Import org-tree upline links from a CSV into PostgreSQL ``users.upline_user_id``.

**Existing users only** — every ``fbo_id`` must already exist. Use ``import_legacy_sqlite.py``
first for a full legacy DB import (it also backfills uplines from SQLite).

CSV columns (header row, case-insensitive):

- ``fbo_id`` — account FBO (matches ``users.fbo_id``, case-insensitive)
- ``upline_fbo_id`` — direct upline’s FBO; empty / omitted = clear upline (root)

Examples (from ``backend/``):

  python scripts/import_org_tree_csv.py --csv ./org-tree.csv --dry-run
  python scripts/import_org_tree_csv.py --csv ./org-tree.csv

Environment: ``DATABASE_URL`` / ``.env`` same as the API.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

try:
    from dotenv import load_dotenv
except ImportError:
    pass
else:
    load_dotenv(BACKEND / ".env")
    load_dotenv(BACKEND.parent / ".env")

from sqlalchemy import select, update

from app.core.fbo_id import normalize_fbo_id
from app.db.session import AsyncSessionLocal
from app.models.user import User


def _norm_cell(row: dict[str, Any], *keys: str) -> str:
    lower = {k.lower().strip(): v for k, v in row.items()}
    for k in keys:
        if k.lower() in lower and lower[k.lower()] is not None:
            return str(lower[k.lower()]).strip()
    return ""


def _upline_chain_cycles(upline_of: dict[int, int | None]) -> bool:
    """True if following upline pointers revisits a node (cycle)."""
    for start in upline_of:
        seen: set[int] = set()
        cur: int | None = start
        while cur is not None:
            if cur in seen:
                return True
            seen.add(cur)
            cur = upline_of.get(cur)
    return False


async def run_import(csv_path: Path, *, dry_run: bool) -> int:
    rows: list[dict[str, Any]] = []
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        r = csv.DictReader(f)
        if not r.fieldnames:
            print("ERROR: CSV has no header row", file=sys.stderr)
            return 2
        for row in r:
            rows.append(row)

    async with AsyncSessionLocal() as session:
        all_fbo: set[str] = set()
        planned: list[tuple[str, str]] = []
        for row in rows:
            fbo = normalize_fbo_id(_norm_cell(row, "fbo_id", "fbo"))
            if not fbo:
                continue
            upline_raw = _norm_cell(row, "upline_fbo_id", "upline_fbo", "upline")
            upline_fbo = normalize_fbo_id(upline_raw) if upline_raw else ""
            all_fbo.add(fbo)
            if upline_fbo:
                all_fbo.add(upline_fbo)
            planned.append((fbo, upline_fbo))

        if not all_fbo:
            print("No data rows with fbo_id.")
            return 0

        res = await session.execute(select(User.id, User.fbo_id).where(User.fbo_id.in_(sorted(all_fbo))))
        by_fbo: dict[str, int] = {normalize_fbo_id(x[1]): x[0] for x in res.all()}

        missing = sorted(x for x in all_fbo if x not in by_fbo)
        if missing:
            print("ERROR: unknown fbo_id(s) in CSV (create users first):", ", ".join(missing[:40]))
            if len(missing) > 40:
                print(f"  ... and {len(missing) - 40} more", file=sys.stderr)
            return 3

        full_rows = (await session.execute(select(User.id, User.upline_user_id))).all()
        proposed: dict[int, int | None] = {
            int(uid): (int(up) if up is not None else None) for uid, up in full_rows
        }

        updates: list[tuple[int, int | None]] = []
        for fbo, upline_fbo in planned:
            uid = by_fbo[fbo]
            if not upline_fbo:
                new_parent = None
            else:
                pid = by_fbo[upline_fbo]
                if pid == uid:
                    print(f"SKIP self-upline: {fbo}", file=sys.stderr)
                    continue
                new_parent = pid
            updates.append((uid, new_parent))

        for uid, new_parent in updates:
            trial = dict(proposed)
            trial[uid] = new_parent
            if _upline_chain_cycles(trial):
                print(
                    f"ERROR: setting user {uid} upline -> {new_parent} would create a cycle",
                    file=sys.stderr,
                )
                return 4

        n = 0
        for uid, new_parent in updates:
            proposed[uid] = new_parent
            if dry_run:
                print(f"  [dry-run] user {uid} upline_user_id -> {new_parent}")
            else:
                await session.execute(update(User).where(User.id == uid).values(upline_user_id=new_parent))
            n += 1

        if not dry_run:
            await session.commit()
        print(f"OK: {'would apply' if dry_run else 'applied'} {n} upline update(s).")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Import org upline links from CSV")
    p.add_argument("--csv", required=True, type=Path, help="Path to CSV")
    p.add_argument("--dry-run", action="store_true", help="Print planned updates only")
    args = p.parse_args()
    if not args.csv.is_file():
        print(f"ERROR: file not found: {args.csv}", file=sys.stderr)
        sys.exit(2)
    code = asyncio.run(run_import(args.csv, dry_run=args.dry_run))
    sys.exit(code)


if __name__ == "__main__":
    main()
