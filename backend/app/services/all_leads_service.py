from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.schemas.leads import AllLeadsResponse, LeadPublic
from app.validators.leads_validator import lead_list_conditions, parse_status_query, validate_list_flags


class AllLeadsService:
    def __init__(self, repository: SqlAlchemyLeadsRepository) -> None:
        self._repository = repository

    async def get_all(
        self,
        *,
        user: AuthUser,
        limit: int,
        offset: int,
        q: Optional[str],
        status: Optional[str],
        archived_only: bool,
        deleted_only: bool,
    ) -> AllLeadsResponse:
        validate_list_flags(archived_only=archived_only, deleted_only=deleted_only, user=user)
        condition = lead_list_conditions(
            user,
            q=q,
            status_filter=parse_status_query(status),
            archived_only=archived_only,
            deleted_only=deleted_only,
        )
        now = datetime.now(timezone.utc)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        rows, total, today_total = await self._repository.list_all_leads_split(
            condition=condition,
            day_start=day_start,
            limit=limit,
            offset=offset,
        )
        today_items: list[LeadPublic] = []
        history_items: list[LeadPublic] = []
        for row in rows:
            created_at = row.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            payload = LeadPublic.model_validate(row)
            if created_at >= day_start:
                today_items.append(payload)
            else:
                history_items.append(payload)
        return AllLeadsResponse(
            today_items=today_items,
            history_items=history_items,
            today_total=today_total,
            history_total=max(total - today_total, 0),
            total=total,
            limit=limit,
            offset=offset,
        )


def get_all_leads_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AllLeadsService:
    return AllLeadsService(repository=SqlAlchemyLeadsRepository(session))
