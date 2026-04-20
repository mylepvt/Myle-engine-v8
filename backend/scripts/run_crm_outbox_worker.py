#!/usr/bin/env python3
"""Reliable FastAPI -> CRM shadow outbox worker.

Run from ``backend/``:

    python scripts/run_crm_outbox_worker.py
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

load_dotenv(BACKEND / ".env")
load_dotenv(BACKEND.parent / ".env")

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.services.crm_outbox import process_crm_outbox_batch

logger = logging.getLogger("crm_outbox_worker")


async def _run_loop(*, once: bool) -> None:
    if not settings.crm_api_url:
        raise SystemExit("CRM_API_URL is required for the CRM outbox worker")
    if not settings.crm_internal_secret:
        raise SystemExit("CRM_INTERNAL_SECRET is required for the CRM outbox worker")

    timeout = httpx.Timeout(10.0)
    async with httpx.AsyncClient(base_url=settings.crm_api_url, timeout=timeout) as client:
        while True:
            async with AsyncSessionLocal() as session:
                stats = await process_crm_outbox_batch(
                    session,
                    client=client,
                )
            if stats["claimed"] > 0:
                logger.info("crm_outbox batch=%s", stats)
            if once:
                return
            if stats["claimed"] == 0:
                await asyncio.sleep(settings.crm_outbox_poll_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the CRM outbox worker")
    parser.add_argument("--once", action="store_true", help="Process at most one batch and exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(_run_loop(once=args.once))


if __name__ == "__main__":
    main()
