#!/usr/bin/env python3
"""
Playwright — real Google Chrome (channel=\"chrome\"): login → lead pool → claim → dashboard.

Env:
  PLAYWRIGHT_BASE_URL   default http://127.0.0.1:5005  (change if your app uses another port)
  PLAYWRIGHT_USERNAME
  PLAYWRIGHT_PASSWORD

Optional:
  PLAYWRIGHT_CLAIM_COUNT  default 1
  PLAYWRIGHT_PAUSE        set to 1 to wait for Enter before closing (headed debug)

Requires: Google Chrome installed + `python3 -m playwright install chrome` (deps).
Run app first:  PORT=5005 python3 app.py
"""
from __future__ import annotations

import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:5005").rstrip("/")
USER = os.environ.get("PLAYWRIGHT_USERNAME", "").strip()
PASSWORD = os.environ.get("PLAYWRIGHT_PASSWORD", "").strip()
CLAIM_COUNT = max(1, min(50, int(os.environ.get("PLAYWRIGHT_CLAIM_COUNT", "1"))))
PAUSE = os.environ.get("PLAYWRIGHT_PAUSE", "").lower() in ("1", "true", "yes")


def run() -> int:
    if not USER or not PASSWORD:
        print(
            "Set PLAYWRIGHT_USERNAME and PLAYWRIGHT_PASSWORD.\n"
            "Example:\n"
            f"  PLAYWRIGHT_BASE_URL={BASE} \\\n"
            "  PLAYWRIGHT_USERNAME=teamuser PLAYWRIGHT_PASSWORD='secret' \\\n"
            "  python3 scripts/playwright_claim_flow.py",
            file=sys.stderr,
        )
        return 2

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=False)
        try:
            page = browser.new_page()

            page.goto(f"{BASE}/login", wait_until="domcontentloaded")
            page.locator("input[name='username']").fill(USER)
            page.locator("input[name='password']").fill(PASSWORD)
            page.locator("form[method='post'] button[type='submit']").first.click()
            page.wait_for_load_state("networkidle")

            if "/login" in page.url:
                print("Login may have failed — still on /login. Check credentials.", file=sys.stderr)
                return 1

            page.goto(f"{BASE}/lead-pool", wait_until="domcontentloaded")

            claim_form = page.locator("#claimForm")
            if not claim_form.count():
                print(
                    "No #claimForm — pool empty, wallet empty, or balance too low for 1 lead. "
                    "Check /lead-pool in browser.",
                    file=sys.stderr,
                )
                return 1

            page.locator("#countInput").fill(str(CLAIM_COUNT))
            # Hidden csrf_token stays in form; submit sends it.
            claim_form.locator("button[type='submit']").click()
            page.wait_for_load_state("networkidle")

            page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            print("Dashboard opened successfully")
            print(f"URL: {page.url}")

            if PAUSE:
                input("Press Enter to close...")
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
