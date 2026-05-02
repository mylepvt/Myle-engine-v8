"""Scheduled cron jobs for Myle automation.

Jobs (all IST-aware):
- enrollment_proof_alert      : every 30min — pending proof > 2h → push admin/leaders
- weekly_compliance_digest    : Monday 09:00 IST — compliance summary to leaders
- daily_report_reminder       : 20:00 IST daily — push eligible users who haven't submitted report
- call_target_reminder        : 17:00 IST daily — push eligible users short on calls
- watch_archive_maintenance   : every 30min — archive completed-watch leads > 24h + redistribute stale
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import today_ist
from app.db.session import AsyncSessionLocal
from app.models.daily_report import DailyReport
from app.models.lead import Lead
from app.models.user import User
from app.services.live_metrics import fresh_call_counts_by_user, get_daily_call_target
from app.services.member_compliance import build_compliance_snapshots
from app.services.push_service import send_push_to_role, send_push_to_user
from app.services import execution_enforcement as enf

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Job 1: enrollment proof pending > 2h → alert admin + leaders
# ---------------------------------------------------------------------------

async def job_enrollment_proof_alert() -> None:
    """Push admin and leaders when a payment proof has been waiting > 2 hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    try:
        async with AsyncSessionLocal() as session:
            rows = (
                await session.execute(
                    select(Lead).where(
                        and_(
                            Lead.payment_status == "proof_uploaded",
                            Lead.payment_proof_uploaded_at.isnot(None),
                            Lead.payment_proof_uploaded_at < cutoff,
                            Lead.deleted_at.is_(None),
                        )
                    )
                )
            ).scalars().all()

            if not rows:
                return

            count = len(rows)
            body = (
                "1 enrollment payment proof has been waiting over 2 hours for approval."
                if count == 1
                else f"{count} enrollment payment proofs have been waiting over 2 hours."
            )

            for role in ("admin", "leader"):
                try:
                    await send_push_to_role(
                        session,
                        role,
                        title="Enrollment approval overdue",
                        body=body,
                        url="/dashboard/team/enrollment-approvals",
                    )
                except Exception:
                    pass

            logger.info("enrollment_proof_alert: %d overdue proofs notified", count)

    except Exception as exc:
        logger.error("job_enrollment_proof_alert failed: %s", exc)


# ---------------------------------------------------------------------------
# Job 3: weekly compliance digest → leaders every Monday 09:00 IST
# ---------------------------------------------------------------------------

async def job_weekly_compliance_digest() -> None:
    """Send weekly compliance health summary to all leaders."""
    try:
        async with AsyncSessionLocal() as session:
            leader_ids = (
                await session.execute(
                    select(User.id).where(
                        User.role == "leader",
                        User.registration_status == "approved",
                        User.removed_at.is_(None),
                    )
                )
            ).scalars().all()

            if not leader_ids:
                return

            for leader_id in leader_ids:
                await _send_digest_for_leader(session, int(leader_id))

    except Exception as exc:
        logger.error("job_weekly_compliance_digest failed: %s", exc)


