from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import BackgroundTasks, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db
from app.core.config import settings
from app.core.pipeline_rules import validate_vl2_status_transition_for_role
from app.core.realtime_hub import notify_topics
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.models.wallet_ledger import WalletLedgerEntry
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.schemas.call_events import CallEventCreate, CallEventListResponse, CallEventPublic
from app.schemas.leads import (
    LeadCreate,
    LeadCtcsActionRequest,
    LeadDetailPublic,
    LeadListResponse,
    MindsetLockCompleteResponse,
    MindsetLockPreviewResponse,
    LeadPublic,
    LeadTransitionRequest,
    LeadTransitionResponse,
    LeadUpdate,
)
from app.services.leads_contracts import LeadsRepositoryContract, TopicNotifierContract
from app.services.auto_handoff import AutoHandoffService
from app.services.invoice_records import create_tax_invoice_for_pool_claim
from app.services.ctcs_heat import bump_heat_on_entering_contacted, clamp_ctcs_heat
from app.services.ctcs_status_chain import advance_lead_status_toward
from app.services.whatsapp_ctcs import send_interested_enrollment_assets
from app.validators.leads_validator import lead_list_conditions, parse_status_query, validate_list_flags


async def _deliver_ctcs_interested_whatsapp(lead_id: int, phone: str | None) -> None:
    await send_interested_enrollment_assets(lead_id=lead_id, phone=phone)


def _display_name_for_user(row: tuple[int, str | None, str | None, str]) -> str:
    _, name, username, email = row
    if name and name.strip():
        return name.strip()
    if username and username.strip():
        return username.strip()
    local = (email or "").split("@", 1)[0].strip()
    return local or "Assigned"


def _display_name_from_fields(name: str | None, username: str | None, email: str | None) -> str:
    if name and name.strip():
        return name.strip()
    if username and username.strip():
        return username.strip()
    local = (email or "").split("@", 1)[0].strip()
    return local or "Leader"


