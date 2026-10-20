"""Leads given free (waived) to a member by an admin — a new joiner's starter leads, or an
off-the-record deal. They leave the pool like a claim but cost the member nothing, and
``Lead.waived_reason`` says why, so Myle Ledger books them apart (Myle Bridge event
``lead.claimed`` with amount 0 and the reason)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.crm_outbox import enqueue_lead_shadow_upsert

REASONS = ("New joiner", "Off-record deal", "Other")
MAX_COUNT = 50


async def give_free_leads(
    session: AsyncSession, *, admin_id: int, member_id: int, count: int, reason: str, note: str | None = None
) -> list[Lead]:
    if reason not in REASONS:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Pick a reason")
    member = await session.get(User, member_id)
    if member is None or member.role not in ("leader", "team"):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Member not found")
    label = reason if reason != "Other" or not (note or "").strip() else f"Other: {note.strip()}"
    label = label[:64]

    leads = list(
        (
            await session.execute(
                select(Lead)
                .where(
                    and_(
                        Lead.in_pool.is_(True),
                        Lead.pool_type == "paid",
                        Lead.deleted_at.is_(None),
                        Lead.archived_at.is_(None),
                    )
                )
                .order_by(Lead.created_at.asc(), Lead.id.asc())
                .limit(max(1, min(int(count), MAX_COUNT)))
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    if not leads:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="No leads available in the pool")

    now = datetime.now(timezone.utc)
    for lead in leads:
        lead.waived_reason = label
        # Same hand-over as a claim (LeadsRepository.mark_lead_claimed), with no wallet debit.
        lead.created_by_user_id = member.id
        lead.owner_user_id = member.id
        lead.assigned_to_user_id = member.id
        lead.in_pool = False
        lead.last_action_at = now
        await session.flush()
        enqueue_lead_shadow_upsert(session, lead)

    session.add(
        ActivityLog(
            user_id=admin_id,
            action="lead.waived",
            entity_type="user",
            entity_id=member.id,
            meta={"count": len(leads), "reason": label, "lead_ids": [l.id for l in leads]},
        )
    )
    await session.commit()
    return leads
