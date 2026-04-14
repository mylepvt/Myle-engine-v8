from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@dataclass(frozen=True)
class OrgUserRow:
    id: int
    name: str
    role: str
    upline_user_id: int | None


class OrgRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_users_for_tree(self, *, include_inactive: bool) -> list[OrgUserRow]:
        stmt = select(
            User.id,
            User.name,
            User.username,
            User.fbo_id,
            User.role,
            User.upline_user_id,
        ).order_by(User.id.asc())

        if not include_inactive:
            stmt = stmt.where(
                and_(
                    User.access_blocked.is_(False),
                    User.registration_status == "approved",
                    User.discipline_status == "active",
                )
            )

        rows = (await self.session.execute(stmt)).all()
        out: list[OrgUserRow] = []
        for uid, name, username, fbo_id, role, upline_user_id in rows:
            display_name = (name or username or fbo_id or f"user_{int(uid)}").strip()
            out.append(
                OrgUserRow(
                    id=int(uid),
                    name=display_name,
                    role=str(role),
                    upline_user_id=int(upline_user_id) if upline_user_id is not None else None,
                )
            )
        return out
