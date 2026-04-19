from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.org_repository import OrgRepository, OrgUserRow


class OrgTreeService:
    """Build org hierarchy tree in memory from a single user query."""

    def __init__(self, session: AsyncSession) -> None:
        self.repository = OrgRepository(session)

    async def get_tree_for_user(
        self,
        *,
        actor_user_id: int,
        actor_role: str,
        include_inactive: bool,
    ) -> list[dict[str, Any]]:
        users = await self.repository.list_users_for_tree(include_inactive=include_inactive)
        if not users:
            return []

        users_by_id: dict[int, OrgUserRow] = {u.id: u for u in users}
        children_map: dict[int | None, list[int]] = defaultdict(list)
        for user in users:
            parent_id = user.upline_user_id if user.upline_user_id in users_by_id else None
            children_map[parent_id].append(user.id)

        for parent_id in children_map:
            children_map[parent_id].sort(key=lambda uid: users_by_id[uid].name.lower())

        if actor_role == "admin":
            root_ids = children_map.get(None, [])
            return [self._build_subtree(root_id, users_by_id, children_map) for root_id in root_ids]

        actor = users_by_id.get(actor_user_id)
        if actor is None:
            return []

        if actor_role == "leader":
            return [self._build_subtree(actor.id, users_by_id, children_map)]

        # Team visibility: self + direct reports only.
        return [self._build_subtree(actor.id, users_by_id, children_map, max_depth=1)]

    def _build_subtree(
        self,
        root_id: int,
        users_by_id: dict[int, OrgUserRow],
        children_map: dict[int | None, list[int]],
        *,
        max_depth: int | None = None,
    ) -> dict[str, Any]:
        def count_descendants(node: dict[str, Any]) -> int:
            total = 0
            for child in node["children"]:
                total += 1 + count_descendants(child)
            return total

        def walk(user_id: int, depth: int, seen: set[int]) -> dict[str, Any]:
            user = users_by_id[user_id]
            node: dict[str, Any] = {
                "id": user.id,
                "name": user.name,
                "fbo_id": user.fbo_id,
                "role": user.role,
                "team_size": 0,
                "children": [],
            }

            # Defensive cycle guard for malformed upline data.
            if user_id in seen:
                return node
            next_seen = set(seen)
            next_seen.add(user_id)

            if max_depth is not None and depth >= max_depth:
                return node

            child_ids = children_map.get(user_id, [])
            node["children"] = [walk(child_id, depth + 1, next_seen) for child_id in child_ids]
            node["team_size"] = count_descendants(node)
            return node

        return walk(root_id, 0, set())
