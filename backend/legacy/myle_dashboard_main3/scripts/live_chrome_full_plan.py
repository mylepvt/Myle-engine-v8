#!/usr/bin/env python3
"""
LIVE TEST PLAN — Chrome (headed) — UI + claim + dashboard + AI + admin.
Pehle Flask chalao (alag terminal), phir:

  DATABASE_PATH=/tmp/myle_live_full.db BOOTSTRAP_ADMIN_PASSWORD='...' PORT=5011 python3 app.py

  PLAYWRIGHT_BASE_URL=http://127.0.0.1:5011 \\
  PLAYWRIGHT_ADMIN_PASSWORD='...' \\
  python3 scripts/live_chrome_full_plan.py

Team user + pool + wallet is auto-seeded into DATABASE_PATH (same DB as server).

Optional: PLAYWRIGHT_PAUSE=1 — end par Enter.
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

TEAM_USER = os.environ.get("LIVE_PLAN_TEAM_USER", "liveteam")
TEAM_PASS = os.environ.get("LIVE_PLAN_TEAM_PASSWORD", "LivePlan99!")
ADMIN_PASS = os.environ.get("PLAYWRIGHT_ADMIN_PASSWORD", os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")).strip()
BASE = os.environ.get("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:5011").rstrip("/")
SLOW_MS = int(os.environ.get("PLAYWRIGHT_SLOW_MO", "400"))
PAUSE = os.environ.get("PLAYWRIGHT_PAUSE", "").lower() in ("1", "true", "yes")
DB_PATH = os.environ.get("DATABASE_PATH", "/tmp/myle_live_full.db")
os.environ["DATABASE_PATH"] = DB_PATH


def _seed_data() -> None:
    from werkzeug.security import generate_password_hash

    from database import get_db, init_db, migrate_db, seed_users

    init_db()
    migrate_db()
    seed_users()

    db = get_db()
    ph_team = generate_password_hash(TEAM_PASS, method="pbkdf2:sha256")
    row = db.execute("SELECT id FROM users WHERE username=?", (TEAM_USER,)).fetchone()
    if not row:
        db.execute(
            """INSERT INTO users (username, password, role, status)
               VALUES (?, ?, 'team', 'approved')""",
            (TEAM_USER, ph_team),
        )
    else:
        db.execute(
            "UPDATE users SET password=?, role='team', status='approved' WHERE username=?",
            (ph_team, TEAM_USER),
        )

    db.execute(
        "INSERT INTO app_settings (key, value) VALUES ('daily_call_target', '0') "
        "ON CONFLICT(key) DO UPDATE SET value='0'"
    )
    db.execute(
        "INSERT INTO app_settings (key, value) VALUES ('tracking_start_date', '') "
        "ON CONFLICT(key) DO UPDATE SET value=''"
    )

    db.execute("DELETE FROM leads WHERE phone LIKE 'LIVETEST-LIVE-%'")
    batch = int(time.time()) % 1_000_000
    for i in range(5):
        phone = f"LIVETEST-LIVE-{batch}-{i:04d}"
        db.execute(
            """INSERT INTO leads (name, phone, email, assigned_to, source, status,
               in_pool, pool_price, claimed_at, city, notes)
               VALUES (?, ?, '', '', 'LiveTest', 'New Lead', 1, 50.0, NULL, '', '')""",
            (f"Live Pool {i}", phone),
        )

    db.execute("DELETE FROM wallet_recharges WHERE username=? AND utr_number LIKE 'LIVEPLAN-%'", (TEAM_USER,))
    db.execute(
        """INSERT INTO wallet_recharges (username, amount, utr_number, status,
           requested_at, processed_at) VALUES (?, 5000, ?, 'approved',
           datetime('now','localtime'), datetime('now','localtime'))""",
        (TEAM_USER, "LIVEPLAN-CREDIT"),
    )
    db.commit()
    db.close()
    print(f"[seed] DB={DB_PATH} team={TEAM_USER} / pool=5 / wallet +5000", flush=True)


def _launch(p):
    try:
        return p.chromium.launch(channel="chrome", headless=False, slow_mo=SLOW_MS)
    except Exception:
        return p.chromium.launch(headless=False, slow_mo=SLOW_MS)


def _login(page, user: str, password: str) -> bool:
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.locator("input[name='username']").fill(user)
    page.locator("input[name='password']").fill(password)
    page.locator("form[method='post'] button[type='submit']").first.click()
    page.wait_for_load_state("networkidle")
    return "/login" not in page.url


def run() -> int:
    if not ADMIN_PASS:
        print("Set PLAYWRIGHT_ADMIN_PASSWORD or BOOTSTRAP_ADMIN_PASSWORD (admin).", file=sys.stderr)
        return 2

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("pip install playwright && python3 -m playwright install chrome", file=sys.stderr)
        return 2

    _seed_data()

    console_errors: list[str] = []

    def _on_console(msg):
        if msg.type == "error":
            console_errors.append(msg.text)

    print("\n========== LIVE TEST (Chrome khulega) ==========", flush=True)
    print(f"URL:     {BASE}", flush=True)
    print(f"Admin:   admin / {ADMIN_PASS[:3]}***", flush=True)
    print(f"Team:    {TEAM_USER} / {TEAM_PASS}", flush=True)
    print("================================================\n", flush=True)

    with sync_playwright() as p:
        browser = _launch(p)
        try:
            # ── Desktop — Part 1 + team flows ─────────────────
            page = browser.new_page(viewport={"width": 1360, "height": 820})
            page.on("console", _on_console)

            print("PART 1 / B / C / F — Team login → Dashboard (AI) → Claim → Leads", flush=True)
            if not _login(page, TEAM_USER, TEAM_PASS):
                print("Team login fail.", file=sys.stderr)
                return 1

            page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            page.wait_for_timeout(900)
            body = page.inner_text("body")
            if "Coach" in body or "AI coach" in body or "next_action" in body.lower():
                print("  ✓ AI coach section visible", flush=True)
            else:
                print("  ? AI coach text not found (check dashboard template)", flush=True)

            page.goto(f"{BASE}/lead-pool", wait_until="domcontentloaded")
            page.wait_for_timeout(600)
            if page.locator("#claimForm").count() == 0:
                print("  ✗ No claim form — pool/wallet?", file=sys.stderr)
            else:
                page.locator("#countInput").fill("2")
                page.locator("#claimForm button[type='submit']").click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(800)
                print("  ✓ Claim submitted (2 leads)", flush=True)

            page.goto(f"{BASE}/leads", wait_until="domcontentloaded")
            page.wait_for_timeout(700)
            edit = page.locator('a[href*="/edit"]').first
            if edit.count():
                edit.click()
                page.wait_for_load_state("domcontentloaded")
                fu = page.locator("input[name='follow_up_date']")
                if fu.count():
                    fu.fill("2099-12-31")
                    page.wait_for_timeout(500)
                    print("  ✓ Follow-up date field (Test E)", flush=True)
                page.go_back()
                page.wait_for_timeout(400)

            # Call status dropdown if present
            sel = page.locator("select.call-status-select").first
            if sel.count():
                opts = page.locator("select.call-status-select option")
                if opts.count() > 1:
                    sel.select_option(index=1)
                    page.wait_for_timeout(1200)
                    print("  ✓ Call status change (Test B)", flush=True)

            print("PART 1 — Admin", flush=True)
            page.goto(f"{BASE}/logout", wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            if not _login(page, "admin", ADMIN_PASS):
                print("Admin login fail.", file=sys.stderr)
                return 1
            page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
            page.wait_for_timeout(800)
            page.goto(f"{BASE}/admin/decision-engine", wait_until="domcontentloaded")
            page.wait_for_timeout(1000)
            print("  ✓ Admin + Decision engine", flush=True)

            # ── Mobile viewport (Tests A, G-ish) ───────────────
            print("PART 2 — Mobile viewport (390×844)", flush=True)
            page.set_viewport_size({"width": 390, "height": 844})
            page.goto(f"{BASE}/logout", wait_until="domcontentloaded")
            page.wait_for_timeout(400)
            _login(page, TEAM_USER, TEAM_PASS)
            page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            page.wait_for_timeout(700)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(500)
            page.goto(f"{BASE}/lead-pool", wait_until="domcontentloaded")
            page.wait_for_timeout(600)
            print("  ✓ Mobile scroll + pool page", flush=True)

            # Console
            if console_errors:
                print("\nBrowser console (errors):", flush=True)
                for e in console_errors[:12]:
                    print("  ", e, flush=True)
            else:
                print("\n✓ No JS console errors captured", flush=True)

            print("\nDone — aapne Chrome me poora flow dekh liya.", flush=True)
            if PAUSE:
                input("Enter = band...")
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
