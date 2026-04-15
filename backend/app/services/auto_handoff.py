from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import event, inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.services.ctcs_heat import bump_heat_on_entering_contacted

_TERMINAL_STATUSES = {"lost", "converted", "inactive"}
_FOLLOW_UP_COMPLETION_KEY = "auto_handoff_followup_completed"


class AutoHandoffService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def on_lead_created(self, *, lead: Lead, actor_user_id: int) -> None:
        if lead.assigned_to_user_id is None:
            lead.assigned_to_user_id = lead.created_by_user_id
        await self._ensure_open_follow_up(
            lead_id=lead.id,
            created_by_user_id=lead.assigned_to_user_id or actor_user_id,
            note="Auto handoff: first contact follow-up",
            due_hours=24,
        )
        self._session.add(
            ActivityLog(
                user_id=actor_user_id,
                action="auto_handoff.lead_created",
                entity_type="lead",
                entity_id=lead.id,
                meta={"assigned_to_user_id": lead.assigned_to_user_id},
            )
        )

    async def on_call_logged(self, *, lead: Lead, outcome: str, actor_user_id: int) -> None:
        prev_status = lead.status
        if lead.status in {"new_lead", "new"}:
            lead.status = "contacted"
        bump_heat_on_entering_contacted(lead, prev_status)
        if lead.assigned_to_user_id is None:
            lead.assigned_to_user_id = lead.created_by_user_id or actor_user_id
        if outcome in {"no_answer", "busy", "callback_requested"} and lead.status not in _TERMINAL_STATUSES:
            await self._ensure_open_follow_up(
                lead_id=lead.id,
                created_by_user_id=lead.assigned_to_user_id or actor_user_id,
                note="Auto handoff: callback follow-up",
                due_hours=24,
            )
        self._session.add(
            ActivityLog(
                user_id=actor_user_id,
                action="auto_handoff.call_logged",
                entity_type="lead",
                entity_id=lead.id,
                meta={"outcome": outcome, "status": lead.status},
            )
        )

    async def on_payment_approved(self, *, lead: Lead, actor_user_id: int) -> None:
        if lead.assigned_to_user_id is None:
            lead.assigned_to_user_id = lead.created_by_user_id or actor_user_id
        await self._ensure_open_follow_up(
            lead_id=lead.id,
            created_by_user_id=lead.assigned_to_user_id or actor_user_id,
            note="Auto handoff: onboarding follow-up after payment approval",
            due_hours=24,
        )
        self._session.add(
            ActivityLog(
                user_id=actor_user_id,
                action="auto_handoff.payment_approved",
                entity_type="lead",
                entity_id=lead.id,
                meta={"payment_status": lead.payment_status, "status": lead.status},
            )
        )

    async def _ensure_open_follow_up(
        self,
        *,
        lead_id: int,
        created_by_user_id: int,
        note: str,
        due_hours: int,
    ) -> None:
        existing = await self._session.execute(
            select(FollowUp.id).where(FollowUp.lead_id == lead_id, FollowUp.completed_at.is_(None)).limit(1)
        )
        if existing.scalar_one_or_none() is not None:
            return
        self._session.add(
            FollowUp(
                lead_id=lead_id,
                note=note,
                due_at=datetime.now(timezone.utc) + timedelta(hours=due_hours),
                created_by_user_id=created_by_user_id,
            )
        )


def _apply_follow_up_completion_handoff(session: Session, follow_up: FollowUp) -> None:
    lead = session.get(Lead, follow_up.lead_id)
    if lead is None:
        return

    prev_status = lead.status
    if lead.status in {"new_lead", "new"}:
        lead.status = "contacted"
    bump_heat_on_entering_contacted(lead, prev_status)
    if lead.assigned_to_user_id is None:
        lead.assigned_to_user_id = lead.created_by_user_id

    if lead.status not in _TERMINAL_STATUSES:
        existing = session.execute(
            select(FollowUp.id).where(FollowUp.lead_id == lead.id, FollowUp.completed_at.is_(None)).limit(1)
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                FollowUp(
                    lead_id=lead.id,
                    note="Auto handoff: next follow-up",
                    due_at=datetime.now(timezone.utc) + timedelta(hours=24),
                    created_by_user_id=lead.assigned_to_user_id or lead.created_by_user_id,
                )
            )

    session.add(
        ActivityLog(
            user_id=lead.assigned_to_user_id or lead.created_by_user_id,
            action="auto_handoff.follow_up_completed",
            entity_type="lead",
            entity_id=lead.id,
            meta={"follow_up_id": follow_up.id},
        )
    )


@event.listens_for(Session, "before_flush")
def _auto_handoff_followup_completed(session: Session, _flush_context: Any, _instances: Any) -> None:
    seen = session.info.setdefault(_FOLLOW_UP_COMPLETION_KEY, set())
    for obj in session.dirty:
        if not isinstance(obj, FollowUp):
            continue
        hist = sa_inspect(obj).attrs.completed_at.history
        old = hist.deleted[0] if hist.deleted else None
        new = hist.added[0] if hist.added else obj.completed_at
        if old is None and new is not None and obj.id not in seen:
            _apply_follow_up_completion_handoff(session, obj)
            seen.add(obj.id)
