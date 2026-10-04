"""Record and read scheduled-notification runs, so the admin can see today's
9:00 plan / nudges / 17:00 target / 20:30 recap reach without opening Render."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import IST
from app.models.push_job_run import PushJobRun
from app.services.live_metrics import ist_day_bounds

logger = logging.getLogger(__name__)

# Job key → (label shown to the admin, scheduled time IST). Order = display order.
JOBS: dict[str, tuple[str, str]] = {
    "morning_plan": ("Daily plan", "9 AM"),
    "inactivity_nudge": ("Idle nudges", "11–4:30"),
    "call_target_reminder": ("Call target", "5 PM"),
    "evening_recap": ("Evening recap", "8:30 PM"),
    "tracking_report_reminder": ("Leader report", "9:30 PM"),
}


async def record_push_run(job: str, *, targeted: int, sent: int, error: str | None = None) -> None:
    """Save one run in its own session — never breaks the job that calls it."""
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            session.add(PushJobRun(job=job, targeted=targeted, sent=sent, error=(error or None) and error[:500]))
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not record push run %s: %s", job, exc)


async def todays_push_runs(session: AsyncSession, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    start, end = ist_day_bounds(now.astimezone(IST).date())
    runs = (
        await session.execute(
            select(PushJobRun).where(PushJobRun.ran_at >= start, PushJobRun.ran_at < end).order_by(PushJobRun.ran_at)
        )
    ).scalars().all()
    out = []
    for job, (label, when) in JOBS.items():
        mine = [r for r in runs if r.job == job]
        last = mine[-1] if mine else None
        out.append(
            {
                "job": job,
                "label": label,
                "scheduled": when,
                "ran": bool(mine),
                "runs": len(mine),
                "targeted": sum(r.targeted for r in mine),
                "sent": sum(r.sent for r in mine),
                "last_ran_at": last.ran_at.isoformat() if last else None,
                "error": next((r.error for r in reversed(mine) if r.error), None),
            }
        )
    return out
