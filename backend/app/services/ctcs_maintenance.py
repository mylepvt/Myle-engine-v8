"""Periodic CTCS maintenance (heat decay). Run from cron / scripts."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.lead import Lead


async def decay_lead_heat_scores(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Subtract heat for leads not decayed in 24h. Returns rows updated (best-effort)."""
    utc = now or datetime.now(timezone.utc)
    decay_hours = int(settings.ctcs_heat_decay_interval_hours)
    decay_points = int(settings.ctcs_heat_decay_points)
    cutoff = utc - timedelta(hours=decay_hours)
    stmt = select(Lead).where(Lead.heat_score > 0).where(Lead.deleted_at.is_(None)).where(
        (Lead.heat_last_decayed_at.is_(None)) | (Lead.heat_last_decayed_at < cutoff),
    )
    rows = (await session.execute(stmt)).scalars().all()
    n = 0
    for lead in rows:
        lead.heat_score = max(0, int(lead.heat_score or 0) - decay_points)
        lead.heat_last_decayed_at = utc
        n += 1
    if n:
        await session.commit()
    return n
