#!/usr/bin/env python3
"""
One-off: old Flask/SQLite CSV exports → vl2 PostgreSQL (users + hierarchy + leads).

Prefer full DB import when possible: ``scripts/import_legacy_sqlite.py`` (see
``legacy/LEGACY_TO_VL2_MAPPING.md``). Use this when you only have Render shell CSVs.

Run from ``backend/`` (so ``app`` resolves):

  export DATABASE_URL='postgresql://...'
  export IMPORT_DEFAULT_PASSWORD='...'   # optional; default ChangeMeAfterImport!
  # Save exports on the target host:
  #   /tmp/users_export.csv  — id,username,fbo_id,role,email,phone,upline_*,status,training_*,joining_date
  #   /tmp/leads_export.csv  — id,name,phone,email,assigned_to,assigned_user_id,status,city,notes,created_at,deleted_at,in_pool

  python migrate_from_old_app.py
  python migrate_from_old_app.py --dry-run

Env:
  USERS_CSV   default /tmp/users_export.csv
  LEADS_CSV   default /tmp/leads_export.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import bcrypt
import psycopg2
from psycopg2.extras import execute_values

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.constants.roles import ROLES_SET
from app.core.lead_status import LEAD_STATUS_SET

os.environ.setdefault("IMPORT_DEFAULT_PASSWORD", "ChangeMeAfterImport!")
IMPORT_DEFAULT_PASSWORD = os.environ["IMPORT_DEFAULT_PASSWORD"]

# Exact legacy UI strings → vl2 ``Lead.status`` (see app/core/lead_status.py)
_STATUS_LABEL_MAP: dict[str, str] = {
    "new": "new_lead",
    "New": "new_lead",
    "Lost": "lost",
    "Inactive": "inactive",
    "Contacted": "contacted",
    "Retarget": "retarget",
    "Video Watched": "video_watched",
    "Video Sent": "video_sent",
    "Invited": "invited",
    "Paid ₹196": "paid",
    "Day 1": "day1",
    "Day 2": "day2",
    "Day 3": "day2",
}


def _norm_db_url(raw: str) -> str:
    u = raw.strip()
    if u.startswith("postgres://"):
        u = "postgresql://" + u[len("postgres://") :]
    return u.replace("+asyncpg", "").replace("+psycopg2", "")


def _hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def map_lead_status(raw: str) -> str:
    s = (raw or "").strip()
    if s in _STATUS_LABEL_MAP:
        out = _STATUS_LABEL_MAP[s]
        return out if out in LEAD_STATUS_SET else "new_lead"
    low = s.lower()
    if low in LEAD_STATUS_SET:
        return low
    slug = low.replace(" ", "_")
    if slug in LEAD_STATUS_SET:
        return slug
    if "paid" in low and "196" in s:
        return "paid"
    if "day" in low and "1" in s:
        return "day1"
    if "day" in low and "2" in s:
        return "day2"
    if "lost" in low or "retarget" in low:
        return "lost"
    if "inactive" in low:
        return "inactive"
    if "contact" in low:
        return "contacted"
    return "new_lead"


def _parse_dt(val: str | None) -> datetime | None:
    if not val or not str(val).strip():
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s[:26], fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _parse_joining_date(val: str | None) -> date | None:
    if not val or not str(val).strip():
        return None
    s = str(val).strip()[:32]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _norm_email(username: str | None, legacy_id: int, raw_email: str) -> str:
    e = (raw_email or "").strip().lower()
    if e:
        return e[:320]
    safe = re.sub(r"[^a-z0-9._+-]", "_", (username or f"user{legacy_id}").lower())[:80]
    return f"{safe}.{legacy_id}@legacy.import.local"


def _norm_phone_user(raw: str | None) -> str | None:
    if raw is None:
        return None
    p = re.sub(r"\s+", "", str(raw).strip())
    if not p:
        return None
    if not p.startswith("+") and p.isdigit() and len(p) == 10:
        p = "+91" + p
    return p[:32]


def _norm_phone_lead(raw: str | None) -> str | None:
    p = _norm_phone_user(raw)
    return p[:20] if p else None


def _norm_role(raw: str) -> str:
    r = (raw or "team").strip().lower()
    return r if r in ROLES_SET else "team"


def _norm_fbo(raw: str, legacy_id: int) -> str:
    s = (raw or "").strip().lower()[:64]
    if s:
        return s
    return f"legacy-{legacy_id}"


def parse_gender(notes_raw: str) -> str | None:
    m = re.search(r"Gender:\s*(Male|Female)", notes_raw or "")
    return m.group(1).lower() if m else None


def parse_notes(notes_raw: str) -> str | None:
    cleaned = re.sub(r"Gender:\s*(Male|Female)\s*\|?\s*", "", notes_raw or "").strip()
    cleaned = re.sub(r"Submit Time:.*", "", cleaned).strip(" |")
    return cleaned or None


def load_username_to_id(cur) -> dict[str, int]:
    cur.execute("SELECT id, username FROM users WHERE username IS NOT NULL AND TRIM(username) <> ''")
    return {row[1].strip().lower(): row[0] for row in cur.fetchall()}


def migrate(*, dry_run: bool) -> int:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("ERROR: set DATABASE_URL", file=sys.stderr)
        return 1

    users_path = Path(os.environ.get("USERS_CSV", "/tmp/users_export.csv")).expanduser()
    leads_path = Path(os.environ.get("LEADS_CSV", "/tmp/leads_export.csv")).expanduser()

    print(f"Dry-run: {dry_run}")
    print(f"Users CSV: {users_path} (exists={users_path.is_file()})")
    print(f"Leads CSV: {leads_path} (exists={leads_path.is_file()})")

    conn = psycopg2.connect(_norm_db_url(database_url))
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT id, fbo_id FROM users")
    existing_by_fbo: dict[str, int] = {}
    for uid, fbo in cur.fetchall():
        if fbo:
            existing_by_fbo[str(fbo).strip().lower()] = uid

    old_sqlite_user_id_to_pg_id: dict[int, int] = {}
    users_inserted = 0

    if users_path.is_file():
        with users_path.open(newline="", encoding="utf-8", errors="replace") as f:
            rows = list(csv.DictReader(f))
        print(f"Users in CSV: {len(rows)}")
        hashed_pw = _hash_pw(IMPORT_DEFAULT_PASSWORD)

        for row in rows:
            try:
                old_id = int(row["id"])
            except (KeyError, ValueError):
                continue
            fbo_id = _norm_fbo(row.get("fbo_id", ""), old_id)
            username = (row.get("username") or "").strip() or None
            role = _norm_role(row.get("role", ""))
            email = _norm_email(username, old_id, row.get("email", ""))
            phone = _norm_phone_user(row.get("phone"))
            training_req = str(row.get("training_required", "0")).strip() in ("1", "True", "true")
            training_status = (row.get("training_status") or "not_required").strip() or "not_required"
            joining_date = _parse_joining_date(row.get("joining_date"))
            name = username

            if fbo_id in existing_by_fbo:
                old_sqlite_user_id_to_pg_id[old_id] = existing_by_fbo[fbo_id]
                continue

            if dry_run:
                users_inserted += 1
                old_sqlite_user_id_to_pg_id[old_id] = -1
                continue

            def _insert_user(email_val: str, phone_val: str | None) -> int | None:
                cur.execute(
                    """
                    INSERT INTO users (fbo_id, username, email, role, hashed_password,
                        training_required, training_status, name, phone, joining_date,
                        registration_status, discipline_status, access_blocked)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'approved', 'active', false)
                    ON CONFLICT (fbo_id) DO NOTHING
                    RETURNING id
                    """,
                    (
                        fbo_id,
                        username,
                        email_val,
                        role,
                        hashed_pw,
                        training_req,
                        training_status,
                        name,
                        phone_val,
                        joining_date,
                    ),
                )
                out = cur.fetchone()
                if out:
                    return int(out[0])
                cur.execute("SELECT id FROM users WHERE fbo_id=%s", (fbo_id,))
                r = cur.fetchone()
                return int(r[0]) if r else None

            try:
                new_uid = _insert_user(email, phone)
                if new_uid is not None:
                    old_sqlite_user_id_to_pg_id[old_id] = new_uid
                    existing_by_fbo[fbo_id] = new_uid
                    users_inserted += 1
                    conn.commit()
                else:
                    conn.commit()
            except psycopg2.Error as e:
                conn.rollback()
                print(f"  user insert retry old_id={old_id} fbo={fbo_id}: {e.pgerror or e}")
                try:
                    email2 = (_norm_email(username, old_id, "") + ".dup")[:320]
                    new_uid = _insert_user(email2, None)
                    if new_uid is not None:
                        old_sqlite_user_id_to_pg_id[old_id] = new_uid
                        existing_by_fbo[fbo_id] = new_uid
                        users_inserted += 1
                    conn.commit()
                except psycopg2.Error as e2:
                    conn.rollback()
                    print(f"  user insert failed old_id={old_id}: {e2}")

        username_to_id = load_username_to_id(cur)
        upline_updated = 0
        for row in rows:
            try:
                old_id = int(row["id"])
            except (KeyError, ValueError):
                continue
            upline_username = (row.get("upline_username") or "").strip()
            if not upline_username:
                continue
            uid = old_sqlite_user_id_to_pg_id.get(old_id)
            if not uid or uid < 0:
                continue
            upline_id = username_to_id.get(upline_username.lower())
            if upline_id is None:
                cur.execute(
                    "SELECT id FROM users WHERE LOWER(TRIM(username))=%s",
                    (upline_username.lower(),),
                )
                r = cur.fetchone()
                upline_id = r[0] if r else None
            if upline_id and not dry_run:
                cur.execute(
                    "UPDATE users SET upline_user_id=%s WHERE id=%s AND (upline_user_id IS NULL OR upline_user_id <> %s)",
                    (upline_id, uid, upline_id),
                )
                upline_updated += int(cur.rowcount > 0)
        if not dry_run:
            conn.commit()
        print(f"Users inserted: {users_inserted}; upline rows updated: {upline_updated}")
    else:
        print("WARNING: users CSV missing — old user id → assignee mapping incomplete")
        cur.execute("SELECT id, fbo_id FROM users")
        for uid, fbo in cur.fetchall():
            if fbo:
                existing_by_fbo[str(fbo).strip().lower()] = uid

    cur.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    ar = cur.fetchone()
    admin_id = ar[0] if ar else 1

    leads_rows: list[tuple] = []
    skipped = 0
    if leads_path.is_file():
        with leads_path.open(newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                raw_assignee = (row.get("assigned_user_id") or "").strip()
                try:
                    old_uid = int(raw_assignee) if raw_assignee else 0
                except ValueError:
                    old_uid = 0
                name = (row.get("name") or "").strip()
                if not name:
                    skipped += 1
                    continue
                phone = _norm_phone_lead(row.get("phone"))
                email = (row.get("email") or "").strip() or None
                if email:
                    email = email[:320]
                city = (row.get("city") or "").strip() or None
                notes_raw = row.get("notes") or ""
                status = map_lead_status(row.get("status") or "")
                gender = parse_gender(notes_raw)
                notes = parse_notes(notes_raw)
                created_at = _parse_dt(row.get("created_at")) or datetime.now(timezone.utc)
                deleted_at = _parse_dt(row.get("deleted_at"))
                in_pool = str(row.get("in_pool", "0")).strip() in ("1", "true", "True")

                owner = old_sqlite_user_id_to_pg_id.get(old_uid) if old_uid else None
                if owner is None or owner < 0:
                    owner = admin_id

                leads_rows.append(
                    (
                        name,
                        phone,
                        email,
                        city,
                        gender,
                        status,
                        owner,
                        owner,
                        created_at,
                        notes,
                        in_pool,
                        deleted_at,
                    )
                )
        print(f"Leads parsed: {len(leads_rows)} (skipped empty name: {skipped})")
    else:
        print("WARNING: leads CSV missing — no leads inserted")

    if dry_run:
        print("Dry-run complete (no lead writes).")
        cur.close()
        conn.close()
        return 0

    if leads_rows:
        execute_values(
            cur,
            """
            INSERT INTO leads
                (name, phone, email, city, gender, status,
                 created_by_user_id, assigned_to_user_id,
                 created_at, notes, in_pool, deleted_at)
            VALUES %s
            """,
            leads_rows,
            page_size=300,
        )
        conn.commit()
        print(f"Leads inserted: {len(leads_rows)}")

    cur.close()
    conn.close()
    print("Done.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="CSV migration from old Myle SQLite exports.")
    p.add_argument("--dry-run", action="store_true", help="Parse only; no DB writes")
    args = p.parse_args()
    return migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
