#!/usr/bin/env python3
"""Auto-cycle completed-watch leads through archive and stale reassignment.

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
from app.services.execution_enforcement import run_completed_watch_pipeline_maintenance


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Archive and redistribute completed-watch leads.")
    parser.add_argument("--archive-after-hours", type=int, default=24, help="Hours after watch completion before auto-archiving.")
    parser.add_argument("--stale-hours", type=int, default=24, help="Hours to wait inside archived before reassignment.")
    parser.add_argument("--top-n", type=int, default=10, help="Top XP team pool size.")
    parser.add_argument("--limit", type=int, default=500, help="Maximum stale leads to process per cycle.")
    return parser


async def _run(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal() as session:
        result = await run_completed_watch_pipeline_maintenance(
            session,
            archive_after_hours=args.archive_after_hours,
            stale_hours=args.stale_hours,
            top_n=args.top_n,
            limit=args.limit,
            auto_reassign=True,
        )
    print(
        "watch_pipeline_maintenance:",
        f"auto_archived={result['auto_archived']}",
        f"reassigned={result['reassigned']}",
        f"skipped={result['skipped']}",
    )


if __name__ == "__main__":
    asyncio.run(_run(_build_parser().parse_args()))
