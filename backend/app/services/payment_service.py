"""Payment proof upload and approval service."""

from __future__ import annotations

from datetime import datetime
from typing import List, Tuple

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.repositories.payment_repository import PaymentRepository


class PaymentService:
    """Payment proof processing and approval service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PaymentRepository(session)

    async def upload_payment_proof(self, file: UploadFile) -> str:
        """Upload payment proof file and return URL."""
        filename = f"payment_proofs/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        # TODO: Implement actual file upload to S3 / local storage
        return f"https://storage.example.com/{filename}"

    async def process_payment_proof(
        self,
        lead_id: int,
        payment_amount_cents: int,
        proof_url: str,
        notes: str | None,
        uploaded_by_user_id: int,
    ) -> Tuple[bool, str]:
        """Process uploaded payment proof."""
        lead = await self.repo.get_lead_by_id(lead_id)
        if not lead:
            return False, "Lead not found"

        if lead.status not in ["video_watched", "paid"]:
            return False, "Payment proof can only be uploaded for video_watched or paid leads"

        lead.payment_amount_cents = payment_amount_cents
        lead.payment_proof_url = proof_url
        lead.payment_proof_uploaded_at = datetime.utcnow()
        lead.payment_status = "pending_approval"

        await self._log_payment_activity(
            lead_id, uploaded_by_user_id, "payment_proof_uploaded", notes
        )

        await self.session.commit()
        return True, "Payment proof uploaded successfully"

    async def approve_payment_proof(
        self, lead_id: int, approved_by_user_id: int
    ) -> Tuple[bool, str]:
        """Approve payment proof."""
        lead = await self.repo.get_lead_by_id(lead_id)
        if not lead:
            return False, "Lead not found"

        if lead.payment_status != "pending_approval":
            return False, "Payment proof is not pending approval"

        lead.payment_status = "approved"
        if lead.status != "paid":
            lead.status = "paid"

        await self._log_payment_activity(lead_id, approved_by_user_id, "payment_proof_approved")
        await self.session.commit()
        return True, "Payment proof approved"

    async def reject_payment_proof(
        self, lead_id: int, rejection_reason: str, rejected_by_user_id: int
    ) -> Tuple[bool, str]:
        """Reject payment proof."""
        lead = await self.repo.get_lead_by_id(lead_id)
        if not lead:
            return False, "Lead not found"

        if lead.payment_status != "pending_approval":
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
        leads = await self.repo.get_pending_proofs(user_id, user_role)

        return [
            {
                "lead_id": lead.id,
                "lead_name": lead.name,
                "payment_amount_cents": lead.payment_amount_cents,
                "payment_proof_url": lead.payment_proof_url,
                "payment_proof_uploaded_at": lead.payment_proof_uploaded_at,
                "uploaded_by_user_id": lead.assigned_to_user_id,
            }
            for lead in leads
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
