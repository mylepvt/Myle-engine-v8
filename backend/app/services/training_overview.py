"""Admin training-progress monitor — per-member 7-day completion grouped by team leader.

Mirrors the legacy ``/admin/training`` Members tab: every approved leader/team member
becomes a row showing how many of the 7 training days are done, latest test score,
training status and certificate state. Rows are grouped under the nearest leader in the
org tree so an admin can see which team manager's training is running and how far along.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.core.auth_cookies import display_name_from_user
from app.models.training_progress import TrainingProgress
from app.models.training_test_attempt import TrainingTestAttempt
from app.models.user import User
from app.services.user_hierarchy import (
    load_user_hierarchy_entries,
    nearest_leader_entry,
    recursive_downline_user_ids,
)

TOTAL_TRAINING_DAYS = 7


async def _scope_users(session: AsyncSession, actor: AuthUser) -> list[User]:
    """Members visible to the actor: admin → all approved leader+team; leader → downline."""
    if actor.role == "admin":
        rows = (
            await session.execute(
                select(User)
                .where(
                    User.registration_status == "approved",
                    User.role.in_(("leader", "team")),
                )
                .order_by(User.created_at.asc(), User.id.asc())
            )
        ).scalars().all()
        return list(rows)
    if actor.role == "leader":
        downline_ids = await recursive_downline_user_ids(session, actor.user_id)
        if not downline_ids:
            return []
        rows = (
            await session.execute(
                select(User)
                .where(
                    User.registration_status == "approved",
                    User.id.in_(downline_ids),
                )
                .order_by(User.created_at.asc(), User.id.asc())
            )
        ).scalars().all()
        return list(rows)
    rows = (
        await session.execute(select(User).where(User.id == actor.user_id))
    ).scalars().all()
    return list(rows)


def _latest_test(attempt: TrainingTestAttempt | None) -> dict | None:
    if attempt is None:
        return None
    total = int(attempt.total_questions or 0)
    score = int(attempt.score or 0)
    percent = round(score / total * 100) if total else 0
    return {
        "score": score,
        "total": total,
        "percent": percent,
        "passed": bool(attempt.passed),
    }


async def get_training_overview(session: AsyncSession, *, actor: AuthUser) -> dict:
    users = await _scope_users(session, actor)
    user_ids = [int(u.id) for u in users]
    if not user_ids:
        return {"groups": [], "total_members": 0, "total_days": TOTAL_TRAINING_DAYS}

    # Days completed (1..7) per member.
    progress_rows = (
        await session.execute(
            select(TrainingProgress.user_id, func.count())
            .where(
                TrainingProgress.user_id.in_(user_ids),
                TrainingProgress.completed.is_(True),
                TrainingProgress.day_number >= 1,
                TrainingProgress.day_number <= TOTAL_TRAINING_DAYS,
            )
            .group_by(TrainingProgress.user_id)
        )
    ).all()
    days_done_map = {int(uid): int(count) for uid, count in progress_rows}

    # Latest test attempt per member.
    attempt_rows = (
        await session.execute(
            select(TrainingTestAttempt)
            .where(TrainingTestAttempt.user_id.in_(user_ids))
            .order_by(
                TrainingTestAttempt.user_id.asc(),
                TrainingTestAttempt.attempted_at.desc(),
            )
        )
    ).scalars().all()
    latest_test_map: dict[int, TrainingTestAttempt] = {}
    for attempt in attempt_rows:
        latest_test_map.setdefault(int(attempt.user_id), attempt)

    hierarchy_entries = await load_user_hierarchy_entries(session, user_ids)

    groups: dict[str, dict] = {}
    for member in users:
        leader = nearest_leader_entry(int(member.id), hierarchy_entries)
        leader_user_id = leader.id if leader is not None else None
        key = str(leader_user_id) if leader_user_id is not None else "unassigned"

        row = {
            "user_id": int(member.id),
            "name": display_name_from_user(member) or member.fbo_id,
            "fbo_id": member.fbo_id,
            "role": member.role,
            "joining_date": member.joining_date.isoformat() if member.joining_date else None,
            "training_required": bool(member.training_required),
            "training_status": member.training_status,
            "days_done": days_done_map.get(int(member.id), 0),
            "total_days": TOTAL_TRAINING_DAYS,
            "has_certificate": bool(member.certificate_url),
            "test": _latest_test(latest_test_map.get(int(member.id))),
        }

        group = groups.get(key)
        if group is None:
            group = {
                "leader_user_id": leader_user_id,
                "leader_name": (leader.display_name if leader is not None else None)
                or "No mapped leader",
                "members": [],
            }
            groups[key] = group
        group["members"].append(row)

    group_list = list(groups.values())
    group_list.sort(
        key=lambda g: (g["leader_user_id"] is None, (g["leader_name"] or "").lower())
    )
    for group in group_list:
        group["members"].sort(key=lambda m: m["name"].lower())
        group["member_count"] = len(group["members"])
        group["completed_count"] = sum(
            1 for m in group["members"] if m["days_done"] >= TOTAL_TRAINING_DAYS
        )

    return {
        "groups": group_list,
        "total_members": len(user_ids),
        "total_days": TOTAL_TRAINING_DAYS,
    }
