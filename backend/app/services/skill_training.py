"""Personal Development & Skills Academy — Level 2 of the learning journey.

Level 1 is the mandatory 7-day onboarding (``training_videos``). The academy
opens only once onboarding is verified complete on the server
(``training_status`` ``completed``, i.e. all days done + test / certificate, or an
admin-granted ``not_required``). The rule is the same for team members and
leaders — the leader role is never a bypass.

On the final onboarding day a teaser may show; that trigger is deliberately
separate from the unlock, so reaching Day 7 never opens the academy by itself.

Two separate tracks share the same lesson tables and unlock rule:

- **Personal Development** — one unnumbered category, the lessons carried over
  from the earlier day-by-day track.
- **Skills Academy** — six numbered categories, always in the order of
  ``CATEGORIES``.

The surface returns them as separate blocks with their own progress. A
lesson is done when the member marks it complete after the recording is up; a
lesson flagged ``practice_required`` also needs a written practice answer.
Nothing here feeds discipline / compliance rules — it is tracking only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.core.auth_cookies import display_name_from_user
from app.models.skill_training import SkillLesson, SkillLessonProgress
from app.models.user import User
from app.services.training_overview import _scope_users
from app.services.training_surface import build_training_surface

_FINISHED_ONBOARDING = frozenset({"completed", "not_required"})

PRACTICE_MIN_CHARS = 20
PRACTICE_MAX_CHARS = 4000

CATEGORIES: tuple[dict, ...] = (
    {
        "key": "personal_development",
        "number": None,
        "title": "Personal Development",
        "purpose": "Mindset, habits and personal growth.",
    },
    {
        "key": "process",
        "number": 1,
        "title": "Process Mastery",
        "purpose": "Understand the full business workflow — from lead to closing.",
    },
    {
        "key": "invitation",
        "number": 2,
        "title": "Invitation",
        "purpose": "Start conversations and arrange a meeting.",
    },
    {
        "key": "follow_up",
        "number": 3,
        "title": "Follow-up",
        "purpose": "Guide an interested prospect at the right pace.",
    },
    {
        "key": "bond_creation",
        "number": 4,
        "title": "Bond Creation",
        "purpose": "Build trust, listening skills and genuine relationships.",
    },
    {
        "key": "mistakes",
        "number": 5,
        "title": "Mistakes — Do's & Don'ts",
        "purpose": "Avoid common mistakes and keep every conversation professional.",
    },
    {
        "key": "closing",
        "number": 6,
        "title": "Closing",
        "purpose": "Guide prospects toward an informed decision.",
    },
)
CATEGORY_KEYS: tuple[str, ...] = tuple(c["key"] for c in CATEGORIES)
PERSONAL_DEVELOPMENT = "personal_development"

Status = Literal["not_started", "in_progress", "completed"]


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


def _is_admin(user: User) -> bool:
    return (user.role or "").strip().lower() == "admin"


def skill_training_available(user: User) -> bool:
    """Admins always (to manage content); leaders and team only after verified onboarding."""
    if _is_admin(user):
        return True
    if (user.role or "").strip().lower() not in ("leader", "team"):
        return False
    if user.training_required:
        return False
    return (user.training_status or "").strip().lower() in _FINISHED_ONBOARDING


def _status(done: int, total: int) -> Status:
    if done <= 0:
        return "not_started"
    if total > 0 and done >= total:
        return "completed"
    return "in_progress"


async def _onboarding_summary(session: AsyncSession, user: User, available: bool) -> dict:
    """Level 1 progress for the Growth Journey header plus the Day 7 teaser trigger."""
    surface = await build_training_surface(session, int(user.id))
    catalog = [int(v.day_number) for v in surface.videos]
    done_days = {int(p.day_number) for p in surface.progress if p.completed}
    completed_days = sum(1 for d in catalog if d in done_days)
    total_days = len(catalog)
    all_days_done = total_days > 0 and completed_days >= total_days
    final_day_open = bool(surface.videos) and surface.videos[-1].unlocked

    if available:
        status: Status = "completed"
    else:
        status = "in_progress" if completed_days > 0 else "not_started"
    return {
        "status": status,
        "total_days": total_days,
        "completed_days": completed_days,
        "current_day": next((d for d in catalog if d not in done_days), None),
        # Every day is ticked but the test / certificate is still pending.
        "awaiting_certification": all_days_done and not available,
        # Teaser only — never an unlock. Shows once the final day is open.
        "teaser": (not available) and final_day_open and not _is_admin(user),
    }


async def _load_lessons(session: AsyncSession) -> list[SkillLesson]:
    rows = (
        await session.execute(select(SkillLesson).order_by(SkillLesson.position.asc(), SkillLesson.id.asc()))
    ).scalars().all()
    order = {key: i for i, key in enumerate(CATEGORY_KEYS)}
    return sorted(
        (r for r in rows if r.category in order),
        key=lambda r: (order[r.category], r.position, r.id),
    )


async def _load_progress(session: AsyncSession, user_id: int) -> dict[int, SkillLessonProgress]:
    rows = (
        await session.execute(select(SkillLessonProgress).where(SkillLessonProgress.user_id == user_id))
    ).scalars().all()
    return {int(p.lesson_id): p for p in rows}


async def build_skill_training_surface(session: AsyncSession, user: User) -> dict:
    available = skill_training_available(user)
    is_admin = _is_admin(user)
    lessons = await _load_lessons(session)
    progress = await _load_progress(session, int(user.id)) if available else {}
    onboarding = await _onboarding_summary(session, user, available)

    categories = []
    for meta in CATEGORIES:
        own = [l for l in lessons if l.category == meta["key"]]
        rows = []
        for index, lesson in enumerate(own, start=1):
            done = progress.get(int(lesson.id))
            rows.append(
                {
                    "id": int(lesson.id),
                    "number": index,
                    "position": int(lesson.position),
                    "title": lesson.title,
                    "description": lesson.description,
                    "duration_minutes": lesson.duration_minutes,
                    "practice_task": lesson.practice_task,
                    "practice_required": bool(lesson.practice_required),
                    "has_video": bool(lesson.youtube_url),
                    "youtube_url": lesson.youtube_url if is_admin else None,
                    "completed": done is not None,
                    "completed_at": done.completed_at.isoformat() if done else None,
                    "practice_response": done.practice_response if done else None,
                }
            )
        completed = sum(1 for r in rows if r["completed"])
        categories.append(
            {
                **meta,
                "total_lessons": len(rows),
                "completed_lessons": completed,
                "status": _status(completed, len(rows)),
                # Locked: only the outline (title, purpose, count) — no lesson content.
                "lessons": rows if available else [],
            }
        )

    personal = next(c for c in categories if c["key"] == PERSONAL_DEVELOPMENT)
    academy = [c for c in categories if c["key"] != PERSONAL_DEVELOPMENT]
    pd_block = _section([personal], available)
    academy_block = _section(academy, available)
    total = pd_block["total_lessons"] + academy_block["total_lessons"]
    completed_total = pd_block["completed_lessons"] + academy_block["completed_lessons"]
    return {
        "available": available,
        "total_lessons": total,
        "completed_lessons": completed_total,
        # Overall next step: Personal Development first, then the academy.
        "next_lesson_id": pd_block["next_lesson_id"] or academy_block["next_lesson_id"],
        "onboarding": onboarding,
        "personal_development": {**personal, "next_lesson_id": pd_block["next_lesson_id"]},
        "academy": {
            "status": academy_block["status"],
            "total_lessons": academy_block["total_lessons"],
            "completed_lessons": academy_block["completed_lessons"],
            "next_lesson_id": academy_block["next_lesson_id"],
            "categories": academy,
        },
    }


def _section(categories: list[dict], available: bool) -> dict:
    """Totals + first open lesson (with a recording) across a group of categories."""
    total = sum(c["total_lessons"] for c in categories)
    completed = sum(c["completed_lessons"] for c in categories)
    next_lesson_id = next(
        (
            l["id"]
            for c in categories
            for l in c["lessons"]
            if available and not l["completed"] and l["has_video"]
        ),
        None,
    )
    return {
        "status": _status(completed, total) if available else "not_started",
        "total_lessons": total,
        "completed_lessons": completed,
        "next_lesson_id": next_lesson_id,
    }


async def complete_skill_lesson(
    session: AsyncSession,
    user: User,
    lesson_id: int,
    *,
    practice_response: str | None = None,
    now: datetime | None = None,
) -> None:
    """Mark a lesson done (or update its practice answer).

    Raises ``LookupError`` for an unknown lesson and ``ValueError`` with a
    member-facing message when the lesson can't be completed yet.
    """
    if not skill_training_available(user):
        raise ValueError("Personal Development and Skills Academy open after you complete all 7 onboarding days")
    lesson = await session.get(SkillLesson, lesson_id)
    if lesson is None or lesson.category not in CATEGORY_KEYS:
        raise LookupError("Lesson not found")
    if not lesson.youtube_url:
        raise ValueError("This lesson's recording has not been added yet")

    answer = (practice_response or "").strip() or None
    if answer is not None and len(answer) > PRACTICE_MAX_CHARS:
        raise ValueError(f"Keep your practice answer under {PRACTICE_MAX_CHARS} characters")
    if lesson.practice_required and (answer is None or len(answer) < PRACTICE_MIN_CHARS):
        raise ValueError(
            f"Write your practice answer (at least {PRACTICE_MIN_CHARS} characters) to complete this lesson"
        )

    existing = (
        await session.execute(
            select(SkillLessonProgress).where(
                SkillLessonProgress.user_id == int(user.id),
                SkillLessonProgress.lesson_id == lesson_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        # Completion is permanent; a member may only refine their practice answer.
        if answer is not None:
            existing.practice_response = answer
            await session.commit()
        return
    session.add(
        SkillLessonProgress(
            user_id=int(user.id),
            lesson_id=lesson_id,
            practice_response=answer,
            completed_at=now or datetime.now(timezone.utc),
        )
    )
    await session.commit()


async def get_skill_training_overview(session: AsyncSession, *, actor: AuthUser) -> dict:
    """Admin → all members; leader → downline. Tracking only."""
    users = [u for u in await _scope_users(session, actor) if u.role in ("leader", "team")]
    lessons = await _load_lessons(session)
    category_of = {int(l.id): l.category for l in lessons}
    totals = {key: 0 for key in CATEGORY_KEYS}
    for l in lessons:
        totals[l.category] += 1

    user_ids = [int(u.id) for u in users]
    per_user: dict[int, dict] = {}
    if user_ids and category_of:
        rows = (
            await session.execute(
                select(
                    SkillLessonProgress.user_id,
                    SkillLessonProgress.lesson_id,
                    SkillLessonProgress.practice_response,
                    SkillLessonProgress.completed_at,
                ).where(
                    SkillLessonProgress.user_id.in_(user_ids),
                    SkillLessonProgress.lesson_id.in_(list(category_of)),
                )
            )
        ).all()
        for uid, lesson_id, answer, at in rows:
            entry = per_user.setdefault(
                int(uid),
                {"by_category": {k: 0 for k in CATEGORY_KEYS}, "practice": 0, "last": None},
            )
            entry["by_category"][category_of[int(lesson_id)]] += 1
            if answer:
                entry["practice"] += 1
            if entry["last"] is None or at > entry["last"]:
                entry["last"] = at

    members = []
    for u in users:
        entry = per_user.get(int(u.id))
        by_category = entry["by_category"] if entry else {k: 0 for k in CATEGORY_KEYS}
        members.append(
            {
                "user_id": int(u.id),
                "name": display_name_from_user(u) or u.fbo_id,
                "fbo_id": u.fbo_id,
                "role": u.role,
                "available": skill_training_available(u),
                "completed_lessons": sum(by_category.values()),
                "personal_development_completed": by_category[PERSONAL_DEVELOPMENT],
                "academy_completed": sum(v for k, v in by_category.items() if k != PERSONAL_DEVELOPMENT),
                "practice_submitted": entry["practice"] if entry else 0,
                "by_category": by_category,
                "last_completed_at": entry["last"].isoformat() if entry and entry["last"] else None,
            }
        )
    members.sort(key=lambda m: (not m["available"], -m["completed_lessons"], m["name"] or ""))
    return {
        "total_lessons": len(lessons),
        "personal_development_total": totals[PERSONAL_DEVELOPMENT],
        "academy_total": len(lessons) - totals[PERSONAL_DEVELOPMENT],
        "categories": [
            {"key": c["key"], "number": c["number"], "title": c["title"], "total_lessons": totals[c["key"]]}
            for c in CATEGORIES
        ],
        "members": members,
    }
