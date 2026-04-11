#!/usr/bin/env python3
"""
STEP 1 production-style E2E on REAL leads.db (no pytest temp DB).

Prereq:
  export ADMIN_PASSWORD='your real admin login password'
  Optional: export DATABASE_PATH='/path/to/leads.db' (default: ../leads.db from repo root)

Flow:
  1) Admin session: add 5 pool leads (PROD_STEP1_*), credit new team user wallet
  2) Create approved team user (SQL insert — mirrors admin-created account; password known)
  3) Team session: claim 4 leads
  4) Print DB claimed_at + compare dashboard "My Leads Progress" badge to SQL count

Run from repo root:
  cd /path/to/Myle-Dashboard-main && ADMIN_PASSWORD=... python3 scripts/prod_step1_claim_e2e.py
"""
from __future__ import annotations

import os
import re
import sys
import time

# ── Must set before importing app ─────────────────────────────
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

os.environ.setdefault("DATABASE_PATH", os.path.join(_ROOT, "leads.db"))
os.environ.setdefault("SECRET_KEY", "prod-e2e-script-local-secret")
os.environ.setdefault("GUNICORN_MULTI_WORKER", "1")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()
if not ADMIN_PASSWORD:
    print("ERROR: Set ADMIN_PASSWORD to your real admin password for this database.", file=sys.stderr)
    sys.exit(2)

# Resolve admin username (first approved admin)
import sqlite3

_db_path = os.environ["DATABASE_PATH"]
_conn = sqlite3.connect(_db_path)
_conn.row_factory = sqlite3.Row
_admin = _conn.execute(
    "SELECT username FROM users WHERE role='admin' AND status='approved' ORDER BY id LIMIT 1"
).fetchone()
_conn.close()
if not _admin:
    print("ERROR: No approved admin user in database.", file=sys.stderr)
    sys.exit(2)
ADMIN_USER = _admin["username"]

import app as app_module  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

from database import get_db  # noqa: E402
from helpers import _today_ist  # noqa: E402

app = app_module.app
app.config["TESTING"] = True


def _csrf(c):
    with c.session_transaction() as s:
        return s.get("_csrf_token", "")


def _login(c, username: str, password: str) -> None:
    c.get("/logout", follow_redirects=True)
    c.get("/login")
    tok = _csrf(c)
    r = c.post(
        "/login",
        data={"username": username, "password": password, "csrf_token": tok},
        follow_redirects=True,
    )
    if r.status_code != 200 or b"Invalid username" in r.data:
        raise RuntimeError(f"Login failed for {username!r} HTTP {r.status_code}")


