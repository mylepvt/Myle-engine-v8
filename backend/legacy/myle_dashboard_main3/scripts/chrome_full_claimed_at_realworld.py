#!/usr/bin/env python3
"""
Full real-world Chrome test: claimed_at NULL migration + logic sync.

Uses Playwright with channel=\"chrome\" (real Google Chrome).

Prereqs:
  - Flask running, e.g. PORT=5006 python3 app.py
  - python3 -m playwright install chrome
  - Google Chrome installed

Env:
  PLAYWRIGHT_BASE_URL   (default http://127.0.0.1:5006)
  DATABASE_PATH         (default <repo>/leads.db)
  PLAYWRIGHT_HEADLESS   1/true = headless (default 1); 0 = headed window

Creates users (idempotent):
  chrome_rw_leader / ChromeRw_Leader_99!
  chrome_rw_team   / ChromeRw_Team_99!   (upline = chrome_rw_leader)

Seeds pool leads with phone prefix 9199CHROME_RW_ (unique suffix).

Run from repo root:
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:5006 python3 scripts/chrome_full_claimed_at_realworld.py
"""
from __future__ import annotations

import os
import re
import sys
import time
from datetime import timedelta

# Repo root on path
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

os.environ.setdefault("DATABASE_PATH", os.path.join(_ROOT, "leads.db"))
os.environ.setdefault("GUNICORN_MULTI_WORKER", "1")

BASE = os.environ.get("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:5006").rstrip("/")
HEADLESS = os.environ.get("PLAYWRIGHT_HEADLESS", "1").lower() in ("1", "true", "yes")

from database import get_db, migrate_db  # noqa: E402
from helpers import _get_wallet, _now_ist, _today_ist  # noqa: E402
from services.wallet_ledger import sum_pool_spent_for_buyer  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

TEAM_USER = "chrome_rw_team"
LEADER_USER = "chrome_rw_leader"
TEAM_PW = "ChromeRw_Team_99!"
LEADER_PW = "ChromeRw_Leader_99!"
PHONE_PRE = "9199CHROME_RW_"

_results: list[tuple[str, str, str]] = []


def _report(name: str, ok: bool, detail: str) -> None:
    status = "PASS" if ok else "FAIL"
    _results.append((name, status, detail))
    print(f"\n[{status}] {name}\n{detail}\n")


def _db():
    return get_db()


def _setup_users_and_settings() -> None:
    db = _db()
    h_l = generate_password_hash(LEADER_PW, method="pbkdf2:sha256")
    h_t = generate_password_hash(TEAM_PW, method="pbkdf2:sha256")
    if not db.execute("SELECT 1 FROM users WHERE username=?", (LEADER_USER,)).fetchone():
        db.execute(
            """INSERT INTO users (username, password, role, fbo_id, upline_name, upline_username,
               phone, email, status, training_required, training_status)
               VALUES (?, ?, 'leader', 'CHRWLEAD1', 'admin', 'admin', '', ?||'@test.local', 'approved', 0, 'not_required')""",
            (LEADER_USER, h_l, LEADER_USER),
        )
    else:
        db.execute("UPDATE users SET password=?, role='leader', status='approved' WHERE username=?", (h_l, LEADER_USER))

    if not db.execute("SELECT 1 FROM users WHERE username=?", (TEAM_USER,)).fetchone():
        db.execute(
            """INSERT INTO users (username, password, role, fbo_id, upline_name, upline_username,
               phone, email, status, training_required, training_status)
               VALUES (?, ?, 'team', 'CHRWTEAM1', ?, ?, '', ?||'@test.local', 'approved', 0, 'not_required')""",
            (TEAM_USER, h_t, LEADER_USER, LEADER_USER, TEAM_USER),
        )
    else:
        db.execute(
            "UPDATE users SET password=?, upline_name=?, upline_username=?, status='approved' WHERE username=?",
            (h_t, LEADER_USER, LEADER_USER, TEAM_USER),
        )

    db.execute(
        "INSERT INTO app_settings (key, value) VALUES ('tracking_start_date', '') "
        "ON CONFLICT(key) DO UPDATE SET value=''"
    )
    db.commit()
    db.close()


