"""Scheduled cron jobs for Myle automation.

Jobs (all IST-aware):
- enrollment_proof_alert  : every 30min — pending proof > 2h → push admin/leaders
- weekly_compliance_digest: Monday 09:00 IST — compliance summary to leaders
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.lead import Lead
from app.models.user import User
from app.services.member_compliance import build_compliance_snapshots
from app.services.push_service import send_push_to_role, send_push_to_user

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
