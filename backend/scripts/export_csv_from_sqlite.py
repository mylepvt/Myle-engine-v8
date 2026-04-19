#!/usr/bin/env python3
"""
Legacy SQLite → two CSV files (same columns as migrate_from_old_app.py expects).

  python scripts/export_csv_from_sqlite.py /path/to/leads.db
  python scripts/export_csv_from_sqlite.py ./leads.db -o ./legacy_export

Default output dir: ./legacy_export/
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

USERS_SQL = """SELECT id, username, fbo_id, role, email, phone, upline_username, upline_fbo_id,
       status, training_required, training_status, joining_date
FROM users WHERE status='approved' ORDER BY id"""

LEADS_SQL = """SELECT id, name, phone, email, assigned_to, assigned_user_id, status, city, notes,
       created_at, deleted_at, in_pool
FROM leads ORDER BY id"""


def export_db(db_path: Path, out_dir: Path) -> int:
    if not db_path.is_file():
        print(f"Not a file: {db_path}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)
    users_out = out_dir / "users_export.csv"
    leads_out = out_dir / "leads_export.csv"

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row

    def dump_query(sql: str, path: Path, label: str) -> int:
        cur = con.execute(sql)
        rows = cur.fetchall()
        if not rows:
            print(f"  [{label}] 0 rows")
            path.write_text("", encoding="utf-8")
            return 0
        cols = rows[0].keys()
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(cols), extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({k: r[k] for k in cols})
        print(f"  [{label}] wrote {len(rows)} rows → {path}")
        return len(rows)

    print(f"Source: {db_path.resolve()}")
    dump_query(USERS_SQL, users_out, "users")
    try:
        dump_query(LEADS_SQL, leads_out, "leads")
    except sqlite3.OperationalError as e:
        print(f"  [leads] skip ({e})", file=sys.stderr)
    con.close()
    print(f"\nNext (new Postgres):\n  export USERS_CSV={users_out.resolve()}")
    print(f"  export LEADS_CSV={leads_out.resolve()}")
    print("  python migrate_from_old_app.py --dry-run && python migrate_from_old_app.py")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Export users+leads CSV from legacy SQLite.")
    p.add_argument("legacy_db", type=Path, help="Path to leads.db (or app.db)")
    p.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=Path("legacy_export"),
        help="Output directory (default: ./legacy_export)",
    )
    args = p.parse_args()
    return export_db(args.legacy_db.expanduser().resolve(), args.output_dir.resolve())


if __name__ == "__main__":
    raise SystemExit(main())