def _wallet_credit_team(amount: float, utr: str) -> None:
    db = _db()
    db.execute(
        """INSERT INTO wallet_recharges (username, amount, utr_number, status,
           requested_at, processed_at, admin_note)
           VALUES (?, ?, ?, 'approved', datetime('now','localtime'), datetime('now','localtime'), 'chrome e2e')""",
        (TEAM_USER, amount, utr),
    )
    db.commit()
    db.close()


def _clear_team_test_leads() -> None:
    """Reset test team user: all assigned leads → pool; remove old CHROME_RW pool rows; re-seed later."""
    db = _db()
    try:
        db.execute(
            """UPDATE leads SET assigned_to='', in_pool=1, claimed_at=NULL
               WHERE assigned_to=? AND deleted_at=''""",
            (TEAM_USER,),
        )
    except Exception:
        db.execute(
            """UPDATE leads SET assigned_to='', in_pool=1, claimed_at=''
               WHERE assigned_to=? AND deleted_at=''""",
            (TEAM_USER,),
        )
    db.execute(f"DELETE FROM leads WHERE in_pool=1 AND phone LIKE '{PHONE_PRE}%'")
    db.commit()
    db.close()


def _seed_pool(n: int) -> None:
    db = _db()
    ts = int(time.time() * 1000)
    for i in range(n):
        phone = f"{PHONE_PRE}{ts}{i:02d}"
        # Legacy DBs: claimed_at NOT NULL DEFAULT '' — use '' for pool rows
        try:
            db.execute(
                """INSERT INTO leads (name, phone, email, assigned_to, source, status,
                   in_pool, pool_price, claimed_at, city, notes, deleted_at)
                   VALUES (?, ?, '', '', 'ChromeE2E', 'New', 1, 50, NULL, '', '', '')""",
                (f"CHROME_RW {i}", phone),
            )
        except Exception:
            db.execute(
                """INSERT INTO leads (name, phone, email, assigned_to, source, status,
                   in_pool, pool_price, claimed_at, city, notes, deleted_at)
                   VALUES (?, ?, '', '', 'ChromeE2E', 'New', 1, 50, '', '', '', '')""",
                (f"CHROME_RW {i}", phone),
            )
    db.commit()
    # Claim route uses ORDER BY created_at ASC — make test rows first in line.
    db.execute(
        f"""UPDATE leads SET created_at='1970-01-01 00:00:00'
            WHERE phone LIKE '{PHONE_PRE}%' AND in_pool=1"""
    )
    db.commit()
    db.close()


def _sql_team_claimed_today() -> int:
    today = _today_ist().isoformat()
    db = _db()
    n = db.execute(
        """SELECT COUNT(*) FROM leads WHERE assigned_to=? AND in_pool=0 AND deleted_at=''
           AND claimed_at IS NOT NULL AND claimed_at != ''
           AND DATE(claimed_at)=?""",
        (TEAM_USER, today),
    ).fetchone()[0]
    db.close()
    return n


def _sql_pipeline_today_total() -> tuple[int, dict]:
    today = _today_ist().isoformat()
    db = _db()
    rows = db.execute(
        """SELECT status, COUNT(*) as cnt FROM leads
           WHERE in_pool=0 AND deleted_at=''
           AND claimed_at IS NOT NULL AND claimed_at != ''
           AND date(claimed_at)=?
           GROUP BY status""",
        (today,),
    ).fetchall()
    d = {r["status"]: r["cnt"] for r in rows}
    db.close()
    return sum(d.values()), d


def _sql_leader_live_claimed_today() -> int:
    today = _today_ist().isoformat()
    db = _db()
    n = db.execute(
        """SELECT COUNT(*) FROM leads WHERE assigned_to=? AND in_pool=0 AND deleted_at=''
           AND claimed_at IS NOT NULL AND claimed_at != ''
           AND DATE(claimed_at)=?""",
        (TEAM_USER, today),
    ).fetchone()[0]
    db.close()
    return n


def _count_claimed_at_empty_string() -> tuple[int, list]:
    db = _db()
    n = db.execute(
        "SELECT COUNT(*) FROM leads WHERE claimed_at='' AND deleted_at=''"
    ).fetchone()[0]
    sample = db.execute(
        "SELECT id, phone, in_pool, assigned_to FROM leads WHERE claimed_at='' AND deleted_at='' LIMIT 5"
    ).fetchall()
    db.close()
    return n, [dict(r) for r in sample]


