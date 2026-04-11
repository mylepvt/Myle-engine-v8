#!/usr/bin/env python3
"""
Headed Chrome — slow steps taaki aap saath-saath dekh saken.

Pehle app chalao (e.g. PORT=5005):
  DATABASE_PATH=/tmp/myle_live.db BOOTSTRAP_ADMIN_PASSWORD='...' PORT=5005 python3 app.py

Phir:
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:5005 \\
  PLAYWRIGHT_USERNAME=admin PLAYWRIGHT_PASSWORD='...' \\
  python3 scripts/live_chrome_watch.py

Optional: PLAYWRIGHT_PAUSE=1 — browser band karne se pehle Enter.
"""
from __future__ import annotations

import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:5005").rstrip("/")
USER = os.environ.get("PLAYWRIGHT_USERNAME", "admin").strip()
PASSWORD = os.environ.get("PLAYWRIGHT_PASSWORD", "").strip()
SLOW_MS = int(os.environ.get("PLAYWRIGHT_SLOW_MO", "450"))
PAUSE = os.environ.get("PLAYWRIGHT_PAUSE", "").lower() in ("1", "true", "yes")


def _launch(p):
    try:
        return p.chromium.launch(channel="chrome", headless=False, slow_mo=SLOW_MS)
    except Exception:
        return p.chromium.launch(headless=False, slow_mo=SLOW_MS)


def run() -> int:
    if not PASSWORD:
        print("PLAYWRIGHT_PASSWORD (or set BOOTSTRAP same as app) zaroori hai.", file=sys.stderr)
        return 2

    with sync_playwright() as p:
        browser = _launch(p)
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            print(f"→ Login: {BASE}/login", flush=True)
            page.goto(f"{BASE}/login", wait_until="domcontentloaded")

            page.locator("input[name='username']").fill(USER)
            page.locator("input[name='password']").fill(PASSWORD)
            page.locator("form[method='post'] button[type='submit']").first.click()
            page.wait_for_load_state("networkidle")

            if "/login" in page.url:
                print("Login fail — /login par hi atke.", file=sys.stderr)
                return 1

            print("→ Admin dashboard", flush=True)
            page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
            page.wait_for_timeout(800)

            print("→ Decision engine (read-only)", flush=True)
            page.goto(f"{BASE}/admin/decision-engine", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)

            # Console errors (red) — quick check
            logs = []
            page.on("console", lambda m: logs.append((m.type, m.text)))

            print("→ Leads (admin view)", flush=True)
            page.goto(f"{BASE}/leads", wait_until="domcontentloaded")
            page.wait_for_timeout(1000)

            errs = [t for typ, t in logs if typ == "error"]
            if errs:
                print("Browser console errors:", *errs[:5], sep="\n  ", file=sys.stderr)

            print("Done — Chrome me flow dekh liya.", flush=True)
            if PAUSE:
                input("Enter dabao band karne ke liye...")
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
