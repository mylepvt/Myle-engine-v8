"""Team wins feed — record wins, list them with cheers, toggle a cheer.

Wins never include a lead's name (privacy); the text is about the member.
All copy is English (app UI rule).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.person_name import person_name
from app.core.time_ist import IST
from app.models.user import User
from app.models.win import Win, WinCheer
from app.services.live_metrics import ist_day_bounds

logger = logging.getLogger(__name__)

# Winner hears about cheers on these counts only — recognition without spam.
CHEER_PUSH_AT = frozenset({1, 5, 10, 25})

KINDS = ("enrollment", "conversion", "level_up", "streak")

_NOUN = {
    "enrollment": "enrollment",
    "conversion": "conversion",
    "level_up": "level up",
    "streak": "streak",
}


def win_text(kind: str, name: str, detail: str | None) -> str:
    if kind == "enrollment":
        return f"{name} enrolled a new prospect"
    if kind == "conversion":
        return f"{name} converted a lead"
    if kind == "level_up":
        return f"{name} reached {(detail or '').title()} level"
    if kind == "streak":
        return f"{name} is on a {detail}-day streak"
    return f"{name} had a win"


def record_win(session: AsyncSession, *, user_id: int, kind: str, detail: str | None = None) -> None:
    """Queue a win in the caller's transaction (caller commits). Never raises."""
    if kind not in KINDS:
        return
    session.add(Win(user_id=user_id, kind=kind, detail=detail))


def _iso_utc(dt: datetime) -> str:
    # SQLite hands back naive datetimes; they are UTC.
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _first_name(user: User) -> str:
    raw = person_name(user.name or user.username or user.fbo_id or "A teammate")
    return raw.split(" ")[0]


async def list_wins(session: AsyncSession, *, viewer_id: int, limit: int = 20) -> list[dict]:
    # Today's wins only (IST) — the home screen is about today.
    since, _ = ist_day_bounds(datetime.now(timezone.utc).astimezone(IST).date())
    cheers = (
        select(WinCheer.win_id, func.count(WinCheer.id).label("n"))
        .group_by(WinCheer.win_id)
        .subquery()
    )
    mine = select(WinCheer.win_id).where(WinCheer.user_id == viewer_id).subquery()
    rows = (
        await session.execute(
            select(Win, User, func.coalesce(cheers.c.n, 0), mine.c.win_id)
            .join(User, User.id == Win.user_id)
            .outerjoin(cheers, cheers.c.win_id == Win.id)
            .outerjoin(mine, mine.c.win_id == Win.id)
            .where(Win.created_at >= since, User.removed_at.is_(None))
            .order_by(Win.created_at.desc(), Win.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": win.id,
            "kind": win.kind,
            "user_id": user.id,
            "name": _first_name(user),
            "text": win_text(win.kind, _first_name(user), win.detail),
            "created_at": _iso_utc(win.created_at),
            "cheers": int(n or 0),
            "cheered_by_me": my_cheer is not None,
            "is_mine": user.id == viewer_id,
        }
        for win, user, n, my_cheer in rows
    ]


async def toggle_cheer(session: AsyncSession, *, win_id: int, user_id: int) -> dict | None:
    """Cheer / un-cheer a win. Returns {cheered, cheers} or None if the win is gone."""
    win = await session.get(Win, win_id)
    if win is None:
        return None
    existing = (
        await session.execute(
            select(WinCheer.id).where(WinCheer.win_id == win_id, WinCheer.user_id == user_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        await session.execute(delete(WinCheer).where(WinCheer.id == existing))
        cheered = False
    else:
        session.add(WinCheer(win_id=win_id, user_id=user_id))
        cheered = True
    await session.flush()
    count = int(
        (await session.execute(select(func.count(WinCheer.id)).where(WinCheer.win_id == win_id))).scalar_one()
    )
    await session.commit()

    if cheered and win.user_id != user_id and count in CHEER_PUSH_AT:
        try:
            from app.services.push_service import send_push_to_user

            cheerer = await session.get(User, user_id)
            who = _first_name(cheerer) if cheerer else "A teammate"
            body = (
                f"{who} cheered your {_NOUN.get(win.kind, 'win')}."
                if count == 1
                else f"{count} teammates have cheered your {_NOUN.get(win.kind, 'win')}."
            )
            await send_push_to_user(session, win.user_id, title="Your team noticed", body=body, url="/dashboard")
        except Exception as exc:  # noqa: BLE001 — a push failure must not undo the cheer
            logger.warning("Cheer push failed win_id=%s: %s", win_id, exc)
    return {"cheered": cheered, "cheers": count}
