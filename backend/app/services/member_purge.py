"""Permanently delete a member's identity (admin "Delete permanently").

The ``users`` row itself must stay: 54 foreign keys point at it and ~23 of them
(leads, wallet ledger, invoices, sales, …) are RESTRICT, and lead ownership is
immutable by design. So "permanent delete" = irreversibly erase everything that
identifies the person and free their FBO ID / email / phone for re-use, while
money, sales and report history stay attached to an anonymous
"Deleted member #<id>" row.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.password_reset_token import PasswordResetToken
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.user_hierarchy import nearest_leader_for_user

# Purged rows get this FBO prefix; list endpoints use it to hide them.
PURGED_FBO_PREFIX = "deleted-"


def is_purged(user: User) -> bool:
    return user.fbo_id.startswith(PURGED_FBO_PREFIX)


@dataclass
class PurgeResult:
    leads_moved: int
    leads_moved_to_user_id: int
    downline_moved: int


async def purge_member(session: AsyncSession, *, target: User, actor_user_id: int) -> PurgeResult:
    """Erase ``target``'s identity. Caller commits. Irreversible."""
    now = datetime.now(timezone.utc)

    # 1. Leads they are working go to the nearest leader above them (else the admin).
    #    Ownership stays — owner_user_id is immutable by design.
    leader = await nearest_leader_for_user(session, target.upline_user_id)
    new_assignee = leader.id if leader is not None and leader.id != target.id else actor_user_id
    leads = (
        await session.execute(
            select(Lead).where(Lead.assigned_to_user_id == target.id, Lead.deleted_at.is_(None))
        )
    ).scalars().all()
    for lead in leads:
        lead.assigned_to_user_id = new_assignee
        lead.is_reassigned = True
        lead.reassigned_at = now
        enqueue_lead_shadow_upsert(session, lead)
        session.add(
            ActivityLog(
                user_id=actor_user_id,
                action="lead.reassigned",
                entity_type="lead",
                entity_id=lead.id,
                meta={"reason": "member_permanently_deleted", "from_user_id": target.id, "to_user_id": new_assignee},
            )
        )

    # 2. Their direct team moves up one level so the tree stays connected.
    downline = await session.execute(
        update(User)
        .where(User.upline_user_id == target.id)
        .values(upline_user_id=target.upline_user_id)
    )

    # 3. Kill any way back in.
    await session.execute(delete(PushSubscription).where(PushSubscription.user_id == target.id))
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == target.id))
    await session.execute(delete(UserPresenceSession).where(UserPresenceSession.user_id == target.id))

    # 4. Erase identity; free FBO ID / email / phone for re-registration.
    target.fbo_id = f"{PURGED_FBO_PREFIX}{target.id}"
    target.email = f"{PURGED_FBO_PREFIX}{target.id}@deleted.invalid"
    target.username = None
    target.phone = None
    target.name = f"Deleted member #{target.id}"
    target.hashed_password = None
    target.avatar_url = None
    target.certificate_url = None
    target.access_blocked = True
    target.discipline_status = "removed"
    target.removed_at = target.removed_at or now
    target.removed_by_user_id = actor_user_id
    target.removal_reason = "Permanently deleted by admin."
    target.grace_end_date = None
    target.grace_reason = None
    target.grace_request_end_date = None
    target.grace_request_reason = None
    target.grace_request_requested_at = None
    target.push_notifications_enabled = False
    target.whatsapp_notifications_enabled = False

    session.add(
        ActivityLog(
            user_id=actor_user_id,
            action="member.permanently_deleted",
            entity_type="user",
            entity_id=target.id,
            meta={"leads_moved": len(leads), "leads_moved_to_user_id": new_assignee},
        )
    )
    return PurgeResult(
        leads_moved=len(leads),
        leads_moved_to_user_id=new_assignee,
        downline_moved=int(downline.rowcount or 0),
    )
