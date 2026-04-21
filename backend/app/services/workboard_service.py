from __future__ import annotations

from datetime import datetime, timedelta, timezone
from time import monotonic
from typing import Annotated

from fastapi import Depends
from sqlalchemy import and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db
from app.core.lead_status import WORKBOARD_COLUMNS
from app.models.lead import Lead
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.schemas.leads import LeadPublic
from app.schemas.workboard import (
    WorkboardActionCounts,
    WorkboardColumnOut,
    WorkboardLeadsResponse,
    WorkboardResponse,
    WorkboardStaleResponse,
    WorkboardSummaryResponse,
)
from app.services.lead_scope import lead_execution_visibility_where

_SUMMARY_CACHE_TTL_SECONDS = 10
_summary_cache: dict[tuple[int, str, int], tuple[float, WorkboardSummaryResponse]] = {}


def _stage_anchor_ts():
    return func.coalesce(Lead.last_action_at, Lead.created_at)


class WorkboardService:
    def __init__(self, repository: SqlAlchemyLeadsRepository) -> None:
        self._repository = repository

    def _active_scope(self, user: AuthUser):
        scope = and_(
            Lead.archived_at.is_(None),
            Lead.deleted_at.is_(None),
            Lead.in_pool.is_(False),
        )
        vis = lead_execution_visibility_where(user)
        if vis is not None:
            scope = and_(scope, vis)
        return scope

    async def get_leads(self, *, user: AuthUser, limit_per_column: int, max_rows: int) -> WorkboardLeadsResponse:
        scope = self._active_scope(user)
        totals = await self._repository.get_workboard_counts(condition=scope)
        rows = await self._repository.get_workboard_leads(condition=scope, limit=max_rows)
        buckets: dict[str, list[LeadPublic]] = {s: [] for s in WORKBOARD_COLUMNS}
        for lead in rows:
            status = lead.status
            if status not in buckets or len(buckets[status]) >= limit_per_column:
                continue
            buckets[status].append(LeadPublic.model_validate(lead))
        return WorkboardLeadsResponse(
            columns=[
                WorkboardColumnOut(status=status, total=totals.get(status, 0), items=buckets[status])
                for status in WORKBOARD_COLUMNS
            ],
            max_rows_fetched=max_rows,
        )

    async def get_stale(self, *, user: AuthUser, stale_hours: int, limit: int) -> WorkboardStaleResponse:
        scope = self._active_scope(user)
        stale_before = datetime.now(timezone.utc) - timedelta(hours=stale_hours)
        stale_rows = await self._repository.get_stale_leads(
            condition=scope,
            stale_before=stale_before,
            limit=limit,
        )
        stale_total = await self._repository.count_leads(
            and_(
                scope,
                _stage_anchor_ts() <= stale_before,
            )
        )
        return WorkboardStaleResponse(
            items=[LeadPublic.model_validate(row) for row in stale_rows],
            total=stale_total,
            stale_hours=stale_hours,
        )

    async def get_summary(
        self,
        *,
        user: AuthUser,
        stale_hours: int,
        use_cache: bool = True,
    ) -> WorkboardSummaryResponse:
        cache_key = (user.user_id, user.role, stale_hours)
        cached = _summary_cache.get(cache_key) if use_cache else None
        now = monotonic()
        if use_cache and cached is not None and now - cached[0] <= _SUMMARY_CACHE_TTL_SECONDS:
            return cached[1]

        scope = self._active_scope(user)
        # Legacy parity: leader workboard hides pending/video action counters (they execute via leads views).
        if user.role == "leader":
            pending_calls = 0
            videos_to_send = 0
        else:
            pending_calls = await self._repository.count_leads(
                and_(
                    scope,
                    or_(Lead.call_status.is_(None), Lead.call_status.in_(("not_called", "no_answer"))),
                )
            )
            videos_to_send = await self._repository.count_leads(
                and_(scope, Lead.status.in_(("new_lead", "new", "contacted", "invited", "whatsapp_sent")))
            )
        batches_due = await self._repository.count_leads(
            and_(
                scope,
                or_(
                    and_(
                        Lead.status == "day1",
                        or_(
                            Lead.d1_morning.is_(False),
                            Lead.d1_afternoon.is_(False),
                            Lead.d1_evening.is_(False),
                        ),
                    ),
                    and_(
                        Lead.status == "day2",
                        or_(
                            Lead.d2_morning.is_(False),
                            Lead.d2_afternoon.is_(False),
                            Lead.d2_evening.is_(False),
                        ),
                    ),
                ),
            )
        )
        closings_due = await self._repository.count_leads(
            and_(scope, Lead.status.in_(("day3", "interview", "track_selected", "seat_hold")))
        )
        stale_before = datetime.now(timezone.utc) - timedelta(hours=stale_hours)
        stale_total = await self._repository.count_leads(
            and_(
                scope,
                _stage_anchor_ts() <= stale_before,
            )
        )
        payload = WorkboardSummaryResponse(
            action_counts=WorkboardActionCounts(
                pending_calls=pending_calls,
                videos_to_send=videos_to_send,
                batches_due=batches_due,
                closings_due=closings_due,
            ),
            stale_total=stale_total,
        )
        if use_cache:
            _summary_cache[cache_key] = (now, payload)
        return payload

    async def get_legacy_workboard(
        self,
        *,
        user: AuthUser,
        limit_per_column: int,
        max_rows: int,
        stale_hours: int,
    ) -> WorkboardResponse:
        leads_payload = await self.get_leads(user=user, limit_per_column=limit_per_column, max_rows=max_rows)
        summary_payload = await self.get_summary(
            user=user,
            stale_hours=stale_hours,
            use_cache=False,
        )
        return WorkboardResponse(
            columns=leads_payload.columns,
            max_rows_fetched=leads_payload.max_rows_fetched,
            action_counts=summary_payload.action_counts,
        )


def get_workboard_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WorkboardService:
    return WorkboardService(repository=SqlAlchemyLeadsRepository(session))
