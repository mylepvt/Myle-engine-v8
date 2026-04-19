#!/usr/bin/env python3
"""
Import rows from a legacy Flask Myle SQLite DB into the vl2 PostgreSQL database.

Read mapping rules in: legacy/LEGACY_TO_VL2_MAPPING.md

Examples (run from ``backend/`` so ``app`` package resolves):

  # Plan only — no writes
  python scripts/import_legacy_sqlite.py --dry-run --legacy-db /path/to/leads.db

  # Import (set DATABASE_URL / .env like the API)
  python scripts/import_legacy_sqlite.py --legacy-db /path/to/leads.db

  # 100% lossless: same as above also stores every SQLite row in ``legacy_row_snapshots`` (default).
  # Structured users/leads/wallet/activity + full JSON snapshot (run ``alembic upgrade head`` first).

  # Only archival snapshot (no normalized tables)
  python scripts/import_legacy_sqlite.py --snapshot-only --legacy-db /path/to/leads.db

  # Normalized import only (skip JSON snapshot)
  python scripts/import_legacy_sqlite.py --no-full-snapshot --legacy-db /path/to/leads.db

  After users are inserted, ``upline_user_id`` is backfilled from legacy
  ``upline_id`` / ``upline_username`` / ``upline_name`` / ``upline_fbo_id`` (leader downline).

  CSV-only upline edits (existing users): ``scripts/import_org_tree_csv.py``.

  # Save legacy→new id maps for debugging
  python scripts/import_legacy_sqlite.py --dry-run --legacy-db ./leads.db --write-mapping /tmp/legacy_maps.json

Environment:
  IMPORT_DEFAULT_PASSWORD  If legacy password hash is not bcrypt, new users get this password
                           (bcrypt-hashed on insert). Default: ChangeMeAfterImport!
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ``backend/`` — same layout as ``scripts/create_user.py`` (FastAPI + pydantic-settings + ``DATABASE_URL``).
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

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError

from app.constants.roles import ROLES_SET
from app.core.lead_status import LEAD_STATUS_SET
from app.core.passwords import hash_password
from app.db.session import AsyncSessionLocal
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.legacy_row_snapshot import LegacyRowSnapshot
from app.models.user import User
from app.models.wallet_recharge import WalletRecharge

_LEGACY_SOURCE_ALIASES = {
    "fb": "facebook",
    "facebook": "facebook",
    "ig": "instagram",
    "instagram": "instagram",
    "referral": "referral",
    "ref": "referral",
    "walk": "walk_in",
    "walk_in": "walk_in",
    "walk-in": "walk_in",
    "other": "other",
}

_PAYMENT_OK = frozenset({"pending", "proof_uploaded", "approved", "rejected"})
_CALL_OK = frozenset(
    {
        "not_called",
        "called",
        "callback_requested",
        "not_interested",
        "converted",
    }
)


def _parse_ts(val: Any) -> datetime | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _norm_role(raw: str) -> str:
    r = (raw or "team").strip().lower()
    return r if r in ROLES_SET else "team"


def _norm_email(username: str, legacy_id: int, raw_email: str) -> str:
    e = (raw_email or "").strip().lower()
    if e:
        return e
    safe = re.sub(r"[^a-z0-9._+-]", "_", (username or f"user{legacy_id}").lower())[:80]
    return f"{safe}.{legacy_id}@legacy.import.local"


def _norm_fbo(raw: str, legacy_id: int) -> str:
    s = (raw or "").strip()
    if s:
        return s.lower()[:64]
    return f"legacy-{legacy_id}"


def normalize_lead_status(raw: str) -> str:
    x = (raw or "").strip().lower()
    if x in LEAD_STATUS_SET:
        return x
    if any(k in x for k in ("lost", "retarget")):
        return "lost"
    if any(k in x for k in ("won", "convert", "paid", "complete", "closing")):
        return "won"
    if any(k in x for k in ("contact", "call", "follow")):
        return "contacted"
    if "qualif" in x:
        return "qualified"
    return "new"


def normalize_source(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = (raw or "").strip().lower()
    if not s:
        return None
    if s in _LEGACY_SOURCE_ALIASES:
        return _LEGACY_SOURCE_ALIASES[s]
    if s in ("facebook", "instagram", "referral", "walk_in", "other"):
        return s
    return "other"


def normalize_call_status(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = (raw or "").strip().lower().replace(" ", "_")
    if not s:
        return "not_called"
    if s in _CALL_OK:
        return s
    if "not" in s and "call" in s:
        return "not_called"
    if "call" in s or "contact" in s:
        return "called"
    return "not_called"


def normalize_payment_status_from_legacy(
    payment_done: int | None, raw: str | None,
) -> str | None:
    if raw:
        t = raw.strip().lower()
        if t in _PAYMENT_OK:
            return t
    if payment_done:
        return "approved"
    return "pending"


def legacy_table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def migrate_password_hash(legacy_pw: str) -> str | None:
    """Return hash string usable by vl2 (bcrypt) or None if importer must set default."""
    p = legacy_pw or ""
    if p.startswith("$2a$") or p.startswith("$2b$") or p.startswith("$2y$"):
        return p
    return None


async def import_users_phase(
    legacy: sqlite3.Connection,
    dry_run: bool,
    default_pw_hash: str,
    *,
    fail_on_skip: bool = False,
) -> dict[int, int]:
    """legacy user id -> new users.id"""
    mapping: dict[int, int] = {}
    rows = legacy.execute("SELECT * FROM users ORDER BY id").fetchall()
    if not rows:
        print("  [users] no rows in legacy DB")
        return mapping

    print(f"  [users] legacy rows: {len(rows)}")

    if dry_run:
        for row in rows[:3]:
            print(f"    sample id={row['id']} username={row['username']!r} fbo={row['fbo_id']!r}")
        if len(rows) > 3:
            print(f"    ... and {len(rows) - 3} more (dry-run)")
        return mapping

    skipped = 0
    for row in rows:
        lid = int(row["id"])
        username = str(row["username"] or "").strip()
        email = _norm_email(username, lid, str(row["email"] or ""))
        fbo = _norm_fbo(str(row["fbo_id"] or ""), lid)
        role = _norm_role(str(row["role"] or "team"))
        hp = migrate_password_hash(str(row["password"] or ""))
        if hp is None:
            hp = default_pw_hash

        u = User(
            fbo_id=fbo,
            username=username or None,
            email=email,
            role=role,
            hashed_password=hp,
        )
        async with AsyncSessionLocal() as session:
            session.add(u)
            try:
                await session.commit()
                await session.refresh(u)
                mapping[lid] = u.id
            except IntegrityError as e:
                await session.rollback()
                skipped += 1
                print(f"    SKIP legacy user id={lid} ({e.orig})")

    print(f"  [users] imported {len(mapping)}, skipped {skipped}")
    if fail_on_skip and skipped > 0:
        raise RuntimeError(
            "User import skipped rows and --fail-on-skip is enabled; fix conflicts then re-run.",
        )

    # Every legacy user id must map to PostgreSQL users.id (new row or already-existing row).
    # Without this, leads import mis-assigns owners when some users inserted and some skipped.
    need_link = [int(row["id"]) for row in rows if int(row["id"]) not in mapping]
    if need_link:
        print(f"  [users] linking {len(need_link)} legacy users to existing PostgreSQL rows …")
        from sqlalchemy import select as _select, or_ as _or
        from app.models.user import User as _User

        async with AsyncSessionLocal() as session:
            for row in rows:
                lid = int(row["id"])
                if lid in mapping:
                    continue
                username = str(row["username"] or "").strip()
                email = _norm_email(username, lid, str(row["email"] or ""))
                fbo = _norm_fbo(str(row["fbo_id"] or ""), lid)
                result = await session.execute(
                    _select(_User).where(_or(_User.email == email, _User.fbo_id == fbo)),
                )
                existing = result.scalars().first()
                if existing:
                    mapping[lid] = existing.id
                else:
                    print(
                        f"    WARN legacy user id={lid} has no PostgreSQL match "
                        f"(fbo={fbo!r} email={email!r})",
                        file=sys.stderr,
                    )
        print(f"  [users] full legacy id → pg id map size: {len(mapping)}")
    return mapping


def _legacy_col(row: sqlite3.Row, name: str) -> Any:
    if name not in row.keys():
        return None
    return row[name]


def _resolve_legacy_upline_legacy_user_id(
    row: sqlite3.Row,
    by_username: dict[str, int],
    by_fbo: dict[str, int],
) -> int | None:
    """Match legacy hierarchy resolution order: upline_id → username → name-as-username → FBO."""
    uid = _legacy_col(row, "upline_id")
    if uid is not None:
        try:
            x = int(uid)
            if x > 0:
                return x
        except (TypeError, ValueError):
            pass

    uun = str(_legacy_col(row, "upline_username") or "").strip()
    if uun:
        hit = by_username.get(uun.lower())
        if hit is not None:
            return hit

    unm = str(_legacy_col(row, "upline_name") or "").strip()
    if unm:
        hit = by_username.get(unm.lower())
        if hit is not None:
            return hit

    ufbo = str(_legacy_col(row, "upline_fbo_id") or "").strip()
    if ufbo:
        nk = _norm_fbo(ufbo, 0)
        hit = by_fbo.get(nk)
        if hit is not None:
            return hit

    return None


async def apply_upline_user_ids_phase(
    legacy: sqlite3.Connection,
    user_map: dict[int, int],
) -> None:
    """After all users exist, set ``User.upline_user_id`` from legacy upline columns."""
    if not user_map:
        return

    rows = legacy.execute("SELECT * FROM users ORDER BY id").fetchall()
    by_username: dict[str, int] = {}
    by_fbo: dict[str, int] = {}
    for row in rows:
        lid = int(row["id"])
        un = str(row["username"] or "").strip().lower()
        if un:
            by_username[un] = lid
        fbo = _norm_fbo(str(row["fbo_id"] or ""), lid)
        by_fbo[fbo] = lid

    n_set = 0
    async with AsyncSessionLocal() as session:
        for row in rows:
            lid = int(row["id"])
            if lid not in user_map:
                continue
            plid = _resolve_legacy_upline_legacy_user_id(row, by_username, by_fbo)
            if plid is None or plid == lid:
                continue
            if plid not in user_map:
                continue
            new_uid = user_map[lid]
            parent_new = user_map[plid]
            await session.execute(
                update(User)
                .where(User.id == new_uid)
                .values(upline_user_id=parent_new),
            )
            n_set += 1
        await session.commit()

    print(f"  [users] upline_user_id links set: {n_set}")


async def pick_default_creator_id(user_map: dict[int, int]) -> int:
    """Prefer any admin in DB (e.g. dev seed); else smallest imported user id."""
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(User).where(User.role == "admin").limit(1))
        admin = r.scalar_one_or_none()
        if admin is not None:
            return admin.id
    return min(user_map.values()) if user_map else 1


def build_username_to_new_id(
    legacy: sqlite3.Connection,
    user_map: dict[int, int],
) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in legacy.execute("SELECT id, username FROM users"):
        lid = int(row["id"])
        if lid not in user_map:
            continue
        un = str(row["username"] or "").strip().lower()
        if un:
            out[un] = user_map[lid]
    return out


async def import_leads_phase(
    legacy: sqlite3.Connection,
    user_map: dict[int, int],
    dry_run: bool,
) -> dict[int, int]:
    """legacy lead id -> new lead id"""
    lead_map: dict[int, int] = {}
    if not legacy_table_exists(legacy, "leads"):
        print("  [leads] table missing")
        return lead_map

    rows = legacy.execute("SELECT * FROM leads ORDER BY id").fetchall()
    if not rows:
        print("  [leads] no rows")
        return lead_map

    print(f"  [leads] legacy rows: {len(rows)}")

    if dry_run:
        for row in rows[:2]:
            print(
                f"    sample id={row['id']} name={row['name']!r} status={row['status']!r}",
            )
        return lead_map

    default_creator = await pick_default_creator_id(user_map)

    async with AsyncSessionLocal() as session:
        for row in rows:
            lid = int(row["id"])
            keys = row.keys()

            assigned_raw = row["assigned_user_id"] if "assigned_user_id" in keys else None
            try:
                aid = int(assigned_raw) if assigned_raw not in (None, "") else None
            except (TypeError, ValueError):
                aid = None
            assigned_new = user_map.get(aid) if aid else None
            creator = assigned_new if assigned_new is not None else default_creator

            name = str(row["name"] or "Imported").strip() or "Imported"
            status = normalize_lead_status(str(row["status"] or "new"))
            phone = (str(row["phone"]) if row["phone"] else None) or None
            em = str(row["email"]).strip() if "email" in keys and row["email"] else None
            email = em or None
            city = (
                str(row["city"]).strip()
                if "city" in keys and row["city"]
                else None
            ) or None
            src = normalize_source(
                str(row["source"]) if "source" in keys else None,
            )
            notes = row["notes"] if "notes" in keys else None
            notes_s = str(notes) if notes else None

            deleted_at = _parse_ts(row["deleted_at"]) if "deleted_at" in keys else None
            if deleted_at is None and "deleted_at" in keys:
                ds = str(row["deleted_at"] or "").strip()
                if ds == "":
                    deleted_at = None

            in_pool = bool(int(row["in_pool"] or 0)) if "in_pool" in keys else False

            cc = int(row["contact_count"] or 0) if "contact_count" in keys else 0
            last_c = (
                _parse_ts(row["last_contacted"])
                if "last_contacted" in keys
                else None
            )

            cr = str(row["call_result"] or "") if "call_result" in keys else ""
            call_st = normalize_call_status(cr)

            pd = int(row["payment_done"] or 0) if "payment_done" in keys else 0
            pamt = float(row["payment_amount"] or 0) if "payment_amount" in keys else 0.0
            amt_cents = int(round(pamt * 100)) if pamt else None

            pay_raw = str(row["payment_status"]) if "payment_status" in keys else None
            pay_st = normalize_payment_status_from_legacy(pd, pay_raw)

            proof = (
                str(row["payment_proof_path"])
                if "payment_proof_path" in keys and row["payment_proof_path"]
                else None
            )

            d1 = bool(int(row["day1_done"] or 0)) if "day1_done" in keys else False
            d2 = bool(int(row["day2_done"] or 0)) if "day2_done" in keys else False
            d3 = bool(int(row["interview_done"] or 0)) if "interview_done" in keys else False
            upd = _parse_ts(row["updated_at"]) if "updated_at" in keys else None

            lead = Lead(
                name=name[:255],
                status=status[:32],
                created_by_user_id=creator,
                phone=phone[:20] if phone else None,
                email=email[:320] if email else None,
                city=city[:100] if city else None,
                source=src[:50] if src else None,
                notes=notes_s,
                archived_at=None,
                deleted_at=deleted_at,
                in_pool=in_pool,
                assigned_to_user_id=assigned_new,
                call_status=call_st[:32] if call_st else None,
                call_count=cc,
                last_called_at=last_c,
                payment_status=pay_st[:32] if pay_st else None,
                payment_amount_cents=amt_cents,
                payment_proof_url=proof[:500] if proof else None,
                day1_completed_at=upd if d1 else None,
                day2_completed_at=upd if d2 else None,
                day3_completed_at=upd if d3 else None,
            )
            session.add(lead)
            await session.flush()
            lead_map[lid] = lead.id

        await session.commit()

    print(f"  [leads] imported {len(lead_map)}")
    return lead_map


async def import_wallet_phase(
    legacy: sqlite3.Connection,
    user_map: dict[int, int],
    dry_run: bool,
) -> int:
    if not legacy_table_exists(legacy, "wallet_recharges"):
        print("  [wallet_recharges] table missing")
        return 0
    rows = legacy.execute("SELECT * FROM wallet_recharges ORDER BY id").fetchall()
    print(f"  [wallet_recharges] legacy rows: {len(rows)}")
    if dry_run or not rows:
        return 0

    uname_to_id = build_username_to_new_id(legacy, user_map)
    n = 0
    async with AsyncSessionLocal() as session:
        for row in rows:
            un = str(row["username"] or "").strip().lower()
            uid = uname_to_id.get(un)
            if uid is None:
                continue
            amt = float(row["amount"] or 0)
            cents = int(round(amt * 100))
            st = str(row["status"] or "pending").strip().lower()
            if st not in ("pending", "approved", "rejected"):
                st = "pending"
            wr = WalletRecharge(
                user_id=uid,
                amount_cents=cents,
                utr_number=(str(row["utr_number"])[:50] if row["utr_number"] else None),
                status=st,
                admin_note=(str(row["admin_note"])[:512] if row["admin_note"] else None),
            )
            session.add(wr)
            n += 1
        await session.commit()
    print(f"  [wallet_recharges] imported {n}")
    return n


async def import_activity_phase(
    legacy: sqlite3.Connection,
    user_map: dict[int, int],
    dry_run: bool,
) -> int:
    if not legacy_table_exists(legacy, "activity_log"):
        print("  [activity_log] table missing")
        return 0
    rows = legacy.execute("SELECT * FROM activity_log ORDER BY id").fetchall()
    print(f"  [activity_log] legacy rows: {len(rows)}")
    if dry_run or not rows:
        return 0

    uname_to_id = build_username_to_new_id(legacy, user_map)
    n = 0
    async with AsyncSessionLocal() as session:
        for row in rows:
            un = str(row["username"] or "").strip().lower()
            uid = uname_to_id.get(un)
            if uid is None:
                continue
            ev = str(row["event_type"] or "import")[:100]
            det = str(row["details"] or "")
            meta = {"detail": det} if det else None
            ip = str(row["ip_address"] or "")[:45] or None
            created = _parse_ts(row["created_at"]) or datetime.now(timezone.utc)
            log = ActivityLog(
                user_id=uid,
                action=ev,
                entity_type=None,
                entity_id=None,
                meta=meta,
                ip_address=ip,
                created_at=created,
            )
            session.add(log)
            n += 1
        await session.commit()
    print(f"  [activity_log] imported {n}")
    return n


def _strip_postgres_json_nul(obj: Any) -> Any:
    """PostgreSQL JSON/JSONB rejects \\u0000 in string values."""
    if isinstance(obj, str):
        return obj.replace("\x00", "") if "\x00" in obj else obj
    if isinstance(obj, dict):
        return {k: _strip_postgres_json_nul(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_strip_postgres_json_nul(x) for x in obj]
    return obj


def _json_safe(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, bytes):
        return {"__bytes_b64__": base64.b64encode(val).decode("ascii")}
    if isinstance(val, memoryview):
        return {"__bytes_b64__": base64.b64encode(val.tobytes()).decode("ascii")}
    return str(val)


def _sqlite_ident(name: str) -> str:
    if not name or not all(c.isalnum() or c == "_" for c in name):
        raise ValueError(f"unsafe table name: {name!r}")
    return '"' + name.replace('"', '""') + '"'


def _list_user_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).fetchall()
    return [r[0] for r in rows]


def _stable_row_key(d: dict[str, Any]) -> str:
    """Prefer SQLite rowid (always on our SELECT); else legacy id column."""
    if "__sqlite_rowid__" in d and d["__sqlite_rowid__"] is not None:
        return f"rowid:{d['__sqlite_rowid__']}"
    if "id" in d and d["id"] is not None:
        return f"id:{d['id']}"
    h = hash(json.dumps(d, sort_keys=True, default=str))
    return f"hash:{h % (10 ** 15)}"


async def import_full_snapshot_phase(
    legacy: sqlite3.Connection,
    import_run_id: str,
    sqlite_label: str,
    dry_run: bool,
) -> int:
    """Store every legacy table row in ``legacy_row_snapshots`` (100% lossless archive)."""
    tables = _list_user_tables(legacy)
    if dry_run:
        total = 0
        for t in tables:
            try:
                ident = _sqlite_ident(t)
            except ValueError:
                print(f"    skip unsafe name: {t!r}", file=sys.stderr)
                continue
            n = int(legacy.execute(f"SELECT COUNT(*) FROM {ident}").fetchone()[0])
            total += n
            print(f"    {t}: {n}")
        print(
            f"  [snapshot] dry-run: {len(tables)} tables, {total} rows (not written)",
        )
        return total

    n_inserted = 0
    chunk: list[LegacyRowSnapshot] = []
    chunk_size = 400

    async with AsyncSessionLocal() as session:
        for t in tables:
            try:
                ident = _sqlite_ident(t)
            except ValueError:
                print(f"  [snapshot] skip unsafe table name: {t!r}", file=sys.stderr)
                continue
            cur = legacy.execute(
                f"SELECT rowid AS __sqlite_rowid__, * FROM {ident}",
            )
            rows = cur.fetchall()
            for row in rows:
                d_raw = {k: row[k] for k in row.keys()}
                payload = _strip_postgres_json_nul(
                    {k: _json_safe(v) for k, v in d_raw.items()},
                )
                rk = _stable_row_key(payload)
                snap = LegacyRowSnapshot(
                    import_run_id=import_run_id,
                    sqlite_label=sqlite_label[:512],
                    table_name=t[:128],
                    row_key=rk[:512],
                    payload=payload,
                )
                chunk.append(snap)
                n_inserted += 1
                if len(chunk) >= chunk_size:
                    session.add_all(chunk)
                    await session.commit()
                    chunk.clear()
        if chunk:
            session.add_all(chunk)
            await session.commit()

    print(f"  [snapshot] inserted {n_inserted} rows into legacy_row_snapshots")
    return n_inserted


async def _pg_smoke() -> None:
    async with AsyncSessionLocal() as s:
        await s.execute(text("SELECT 1"))


async def main() -> int:
    p = argparse.ArgumentParser(description="Import legacy SQLite into vl2 PostgreSQL")
    p.add_argument(
        "--legacy-db",
        default=os.environ.get("LEGACY_SQLITE_PATH", ""),
        help="Path to legacy leads.db (or set LEGACY_SQLITE_PATH)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write to PostgreSQL; print counts and samples",
    )
    p.add_argument(
        "--write-mapping",
        default="",
        help="Write JSON file with legacy→new id maps (users + leads)",
    )
    p.add_argument("--users-only", action="store_true")
    p.add_argument(
        "--fail-on-skip",
        action="store_true",
        help="Fail import if any user row is skipped (idempotency/conflict safety gate).",
    )
    p.add_argument("--skip-wallet", action="store_true")
    p.add_argument("--skip-activity", action="store_true")
    p.add_argument(
        "--sqlite-only",
        action="store_true",
        help="Do not connect to PostgreSQL (for dry-run inspection without API DB)",
    )
    p.add_argument(
        "--no-full-snapshot",
        action="store_true",
        help="Skip lossless JSON snapshot into legacy_row_snapshots (structured import only)",
    )
    p.add_argument(
        "--snapshot-only",
        action="store_true",
        help="Only run 100%% snapshot into legacy_row_snapshots (no users/leads/wallet/activity)",
    )
    args = p.parse_args()

    db_path = (args.legacy_db or "").strip()
    if not db_path:
        print("Provide --legacy-db or LEGACY_SQLITE_PATH", file=sys.stderr)
        return 1
    lp = Path(db_path).expanduser().resolve()
    if not lp.is_file():
        print(f"Not a file: {lp}", file=sys.stderr)
        return 1

    os.environ.setdefault(
        "IMPORT_DEFAULT_PASSWORD",
        "ChangeMeAfterImport!",
    )
    default_plain = os.environ["IMPORT_DEFAULT_PASSWORD"]
    default_pw_hash = hash_password(default_plain)

    dry_run = bool(args.dry_run or args.sqlite_only)

    print(f"Legacy DB: {lp}")
    print(f"Dry-run: {dry_run}" + (" (sqlite-only)" if args.sqlite_only else ""))

    legacy = sqlite3.connect(str(lp))
    legacy.row_factory = sqlite3.Row
    # Legacy DB may store non–UTF-8 bytes in TEXT columns (e.g. truncated base64 in display_picture).
    def _legacy_sqlite_text_factory(raw):  # bytes from sqlite3 TEXT/BLOB
        if isinstance(raw, memoryview):
            raw = raw.tobytes()
        elif isinstance(raw, bytearray):
            raw = bytes(raw)
        return bytes(raw).decode("utf-8", errors="replace")

    legacy.text_factory = _legacy_sqlite_text_factory

    if args.snapshot_only and args.sqlite_only:
        print("--snapshot-only requires PostgreSQL (omit --sqlite-only)", file=sys.stderr)
        return 1

    import_run_id = str(uuid.uuid4())
    sqlite_label = lp.name

    if not args.sqlite_only:
        try:
            await _pg_smoke()
        except Exception as e:
            print(f"PostgreSQL connection failed: {e}", file=sys.stderr)
            return 1

    user_map: dict[int, int] = {}
    lead_map: dict[int, int] = {}

    try:
        if args.snapshot_only:
            if dry_run:
                await import_full_snapshot_phase(
                    legacy, import_run_id, sqlite_label, True,
                )
            else:
                n_snap = await import_full_snapshot_phase(
                    legacy, import_run_id, sqlite_label, False,
                )
                print(f"import_run_id={import_run_id} (save for audit; rows={n_snap})")
        else:
            user_map = await import_users_phase(
                legacy,
                dry_run,
                default_pw_hash,
                fail_on_skip=args.fail_on_skip,
            )
            if not dry_run and user_map:
                await apply_upline_user_ids_phase(legacy, user_map)
            if args.users_only:
                pass
            elif not dry_run and not user_map:
                print("No users imported and no mapping rebuilt; skipping leads.", file=sys.stderr)
            else:
                if dry_run:
                    await import_leads_phase(legacy, user_map, True)
                else:
                    lead_map = await import_leads_phase(legacy, user_map, False)
                    if not args.skip_wallet:
                        await import_wallet_phase(legacy, user_map, False)
                    if not args.skip_activity:
                        await import_activity_phase(legacy, user_map, False)

            if (
                not args.no_full_snapshot
                and not args.sqlite_only
            ):
                print(f"Full snapshot import_run_id={import_run_id}")
                if dry_run:
                    await import_full_snapshot_phase(
                        legacy, import_run_id, sqlite_label, True,
                    )
                else:
                    await import_full_snapshot_phase(
                        legacy, import_run_id, sqlite_label, False,
                    )
    finally:
        legacy.close()

    if args.write_mapping:
        out = {
            "users": {str(k): v for k, v in user_map.items()},
            "leads": {str(k): v for k, v in lead_map.items()},
            "import_run_id": import_run_id,
        }
        Path(args.write_mapping).write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(f"Wrote mapping: {args.write_mapping}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
