"""Payment proof upload and approval service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Tuple

from fastapi import UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services.downline import is_user_in_downline_of, lead_visible_to_leader_clause
from app.services.payment_proof_storage import save_payment_proof_file


class PaymentService:
    """Payment proof processing and approval service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

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
            return await is_user_in_downline_of(
                self.session,
                lead.created_by_user_id,
                actor_user_id,
            )
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

        if lead.status not in ["video_watched", "paid"]:
            return False, "Payment proof can only be uploaded for video_watched or paid leads"

        lead.payment_amount_cents = payment_amount_cents
        lead.payment_proof_url = proof_url
        lead.payment_proof_uploaded_at = datetime.now(timezone.utc)
        lead.payment_status = "proof_uploaded"

        await self._log_payment_activity(
            lead_id, uploaded_by_user_id, "payment_proof_uploaded", notes
        )

        await self.session.commit()
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

        if lead.payment_status != "proof_uploaded":
            return False, "Payment proof is not pending approval"
        if not (lead.payment_proof_url or "").strip():
            return False, "Payment proof file is missing"

        lead.payment_status = "approved"

        if lead.status == "video_watched":
            lead.status = "paid"
        if lead.status == "paid":
            lead.mindset_lock_state = "mindset_lock"
            if lead.mindset_started_at is None:
                lead.mindset_started_at = datetime.now(timezone.utc)
            lead.mindset_completed_at = None
            lead.mindset_completed_by_user_id = None
            lead.mindset_leader_user_id = None

        await self._log_payment_activity(
            lead_id, approved_by_user_id, "payment_proof_approved"
        )

        await self.session.commit()
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

        if lead.payment_status != "proof_uploaded":
            return False, "Payment proof is not pending approval"

        lead.payment_status = "rejected"

        await self._log_payment_activity(
            lead_id, rejected_by_user_id, "payment_proof_rejected", rejection_reason
        )
        await self.session.commit()
        return True, "Payment proof rejected"

    async def get_pending_payment_proofs(
        self, user_id: int, user_role: str
    ) -> List[dict]:
        """Get pending payment proofs for approval."""
        if user_role == "admin":
            where_clause = Lead.payment_status == "proof_uploaded"
        elif user_role == "leader":
            where_clause = (
                Lead.payment_status == "proof_uploaded",
                or_(
                    Lead.assigned_to_user_id == user_id,
                    lead_visible_to_leader_clause(user_id),
                ),
            )
        else:
            return []

        q = await self.session.execute(
            select(Lead, User.username)
            .outerjoin(User, User.id == Lead.assigned_to_user_id)
            .where(
                Lead.payment_proof_url.isnot(None),
                Lead.payment_proof_url != "",
                *([where_clause] if not isinstance(where_clause, tuple) else list(where_clause)),
            )
            .order_by(Lead.payment_proof_uploaded_at.desc(), Lead.id.desc())
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
                "status": "pending",
            }
            for lead, username in rows
        ]

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