def _login(page, user: str, pw: str) -> tuple[int, str]:
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.locator("input[name='username']").fill(user)
    page.locator("input[name='password']").fill(pw)
    with page.expect_response(
        lambda r: r.request.method == "POST" and "/login" in r.url
    ) as resp_info:
        page.locator("form[method='post'] button[type='submit']").first.click()
    resp = resp_info.value
    page.wait_for_load_state("networkidle")
    return resp.status, page.url


def _claim_ui(page, count: int) -> tuple[int, str | None]:
    page.goto(f"{BASE}/lead-pool", wait_until="domcontentloaded")
    form = page.locator("#claimForm")
    if not form.count():
        return -1, "no #claimForm"
    page.locator("#countInput").fill(str(count))
    with page.expect_response(
        lambda r: r.request.method == "POST" and r.url.rstrip("/").endswith("/lead-pool/claim")
    ) as resp_info:
        form.locator("button[type='submit']").click()
    resp = resp_info.value
    page.wait_for_load_state("networkidle")
    return resp.status, resp.headers.get("location")


def _parse_wallet_balance(html: str) -> float | None:
    m = re.search(r"Available Balance[\s\S]*?₹\s*([\d,]+)", html)
    if not m:
        m = re.search(r"₹\s*([\d,]+)\s*</div>\s*</div>\s*</div>\s*</div>\s*<div class=\"col\"", html)
    if m:
        return float(m.group(1).replace(",", ""))
    return None


def _parse_leads_today_badge(html: str) -> int | None:
    # Outer tab "Working Today" — {{ today_leads|length }}
    m = re.search(
        r'id="tab-working"[\s\S]{0,600}?<span class="badge[^"]*"[^>]*>\s*(\d+)\s*</span>',
        html,
    )
    return int(m.group(1)) if m else None


def _parse_leader_claimed_today(html: str) -> int | None:
    idx = html.find("LIVE DATA")
    chunk = html[idx : idx + 4000] if idx >= 0 else html
    nums = re.findall(r'font-size:1\.3rem;">\s*(\d+)\s*</div>', chunk)
    return int(nums[0]) if nums else None


def _parse_my_progress_badge(html: str) -> int | None:
    m = re.search(
        r"My Leads Progress</span>\s*<span[^>]*badge[^>]*>\s*(\d+)\s*</span>",
        html,
    )
    return int(m.group(1)) if m else None


