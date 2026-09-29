"""Skills & Personal Development training — a light, non-blocking 7-day track.

Opens only after a member has unlocked the app (onboarding training done or not
required). One day unlocks per calendar day (IST): Day N opens the day after
Day N-1 was marked done. Completion is a single "done" click — no notes, no
quiz — and nothing here feeds discipline / compliance rules; it is tracking only.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.core.auth_cookies import display_name_from_user
from app.core.time_ist import IST, today_ist
from app.models.skill_training import SkillTrainingProgress, SkillTrainingVideo
from app.models.user import User
from app.services.training_overview import _scope_users

SKILL_TRAINING_DAYS = 7
_FINISHED_ONBOARDING = frozenset({"completed", "not_required"})


def youtube_embed_url(raw: str) -> str:
    """Normalise watch?v= / youtu.be / embed links into a locked-down embed URL."""
    raw = raw.strip()
    if "youtu.be/" in raw:
        vid_id = raw.split("youtu.be/")[-1].split("?")[0].split("&")[0]
    elif "watch?v=" in raw:
        vid_id = raw.split("watch?v=")[-1].split("&")[0]
    elif "embed/" in raw:
        vid_id = raw.split("embed/")[-1].split("?")[0]
    else:
        vid_id = raw.split("/")[-1].split("?")[0]
    params = "controls=0&modestbranding=1&rel=0&disablekb=1&fs=0&iv_load_policy=3"
    return f"https://www.youtube.com/embed/{vid_id}?{params}"


def skill_training_available(user: User) -> bool:
    """Admins always (to manage content); others only once the app is unlocked."""
    role = (user.role or "").strip().lower()
    if role == "admin":
        return True
    if role not in ("leader", "team"):
        return False
    if user.training_required:
        return False
    return (user.training_status or "").strip().lower() in _FINISHED_ONBOARDING


def _completion_day(progress: SkillTrainingProgress) -> date:
    value = progress.completed_at
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(IST).date()


def _day_states(
    day_numbers: list[int],
    progress_by_day: dict[int, SkillTrainingProgress],
    today: date,
) -> dict[int, tuple[bool, date | None]]:
    """(unlocked, unlocks_on) per day. Day N needs Day N-1 done on an earlier IST day."""
    states: dict[int, tuple[bool, date | None]] = {}
    previous: int | None = None
    for day in day_numbers:
        if day in progress_by_day:
            states[day] = (True, None)
        elif previous is None:
            states[day] = (True, None)
        else:
            prev_progress = progress_by_day.get(previous)
            if prev_progress is None:
                states[day] = (False, None)
            else:
                opens_on = _completion_day(prev_progress) + timedelta(days=1)
                states[day] = (today >= opens_on, opens_on if today < opens_on else None)
        previous = day
    return states


async def _load_progress(session: AsyncSession, user_id: int) -> dict[int, SkillTrainingProgress]:
    rows = (
        await session.execute(
            select(SkillTrainingProgress).where(SkillTrainingProgress.user_id == user_id)
        )
    ).scalars().all()
    return {int(p.day_number): p for p in rows}


async def build_skill_training_surface(
    session: AsyncSession,
    user: User,
    *,
    today: date | None = None,
) -> dict:
    current_day = today or today_ist()
    videos = (
        await session.execute(select(SkillTrainingVideo).order_by(SkillTrainingVideo.day_number.asc()))
    ).scalars().all()
    available = skill_training_available(user)
    progress_by_day = await _load_progress(session, int(user.id)) if available else {}
    states = _day_states([int(v.day_number) for v in videos], progress_by_day, current_day)
    is_admin = (user.role or "").strip().lower() == "admin"

    days = []
    for v in videos:
        unlocked, opens_on = states[int(v.day_number)]
        if is_admin:
            unlocked, opens_on = True, None
        done = progress_by_day.get(int(v.day_number))
        days.append(
            {
                "day_number": int(v.day_number),
                "title": v.title,
                "has_video": bool(v.youtube_url),
                "youtube_url": v.youtube_url if is_admin else None,
                "unlocked": bool(available and unlocked),
                "unlocks_on": opens_on.isoformat() if available and opens_on else None,
                "completed": done is not None,
                "completed_at": done.completed_at.isoformat() if done else None,
            }
        )
    return {
        "available": available,
        "total_days": len(days),
        "completed_days": sum(1 for d in days if d["completed"]),
        "days": days,
    }


async def mark_skill_day_done(
    session: AsyncSession,
    user: User,
    day_number: int,
    *,
    now: datetime | None = None,
) -> None:
    """Raise ``ValueError`` with a member-facing message when the day can't be completed."""
    if not skill_training_available(user):
        raise ValueError("Skills training opens after you finish onboarding training")
    video = (
        await session.execute(
            select(SkillTrainingVideo).where(SkillTrainingVideo.day_number == day_number)
        )
    ).scalar_one_or_none()
    if video is None:
        raise LookupError("Training day not found")
    progress_by_day = await _load_progress(session, int(user.id))
    if day_number in progress_by_day:
        return
    moment = now or datetime.now(timezone.utc)
    day_numbers = list(
        (await session.execute(select(SkillTrainingVideo.day_number).order_by(SkillTrainingVideo.day_number.asc())))
        .scalars()
        .all()
    )
    unlocked, opens_on = _day_states(
        [int(d) for d in day_numbers],
        progress_by_day,
        moment.astimezone(IST).date(),
    )[day_number]
    if not unlocked:
        if opens_on is not None:
            raise ValueError(f"Day {day_number} opens on {opens_on.strftime('%d %b %Y')}")
        raise ValueError("Finish the previous day first")
    session.add(SkillTrainingProgress(user_id=int(user.id), day_number=day_number, completed_at=moment))
    await session.commit()


async def get_skill_training_overview(session: AsyncSession, *, actor: AuthUser) -> dict:
    """Admin → all members; leader → downline. Tracking only."""
    users = [u for u in await _scope_users(session, actor) if u.role in ("leader", "team")]
    total = (
        await session.execute(select(func.count()).select_from(SkillTrainingVideo))
    ).scalar() or 0
    user_ids = [int(u.id) for u in users]
    done_map: dict[int, tuple[int, object]] = {}
    if user_ids:
        rows = (
            await session.execute(
                select(
                    SkillTrainingProgress.user_id,
                    func.count(),
                    func.max(SkillTrainingProgress.completed_at),
                )
                .where(SkillTrainingProgress.user_id.in_(user_ids))
                .group_by(SkillTrainingProgress.user_id)
            )
        ).all()
        done_map = {int(uid): (int(count), last) for uid, count, last in rows}

    members = []
    for u in users:
        count, last = done_map.get(int(u.id), (0, None))
        members.append(
            {
                "user_id": int(u.id),
                "name": display_name_from_user(u) or u.fbo_id,
                "fbo_id": u.fbo_id,
                "role": u.role,
                "available": skill_training_available(u),
                "completed_days": count,
                "last_completed_at": last.isoformat() if last else None,
            }
        )
    members.sort(key=lambda m: (not m["available"], -m["completed_days"], m["name"] or ""))
    return {"total_days": int(total), "members": members}
