#!/usr/bin/env python3
"""
Print copy-paste steps for old-Render → new Postgres migration (no secrets).

  python scripts/myle_migrate_steps.py
"""
from __future__ import annotations

TEXT = r"""
================================================================================
MYLE: purana data nayi app mein — sabse aasaan raasta (1 file: leads.db)
================================================================================

Tumhare passwords nayi app mein pehle se set hain — THEEK HAI.
``import_legacy_sqlite.py`` jo user PostgreSQL mein pehle se hai (email / fbo_id
match), use SKIP karta hai — uska password CHANGE NAHI hota. Sirf missing users
insert hote hain. Leads + upline legacy DB se aate hain.

--------------------------------------------------------------------------------
STEP A — Purani app (Render) shell: sirf yeh check karo DB kahan hai
--------------------------------------------------------------------------------

  sqlite3 /var/data/leads.db "SELECT COUNT(*) FROM users;"
  sqlite3 /var/data/leads.db "SELECT COUNT(*) FROM leads;"

Agar error aaye to path try karo (purane project ne kabhi ``instance/app.db``):

  find /var -name "*.db" 2>/dev/null | head

--------------------------------------------------------------------------------
STEP B — ``leads.db`` (ya jo bhi .db mile) laptop par lao
--------------------------------------------------------------------------------

Render dashboard → old web service → **Disk** / **Shell** / docs ke hisaab se
file download (har account ka UI alag). Goal: ek hi file ``leads.db`` local disk
par save ho.

--------------------------------------------------------------------------------
STEP C — Laptop par (repo clone), ``backend/`` folder se import
--------------------------------------------------------------------------------

  cd backend
  export DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DB?sslmode=require"
  # ↑ nayi app wala **External** Postgres URL (Render PostgreSQL → Connect)

  python scripts/import_legacy_sqlite.py --legacy-db /FULL/PATH/leads.db --no-full-snapshot

``--no-full-snapshot`` = bina poori JSON snapshot ke (tez + kam disk).

Pehle dry-run:

  python scripts/import_legacy_sqlite.py --dry-run --legacy-db ./leads.db

--------------------------------------------------------------------------------
Agar sirf CSV mile (``.db`` nahi) — backup plan
--------------------------------------------------------------------------------

  export USERS_CSV=/path/to/users_export.csv
  export LEADS_CSV=/path/to/leads_export.csv
  python migrate_from_old_app.py --dry-run
  python migrate_from_old_app.py

CSV banane ke liye purane shell par (path DB ke mutabiq):

  sqlite3 /var/data/leads.db -csv -header \
    "SELECT id,username,fbo_id,role,email,phone,upline_username,upline_fbo_id,status,training_required,training_status,joining_date FROM users WHERE status='approved' ORDER BY id" \
    > /tmp/users_export.csv

  sqlite3 /var/data/leads.db -csv -header \
    "SELECT id,name,phone,email,assigned_to,assigned_user_id,status,city,notes,created_at,deleted_at,in_pool FROM leads ORDER BY id" \
    > /tmp/leads_export.csv

Phir local script se bhi CSV bana sakte ho (``.db`` milte hi):

  python scripts/export_csv_from_sqlite.py /path/to/leads.db

--------------------------------------------------------------------------------
Dubara import na chalao
--------------------------------------------------------------------------------

Do baar chalane se **duplicate leads** ban sakti hain. Pehle dry-run / staging DB.

================================================================================
"""


def main() -> int:
    print(TEXT.strip() + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
