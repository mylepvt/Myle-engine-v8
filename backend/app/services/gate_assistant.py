"""Compute role-specific Gate Assistant state from live tables."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.schemas.gate_assistant import GateAssistantResponse, GateChecklistItem
from app.services.downline import lead_execution_visible_to_leader_clause
from app.services.lead_scope import lead_visibility_where
from app.services.live_metrics import (
    downline_team_user_ids,
    fresh_call_counts_by_user,
    fresh_lead_counts_by_user,
    get_daily_call_target,
    pending_payment_proof_count,
)
from app.core.time_ist import today_ist


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

    if user.role == "leader":
        pipe_vis = lead_execution_visible_to_leader_clause(user.user_id)
    else:
        pipe_vis = vis
    pipe_q = select(func.count()).select_from(Lead).where(
        Lead.archived_at.is_(None),
        Lead.deleted_at.is_(None),
        Lead.in_pool.is_(False),
    )
    if pipe_vis is not None:
        pipe_q = pipe_q.where(pipe_vis)
    active_pipeline_leads = int((await session.execute(pipe_q)).scalar_one())

    today = today_ist()
    daily_call_target = await get_daily_call_target(session)

    if user.role == "team":
        fresh_leads_today = (await fresh_lead_counts_by_user(session, [user.user_id], today)).get(user.user_id, 0)
        calls_today = (await fresh_call_counts_by_user(session, [user.user_id], today)).get(user.user_id, 0)
        effective_call_target = daily_call_target if fresh_leads_today > 0 else 0
        checklist = [
            GateChecklistItem(
                id="daily_call_target",
                label=(
                    f"{daily_call_target} fresh calls on today's leads ({calls_today}/{effective_call_target or daily_call_target})"
                    if fresh_leads_today > 0
                    else "Fresh-call gate starts after today's claim/import/add-lead"
                ),
                done=effective_call_target == 0 or calls_today >= effective_call_target,
                href="work/leads",
            ),
            GateChecklistItem(
                id="followups_overdue",
                label=f"No overdue follow-ups ({overdue_follow_ups})",
                done=overdue_follow_ups == 0,
                href="work/follow-ups",
            ),
        ]
        if overdue_follow_ups > 0:
            risk = "red"
            next_action = f"Resolve {overdue_follow_ups} overdue follow-up(s)"
            next_href = "work/follow-ups"
            next_label = "Open follow-ups"
        elif effective_call_target > 0 and calls_today < effective_call_target:
            left = effective_call_target - calls_today
            risk = "yellow"
            next_action = f"Log {left} more fresh call(s) on today's claimed / imported / created leads"
            next_href = "work/leads"
            next_label = "Open leads"
        else:
            risk = "green"
            next_action = "You're on track — today's fresh-lead gate is covered."
            next_href = None
            next_label = None
        pending_proof_count = 0
        members_below_call_gate = 0
    elif user.role == "leader":
        team_ids = await downline_team_user_ids(session, user.user_id)
        fresh_counts = await fresh_lead_counts_by_user(session, team_ids, today)
        call_counts = await fresh_call_counts_by_user(session, team_ids, today)
        members_below_call_gate = sum(
            1
            for uid in team_ids
            if int(fresh_counts.get(uid, 0)) > 0 and int(call_counts.get(uid, 0)) < daily_call_target
        )
        pending_proof_count = await pending_payment_proof_count(
            session,
            role="leader",
            user_id=user.user_id,
        )
        checklist = [
            GateChecklistItem(
                id="downline_call_gates",
                label=f"Team members below {daily_call_target} fresh calls ({members_below_call_gate})",
                done=members_below_call_gate == 0,
                href="analytics",
            ),
            GateChecklistItem(
                id="payment_proofs_pending",
                label=f"Rs 196 proofs waiting for review ({pending_proof_count})",
                done=pending_proof_count == 0,
                href="team/enrollment-approvals",
            ),
        ]
        if pending_proof_count > 0:
            risk = "red"
            next_action = f"Review {pending_proof_count} pending payment proof(s)"
            next_href = "team/enrollment-approvals"
            next_label = "Open proof queue"
        elif members_below_call_gate > 0:
            risk = "yellow"
            next_action = f"{members_below_call_gate} team member(s) are below the fresh-call gate"
            next_href = "analytics"
            next_label = "Open analytics"
        else:
            risk = "green"
            next_action = "Your team's call and proof gates are on track."
            next_href = None
            next_label = None
        fresh_leads_today = 0
        calls_today = 0
        effective_call_target = 0
        open_follow_ups = 0
        overdue_follow_ups = 0
    else:
        pending_proof_count = await pending_payment_proof_count(session, role="admin")
        checklist = [
            GateChecklistItem(
                id="payment_proofs_pending",
                label=f"Rs 196 proofs waiting for review ({pending_proof_count})",
                done=pending_proof_count == 0,
                href="team/enrollment-approvals",
            ),
            GateChecklistItem(
                id="followups_overdue",
                label=f"No overdue follow-ups ({overdue_follow_ups})",
                done=overdue_follow_ups == 0,
                href="work/follow-ups",
            ),
        ]
        if pending_proof_count > 0:
            risk = "red"
            next_action = f"Review {pending_proof_count} pending payment proof(s)"
            next_href = "team/enrollment-approvals"
            next_label = "Open proof queue"
        elif overdue_follow_ups > 0:
            risk = "yellow"
            next_action = f"Resolve {overdue_follow_ups} overdue follow-up(s)"
            next_href = "work/follow-ups"
            next_label = "Open follow-ups"
        else:
            risk = "green"
            next_action = "System execution gates look healthy."
            next_href = None
            next_label = None
        fresh_leads_today = 0
        calls_today = 0
        effective_call_target = 0
        members_below_call_gate = 0

    progress_done = sum(1 for c in checklist if c.done)
    progress_total = len(checklist)

    return GateAssistantResponse(
        role=user.role,  # type: ignore[arg-type]
        risk_level=risk,
        progress_done=progress_done,
        progress_total=progress_total,
        next_action=next_action,
        next_href=next_href,
        next_label=next_label,
        checklist=checklist,
        fresh_leads_today=fresh_leads_today,
        calls_today=calls_today,
        call_target=effective_call_target,
        pending_proof_count=pending_proof_count,
        members_below_call_gate=members_below_call_gate,
        open_follow_ups=open_follow_ups,
        overdue_follow_ups=overdue_follow_ups,
        active_pipeline_leads=active_pipeline_leads,
        note="Counts come from live leads, call events, claims, and proof queue state.",
    )
