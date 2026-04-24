"""Compute role-specific Gate Assistant state from live tables."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.follow_up import FollowUp
from app.models.lead import Lead
from app.models.user import User
from app.schemas.gate_assistant import GateAssistantResponse, GateChecklistItem
from app.services.downline import lead_execution_visible_to_leader_clause
from app.services.lead_scope import lead_visibility_where
from app.services.live_metrics import (
    fresh_call_counts_by_user,
    fresh_lead_counts_by_user,
    get_daily_call_target,
    pending_payment_proof_count,
)
from app.services.member_compliance import build_compliance_snapshots, count_submitted_reports_for_day
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
    compliance_level: str | None = None
    compliance_title: str | None = None
    compliance_summary: str | None = None
    calls_short_streak = 0
    missing_report_streak = 0
    grace_active = False
    grace_ending_tomorrow = False
    grace_end_date: str | None = None
    team_warning_count = 0
    team_strong_warning_count = 0
    team_final_warning_count = 0
    team_removed_count = 0
    team_grace_count = 0

    if user.role in {"team", "leader"}:
        compliance = (
            await build_compliance_snapshots(session, [user.user_id], apply_actions=True)
        ).get(user.user_id)
        fresh_leads_today = (await fresh_lead_counts_by_user(session, [user.user_id], today)).get(user.user_id, 0)
        calls_today = (await fresh_call_counts_by_user(session, [user.user_id], today)).get(user.user_id, 0)
        report_submitted_today = (await count_submitted_reports_for_day(session, [user.user_id], today)).get(
            user.user_id,
            False,
        )
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
                id="daily_report_submitted",
                label="Submit today's daily report",
                done=bool(report_submitted_today),
                href="other/daily-report",
            ),
        ]
        if compliance is not None:
            compliance_level = compliance.compliance_level
            compliance_title = compliance.compliance_title
            compliance_summary = compliance.compliance_summary
            calls_short_streak = compliance.calls_short_streak
            missing_report_streak = compliance.missing_report_streak
            grace_active = compliance.grace_active
            grace_ending_tomorrow = compliance.grace_ending_tomorrow
            grace_end_date = compliance.grace_end_date.isoformat() if compliance.grace_end_date else None
        if compliance_level == "final_warning":
            risk = "red"
            next_action = compliance_summary or "Final warning active."
            next_href = "other/daily-report" if missing_report_streak >= calls_short_streak else "work/leads"
            next_label = "Fix now"
        elif compliance_level == "strong_warning":
            risk = "red"
            next_action = compliance_summary or "Strong warning active."
            next_href = "other/daily-report" if missing_report_streak >= calls_short_streak else "work/leads"
            next_label = "Recover today"
        elif compliance_level == "warning":
            risk = "yellow"
            next_action = compliance_summary or "Warning active."
            next_href = "other/daily-report" if missing_report_streak >= calls_short_streak else "work/leads"
            next_label = "Recover today"
        elif compliance_level == "grace_ending":
            risk = "yellow"
            next_action = compliance_summary or "Grace ends tomorrow."
            next_href = "other/daily-report"
            next_label = "Prepare return"
        elif compliance_level == "grace":
            risk = "green"
            next_action = compliance_summary or "Grace is active."
            next_href = None
            next_label = None
        elif not report_submitted_today:
            risk = "yellow"
            next_action = "Submit today's daily report before the day closes."
            next_href = "other/daily-report"
            next_label = "Open report"
        elif effective_call_target > 0 and calls_today < effective_call_target:
            left = effective_call_target - calls_today
            risk = "yellow"
            next_action = f"Log {left} more fresh call(s) on today's claimed / imported / created leads"
            next_href = "work/leads"
            next_label = "Open leads"
        else:
            risk = "green"
            next_action = "You're on track — today's call and report gates are covered."
            next_href = None
            next_label = None
        pending_proof_count = 0
        members_below_call_gate = 0
    else:
        org_user_ids = [
            int(uid)
            for uid in (
                await session.execute(
                    select(User.id).where(User.role.in_(("leader", "team")))
                )
            ).scalars().all()
        ]
        compliance_map = await build_compliance_snapshots(
            session,
            org_user_ids,
            apply_actions=True,
        )
        # Admin dashboard currently does not render this card, but keep org-wide counts ready for parity.
        team_warning_count = sum(1 for snapshot in compliance_map.values() if snapshot.compliance_level == "warning")
        team_strong_warning_count = sum(
            1 for snapshot in compliance_map.values() if snapshot.compliance_level == "strong_warning"
        )
        team_final_warning_count = sum(
            1 for snapshot in compliance_map.values() if snapshot.compliance_level == "final_warning"
        )
        team_removed_count = sum(1 for snapshot in compliance_map.values() if snapshot.compliance_level == "removed")
        team_grace_count = sum(
            1 for snapshot in compliance_map.values() if snapshot.compliance_level in {"grace", "grace_ending"}
        )
        pending_proof_count = await pending_payment_proof_count(session, role="admin")
        checklist = [
            GateChecklistItem(
                id="payment_proofs_pending",
                label=f"Rs 196 proofs waiting for review ({pending_proof_count})",
                done=pending_proof_count == 0,
                href="team/enrollment-approvals",
            ),
            GateChecklistItem(
                id="org_discipline",
                label=(
                    "Org discipline alerts "
                    f"(W:{team_warning_count} / S:{team_strong_warning_count} / F:{team_final_warning_count} / R:{team_removed_count})"
                ),
                done=(team_warning_count + team_strong_warning_count + team_final_warning_count + team_removed_count) == 0,
                href="settings/all-members",
            ),
            GateChecklistItem(
                id="followups_overdue",
                label=f"No overdue follow-ups ({overdue_follow_ups})",
                done=overdue_follow_ups == 0,
                href="work/follow-ups",
            ),
        ]
        if team_removed_count > 0 or team_final_warning_count > 0:
            risk = "red"
            next_action = (
                f"Org discipline alerts: {team_removed_count} removed and {team_final_warning_count} final warning member(s)"
            )
            next_href = "settings/all-members"
            next_label = "Open control center"
        elif pending_proof_count > 0:
            risk = "red"
            next_action = f"Review {pending_proof_count} pending payment proof(s)"
            next_href = "team/enrollment-approvals"
            next_label = "Open proof queue"
        elif team_strong_warning_count > 0 or team_warning_count > 0:
            risk = "yellow"
            next_action = f"{team_warning_count + team_strong_warning_count} member(s) are under discipline watch"
            next_href = "settings/all-members"
            next_label = "Open control center"
        elif overdue_follow_ups > 0:
            risk = "yellow"
            next_action = f"Resolve {overdue_follow_ups} overdue follow-up(s)"
            next_href = "work/follow-ups"
            next_label = "Open follow-ups"
        else:
            risk = "green"
            next_action = "System execution and discipline gates look healthy."
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
        compliance_level=compliance_level,
        compliance_title=compliance_title,
        compliance_summary=compliance_summary,
        calls_short_streak=calls_short_streak,
        missing_report_streak=missing_report_streak,
        grace_active=grace_active,
        grace_ending_tomorrow=grace_ending_tomorrow,
        grace_end_date=grace_end_date,
        team_warning_count=team_warning_count,
        team_strong_warning_count=team_strong_warning_count,
        team_final_warning_count=team_final_warning_count,
        team_removed_count=team_removed_count,
        team_grace_count=team_grace_count,
        note=None,
    )
