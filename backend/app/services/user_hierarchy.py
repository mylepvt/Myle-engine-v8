from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

_MAX_UPLINE_WALK = 64


@dataclass(frozen=True)
class UserHierarchyEntry:
    id: int
    role: str
    upline_user_id: int | None
    name: str | None
    username: str | None
    email: str | None

    @property
    def display_name(self) -> str:
        if self.name and self.name.strip():
            return self.name.strip()
        if self.username and self.username.strip():
            return self.username.strip()
        local = (self.email or "").split("@", 1)[0].strip()
        return local or "User"


async def load_user_hierarchy_entries(
    session: AsyncSession,
    user_ids: Iterable[int | None],
) -> dict[int, UserHierarchyEntry]:
    """Load the requested users plus their uplines so leader lookup can be resolved in memory."""
    pending = {int(user_id) for user_id in user_ids if user_id is not None}
    entries: dict[int, UserHierarchyEntry] = {}
    queried: set[int] = set()

    while pending:
        batch = pending - queried
        if not batch:
            break
        queried.update(batch)
        rows = (
            await session.execute(
                select(
                    User.id,
                    User.role,
                    User.upline_user_id,
                    User.name,
                    User.username,
                    User.email,
                ).where(User.id.in_(batch))
            )
        ).all()
        pending = set()
        for user_id, role, upline_user_id, name, username, email in rows:
            entry = UserHierarchyEntry(
                id=int(user_id),
                role=str(role or ""),
                upline_user_id=int(upline_user_id) if upline_user_id is not None else None,
                name=name,
                username=username,
                email=email,
            )
            entries[entry.id] = entry
            if entry.upline_user_id is not None and entry.upline_user_id not in entries:
                pending.add(entry.upline_user_id)

    return entries


def nearest_leader_entry(
    start_user_id: int | None,
    entries: Mapping[int, UserHierarchyEntry],
) -> UserHierarchyEntry | None:
    """Return the nearest leader in the upline chain; a leader resolves to self."""
    if start_user_id is None:
        return None

    current = int(start_user_id)
    seen: set[int] = set()
    while current not in seen:
        seen.add(current)
        entry = entries.get(current)
        if entry is None:
            return None
        role = (entry.role or "").strip().lower()
        if role == "leader":
            return entry
        if role == "admin" or entry.upline_user_id is None:
            return None
        current = int(entry.upline_user_id)
    return None


async def recursive_downline_user_ids(
    session: AsyncSession,
    leader_user_id: int,
) -> list[int]:
    """Strict descendants of `leader_user_id` in the org tree."""
    tree = (
        select(User.id)
        .where(User.upline_user_id == leader_user_id)
        .cte(name="user_hierarchy_downline_tree", recursive=True)
    )
    tree = tree.union_all(select(User.id).where(User.upline_user_id == tree.c.id))
    rows = await session.execute(select(tree.c.id))
    return [int(uid) for uid in rows.scalars().all()]


async def is_user_in_downline_of(
    session: AsyncSession,
    member_user_id: int,
    leader_user_id: int,
) -> bool:
    """True if `member_user_id` is a strict descendant of `leader_user_id`."""
    if member_user_id == leader_user_id:
        return False
    current: int | None = member_user_id
    for _ in range(_MAX_UPLINE_WALK):
        parent = (
            await session.execute(select(User.upline_user_id).where(User.id == current))
        ).scalar_one_or_none()
        if parent is None:
            return False
        if int(parent) == leader_user_id:
            return True
        current = int(parent)
    return False


async def nearest_leader_for_user(
    session: AsyncSession,
    start_user_id: int | None,
) -> UserHierarchyEntry | None:
    if start_user_id is None:
        return None
    entries = await load_user_hierarchy_entries(session, [start_user_id])
    return nearest_leader_entry(start_user_id, entries)


async def nearest_leader_username_for_user_id(
    session: AsyncSession,
    user_id: int | None,
) -> str | None:
    leader = await nearest_leader_for_user(session, user_id)
    return (leader.username or "").strip() or None if leader is not None else None


async def resolve_user_id_by_username(
    session: AsyncSession,
    username: str | None,
) -> int | None:
    raw = (username or "").strip()
    if not raw:
        return None
    row = (
        await session.execute(select(User.id).where(User.username == raw).limit(1))
    ).scalar_one_or_none()
    return int(row) if row is not None else None


async def nearest_leader_username_for_username(
    session: AsyncSession,
    username: str | None,
) -> str | None:
    user_id = await resolve_user_id_by_username(session, username)
    if user_id is None:
        return None
    return await nearest_leader_username_for_user_id(session, user_id)
