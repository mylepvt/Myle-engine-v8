from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.wallet_ledger import WalletLedgerEntry
from app.schemas.call_events import CallEventCreate
from app.schemas.leads import LeadCreate
from app.services.lead_scope import user_can_access_lead, user_can_mutate_lead


class SqlAlchemyLeadsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def can_access_lead(self, user: AuthUser, lead: Lead) -> bool:
        return await user_can_access_lead(self._session, user, lead)

    async def can_mutate_lead(self, user: AuthUser, lead: Lead) -> bool:
        return await user_can_mutate_lead(self._session, user, lead)

    async def get_lead(self, lead_id: int) -> Lead | None:
        return await self._session.get(Lead, lead_id)

    async def get_lead_for_update(self, lead_id: int) -> Lead | None:
        stmt = select(Lead).where(Lead.id == lead_id).with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def count_leads(self, condition: Any) -> int:
        stmt = select(func.count()).select_from(Lead)
        if condition is not None:
            stmt = stmt.where(condition)
        return int((await self._session.execute(stmt)).scalar_one())

    async def list_leads(self, *, condition: Any, limit: int, offset: int) -> list[Lead]:
        stmt = select(Lead).order_by(Lead.created_at.desc()).limit(limit).offset(offset)
        if condition is not None:
            stmt = stmt.where(condition)
        return (await self._session.execute(stmt)).scalars().all()

    async def wallet_balance_cents(self, user_id: int) -> int:
        stmt = select(func.coalesce(func.sum(WalletLedgerEntry.amount_cents), 0)).where(
            WalletLedgerEntry.user_id == user_id
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def create_lead(self, body: LeadCreate, user_id: int) -> Lead:
        lead = Lead(
            name=body.name.strip(),
            status=body.status,
            created_by_user_id=user_id,
            assigned_to_user_id=user_id,
            phone=body.phone,
            email=body.email,
            city=body.city,
            source=body.source,
            notes=body.notes,
        )
        self._session.add(lead)
        await self._session.flush()
        return lead

    async def add_lead_activity(self, *, user_id: int, action: str, lead_id: int, meta: dict) -> None:
        self._session.add(
            ActivityLog(
                user_id=user_id,
                action=action,
                entity_type="lead",
                entity_id=lead_id,
                meta=meta,
            )
        )

    async def add_wallet_debit_for_claim(
        self,
        *,
        user_id: int,
        lead_id: int,
        lead_name: str,
        price_cents: int,
    ) -> None:
        self._session.add(
            WalletLedgerEntry(
                user_id=user_id,
                amount_cents=-price_cents,
                currency="INR",
                idempotency_key=f"pool_claim_{lead_id}_{user_id}",
                note=f"Lead pool claim — #{lead_id} {lead_name}",
                created_by_user_id=user_id,
            )
        )

    async def mark_lead_claimed(self, lead: Lead, user_id: int) -> None:
        lead.created_by_user_id = user_id
        lead.assigned_to_user_id = user_id
        lead.in_pool = False

    async def persist_lead(self, lead: Lead) -> Lead:
        await self._session.commit()
        await self._session.refresh(lead)
        return lead

    async def soft_delete_lead(self, lead: Lead) -> None:
        lead.deleted_at = datetime.now(timezone.utc)
        lead.in_pool = False
        await self._session.commit()

    async def create_call_event(self, *, lead_id: int, user_id: int, body: CallEventCreate) -> CallEvent:
        now = datetime.now(timezone.utc)
        event = CallEvent(
            lead_id=lead_id,
            user_id=user_id,
            outcome=body.outcome,
            duration_seconds=body.duration_seconds,
            notes=body.notes,
            called_at=now,
        )
        self._session.add(event)
        await self._session.flush()
        return event

    async def add_call_activity(
        self,
        *,
        user_id: int,
        event_id: int,
        lead_id: int,
        outcome: str,
        duration_seconds: int | None,
    ) -> None:
        self._session.add(
            ActivityLog(
                user_id=user_id,
                action="call.logged",
                entity_type="call_event",
                entity_id=event_id,
                meta={
                    "lead_id": lead_id,
                    "outcome": outcome,
                    "duration_seconds": duration_seconds,
                },
            )
        )

    async def count_calls(self, lead_id: int) -> int:
        stmt = select(func.count()).select_from(CallEvent).where(CallEvent.lead_id == lead_id)
        return int((await self._session.execute(stmt)).scalar_one())

    async def list_calls(self, *, lead_id: int, limit: int, offset: int) -> list[CallEvent]:
        stmt = (
            select(CallEvent)
            .where(CallEvent.lead_id == lead_id)
            .order_by(CallEvent.called_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return (await self._session.execute(stmt)).scalars().all()

    async def commit(self) -> None:
        await self._session.commit()
