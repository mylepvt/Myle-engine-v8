"""App setup per member: is Myle installed on their phone, are notifications on?

The app reports its own state (``record_device_status``) each time it opens;
"notifications on" is confirmed server-side by a saved push subscription.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.models.user_device_status import UserDeviceStatus

PLATFORMS = ("ios", "android", "desktop")
PERMISSIONS = ("granted", "denied", "default", "unsupported")


async def record_device_status(
    session: AsyncSession, *, user_id: int, platform: str, standalone: bool, push_permission: str
) -> None:
    values = {
        "platform": platform if platform in PLATFORMS else "desktop",
        "standalone": bool(standalone),
        "push_permission": push_permission if push_permission in PERMISSIONS else "default",
        "updated_at": datetime.now(timezone.utc),
    }
    # One atomic upsert: the app reports from two places at once on first open, and a
    # plain "insert if missing" would make the second request fail on the unique key.
    dialect = session.bind.dialect.name if session.bind is not None else ""
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as dialect_insert
    else:
        from sqlalchemy.dialects.sqlite import insert as dialect_insert
    stmt = dialect_insert(UserDeviceStatus).values(user_id=user_id, **values)
    stmt = stmt.on_conflict_do_update(index_elements=[UserDeviceStatus.user_id], set_=values)
    await session.execute(stmt)
    await session.commit()


def _notifications(user: User, subs: int, status: UserDeviceStatus | None) -> str:
    if subs > 0 and user.push_notifications_enabled:
        return "on"
    if status is not None and status.push_permission == "denied":
        return "blocked"
    return "off"


async def build_app_setup(session: AsyncSession) -> dict:
    users = (
        await session.execute(
            select(User)
            .where(
                User.role.in_(("team", "leader")),
                User.removed_at.is_(None),
                User.registration_status == "approved",
            )
            .order_by(User.name)
        )
    ).scalars().all()
    ids = [u.id for u in users]
    subs = dict(
        (
            await session.execute(
                select(PushSubscription.user_id, func.count(PushSubscription.id))
                .where(PushSubscription.user_id.in_(ids or [-1]))
                .group_by(PushSubscription.user_id)
            )
        ).all()
    )
    statuses = {
        s.user_id: s
        for s in (
            await session.execute(select(UserDeviceStatus).where(UserDeviceStatus.user_id.in_(ids or [-1])))
        ).scalars()
    }
    members = []
    for u in users:
        st = statuses.get(u.id)
        app = "unknown" if st is None else ("installed" if st.standalone else "browser")
        notif = _notifications(u, int(subs.get(u.id, 0)), st)
        members.append(
            {
                "user_id": u.id,
                "name": u.name or u.username or u.fbo_id,
                "role": u.role,
                "app": app,
                "platform": st.platform if st else None,
                "notifications": notif,
                "ready": app == "installed" and notif == "on",
                "checked_at": st.updated_at.isoformat() if st and st.updated_at else None,
            }
        )
    # Not ready first, so the admin sees who to chase.
    members.sort(key=lambda m: (m["ready"], (m["name"] or "").lower()))
    return {
        "total": len(members),
        "ready": sum(1 for m in members if m["ready"]),
        "installed": sum(1 for m in members if m["app"] == "installed"),
        "notifications_on": sum(1 for m in members if m["notifications"] == "on"),
        "members": members,
    }
