"""DB access layer for payments — no business logic here."""
from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.payment import Payment, PaymentStatus


class PaymentRepository:

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_lead_assigned_to_user(
        self, lead_id: int, user_id: int
    ) -> Lead | None:
        r = await self.session.execute(
            select(Lead).where(
                and_(
                    Lead.id == lead_id,
                    Lead.assigned_to_user_id == user_id,
                )
            )
        )
        return r.scalar_one_or_none()

    async def get_active_payment(self, lead_id: int) -> Payment | None:
        r = await self.session.execute(
            select(Payment).where(
                and_(
                    Payment.lead_id == lead_id,
                    Payment.status.in_(
                        [PaymentStatus.INITIATED, PaymentStatus.VERIFIED]
                    ),
                )
            )
        )
        return r.scalar_one_or_none()

    async def get_payment_by_any_id(self, payment_id: str) -> Payment | None:
        r = await self.session.execute(
            select(Payment).where(
                or_(
                    Payment.id == payment_id,
                    Payment.razorpay_order_id == payment_id,
                    Payment.razorpay_payment_id == payment_id,
                )
            )
        )
        return r.scalar_one_or_none()

    async def save(self, payment: Payment) -> Payment:
        self.session.add(payment)
        await self.session.flush()
        return payment

    async def get_lead_by_id(self, lead_id: int) -> Lead | None:
        r = await self.session.execute(select(Lead).where(Lead.id == lead_id))
        return r.scalar_one_or_none()

    async def get_pending_proofs(self, user_id: int, role: str) -> list[Lead]:
        r = await self.session.execute(
            select(Lead)
            .where(Lead.payment_status == "pending_approval")
            .order_by(Lead.payment_proof_uploaded_at.desc())
        )
        return list(r.scalars().all())
