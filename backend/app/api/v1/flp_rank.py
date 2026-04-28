"""FLP CC & rank endpoints."""
from __future__ import annotations

from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.flp_cc_entry import FLPCCEntry
from app.models.flp_monthly_cc import FLPMonthlyCC
from app.models.user import User
from app.services.flp_rank_service import (
    RANK_LABELS,
    RANK_ORDER,
    get_team_flp_summary,
    get_user_flp_summary,
    recompute_user_rank,
    upsert_monthly_rollup,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CCEntryIn(BaseModel):
    user_id: int
    year_month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    cc_amount: float = Field(..., gt=0, le=100)
    entry_type: str = Field("personal", pattern="^(personal|group)$")
    note: Optional[str] = None


class RankOverrideIn(BaseModel):
    rank: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/me")
async def get_my_flp_summary(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await get_user_flp_summary(session, user.user_id)


@router.get("/me/history")
async def get_my_cc_history(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> List[dict]:
    rows = (
        await session.execute(
            select(FLPMonthlyCC)
            .where(FLPMonthlyCC.user_id == user.user_id)
            .order_by(FLPMonthlyCC.year_month.desc())
        )
    ).scalars().all()
    return [
        {
            "year_month": r.year_month,
            "personal_cc": r.personal_cc,
            "group_cc": r.group_cc,
            "total_cc": r.total_cc,
            "is_active": r.is_active,
        }
        for r in rows
    ]


@router.post("/cc")
async def record_cc_entry(
    body: CCEntryIn,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Forbidden")

    target = (await session.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    entry = FLPCCEntry(
        user_id=body.user_id,
        year_month=body.year_month,
        cc_amount=body.cc_amount,
        entry_type=body.entry_type,
        note=body.note,
        recorded_by_user_id=user.user_id,
    )
    session.add(entry)
    await session.flush()

    await upsert_monthly_rollup(session, body.user_id, body.year_month)
    updated_user = await recompute_user_rank(session, body.user_id)
    await session.commit()

    return {
        "entry_id": entry.id,
        "user_id": body.user_id,
        "year_month": body.year_month,
        "cc_amount": body.cc_amount,
        "entry_type": body.entry_type,
        "new_rank": updated_user.flp_rank,
        "new_rank_label": RANK_LABELS.get(updated_user.flp_rank, updated_user.flp_rank),
        "cumulative_cc": updated_user.flp_cumulative_cc,
    }


@router.get("/team")
async def get_team_flp(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> List[dict]:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Forbidden")

    if user.role == "admin":
        ids = (await session.execute(select(User.id).where(User.removed_at.is_(None)))).scalars().all()
    else:
        ids = (
            await session.execute(
                select(User.id).where(
                    User.upline_user_id == user.user_id,
                    User.removed_at.is_(None),
                )
            )
        ).scalars().all()

    return await get_team_flp_summary(session, list(ids))


@router.put("/rank/{target_user_id}")
async def override_rank(
    target_user_id: int,
    body: RankOverrideIn,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    if body.rank not in RANK_ORDER:
        raise HTTPException(status_code=422, detail=f"Invalid rank. Valid: {RANK_ORDER}")

    target = (await session.execute(select(User).where(User.id == target_user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.flp_rank = body.rank
    await session.commit()

    return {
        "user_id": target_user_id,
        "flp_rank": target.flp_rank,
        "flp_rank_label": RANK_LABELS.get(target.flp_rank, target.flp_rank),
    }


@router.post("/recompute/{target_user_id}")
async def recompute_rank(
    target_user_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Forbidden")

    updated = await recompute_user_rank(session, target_user_id)
    await session.commit()

    return {
        "user_id": target_user_id,
        "flp_rank": updated.flp_rank,
        "flp_rank_label": RANK_LABELS.get(updated.flp_rank, updated.flp_rank),
        "flp_cumulative_cc": updated.flp_cumulative_cc,
    }