def main() -> int:
    ts = int(time.time())
    team_user = f"prod_step1_{ts}"
    team_password = f"ProdStep1_{ts % 10000}!"
    tag = f"PROD_STEP1_{ts}"
    pool_price = 50.0
    claim_n = 4

    db = get_db()
    admin_fbo = db.execute(
        "SELECT fbo_id FROM users WHERE username=?", (ADMIN_USER,)
    ).fetchone()
    admin_fbo_val = (admin_fbo["fbo_id"] or "").strip() or "910900367506"
    new_fbo = f"E2E{ts % 900000000 + 100000000}"
    # Ensure FBO unique
    while db.execute("SELECT 1 FROM users WHERE fbo_id=?", (new_fbo,)).fetchone():
        new_fbo = f"E2E{int(time.time() * 1000) % 900000000 + 100000000}"

    db.execute(
        """INSERT INTO users (username, password, role, fbo_id, upline_name, upline_username,
           phone, email, status, training_required, training_status)
           VALUES (?, ?, 'team', ?, ?, ?, '', ?, 'approved', 0, 'not_required')""",
        (
            team_user,
            generate_password_hash(team_password, method="pbkdf2:sha256"),
            new_fbo,
            ADMIN_USER,
            ADMIN_USER,
            f"{team_user}@e2e.local",
        ),
    )
    db.execute(
        "INSERT INTO app_settings (key, value) VALUES ('tracking_start_date', '') "
        "ON CONFLICT(key) DO UPDATE SET value=''"
    )
    db.commit()
    db.close()

    print(f"Admin login user: {ADMIN_USER}")
    print(f"Created team user: {team_user} (password: {team_password})")

    c = app.test_client()

    _login(c, ADMIN_USER, ADMIN_PASSWORD)
    tok = _csrf(c)

    # Wallet credit (₹500)
    r_w = c.post(
        f"/admin/members/{team_user}/wallet-adjust",
        data={
            "amount": "500",
            "note": f"{tag} E2E wallet credit",
            "csrf_token": tok,
        },
        follow_redirects=True,
    )
    print(f"Wallet adjust: HTTP {r_w.status_code}")

    # 5 pool leads
    for i in range(5):
        tok = _csrf(c)
        phone = f"{tag}-P{i}"
        r_p = c.post(
            "/admin/lead-pool/add-single",
            data={
                "name": f"{tag} Pool {i}",
                "phone": phone,
                "email": "",
                "price": str(int(pool_price)),
                "source": "PROD_E2E",
                "csrf_token": tok,
            },
            follow_redirects=True,
        )
        print(f"Pool add {i}: HTTP {r_p.status_code}")

    _login(c, team_user, team_password)
    tok = _csrf(c)
    r_claim = c.post(
        "/lead-pool/claim",
        data={"count": str(claim_n), "csrf_token": tok},
        follow_redirects=False,
    )
    print(f"Claim x{claim_n}: HTTP {r_claim.status_code} Location={r_claim.headers.get('Location')!r}")

    today = _today_ist().isoformat()
    db = get_db()
    rows = db.execute(
        """SELECT id, name, claimed_at, in_pool, assigned_to
           FROM leads WHERE assigned_to=? AND name LIKE ?
           ORDER BY id""",
        (team_user, f"{tag}%"),
    ).fetchall()
    claimed_today = db.execute(
        """SELECT COUNT(*) FROM leads WHERE assigned_to=? AND in_pool=0 AND deleted_at=''
           AND claimed_at IS NOT NULL AND DATE(claimed_at)=?""",
        (team_user, today),
    ).fetchone()[0]
    my_progress_cnt = db.execute(
        """SELECT COUNT(*) FROM leads WHERE assigned_to=? AND in_pool=0 AND deleted_at=''
           AND claimed_at IS NOT NULL
           AND status NOT IN ('Lost','Converted','Fully Converted')""",
        (team_user,),
    ).fetchone()[0]
    my_progress_batch = db.execute(
        """SELECT COUNT(*) FROM leads WHERE assigned_to=? AND in_pool=0 AND deleted_at=''
           AND claimed_at IS NOT NULL AND name LIKE ?
           AND status NOT IN ('Lost','Converted','Fully Converted')""",
        (team_user, f"{tag}%"),
    ).fetchone()[0]
    db.close()

    print("\n--- DB: claimed rows (this batch names) ---")
    for r in rows:
        print(dict(r))

    print(f"\n--- DB: COUNT claimed today (IST date {today}) for {team_user}: {claimed_today}")
    print(f"--- DB: my_progress_leads equivalent count (all): {my_progress_cnt}")
    print(f"--- DB: my_progress count (this batch names only): {my_progress_batch}")

    r_dash = c.get("/dashboard")
    html = r_dash.get_data(as_text=True)
    m = re.search(
        r"My Leads Progress</span>\s*<span class=\"badge[^\"]*\"[^>]*>\s*(\d+)\s*</span>",
        html,
    )
    badge = int(m.group(1)) if m else None
    print(f"\n--- UI: GET /dashboard HTTP {r_dash.status_code} ---")
    print(f"Parsed 'My Leads Progress' badge count: {badge}")

    ok_ts = all(
        r["claimed_at"] and str(r["claimed_at"]).strip() not in ("", "None")
        for r in rows
        if r["in_pool"] == 0
    )
    claimed_rows = [r for r in rows if r["in_pool"] == 0]
    ok_match = (
        badge == my_progress_batch == my_progress_cnt == claim_n and len(claimed_rows) == claim_n
    )

    print("\n========== RESULT ==========")
    print(f"claimed_at timestamps present on claimed rows: {'OK' if ok_ts else 'FAIL'}")
    print(
        f"Dashboard badge ({badge}) == SQL my_progress count ({my_progress_cnt}) "
        f"and {claim_n} leads claimed: {'OK' if ok_match else 'FAIL'}"
    )
    return 0 if ok_ts and ok_match else 1


if __name__ == "__main__":
    raise SystemExit(main())
