from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db
from app.core.pipeline_rules import validate_vl2_status_transition_for_role
from app.core.realtime_hub import notify_topics
from app.models.lead import Lead
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.schemas.call_events import CallEventCreate, CallEventListResponse, CallEventPublic
from app.schemas.leads import (
    LeadCreate,
    LeadDetailPublic,
    LeadListResponse,
    LeadPublic,
    LeadTransitionRequest,
    LeadTransitionResponse,
    LeadUpdate,
)
from app.services.lead_scope import user_can_access_lead, user_can_mutate_lead
from app.services.leads_contracts import LeadsRepositoryContract, TopicNotifierContract
from app.validators.leads_validator import lead_list_conditions, parse_status_query, validate_list_flags


def _sync_batch_completion_timestamps(lead: Lead, now: datetime) -> None:
    if lead.d1_morning and lead.d1_afternoon and lead.d1_evening:
        if lead.day1_completed_at is None:
            lead.day1_completed_at = now
    else:
        lead.day1_completed_at = None
    if lead.d2_morning and lead.d2_afternoon and lead.d2_evening:
        if lead.day2_completed_at is None:
            lead.day2_completed_at = now
    else:
        lead.day2_completed_at = None


class LeadsService:
    def __init__(
        self,
        *,
        repository: LeadsRepositoryContract,
        session: AsyncSession,
        notifier: TopicNotifierContract,
    ) -> None:
        self._repository = repository
        self._session = session
        self._notifier = notifier

    async def _get_lead_or_404(self, lead_id: int) -> Lead:
        lead = await self._repository.get_lead(lead_id)
        if lead is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        return lead

    async def list_leads(
        self,
        *,
        user: AuthUser,
        limit: int,
        offset: int,
        q: Optional[str],
        status: Optional[str],
        archived_only: bool,
        deleted_only: bool,
    ) -> LeadListResponse:
        validate_list_flags(archived_only=archived_only, deleted_only=deleted_only, user=user)
        condition = lead_list_conditions(
            user,
            q=q,
            status_filter=parse_status_query(status),
            archived_only=archived_only,
            deleted_only=deleted_only,
        )
        total = await self._repository.count_leads(condition)
        rows = await self._repository.list_leads(condition=condition, limit=limit, offset=offset)
        return LeadListResponse(
            items=[LeadPublic.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create_lead(self, *, body: LeadCreate, user: AuthUser) -> Lead:
        lead = await self._repository.create_lead(body, user.user_id)
        await self._repository.add_lead_activity(
            user_id=user.user_id,
            action="lead.created",
            lead_id=lead.id,
            meta={"name": lead.name, "status": lead.status},
        )
        lead = await self._repository.persist_lead(lead)
        await self._notifier("leads")
        return lead

    async def claim_lead(self, *, lead_id: int, user: AuthUser) -> Lead:
        lead = await self._repository.get_lead_for_update(lead_id)
        if lead is None or lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not lead.in_pool or lead.archived_at is not None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Lead is not available in the pool",
            )
        price = lead.pool_price_cents or 0
        if price > 0:
            balance = await self._repository.wallet_balance_cents(user.user_id)
            if balance < price:
                raise HTTPException(
                    status_code=http_status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Insufficient wallet balance. Need ₹{price / 100:.0f}, have ₹{balance / 100:.0f}.",
                )
            await self._repository.add_wallet_debit_for_claim(
                user_id=user.user_id,
                lead_id=lead_id,
                lead_name=lead.name,
                price_cents=price,
            )
        await self._repository.mark_lead_claimed(lead, user.user_id)
        await self._repository.add_lead_activity(
            user_id=user.user_id,
            action="lead.claimed",
            lead_id=lead_id,
            meta={"price_cents": price},
        )
        lead = await self._repository.persist_lead(lead)
        await self._notifier("leads", "wallet")
        return lead

    async def update_lead(self, *, lead_id: int, body: LeadUpdate, user: AuthUser) -> Lead:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None and body.restored is not True:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Lead is deleted — restore from recycle bin first (admin only)",
            )
        if body.restored is True:
            if user.role != "admin":
                raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
            if lead.deleted_at is None:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Lead is not deleted")
            lead.deleted_at = None
            lead = await self._repository.persist_lead(lead)
            await self._notifier("leads")
            return lead
        if not await user_can_mutate_lead(self._session, user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if user.role == "team":
            if body.day1_completed is not None:
                raise HTTPException(
                    status_code=http_status.HTTP_403_FORBIDDEN,
                    detail="Team cannot update Day 1 completion",
                )
            if any(x is not None for x in (body.d1_morning, body.d1_afternoon, body.d1_evening)):
                raise HTTPException(
                    status_code=http_status.HTTP_403_FORBIDDEN,
                    detail="Team cannot update Day 1 batches",
                )
        if body.in_pool is not None:
            if user.role != "admin":
                raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
            if lead.deleted_at is not None:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change pool state of a deleted lead",
                )
            if body.in_pool is True and lead.archived_at is not None:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Unarchive before adding to pool",
                )
            lead.in_pool = body.in_pool
        if body.pool_price_cents is not None:
            if user.role != "admin":
                raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
            lead.pool_price_cents = body.pool_price_cents if body.pool_price_cents > 0 else None
        if body.name is not None:
            lead.name = body.name.strip()
        if body.status is not None:
            ok, msg = validate_vl2_status_transition_for_role(
                current_slug=lead.status,
                target_slug=body.status,
                role=user.role,
            )
            if not ok:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg)
            lead.status = body.status
        if body.archived is True:
            lead.archived_at = datetime.now(timezone.utc)
            lead.in_pool = False
        elif body.archived is False:
            lead.archived_at = None
        if body.phone is not None:
            lead.phone = body.phone
        if body.email is not None:
            lead.email = body.email
        if body.city is not None:
            lead.city = body.city
        if body.source is not None:
            lead.source = body.source
        if body.notes is not None:
            lead.notes = body.notes
        if body.call_status is not None:
            lead.call_status = body.call_status
        if body.whatsapp_sent is True:
            lead.whatsapp_sent_at = datetime.now(timezone.utc)
        elif body.whatsapp_sent is False:
            lead.whatsapp_sent_at = None
        if body.payment_status is not None:
            lead.payment_status = body.payment_status
        now = datetime.now(timezone.utc)
        if body.no_response_attempt_count is not None:
            lead.no_response_attempt_count = body.no_response_attempt_count
        explicit_d1 = (body.d1_morning, body.d1_afternoon, body.d1_evening)
        if any(x is not None for x in explicit_d1):
            if body.d1_morning is not None:
                lead.d1_morning = body.d1_morning
            if body.d1_afternoon is not None:
                lead.d1_afternoon = body.d1_afternoon
            if body.d1_evening is not None:
                lead.d1_evening = body.d1_evening
        elif body.day1_completed is True:
            lead.d1_morning = True
            lead.d1_afternoon = True
            lead.d1_evening = True
        elif body.day1_completed is False:
            lead.d1_morning = False
            lead.d1_afternoon = False
            lead.d1_evening = False
        explicit_d2 = (body.d2_morning, body.d2_afternoon, body.d2_evening)
        if any(x is not None for x in explicit_d2):
            if body.d2_morning is not None:
                lead.d2_morning = body.d2_morning
            if body.d2_afternoon is not None:
                lead.d2_afternoon = body.d2_afternoon
            if body.d2_evening is not None:
                lead.d2_evening = body.d2_evening
        elif body.day2_completed is True:
            lead.d2_morning = True
            lead.d2_afternoon = True
            lead.d2_evening = True
        elif body.day2_completed is False:
            lead.d2_morning = False
            lead.d2_afternoon = False
            lead.d2_evening = False
        if body.day3_completed is True:
            lead.day3_completed_at = now
        elif body.day3_completed is False:
            lead.day3_completed_at = None
        _sync_batch_completion_timestamps(lead, now)
        lead = await self._repository.persist_lead(lead)
        await self._notifier("leads")
        return lead

    async def delete_lead(self, *, lead_id: int, user: AuthUser) -> None:
        lead = await self._get_lead_or_404(lead_id)
        if not await user_can_mutate_lead(self._session, user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        await self._repository.soft_delete_lead(lead)
        await self._notifier("leads")

    async def get_lead_detail(self, *, lead_id: int, user: AuthUser) -> LeadDetailPublic:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await user_can_access_lead(self._session, user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return LeadDetailPublic.model_validate(lead)

    async def log_call(self, *, lead_id: int, body: CallEventCreate, user: AuthUser) -> CallEventPublic:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await user_can_mutate_lead(self._session, user, lead) and lead.assigned_to_user_id != user.user_id:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        event = await self._repository.create_call_event(lead_id=lead_id, user_id=user.user_id, body=body)
        now = event.called_at
        lead.call_count = (lead.call_count or 0) + 1
        lead.last_called_at = now
        lead.call_status = {
            "answered": "called",
            "no_answer": "not_called",
            "busy": "not_called",
            "callback_requested": "callback_requested",
            "wrong_number": "not_called",
        }.get(body.outcome, "called")
        await self._repository.add_call_activity(
            user_id=user.user_id,
            event_id=event.id,
            lead_id=lead_id,
            outcome=body.outcome,
            duration_seconds=body.duration_seconds,
        )
        await self._repository.commit()
        await self._notifier("leads")
        return CallEventPublic.model_validate(event)

    async def list_calls(
        self,
        *,
        lead_id: int,
        user: AuthUser,
        limit: int,
        offset: int,
    ) -> CallEventListResponse:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await user_can_access_lead(self._session, user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        total = await self._repository.count_calls(lead_id)
        rows = await self._repository.list_calls(lead_id=lead_id, limit=limit, offset=offset)
        return CallEventListResponse(items=[CallEventPublic.model_validate(r) for r in rows], total=total)

    async def get_available_transitions(self, *, lead_id: int, user: AuthUser) -> list[str]:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await user_can_access_lead(self._session, user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        from app.core.lead_status import LEAD_STATUS_SEQUENCE, TEAM_FORBIDDEN_STATUS_SLUGS

        available: list[str] = []
        for status in LEAD_STATUS_SEQUENCE:
            if user.role == "team" and status in TEAM_FORBIDDEN_STATUS_SLUGS:
                continue
            is_valid, _ = validate_vl2_status_transition_for_role(
                current_slug=lead.status,
                target_slug=status,
                role=user.role,
            )
            if is_valid:
                available.append(status)
        return available

    async def transition_lead_status(
        self,
        *,
        lead_id: int,
        body: LeadTransitionRequest,
        user: AuthUser,
    ) -> LeadTransitionResponse:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await user_can_mutate_lead(self._session, user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        ok, msg = validate_vl2_status_transition_for_role(
            current_slug=lead.status,
            target_slug=body.target_status,
            role=user.role,
        )
        if not ok:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg)
        lead.status = body.target_status
        lead = await self._repository.persist_lead(lead)
        await self._notifier("leads")
        return LeadTransitionResponse(
            success=True,
            message="Status updated successfully",
            new_status=lead.status,
        )


def get_leads_service(session: AsyncSession = Depends(get_db)) -> LeadsService:
    return LeadsService(
        repository=SqlAlchemyLeadsRepository(session),
        session=session,
        notifier=notify_topics,
    )
