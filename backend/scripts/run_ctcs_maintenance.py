#!/usr/bin/env python3
"""CTCS cron: decay heat scores. Run from ``backend/`` with ``DATABASE_URL`` set.

Example::

    cd backend && python scripts/run_ctcs_maintenance.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")
load_dotenv(BACKEND.parent / ".env")

from app.db.session import AsyncSessionLocal
from app.services.ctcs_maintenance import decay_lead_heat_scores


async def main() -> None:
    async with AsyncSessionLocal() as session:
        n = await decay_lead_heat_scores(session)
    print(f"ctcs_maintenance: decay applied to {n} lead(s)")


if __name__ == "__main__":
    asyncio.run(main())
