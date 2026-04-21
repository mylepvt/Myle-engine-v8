"""Payment proof upload and approval service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Tuple

from fastapi import UploadFile
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.downline import (
    is_user_in_downline_of,
    lead_execution_visible_to_leader_clause,
    lead_visible_to_leader_clause,
)
from app.services.payment_proof_storage import save_payment_proof_file


class PaymentService:
    """Payment proof processing and approval service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _commit_with_shadow_upsert(self, lead: Lead) -> None:
        await self.session.flush()
        enqueue_lead_shadow_upsert(self.session, lead)
        await self.session.commit()

    async def upload_payment_proof(self, file: UploadFile, *, lead_id: int) -> str:
        """Upload payment proof file and return URL."""
        ok, result = await save_payment_proof_file(lead_id=lead_id, file=file)
        if not ok:
            raise ValueError(result)
        return result

    async def _can_access_lead(
        self,
        lead: Lead,
        *,
        actor_user_id: int,
        actor_role: str,
    ) -> bool:
        if actor_role == "admin":
            return True
        if lead.created_by_user_id == actor_user_id or lead.assigned_to_user_id == actor_user_id:
            return True
        if actor_role == "leader":
            if await is_user_in_downline_of(
                self.session,
                lead.created_by_user_id,
                actor_user_id,
            ):
                return True
            assignee = lead.assigned_to_user_id
            if assignee is not None and await is_user_in_downline_of(
                self.session,
                assignee,
                actor_user_id,
            ):
                return True
            return False
        return False

    async def process_payment_proof(
        self,
        lead_id: int,
        payment_amount_cents: int,
        proof_url: str,
        notes: str | None,
        uploaded_by_user_id: int,
        uploaded_by_role: str,
    ) -> Tuple[bool, str]:
        """Process uploaded payment proof."""
        lead = await self.session.get(Lead, lead_id)
        if not lead:
            return False, "Lead not found"
        if not await self._can_access_lead(
            lead,
            actor_user_id=uploaded_by_user_id,
            actor_role=uploaded_by_role,
        ):
            return False, "Access denied"
        if lead.payment_proof_url and lead.payment_status == "approved":
            return False, "Payment proof is already approved"
        if lead.payment_proof_url and lead.payment_status == "proof_uploaded":
            return False, "Payment proof is already pending review"

        lead.payment_amount_cents = payment_amount_cents
        lead.payment_proof_url = proof_url
        lead.payment_proof_uploaded_at = datetime.now(timezone.utc)
        lead.payment_status = "proof_uploaded"

        await self._log_payment_activity(
            lead_id, uploaded_by_user_id, "payment_proof_uploaded", notes
        )

        await self._commit_with_shadow_upsert(lead)
        return True, "Payment proof uploaded successfully"

    async def approve_payment_proof(
        self,
        lead_id: int,
        approved_by_user_id: int,
        approved_by_role: str,
    ) -> Tuple[bool, str]:
        """Approve payment proof."""
        lead = await self.session.get(Lead, lead_id)
        if not lead:
            return False, "Lead not found"
        if not await self._can_access_lead(
            lead,
            actor_user_id=approved_by_user_id,
            actor_role=approved_by_role,
        ):
            return False, "Access denied"

        if not (lead.payment_proof_url or "").strip():
            return False, "Payment proof file is missing"
        if lead.payment_status == "approved":
            return False, "Payment proof is already approved"
        if lead.payment_status != "proof_uploaded":
            return False, "Payment proof is not pending approval"

        now = datetime.now(timezone.utc)
        prev_status = lead.status
        lead.payment_status = "approved"

        if lead.status == "video_watched":
            lead.status = "paid"
        if lead.status == "paid":
            lead.mindset_lock_state = None
            lead.mindset_started_at = None
            lead.mindset_completed_at = None
            lead.mindset_completed_by_user_id = None
            lead.mindset_leader_user_id = None
        if lead.status != prev_status:
            lead.last_action_at = now

        await self._log_payment_activity(
            lead_id, approved_by_user_id, "payment_proof_approved"
        )

        await self._commit_with_shadow_upsert(lead)
        return True, "Payment proof approved"

    async def reject_payment_proof(
        self,
        lead_id: int,
        rejection_reason: str,
        rejected_by_user_id: int,
        rejected_by_role: str,
    ) -> Tuple[bool, str]:
        """Reject payment proof."""
        lead = await self.session.get(Lead, lead_id)
        if not lead:
            return False, "Lead not found"
        if not await self._can_access_lead(
            lead,
            actor_user_id=rejected_by_user_id,
            actor_role=rejected_by_role,
        ):
            return False, "Access denied"

        if not (lead.payment_proof_url or "").strip():
            return False, "Payment proof file is missing"
        if lead.payment_status != "proof_uploaded":
            return False, "Payment proof is not pending approval"

        lead.payment_status = "rejected"

        await self._log_payment_activity(
            lead_id, rejected_by_user_id, "payment_proof_rejected", rejection_reason
        )
        await self._commit_with_shadow_upsert(lead)
        return True, "Payment proof rejected"

    async def get_pending_payment_proofs(
        self, user_id: int, user_role: str
    ) -> List[dict]:
        """Get pending payment proofs for approval."""
        if user_role == "admin":
            # Only actionable proofs: uploaded but not yet approved or rejected.
            # Rejected proofs require team to re-upload before admin can act.
            where_clause = and_(
                Lead.deleted_at.is_(None),
                Lead.payment_proof_url.isnot(None),
                Lead.payment_proof_url != "",
                Lead.payment_status == "proof_uploaded",
            )
        elif user_role == "leader":
            # Include leads assigned to anyone in the downline (e.g. admin/pool-created
            # leads claimed by a team member), not only leads created within the tree.
            where_parts = [
                Lead.payment_proof_url.isnot(None),
                Lead.payment_proof_url != "",
                Lead.payment_status == "proof_uploaded",
                or_(
                    lead_visible_to_leader_clause(user_id),
                    lead_execution_visible_to_leader_clause(user_id),
                ),
            ]
        else:
            return []

        if user_role == "admin":
            where_parts = [where_clause]
        q = await self.session.execute(
            select(Lead, User.username)
            .outerjoin(User, User.id == Lead.assigned_to_user_id)
            .where(*where_parts)
            .order_by(
                func.coalesce(Lead.payment_proof_uploaded_at, Lead.created_at).desc(),
                Lead.id.desc(),
            )
        )
        rows = q.all()

        return [
            {
                "lead_id": lead.id,
                "lead_name": lead.name,
                "lead_phone": lead.phone,
                "payment_amount_cents": lead.payment_amount_cents,
                "payment_proof_url": lead.payment_proof_url,
                "payment_proof_uploaded_at": lead.payment_proof_uploaded_at,
                "uploaded_by_user_id": lead.assigned_to_user_id,
                "uploaded_by_username": username,
                "status": lead.payment_status or "proof_uploaded",
            }
            for lead, username in rows
        ]

    async def get_payment_proof_history(
        self,
        user_id: int,
        user_role: str,
        *,
        reviewed_after: datetime,
        reviewed_before: datetime,
        limit: int,
        offset: int,
    ) -> tuple[List[dict], int]:
        """Calendar-day approval / rejection history for proofs."""
        if user_role not in ("admin", "leader"):
            return [], 0

        uploaded_by = aliased(User, name="uploaded_by")
        reviewed_by = aliased(User, name="reviewed_by")

        where_parts = [
            Lead.deleted_at.is_(None),
            ActivityLog.entity_type == "lead",
            ActivityLog.action.in_(("payment_proof_approved", "payment_proof_rejected")),
            ActivityLog.created_at >= reviewed_after,
            ActivityLog.created_at < reviewed_before,
        ]
        if user_role == "leader":
            where_parts.append(
                or_(
                    lead_visible_to_leader_clause(user_id),
                    lead_execution_visible_to_leader_clause(user_id),
                )
            )

        count_stmt = (
            select(func.count())
            .select_from(ActivityLog)
            .join(Lead, Lead.id == ActivityLog.entity_id)
            .where(*where_parts)
        )
        total = int((await self.session.execute(count_stmt)).scalar_one())

        stmt = (
            select(
                ActivityLog,
                Lead,
                uploaded_by.username.label("uploaded_by_username"),
                reviewed_by.id.label("reviewed_by_user_id"),
                reviewed_by.username.label("reviewed_by_username"),
            )
            .join(Lead, Lead.id == ActivityLog.entity_id)
            .outerjoin(uploaded_by, uploaded_by.id == Lead.assigned_to_user_id)
            .outerjoin(reviewed_by, reviewed_by.id == ActivityLog.user_id)
            .where(*where_parts)
            .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()

        items: list[dict] = []
        for activity, lead, uploaded_by_username, reviewed_by_user_id, reviewed_by_username in rows:
            action = "approved" if activity.action == "payment_proof_approved" else "rejected"
            meta = activity.meta if isinstance(activity.meta, dict) else {}
            note = meta.get("notes")
            items.append(
                {
                    "lead_id": lead.id,
                    "lead_name": lead.name,
                    "lead_phone": lead.phone,
                    "payment_amount_cents": lead.payment_amount_cents,
                    "payment_proof_url": lead.payment_proof_url,
                    "payment_proof_uploaded_at": lead.payment_proof_uploaded_at,
                    "uploaded_by_user_id": lead.assigned_to_user_id,
                    "uploaded_by_username": uploaded_by_username,
                    "status": lead.payment_status or action,
                    "reviewed_at": activity.created_at,
                    "reviewed_by_user_id": reviewed_by_user_id,
                    "reviewed_by_username": reviewed_by_username,
                    "review_action": action,
                    "review_note": str(note).strip() if isinstance(note, str) and note.strip() else None,
                }
            )
        return items, total

    async def _log_payment_activity(
        self, lead_id: int, user_id: int, action: str, notes: str | None = None
    ) -> None:
        """Audit trail + admin dashboard counts (IST day buckets)."""
        meta = {"notes": notes} if notes else None
        self.session.add(
            ActivityLog(
                user_id=user_id,
                action=action,
                entity_type="lead",
                entity_id=lead_id,
                meta=meta,
            ),
        )