def _ctcs_filter_clause(ctcs_filter: Optional[str]) -> Any:
    if ctcs_filter is None:
        return None
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    key = ctcs_filter.strip().lower()
    if key in ("", "all"):
        return None
    if key == "today":
        return Lead.created_at >= day_start
    if key in ("followups", "follow_ups"):
        return Lead.next_followup_at.is_not(None)
    if key == "hot":
        return Lead.heat_score >= settings.ctcs_heat_hot_threshold
    if key == "converted":
        return Lead.status.in_(
            ("converted", "seat_hold", "paid", "day1", "day2", "interview", "track_selected"),
        )
    raise HTTPException(
        status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="Invalid ctcs_filter (use: all|today|followups|hot|converted)",
    )


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
        notifier: TopicNotifierContract,
        session: AsyncSession,
    ) -> None:
        self._repository = repository
        self._notifier = notifier
        self._session = session

    async def _get_lead_or_404(self, lead_id: int) -> Lead:
        lead = await self._repository.get_lead(lead_id)
        if lead is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        return lead

    async def _nearest_leader(self, start_user_id: int) -> tuple[int, str] | None:
        current = int(start_user_id)
        seen: set[int] = set()
        while current not in seen:
            seen.add(current)
            row = (
                await self._session.execute(
                    select(User.upline_user_id).where(User.id == current).limit(1)
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            parent_id = int(row)
            parent = (
                await self._session.execute(
                    select(User.id, User.role, User.upline_user_id, User.name, User.username, User.email)
                    .where(User.id == parent_id)
                    .limit(1)
                )
            ).one_or_none()
            if parent is None:
                return None
            pid, role, _, name, username, email = parent
            role_key = (role or "").strip().lower()
            if role_key == "leader":
                return int(pid), _display_name_from_fields(name, username, email)
            if role_key == "admin":
                return None
            current = int(pid)
        return None

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
        ctcs_filter: Optional[str] = None,
        ctcs_priority_sort: bool = False,
        pre_enrollment_only: bool = False,
    ) -> LeadListResponse:
        validate_list_flags(archived_only=archived_only, deleted_only=deleted_only, user=user)
        condition = lead_list_conditions(
            user,
            q=q,
            status_filter=parse_status_query(status),
            archived_only=archived_only,
            deleted_only=deleted_only,
        )
        extra = _ctcs_filter_clause(ctcs_filter)
        if extra is not None:
            condition = and_(condition, extra) if condition is not None else extra
        if pre_enrollment_only:
            pre_enroll = Lead.status.in_(
                ["new_lead", "contacted", "invited", "video_sent", "video_watched"]
            )
            condition = and_(condition, pre_enroll) if condition is not None else pre_enroll
        total = await self._repository.count_leads(condition)
        rows = await self._repository.list_leads(
            condition=condition,
            limit=limit,
            offset=offset,
            ctcs_priority_sort=ctcs_priority_sort,
            now_utc=datetime.now(timezone.utc),
        )
        assigned_ids = {
            int(r.assigned_to_user_id)
            for r in rows
            if getattr(r, "assigned_to_user_id", None) is not None
        }
        assigned_name_by_id: dict[int, str] = {}
        if assigned_ids:
            assigned_rows = (
                await self._session.execute(
                    select(User.id, User.name, User.username, User.email).where(User.id.in_(assigned_ids))
                )
            ).all()
            assigned_name_by_id = {int(uid): _display_name_for_user((uid, name, username, email)) for uid, name, username, email in assigned_rows}

        items: list[LeadPublic] = []
        for r in rows:
            item = LeadPublic.model_validate(r)
            uid = item.assigned_to_user_id
            item.assigned_to_name = assigned_name_by_id.get(uid) if uid is not None else None
            items.append(item)
        return LeadListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create_lead(self, *, body: LeadCreate, user: AuthUser) -> Lead:
        lead = await self._repository.create_lead(body, user.user_id)
        handoff = AutoHandoffService(self._session)
        await handoff.on_lead_created(lead=lead, actor_user_id=user.user_id)
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
        if user.role not in {"team", "leader"}:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
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
            await self._session.flush()
            idem_key = f"pool_claim_{lead_id}_{user.user_id}"
            entry_row = await self._session.execute(
                select(WalletLedgerEntry).where(WalletLedgerEntry.idempotency_key == idem_key)
            )
            entry = entry_row.scalar_one_or_none()
            if entry is not None:
                await create_tax_invoice_for_pool_claim(
                    self._session,
                    user_id=user.user_id,
                    total_cents=price,
                    wallet_ledger_entry_id=entry.id,
                    crm_claim_idempotency_key=None,
                    lead_index=1,
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

    async def preview_mindset_lock(self, *, lead_id: int, user: AuthUser) -> MindsetLockPreviewResponse:
        if user.role != "team":
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only team can preview mindset lock")
        lead = await self._get_lead_or_404(lead_id)
        if lead.assigned_to_user_id != user.user_id:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        started_at = lead.mindset_started_at
        if started_at is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Mindset session has not started for this lead",
            )
        leader = await self._nearest_leader(user.user_id)
        now = datetime.now(timezone.utc)
        elapsed_seconds = max(0, int((now - started_at).total_seconds()))
        remaining_seconds = max(0, 300 - elapsed_seconds)
        return MindsetLockPreviewResponse(
            eligible=remaining_seconds == 0,
            elapsed_seconds=elapsed_seconds,
            remaining_seconds=remaining_seconds,
            mindset_started_at=started_at,
            leader_user_id=leader[0] if leader else None,
            leader_name=leader[1] if leader else None,
        )

    async def complete_mindset_lock(
        self,
        *,
        lead_id: int,
        user: AuthUser,
    ) -> MindsetLockCompleteResponse:
        if user.role != "team":
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only team can complete mindset lock")
        lead = await self._repository.get_lead_for_update(lead_id)
        if lead is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if lead.mindset_lock_state == "leader_assigned" and lead.mindset_completed_at is not None and lead.mindset_started_at is not None:
            if lead.mindset_completed_by_user_id is not None and lead.mindset_completed_by_user_id != user.user_id:
                raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
            leader_id = int(lead.mindset_leader_user_id or lead.assigned_to_user_id or 0)
            if leader_id <= 0:
                raise HTTPException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    detail="Lead already handed off but leader reference is missing",
                )
            leader_name = "Leader"
            row = (
                await self._session.execute(
                    select(User.name, User.username, User.email)
                    .where(User.id == leader_id)
                    .limit(1)
                )
            ).one_or_none()
            if row is not None:
                leader_name = _display_name_from_fields(row[0], row[1], row[2])
            duration_seconds = max(0, int((lead.mindset_completed_at - lead.mindset_started_at).total_seconds()))
            return MindsetLockCompleteResponse(
                status="assigned",
                leader_name=leader_name,
                leader_user_id=leader_id,
                duration_seconds=duration_seconds,
                mindset_started_at=lead.mindset_started_at,
                mindset_completed_at=lead.mindset_completed_at,
            )
        if lead.assigned_to_user_id != user.user_id:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if lead.payment_status != "approved":
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Payment proof must be approved before leader handoff",
            )
        started_at = lead.mindset_started_at
        if started_at is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Mindset session has not started for this lead",
            )
        now = datetime.now(timezone.utc)
        duration_seconds = max(0, int((now - started_at).total_seconds()))
        if duration_seconds < 300:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Minimum 5 minutes required before sending to leader",
            )
        leader = await self._nearest_leader(user.user_id)
        if leader is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="No leader found in upline",
            )
        leader_id, leader_name = leader
        from_uid = lead.assigned_to_user_id
        lead.assigned_to_user_id = leader_id
        lead.last_action_at = now
        lead.mindset_completed_at = now
        lead.mindset_lock_state = "leader_assigned"
        lead.mindset_completed_by_user_id = user.user_id
        lead.mindset_leader_user_id = leader_id
        await self._repository.add_lead_activity(
            user_id=user.user_id,
            action="manual_handoff_triggered",
            lead_id=lead.id,
            meta={
                "from_user_id": from_uid,
                "to_user_id": leader_id,
                "team_user_id": user.user_id,
                "leader_id": leader_id,
                "mindset_started_at": started_at.isoformat(),
                "mindset_completed_at": now.isoformat(),
                "duration_seconds": duration_seconds,
            },
        )
        await self._repository.persist_lead(lead)
        await self._notifier("leads", "workboard")
        return MindsetLockCompleteResponse(
            status="assigned",
            leader_name=leader_name,
            leader_user_id=leader_id,
            duration_seconds=duration_seconds,
            mindset_started_at=started_at,
            mindset_completed_at=now,
        )

    async def update_lead(self, *, lead_id: int, body: LeadUpdate, user: AuthUser) -> Lead:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None and body.restored is not True:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Lead is deleted — restore from recycle bin first (admin only)",
            )
        if body.restored is True:
            if lead.deleted_at is None:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Lead is not deleted")
            if user.role != "admin" and lead.assigned_to_user_id != user.user_id:
                raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
            lead.deleted_at = None
            lead = await self._repository.persist_lead(lead)
            await self._notifier("leads")
            return lead
        if not await self._repository.can_mutate_lead(user, lead):
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
        if body.assigned_to_user_id is not None:
            if user.role not in ("admin", "leader"):
                raise HTTPException(
                    status_code=http_status.HTTP_403_FORBIDDEN,
                    detail="Only admin or leader can re-assign leads",
                )
            lead.assigned_to_user_id = body.assigned_to_user_id
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
            prev_status = lead.status
            lead.status = body.status
            bump_heat_on_entering_contacted(lead, prev_status)
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
        if body.next_followup_at is not None:
            lead.next_followup_at = body.next_followup_at
            lead.last_action_at = datetime.now(timezone.utc)
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
        if not await self._repository.can_mutate_lead(user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        await self._repository.soft_delete_lead(lead)
        await self._notifier("leads")

    async def permanent_delete_lead(self, *, lead_id: int, user: AuthUser) -> None:
        if user.role != "admin":
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Lead is not in recycle bin",
            )
        await self._repository.hard_delete_lead(lead_id)
        await self._notifier("leads")

    async def get_lead_detail(self, *, lead_id: int, user: AuthUser) -> LeadDetailPublic:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await self._repository.can_access_lead(user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return LeadDetailPublic.model_validate(lead)

    async def log_call(self, *, lead_id: int, body: CallEventCreate, user: AuthUser) -> CallEventPublic:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await self._repository.can_mutate_lead(user, lead) and lead.assigned_to_user_id != user.user_id:
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
        handoff = AutoHandoffService(self._session)
        await handoff.on_call_logged(lead=lead, outcome=body.outcome, actor_user_id=user.user_id)
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
        if not await self._repository.can_access_lead(user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        total = await self._repository.count_calls(lead_id)
        rows = await self._repository.list_calls(lead_id=lead_id, limit=limit, offset=offset)
        return CallEventListResponse(items=[CallEventPublic.model_validate(r) for r in rows], total=total)

    async def get_available_transitions(self, *, lead_id: int, user: AuthUser) -> list[str]:
        lead = await self._get_lead_or_404(lead_id)
        if lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await self._repository.can_access_lead(user, lead):
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
        if not await self._repository.can_mutate_lead(user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        ok, msg = validate_vl2_status_transition_for_role(
            current_slug=lead.status,
            target_slug=body.target_status,
            role=user.role,
        )
        if not ok:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg)
        prev_status = lead.status
        lead.status = body.target_status
        bump_heat_on_entering_contacted(lead, prev_status)
        lead = await self._repository.persist_lead(lead)

        # XP hooks — fire-and-forget; never block transition on XP errors
        try:
            from app.services.xp_service import grant_xp, revoke_won_xp
            if body.target_status == "contacted":
                await grant_xp(self._session, user.user_id, "lead_contacted", lead.id)
            elif body.target_status == "won":
                await grant_xp(self._session, user.user_id, "lead_won", lead.id)
            if prev_status == "won" and body.target_status != "won":
                await revoke_won_xp(self._session, user.user_id, lead.id)
            await self._session.commit()
        except Exception:
            pass

        await self._notifier("leads")
        return LeadTransitionResponse(
            success=True,
            message="Status updated successfully",
            new_status=lead.status,
        )

    async def apply_ctcs_action(
        self,
        *,
        lead_id: int,
        body: LeadCtcsActionRequest,
        user: AuthUser,
        background_tasks: BackgroundTasks | None = None,
    ) -> Lead:
        lead = await self._repository.get_lead_for_update(lead_id)
        if lead is None or lead.deleted_at is not None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if not await self._repository.can_mutate_lead(user, lead):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if lead.archived_at is not None:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Lead is archived")

        now = datetime.now(timezone.utc)
        action = body.action

        if action == "interested":
            advance_lead_status_toward(lead=lead, target_slug="video_sent", role=user.role)
            lead.heat_score = clamp_ctcs_heat(
                int(lead.heat_score or 0) + settings.ctcs_heat_interested_bonus,
            )
            lead.call_status = "video_sent"
            lead.whatsapp_sent_at = now
            if settings.ctcs_whatsapp_async and background_tasks is not None:
                background_tasks.add_task(_deliver_ctcs_interested_whatsapp, lead.id, lead.phone)
                wa_meta: dict[str, Any] = {"queued": True, "channel": "whatsapp"}
            else:
                wa_meta = await send_interested_enrollment_assets(lead_id=lead.id, phone=lead.phone)
            await self._repository.add_lead_activity(
                user_id=user.user_id,
                action="ctcs.interested",
                lead_id=lead.id,
                meta={"whatsapp": wa_meta},
            )
        elif action == "not_picked":
            advance_lead_status_toward(lead=lead, target_slug="contacted", role=user.role)
            lead.next_followup_at = now + timedelta(hours=2)
            lead.heat_score = clamp_ctcs_heat(
                int(lead.heat_score or 0) - settings.ctcs_heat_not_picked_penalty,
            )
            lead.call_status = "no_answer"
            self._session.add(
                FollowUp(
                    lead_id=lead.id,
                    note="CTCS: not picked — retry after 2h",
                    due_at=lead.next_followup_at,
                    created_by_user_id=user.user_id,
                ),
            )
        elif action == "call_later":
            advance_lead_status_toward(lead=lead, target_slug="contacted", role=user.role)
            if body.followup_at is not None:
                lead.next_followup_at = body.followup_at
            else:
                lead.next_followup_at = now + timedelta(hours=24)
            self._session.add(
                FollowUp(
                    lead_id=lead.id,
                    note="CTCS: call later",
                    due_at=lead.next_followup_at,
                    created_by_user_id=user.user_id,
                ),
            )
        elif action == "not_interested":
            advance_lead_status_toward(lead=lead, target_slug="lost", role=user.role)
            lead.heat_score = 0
            lead.archived_at = now
            lead.in_pool = False
        elif action == "paid":
            if user.role == "team":
                advance_lead_status_toward(lead=lead, target_slug="paid", role=user.role)
            else:
                advance_lead_status_toward(lead=lead, target_slug="day1", role=user.role)
            lead.payment_status = "approved"
            lead.heat_score = clamp_ctcs_heat(int(lead.heat_score or 0) + settings.ctcs_heat_paid_bonus)

        lead.last_action_at = now
        lead = await self._repository.persist_lead(lead)
        await self._notifier("leads")
        return lead

    async def log_call_attempt(
        self,
        *,
        lead_id: int,
        user: AuthUser,
    ) -> CallEventPublic:
        """Record a dial attempt (CTCS) — maps to ``no_answer`` call event."""
        return await self.log_call(
            lead_id=lead_id,
            body=CallEventCreate(outcome="no_answer"),
            user=user,
        )


def get_leads_service(session: AsyncSession = Depends(get_db)) -> LeadsService:
    return LeadsService(
        repository=SqlAlchemyLeadsRepository(session),
        notifier=notify_topics,
        session=session,
    )
