"""Nightly self-audit — the app's "does anything look wrong?" sense.

The app only ever does exactly what its rules say; it has no instinct that
something is off. This service encodes that instinct as a set of explicit
consistency checks over the data, run on a schedule. Each check looks for a
*contradiction* that should never exist if every code path behaved, reports it,
and (for the safe ones) repairs it.

The check that motivated this: a member could end up with ``discipline_status ==
'removed'`` but ``removed_at IS NULL`` (or vice-versa). Every messaging surface
filters on ``removed_at``, so such a member keeps getting messages even though
they are "removed" — exactly the bug that prompted this work.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import today_ist
from app.models.daily_mission import DailyMission
from app.models.user import User

logger = logging.getLogger(__name__)

# How many offending names to include in the human-readable summary per check.
_SAMPLE_LIMIT = 10


@dataclass
class AuditFinding:
    code: str
    description: str
    user_ids: list[int] = field(default_factory=list)
    sample_names: list[str] = field(default_factory=list)
    fixed: int = 0

    @property
    def count(self) -> int:
        return len(self.user_ids)


@dataclass
class AuditReport:
    findings: list[AuditFinding] = field(default_factory=list)
    auto_fix: bool = False

    @property
    def total_issues(self) -> int:
        return sum(f.count for f in self.findings)

    @property
    def total_fixed(self) -> int:
        return sum(f.fixed for f in self.findings)

    def to_message(self) -> str | None:
        """Build a WhatsApp-friendly summary, or ``None`` when all clean."""
        active = [f for f in self.findings if f.count]
        if not active:
            return None
        lines = ["🩺 *Integrity Audit*", ""]
        for f in active:
            head = f"⚠️ {f.description}: *{f.count}*"
            if f.fixed:
                head += f" (auto-fixed {f.fixed})"
            lines.append(head)
            if f.sample_names:
                lines.append("   " + ", ".join(f.sample_names))
        lines.append("")
        lines.append(f"Total issues: {self.total_issues}" + (
            f" · auto-fixed {self.total_fixed}" if self.auto_fix else ""
        ))
        return "\n".join(lines)


def _name(user: User) -> str:
    return (user.name or user.fbo_id or f"User #{user.id}").strip()


async def run_integrity_audit(session: AsyncSession, *, auto_fix: bool = False) -> AuditReport:
    """Run all consistency checks. When ``auto_fix`` is set, repair the safe ones.

    Returns an :class:`AuditReport`. The function never raises on a single bad
    check — it is meant to run unattended.
    """
    report = AuditReport(auto_fix=auto_fix)
    today = today_ist()
    now = datetime.now(timezone.utc)

    # 1. discipline_status == 'removed' but removed_at is NULL.
    #    These members look "removed" on the member screen but still pass every
    #    messaging filter (which keys off removed_at). Safe to repair: stamp
    #    removed_at so the messaging filters start excluding them.
    rows = (
        await session.execute(
            select(User).where(
                User.discipline_status == "removed",
                User.removed_at.is_(None),
            )
        )
    ).scalars().all()
    f1 = AuditFinding(
        code="removed_status_without_timestamp",
        description="Marked removed but messaging filters still let them through",
        user_ids=[u.id for u in rows],
        sample_names=[_name(u) for u in rows[:_SAMPLE_LIMIT]],
    )
    if auto_fix:
        for u in rows:
            u.removed_at = now
            if not u.access_blocked:
                u.access_blocked = True
            f1.fixed += 1
    report.findings.append(f1)

    # 2. removed_at set but discipline_status not 'removed'. The inverse drift —
    #    they are filtered out of messaging (good) but the member screen shows a
    #    stale status. Safe to normalise the status string.
    rows = (
        await session.execute(
            select(User).where(
                User.removed_at.is_not(None),
                User.discipline_status != "removed",
            )
        )
    ).scalars().all()
    f2 = AuditFinding(
        code="timestamp_without_removed_status",
        description="Has removal timestamp but status not 'removed'",
        user_ids=[u.id for u in rows],
        sample_names=[_name(u) for u in rows[:_SAMPLE_LIMIT]],
    )
    if auto_fix:
        for u in rows:
            u.discipline_status = "removed"
            f2.fixed += 1
    report.findings.append(f2)

    # 3. Removed members who still own a mission generated today. Read-only flag
    #    (we don't delete history) — points at a generator that ignored removal.
    removed_with_mission = (
        await session.execute(
            select(User)
            .join(DailyMission, DailyMission.user_id == User.id)
            .where(
                or_(User.removed_at.is_not(None), User.discipline_status == "removed"),
                DailyMission.mission_date == today,
            )
            .distinct()
        )
    ).scalars().all()
    report.findings.append(AuditFinding(
        code="removed_member_has_today_mission",
        description="Removed member still got a mission generated today",
        user_ids=[u.id for u in removed_with_mission],
        sample_names=[_name(u) for u in removed_with_mission[:_SAMPLE_LIMIT]],
    ))

    # 4. Dangling upline: upline points at a user that no longer exists or has
    #    been removed. Their team's leader handoff would silently break.
    all_users = (await session.execute(select(User))).scalars().all()
    by_id = {u.id: u for u in all_users}
    dangling: list[User] = []
    for u in all_users:
        if u.upline_user_id is None:
            continue
        parent = by_id.get(u.upline_user_id)
        if parent is None or parent.removed_at is not None:
            dangling.append(u)
    report.findings.append(AuditFinding(
        code="dangling_upline",
        description="Upline missing or removed (handoff target broken)",
        user_ids=[u.id for u in dangling],
        sample_names=[_name(u) for u in dangling[:_SAMPLE_LIMIT]],
    ))

    if auto_fix and report.total_fixed:
        await session.commit()

    logger.info(
        "integrity_audit: issues=%d fixed=%d", report.total_issues, report.total_fixed
    )
    return report
