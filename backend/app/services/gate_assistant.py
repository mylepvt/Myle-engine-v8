"""Compute Gate Assistant state from existing tables — single place for checklist logic."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.schemas.gate_assistant import GateAssistantResponse, GateChecklistItem
from app.services.lead_scope import lead_visibility_where


def _risk_level(open_fu: int, overdue_fu: int) -> Literal["green", "yellow", "red"]:
    if overdue_fu > 0:
        return "red"
    if open_fu > 0:
        return "yellow"
    return "green"


async def build_gate_assistant(session: AsyncSession, user: AuthUser) -> GateAssistantResponse:
    now = datetime.now(timezone.utc)
    vis = lead_visibility_where(user)

    open_q = (
        select(func.count())
        .select_from(FollowUp)
        .join(Lead, FollowUp.lead_id == Lead.id)
        .where(FollowUp.completed_at.is_(None))
    )
    if vis is not None:
        open_q = open_q.where(vis)
    open_follow_ups = int((await session.execute(open_q)).scalar_one())

    overdue_q = (
        select(func.count())
        .select_from(FollowUp)
        .join(Lead, FollowUp.lead_id == Lead.id)
        .where(
            FollowUp.completed_at.is_(None),
            FollowUp.due_at.is_not(None),
            FollowUp.due_at < now,
        )
    )
    if vis is not None:
        overdue_q = overdue_q.where(vis)
    overdue_follow_ups = int((await session.execute(overdue_q)).scalar_one())

    pipe_q = select(func.count()).select_from(Lead).where(
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
    )
    if vis is not None:
        pipe_q = pipe_q.where(vis)
    active_pipeline_leads = int((await session.execute(pipe_q)).scalar_one())

    checklist = [
        GateChecklistItem(
            id="followups_overdue",
            label="No overdue follow-ups",
            done=overdue_follow_ups == 0,
            href="work/follow-ups",
        ),
        GateChecklistItem(
            id="followups_open",
            label="Inbox clear (no open follow-ups)",
            done=open_follow_ups == 0,
            href="work/follow-ups",
        ),
    ]

    progress_done = sum(1 for c in checklist if c.done)
    progress_total = len(checklist)
    risk = _risk_level(open_follow_ups, overdue_follow_ups)

    if overdue_follow_ups > 0:
        next_action = f"Resolve {overdue_follow_ups} overdue follow-up(s)"
        next_href = "work/follow-ups"
    elif open_follow_ups > 0:
        next_action = f"Complete or schedule {open_follow_ups} open follow-up(s)"
        next_href = "work/follow-ups"
    else:
        next_action = "You're on track — keep momentum on your pipeline"
        next_href = None

    return GateAssistantResponse(
        risk_level=risk,
        progress_done=progress_done,
        progress_total=progress_total,
        next_action=next_action,
        next_href=next_href,
        checklist=checklist,
        open_follow_ups=open_follow_ups,
        overdue_follow_ups=overdue_follow_ups,
        active_pipeline_leads=active_pipeline_leads,
        note="Derived from follow-ups and scoped leads — server is the source of truth.",
    )
