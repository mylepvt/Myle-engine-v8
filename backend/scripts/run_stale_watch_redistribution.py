#!/usr/bin/env python3
"""Auto-cycle completed-watch stale leads into the top XP team pool.

Run from ``backend/`` with ``DATABASE_URL`` set.

Example::

    cd backend && python scripts/run_stale_watch_redistribution.py
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")
load_dotenv(BACKEND.parent / ".env")

from app.db.session import AsyncSessionLocal
from app.services.execution_enforcement import stale_redistribute


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Redistribute completed-watch stale leads.")
    parser.add_argument("--stale-hours", type=int, default=48, help="Stale threshold in hours.")
    parser.add_argument("--top-n", type=int, default=10, help="Top XP team pool size.")
    parser.add_argument("--limit", type=int, default=500, help="Maximum stale leads to process per cycle.")
    return parser


async def _run(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal() as session:
        result = await stale_redistribute(
            session,
            stale_hours=args.stale_hours,
            top_n=args.top_n,
            limit=args.limit,
        )
    print(
        "stale_watch_redistribution:",
        f"assigned={result.assigned}",
        f"skipped={result.skipped}",
        f"worker_pool_size={result.worker_pool_size}",
        f"source_bucket={result.source_bucket}",
        f"max_active_per_worker={result.max_active_per_worker}",
    )


if __name__ == "__main__":
    asyncio.run(_run(_build_parser().parse_args()))
