#!/usr/bin/env python3
"""One-time (safe to repeat) Google Sheet backfill: current status of recent leads.

Run from ``backend/`` with CRM_SHEET_WEBHOOK_URL / CRM_SHEET_WEBHOOK_SECRET / DATABASE_URL set:

    python scripts/sheet_sync_backfill.py --dry-run     # count + show a sample, send nothing
    python scripts/sheet_sync_backfill.py               # last 30 days, batches of 200
    python scripts/sheet_sync_backfill.py --days 60
    python scripts/sheet_sync_backfill.py --retry-failed  # also re-queue live rows that gave up
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

load_dotenv(BACKEND / ".env")
load_dotenv(BACKEND.parent / ".env")

from app.services import sheet_sync  # noqa: E402


async def _run(*, days: int, dry_run: bool, retry_failed: bool) -> None:
    if not sheet_sync.enabled() and not dry_run:
        raise SystemExit("CRM_SHEET_WEBHOOK_URL is not set — nothing to send to")
    if retry_failed and not dry_run:
        print(f"Re-queued {await sheet_sync.requeue_failed()} failed live rows")
        await sheet_sync.deliver_pending(max_batches=100)
    stats = await sheet_sync.backfill(days=days, dry_run=dry_run)
    print(
        f"Leads in last {days} days: {stats['leads']} | sent: {stats['sent']} | "
        f"skipped (bad phone): {stats['skipped']} | failed batches: {stats['failed_batches']}"
        + ("  [DRY RUN — nothing sent]" if dry_run else "")
    )
    if stats["failed_batches"]:
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Send current lead statuses to the Google Sheet")
    parser.add_argument("--days", type=int, default=30, help="Leads created in the last N days (default 30)")
    parser.add_argument("--dry-run", action="store_true", help="Build the batches but do not send")
    parser.add_argument("--retry-failed", action="store_true", help="Re-send live rows that ran out of retries")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(_run(days=args.days, dry_run=args.dry_run, retry_failed=args.retry_failed))


if __name__ == "__main__":
    main()