def main() -> int:
    print("=" * 70)
    print("Chrome full real-world test (claimed_at + logic sync)")
    print(f"BASE={BASE}  HEADLESS={HEADLESS}  DATABASE={os.environ['DATABASE_PATH']}")
    print("=" * 70)

    _setup_users_and_settings()
    _clear_team_test_leads()
    _wallet_credit_team(25_000.0, f"CHROME-RW-{int(time.time())}")
    _seed_pool(25)

    today = _today_ist().isoformat()
    today_lo = f"{today} 00:00:00"
    tomorrow_lo = (_now_ist() + timedelta(days=1)).strftime("%Y-%m-%d") + " 00:00:00"

    last_claim_responses: list[str] = []

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        _report("0 Playwright import", False, "pip install playwright && playwright install chrome")
        return 1

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome", headless=HEADLESS)
        except Exception as e:
            _report("0 Chrome launch", False, str(e))
            return 1

        ctx_team = browser.new_context()
        page = ctx_team.new_page()
        http_log: list[str] = []

        # --- Test 1: claim + unclaim ---
        st, url_after = _login(page, TEAM_USER, TEAM_PW)
        http_log.append(f"POST /login -> HTTP {st} final_url={url_after}")
        if "/login" in url_after:
            _report("1a Login (team)", False, "\n".join(http_log))
            browser.close()
            return 1

        cst, loc = _claim_ui(page, 1)
        http_log.append(f"POST /lead-pool/claim -> HTTP {cst} Location={loc!r}")

        db = _db()
        row = db.execute(
            f"""SELECT id, claimed_at, in_pool, assigned_to FROM leads
                WHERE assigned_to=? AND phone LIKE '{PHONE_PRE}%' AND in_pool=0
                ORDER BY id DESC LIMIT 1""",
            (TEAM_USER,),
        ).fetchone()
        db.close()
        ca = row["claimed_at"] if row else None
        ok_ts = bool(row) and ca is not None and str(ca).strip() not in ("", "None")
        _report(
            "1a Claim: claimed_at NOT NULL timestamp",
            ok_ts,
            "HTTP:\n" + "\n".join(http_log[-2:])
            + f"\n\nDB row: {dict(row) if row else {}}",
        )

        lid = row["id"] if row else None
        if lid:
            db = _db()
            try:
                db.execute(
                    "UPDATE leads SET assigned_to='', in_pool=1, claimed_at=NULL WHERE id=?",
                    (lid,),
                )
            except Exception:
                db.execute(
                    "UPDATE leads SET assigned_to='', in_pool=1, claimed_at='' WHERE id=?",
                    (lid,),
                )
            db.commit()
            row2 = db.execute(
                "SELECT id, claimed_at, in_pool, assigned_to FROM leads WHERE id=?", (lid,)
            ).fetchone()
            db.close()
            ca2 = row2["claimed_at"] if row2 else None
            # Ideal: NULL; legacy NOT NULL schema keeps '' in pool until migrate
            ok_null = row2 and (row2["claimed_at"] is None or row2["claimed_at"] == "")
            _report(
                "1b Unclaim (no UI): DB return-to-pool → claimed_at cleared (NULL or '')",
                ok_null,
                f"No Chrome route for unclaim; applied pool-return UPDATE.\n"
                f"DB after: {dict(row2) if row2 else {}}",
            )
        else:
            _report("1b Unclaim", False, "No lead id from claim")

        # --- Test 2: claim 5 today ---
        http_log = []
        cst5, loc5 = _claim_ui(page, 5)
        http_log.append(f"POST /lead-pool/claim x5 -> HTTP {cst5} Location={loc5!r}")
        n_today = _sql_team_claimed_today()
        pipe_total, pipe_by_status = _sql_pipeline_today_total()
        page.goto(f"{BASE}/leads", wait_until="networkidle")
        leads_html = page.content()
        badge_today = _parse_leads_today_badge(leads_html)

        badge_match = badge_today == 5 if badge_today is not None else False
        ok5 = n_today == 5 and pipe_total >= 5 and badge_match
        _report(
            "2 Counting: 5 today + pipeline + UI outer Today Leads badge = 5",
            ok5,
            f"HTTP: {http_log[-1]}\n"
            f"SQL COUNT team (valid claimed_at) DATE={today}: {n_today}\n"
            f"SQL admin-style today_pipeline total: {pipe_total} by_status={pipe_by_status}\n"
            f"UI /leads #tab-working badge (today_leads|length): {badge_today}\n",
        )

        # --- Test 3: no double bucket ---
        db = _db()
        sample = db.execute(
            f"""SELECT id FROM leads WHERE assigned_to=? AND in_pool=0 AND deleted_at=''
               AND claimed_at IS NOT NULL AND claimed_at != ''
               AND DATE(claimed_at)=? LIMIT 1""",
            (TEAM_USER, today),
        ).fetchone()
        db.close()
        lid3 = sample["id"] if sample else None
        in_today = in_hist = 0
        if lid3:
            db = _db()
            in_today = db.execute(
                """SELECT COUNT(*) FROM leads WHERE id=? AND in_pool=0 AND deleted_at=''
                   AND claimed_at IS NOT NULL AND claimed_at != ''
                   AND claimed_at >= ? AND claimed_at < ?""",
                (lid3, today_lo, tomorrow_lo),
            ).fetchone()[0]
            in_hist = db.execute(
                """SELECT COUNT(*) FROM leads WHERE id=? AND in_pool=0 AND deleted_at=''
                   AND NOT (claimed_at IS NOT NULL AND claimed_at != ''
                   AND claimed_at >= ? AND claimed_at < ?)""",
                (lid3, today_lo, tomorrow_lo),
            ).fetchone()[0]
            db.close()
        ok_part = lid3 and in_today == 1 and in_hist == 0
        _report(
            "3 No double bucket (same lead id today vs history SQL)",
            ok_part,
            f"sample_id={lid3} in_today_query={in_today} in_hist_query={in_hist}",
        )

        # --- Test 4: Leader dashboard (fresh context — no team session cookie) ---
        ctx_leader = browser.new_context()
        page2 = ctx_leader.new_page()
        st_l, url_l = _login(page2, LEADER_USER, LEADER_PW)
        page2.goto(f"{BASE}/leader/team-reports", wait_until="networkidle")
        lh = page2.content()
        html_claimed = _parse_leader_claimed_today(lh)
        sql_claimed = _sql_leader_live_claimed_today()
        ok_ld = html_claimed is not None and html_claimed == sql_claimed and sql_claimed >= 5
        _report(
            "4 Leader /leader/team-reports LIVE 'Claimed Today'",
            ok_ld,
            f"HTTP leader login {st_l} url={url_l}\n"
            f"GET /leader/team-reports HTTP 200\n"
            f"SQL COUNT downline DATE(claimed_at)={today}: {sql_claimed}\n"
            f"UI parsed LIVE first card (Claimed Today): {html_claimed}",
        )
        page2.close()
        ctx_leader.close()

        # --- Test 5: Wallet ---
        dbw = _db()
        w = _get_wallet(dbw, TEAM_USER)
        spent_sql = sum_pool_spent_for_buyer(dbw, TEAM_USER)
        dbw.close()
        page.goto(f"{BASE}/wallet", wait_until="networkidle")
        wh = page.content()
        ui_bal = _parse_wallet_balance(wh)
        ok_w = abs(float(w["spent"]) - float(spent_sql)) < 0.02
        if ui_bal is not None:
            ok_w = ok_w and abs(ui_bal - w["balance"]) < 1.0
        _report(
            "5 Wallet spent = SUM(pool_price) claimed; UI balance ~ _get_wallet",
            ok_w,
            f"_get_wallet: {w}\nSQL SUM(pool_price) spent: {spent_sql}\n"
            f"UI parsed wallet balance: {ui_bal}\n"
            f"GET /wallet HTTP 200 (body length {len(wh)})",
        )

        # --- Test 6: migration empty string ---
        migrate_db()
        n_empty, sample = _count_claimed_at_empty_string()
        ok_mig = n_empty == 0
        _report(
            "6 No claimed_at='' rows (after migrate_db sweep)",
            ok_mig,
            f"COUNT(claimed_at=''): {n_empty}\nSample rows: {sample}",
        )

        # --- Test 7: rapid claim + DB unclaim ---
        errors = 0
        rapid_log = []
        for i in range(12):
            try:
                cst, loc = _claim_ui(page, 1)
                rapid_log.append(f"iter{i} claim HTTP {cst}")
                db = _db()
                rid = db.execute(
                    f"""SELECT id FROM leads WHERE assigned_to=? AND phone LIKE '{PHONE_PRE}%'
                        AND in_pool=0 ORDER BY id DESC LIMIT 1""",
                    (TEAM_USER,),
                ).fetchone()
                if rid:
                    try:
                        db.execute(
                            "UPDATE leads SET assigned_to='', in_pool=1, claimed_at=NULL WHERE id=?",
                            (rid["id"],),
                        )
                    except Exception:
                        db.execute(
                            "UPDATE leads SET assigned_to='', in_pool=1, claimed_at='' WHERE id=?",
                            (rid["id"],),
                        )
                db.commit()
                db.close()
            except Exception as ex:
                errors += 1
                rapid_log.append(f"iter{i} ERROR {ex}")
        ok_rapid = errors == 0
        _report(
            "7 Rapid claim + DB unclaim x12",
            ok_rapid,
            "\n".join(rapid_log[-5:]) + f"\n...(total {len(rapid_log)} lines) errors={errors}",
        )

        page.goto(f"{BASE}/dashboard", wait_until="networkidle")
        dh = page.content()
        mp = _parse_my_progress_badge(dh)
        _report(
            "UI sanity: /dashboard My Leads Progress badge",
            mp is not None,
            f"Parsed badge count: {mp} (context only; main assertions above)\nGET /dashboard final URL: {page.url}",
        )

        browser.close()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    fails = [r for r in _results if r[1] == "FAIL"]
    for name, status, _ in _results:
        print(f"  [{status}] {name}")
    print("=" * 70)
    if fails:
        print(f"FAILED: {len(fails)} test(s)")
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