async def _send_digest_for_leader(session: AsyncSession, leader_id: int) -> None:
    team_rows = (
        await session.execute(
            select(User).where(
                User.upline_user_id == leader_id,
                User.registration_status == "approved",
                User.role == "team",
                User.removed_at.is_(None),
            )
        )
    ).scalars().all()

    if not team_rows:
        return

    member_ids = [u.id for u in team_rows]
    snapshots = await build_compliance_snapshots(session, member_ids, apply_actions=False)

    counts = {"warning": 0, "strong_warning": 0, "final_warning": 0, "removed": 0, "clear": 0}
    for snap in snapshots.values():
        level = snap.compliance_level
        if level in counts:
            counts[level] += 1
        elif level not in ("not_applicable", "grace", "grace_ending"):
            counts["clear"] += 1

    total = len(member_ids)
    at_risk = counts["warning"] + counts["strong_warning"] + counts["final_warning"]

    if at_risk == 0 and counts["removed"] == 0:
        body = f"All {total} team members are on track this week. Great work!"
    else:
        parts = []
        if counts["final_warning"]:
            parts.append(f"{counts['final_warning']} final warning")
        if counts["strong_warning"]:
            parts.append(f"{counts['strong_warning']} strong warning")
        if counts["warning"]:
            parts.append(f"{counts['warning']} warning")
        if counts["removed"]:
            parts.append(f"{counts['removed']} removed")
        body = "Team compliance: " + " · ".join(parts) + f" (of {total} members)."

    try:
        await send_push_to_user(
            session,
            leader_id,
            title="Weekly team compliance digest",
            body=body,
            url="/dashboard/team",
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Job 3: daily report reminder — 20:00 IST
# ---------------------------------------------------------------------------

_ELIGIBLE_ROLES = {"team", "leader"}


async def _get_eligible_users(session: AsyncSession) -> list[User]:
    rows = (
        await session.execute(
            select(User).where(
                User.role.in_(list(_ELIGIBLE_ROLES)),
                User.registration_status == "approved",
                User.access_blocked.is_(False),
                User.removed_at.is_(None),
                User.training_required.is_(False),
            )
        )
    ).scalars().all()
    return [
        u for u in rows
        if (u.training_status or "").strip().lower() in {"completed", "not_required"}
    ]


async def job_daily_report_reminder() -> None:
    """Push eligible users who haven't submitted today's daily report (runs 20:00 IST)."""
    try:
        async with AsyncSessionLocal() as session:
            today = today_ist()
            users = await _get_eligible_users(session)
            if not users:
                return

            user_ids = [u.id for u in users]
            submitted = {
                int(uid)
                for (uid,) in (
                    await session.execute(
                        select(DailyReport.user_id).where(
                            DailyReport.user_id.in_(user_ids),
                            DailyReport.report_date == today,
                        )
                    )
                ).all()
            }

            missing = [u for u in users if u.id not in submitted]
            for user in missing:
                try:
                    await send_push_to_user(
                        session,
                        user.id,
                        title="Daily report pending ⚠️",
                        body="You haven't submitted today's daily report yet. Submit before midnight to avoid a compliance warning.",
                        url="/dashboard/work/report",
                    )
                except Exception:
                    pass

            logger.info("daily_report_reminder: pushed %d users", len(missing))

    except Exception as exc:
        logger.error("job_daily_report_reminder failed: %s", exc)


# ---------------------------------------------------------------------------
# Job 4: call target reminder — 17:00 IST
# ---------------------------------------------------------------------------

async def job_call_target_reminder() -> None:
    """Push eligible users who are short on calls for today (runs 17:00 IST)."""
    try:
        async with AsyncSessionLocal() as session:
            today = today_ist()
            users = await _get_eligible_users(session)
            if not users:
                return

            user_ids = [u.id for u in users]
            call_target = await get_daily_call_target(session)
            calls_today = await fresh_call_counts_by_user(session, user_ids, today)

            short = [
                u for u in users
                if int(calls_today.get(u.id, 0)) < call_target
            ]
            for user in short:
                done = int(calls_today.get(user.id, 0))
                remaining = call_target - done
                try:
                    await send_push_to_user(
                        session,
                        user.id,
                        title="Call target reminder 📞",
                        body=f"You've made {done}/{call_target} calls today. {remaining} more needed to stay on track.",
                        url="/dashboard/work/leads",
                    )
                except Exception:
                    pass

            logger.info("call_target_reminder: pushed %d users short on calls", len(short))

    except Exception as exc:
        logger.error("job_call_target_reminder failed: %s", exc)


# ---------------------------------------------------------------------------
# Job 5: watch archive maintenance — every 30min
# ---------------------------------------------------------------------------

async def job_watch_archive_maintenance() -> None:
    """Archive completed-watch leads older than 24h and redistribute stale ones."""
    try:
        async with AsyncSessionLocal() as session:
            result = await enf.run_completed_watch_pipeline_maintenance(session)
            logger.info(
                "watch_archive_maintenance: archived=%d reassigned=%d skipped=%d",
                result["auto_archived"],
                result["reassigned"],
                result["skipped"],
            )
    except Exception as exc:
        logger.error("job_watch_archive_maintenance failed: %s", exc)
