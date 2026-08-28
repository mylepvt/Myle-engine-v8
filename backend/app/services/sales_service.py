"""CC/sale billing engine — upload → OCR → hybrid auto-verify → scoped rollups.

Lifecycle per (lead, billing_stage):
1. A team member / leader / admin uploads the FOREVER Tax Invoice image.
2. Tesseract OCR + regex parse extracts case credits, rupee total, invoice no.,
   FBO id, date (see ``forever_invoice_ocr``).
3. The verify engine checks business rules + OCR confidence. All pass → the row
   is auto-approved (``auto_verified=True``). Otherwise it lands ``pending`` with
   ``verify_notes`` and waits for an admin in the approvals queue.
4. Approved rows roll up onto the role-scoped CC dashboard (team own / leader
   downline / admin all) via the ``owner_user_id`` snapshot.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, Tuple

from fastapi import UploadFile
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.lead_sale import LeadSale
from app.models.user import User
from app.core.realtime_hub import notify_topics
from app.core.time_ist import IST, today_ist
from app.schemas.sales import SaleApproveRequest, SaleManualFields
from app.services.downline import (
    is_user_in_downline_of,
    lead_execution_visible_to_leader_clause,
    lead_visible_to_leader_clause,
    recursive_downline_user_ids,
)
from app.services.forever_invoice_ocr import extract_forever_invoice
from app.services.lead_owner import resolved_owner_user_id
from app.services.sale_invoice_storage import save_sale_invoice_bytes

_VALID_STAGES = ("day3", "day6")
_INVOICE_RE = re.compile(r"^\d{4}-\d{3}-\d{6}$")

# Auto-approve thresholds. Tuned conservatively — anything short routes to admin.
_MIN_AMOUNT_CENTS = 100_000          # FOREVER min order ₹1000
_MIN_CONFIDENCE = Decimal("0.75")    # ≥ 3 of 4 critical fields parsed
_MAX_INVOICE_AGE_DAYS = 60           # bill should be recent
_FUTURE_GRACE_DAYS = 1               # tolerate timezone slop

# FOREVER personal-sale commission ("approx cheque"): 25% of the bill's NET
# amount, i.e. invoice total minus CGST and SGST. Personal = the lead's lifetime
# owner only — downline/team billing never contributes to a leader's cheque.
COMMISSION_RATE_PERCENT = 25

# SQL: per-row net amount (paise) = amount − CGST − SGST, NULL-safe.
_NET_CENTS = (
    func.coalesce(LeadSale.amount_cents, 0)
    - func.coalesce(LeadSale.cgst_cents, 0)
    - func.coalesce(LeadSale.sgst_cents, 0)
)


def commission_from_net_cents(net_cents: int) -> int:
    """25% of net, floored to whole paise. Negative nets clamp to 0."""
    return (max(int(net_cents or 0), 0) * COMMISSION_RATE_PERCENT) // 100


class SalesService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Access ───────────────────────────────────────────────────────────────
    async def _can_access_lead(
        self, lead: Lead, *, actor_user_id: int, actor_role: str
    ) -> bool:
        if actor_role == "admin":
            return True
        owner = resolved_owner_user_id(lead)
        if owner == actor_user_id or lead.assigned_to_user_id == actor_user_id:
            return True
        if actor_role == "leader":
            if await is_user_in_downline_of(self.session, owner, actor_user_id):
                return True
            assignee = lead.assigned_to_user_id
            if assignee is not None and await is_user_in_downline_of(
                self.session, assignee, actor_user_id
            ):
                return True
        return False

    # ── Verify engine ────────────────────────────────────────────────────────
    async def _invoice_number_in_use(
        self, invoice_number: str, *, exclude_sale_id: Optional[int]
    ) -> bool:
        stmt = select(func.count()).select_from(LeadSale).where(
            LeadSale.invoice_number == invoice_number
        )
        if exclude_sale_id is not None:
            stmt = stmt.where(LeadSale.id != exclude_sale_id)
        return int((await self.session.execute(stmt)).scalar_one()) > 0

    @staticmethod
    def _date_window_ok(invoice_date: Optional[date]) -> Tuple[bool, str]:
        if invoice_date is None:
            return False, "invoice date missing"
        today = datetime.now(timezone.utc).date()
        if invoice_date > today + timedelta(days=_FUTURE_GRACE_DAYS):
            return False, "invoice date is in the future"
        if invoice_date < today - timedelta(days=_MAX_INVOICE_AGE_DAYS):
            return False, f"invoice older than {_MAX_INVOICE_AGE_DAYS} days"
        return True, ""

    async def _evaluate_auto_approve(self, sale: LeadSale) -> Tuple[bool, list[str]]:
        """Return (auto_ok, failed_reasons). Empty reasons + True ⇒ auto-approve."""
        reasons: list[str] = []

        num = (sale.invoice_number or "").strip()
        if not num:
            reasons.append("invoice number not detected")
        elif not _INVOICE_RE.match(num):
            reasons.append("invoice number format unrecognized")
        elif await self._invoice_number_in_use(num, exclude_sale_id=sale.id):
            reasons.append("duplicate invoice number")

        if sale.case_credits is None or sale.case_credits <= 0:
            reasons.append("case credits missing")
        if sale.amount_cents is None or sale.amount_cents < _MIN_AMOUNT_CENTS:
            reasons.append(f"amount below ₹{_MIN_AMOUNT_CENTS // 100}")

        ok_date, date_msg = self._date_window_ok(sale.invoice_date)
        if not ok_date:
            reasons.append(date_msg)

        if sale.ocr_confidence is None or sale.ocr_confidence < _MIN_CONFIDENCE:
            reasons.append("low OCR confidence")

        return (len(reasons) == 0), reasons

    # ── Reverse bridge: approved Day-3 billing unlocks the Day-4 payment gate ──
    async def _open_payment_gate_for_day3_sale(self, sale: LeadSale) -> None:
        """An approved Day-3 FLP-billing sale IS the ₹1500 proof — unlock Day-4.

        The Day-4+ status gate (``_PAYMENT_REQUIRED_STATUSES``) checks
        ``lead.payment_status == "approved"``. The CC/sale upload and the
        workboard payment-proof upload used to be two separate actions; this
        bridges them so a single OCR invoice both books the CC and opens the
        gate. Restricted to ``day3`` — the Day-6 closing billing must NOT
        retroactively satisfy the Day-4 gate. Caller commits.
        """
        if sale.billing_stage != "day3" or sale.status != "approved":
            return
        lead = await self.session.get(Lead, sale.lead_id)
        if lead is None:
            return
        if lead.payment_status != "approved":
            lead.payment_status = "approved"
        if lead.payment_amount_cents is None and sale.amount_cents is not None:
            lead.payment_amount_cents = sale.amount_cents
        if not (lead.payment_proof_url or "").strip() and (sale.proof_url or "").strip():
            lead.payment_proof_url = sale.proof_url
        if lead.payment_proof_uploaded_at is None:
            lead.payment_proof_uploaded_at = sale.approved_at or datetime.now(timezone.utc)

    # ── Submit (upload + OCR + verify) ───────────────────────────────────────
    async def submit_sale(
        self,
        *,
        lead_id: int,
        billing_stage: str,
        file: UploadFile,
        manual: SaleManualFields,
        actor_user_id: int,
        actor_role: str,
    ) -> Tuple[bool, str, Optional[LeadSale], bool]:
        """Returns (ok, message, sale, auto_approved)."""
        if billing_stage not in _VALID_STAGES:
            return False, "Invalid billing stage", None, False

        lead = await self.session.get(Lead, lead_id)
        if not lead:
            return False, "Lead not found", None, False
        if not await self._can_access_lead(
            lead, actor_user_id=actor_user_id, actor_role=actor_role
        ):
            return False, "Access denied", None, False

        data = await file.read()
        ok_save, proof_url = await save_sale_invoice_bytes(
            session=self.session, data=data, lead_id=lead_id
        )
        if not ok_save:
            return False, proof_url, None, False

        ocr = extract_forever_invoice(data)

        # Upsert the (lead, stage) row — re-upload replaces a prior pending/rejected.
        existing = (
            await self.session.execute(
                select(LeadSale).where(
                    LeadSale.lead_id == lead_id,
                    LeadSale.billing_stage == billing_stage,
                )
            )
        ).scalar_one_or_none()
        if existing is not None and existing.status == "approved":
            return False, "This billing is already approved", existing, False

        sale = existing or LeadSale(
            lead_id=lead_id, billing_stage=billing_stage,
            submitted_by_user_id=actor_user_id,
        )

        # Manual entry wins over OCR when provided (admin/team override).
        sale.case_credits = manual.case_credits if manual.case_credits is not None else ocr.case_credits
        sale.amount_cents = manual.amount_cents if manual.amount_cents is not None else ocr.amount_cents
        sale.cgst_cents = manual.cgst_cents if manual.cgst_cents is not None else ocr.cgst_cents
        sale.sgst_cents = manual.sgst_cents if manual.sgst_cents is not None else ocr.sgst_cents
        sale.fbo_id = manual.fbo_id or ocr.fbo_id
        sale.sponsor_id = manual.sponsor_id or ocr.sponsor_id
        sale.order_count = manual.order_count if manual.order_count is not None else ocr.order_count
        sale.invoice_date = manual.invoice_date or ocr.invoice_date
        sale.proof_url = proof_url
        sale.ocr_confidence = Decimal(str(ocr.confidence))
        sale.ocr_raw_text = (ocr.raw_text or "")[:8000] or None
        sale.submitted_by_user_id = actor_user_id
        sale.owner_user_id = resolved_owner_user_id(lead)

        # Invoice number: keep unique. If a manual/OCR number collides with another
        # record, do NOT persist it (avoids fraud reuse + IntegrityError) and note it.
        candidate = (manual.invoice_number or ocr.invoice_number or "").strip() or None
        dup_note = None
        if candidate and await self._invoice_number_in_use(
            candidate, exclude_sale_id=sale.id
        ):
            dup_note = f"duplicate invoice {candidate} (not stored)"
            candidate = None
        sale.invoice_number = candidate

        # Reset lifecycle for a fresh submission.
        sale.status = "pending"
        sale.auto_verified = False
        sale.approved_by_user_id = None
        sale.approved_at = None
        sale.rejection_reason = None

        if sale.id is None:
            self.session.add(sale)
        await self.session.flush()  # assigns id for the duplicate self-check

        auto_ok, reasons = await self._evaluate_auto_approve(sale)
        if dup_note:
            reasons = [dup_note, *reasons]
        if not ocr.ocr_available:
            reasons = ["OCR unavailable — manual review", *reasons]

        auto_approved = False
        if auto_ok and ocr.ocr_available:
            sale.status = "approved"
            sale.auto_verified = True
            sale.approved_at = datetime.now(timezone.utc)
            sale.verify_notes = "Auto-verified"
            auto_approved = True
            await self._log(lead_id, actor_user_id, "sale_auto_approved", billing_stage)
            await self._open_payment_gate_for_day3_sale(sale)
        else:
            sale.verify_notes = "; ".join(reasons)[:512] or "Pending review"
            await self._log(lead_id, actor_user_id, "sale_submitted", billing_stage)

        await self.session.commit()
        await self.session.refresh(sale)
        await notify_topics("leads")
        msg = (
            "Invoice verified and approved automatically"
            if auto_approved
            else "Invoice uploaded — pending admin review"
        )
        return True, msg, sale, auto_approved

    # ── Admin approve / reject ───────────────────────────────────────────────
    async def approve_sale(
        self,
        *,
        sale_id: int,
        admin_user_id: int,
        overrides: Optional[SaleApproveRequest] = None,
    ) -> Tuple[bool, str, Optional[LeadSale]]:
        sale = await self.session.get(LeadSale, sale_id)
        if not sale:
            return False, "Sale not found", None
        if sale.status == "approved":
            return False, "Already approved", sale

        # Admin can correct values OCR missed before booking — otherwise
        # approving a blank-OCR invoice would count 0 CC / ₹0.
        if overrides is not None:
            if overrides.case_credits is not None:
                sale.case_credits = overrides.case_credits
            if overrides.amount_cents is not None:
                sale.amount_cents = overrides.amount_cents
            if overrides.cgst_cents is not None:
                sale.cgst_cents = overrides.cgst_cents
            if overrides.sgst_cents is not None:
                sale.sgst_cents = overrides.sgst_cents
            if overrides.invoice_number is not None:
                sale.invoice_number = overrides.invoice_number.strip() or None

        # A booked sale must carry real CC + amount, else it contributes nothing
        # to the rollup or the graph.
        if sale.case_credits is None or sale.case_credits <= 0:
            return False, "Enter case credits before approving", sale
        if sale.amount_cents is None or sale.amount_cents <= 0:
            return False, "Enter the invoice amount before approving", sale

        # Re-run the duplicate guard at approval time too.
        num = (sale.invoice_number or "").strip()
        if num and await self._invoice_number_in_use(num, exclude_sale_id=sale.id):
            return False, "Duplicate invoice number", sale
        sale.status = "approved"
        sale.auto_verified = False
        sale.approved_by_user_id = admin_user_id
        sale.approved_at = datetime.now(timezone.utc)
        sale.rejection_reason = None
        await self._log(sale.lead_id, admin_user_id, "sale_approved", sale.billing_stage)
        await self._open_payment_gate_for_day3_sale(sale)
        await self.session.commit()
        await self.session.refresh(sale)
        await notify_topics("leads")
        return True, "Sale approved", sale

    async def reject_sale(
        self, *, sale_id: int, admin_user_id: int, reason: str
    ) -> Tuple[bool, str, Optional[LeadSale]]:
        sale = await self.session.get(LeadSale, sale_id)
        if not sale:
            return False, "Sale not found", None
        if sale.status == "approved":
            return False, "Cannot reject an approved sale", sale
        sale.status = "rejected"
        sale.auto_verified = False
        sale.rejection_reason = reason[:512]
        await self._log(sale.lead_id, admin_user_id, "sale_rejected", sale.billing_stage)
        await self.session.commit()
        await self.session.refresh(sale)
        await notify_topics("leads")
        return True, "Sale rejected", sale

    # ── Reads ────────────────────────────────────────────────────────────────
    async def list_for_lead(self, lead_id: int) -> list[LeadSale]:
        rows = (
            await self.session.execute(
                select(LeadSale)
                .where(LeadSale.lead_id == lead_id)
                .order_by(LeadSale.billing_stage.asc())
            )
        ).scalars().all()
        return list(rows)

    async def _scope_owner_ids(
        self, user_id: int, role: str
    ) -> Optional[list[int]]:
        """None ⇒ all (admin). Otherwise the owner_user_id set this role may see."""
        if role == "admin":
            return None
        if role == "leader":
            ids = await recursive_downline_user_ids(self.session, user_id)
            return sorted({user_id, *ids})
        return [user_id]

    async def pending_queue(self, *, user_id: int, role: str) -> list[LeadSale]:
        if role not in ("admin", "leader"):
            return []
        stmt = select(LeadSale).where(LeadSale.status == "pending")
        owner_ids = await self._scope_owner_ids(user_id, role)
        if owner_ids is not None:
            stmt = stmt.where(LeadSale.owner_user_id.in_(owner_ids))
        stmt = stmt.order_by(LeadSale.created_at.asc())
        return list((await self.session.execute(stmt)).scalars().all())

    async def dashboard(self, *, user_id: int, role: str) -> dict:
        owner_ids = await self._scope_owner_ids(user_id, role)
        scope = "all" if owner_ids is None else ("downline" if role == "leader" else "self")

        approved = LeadSale.status == "approved"
        base_where = [approved]
        pending_where = [LeadSale.status == "pending"]
        if owner_ids is not None:
            base_where.append(LeadSale.owner_user_id.in_(owner_ids))
            pending_where.append(LeadSale.owner_user_id.in_(owner_ids))

        totals = (
            await self.session.execute(
                select(
                    func.count(LeadSale.id),
                    func.coalesce(func.sum(LeadSale.case_credits), 0),
                    func.coalesce(func.sum(LeadSale.amount_cents), 0),
                ).where(and_(*base_where))
            )
        ).one()
        pending_count = int(
            (
                await self.session.execute(
                    select(func.count(LeadSale.id)).where(and_(*pending_where))
                )
            ).scalar_one()
        )

        # Per-owner breakdown with usernames (+ net for the per-owner cheque).
        rows_q = (
            select(
                LeadSale.owner_user_id,
                User.username,
                func.count(LeadSale.id),
                func.coalesce(func.sum(LeadSale.case_credits), 0),
                func.coalesce(func.sum(LeadSale.amount_cents), 0),
                func.coalesce(func.sum(_NET_CENTS), 0),
            )
            .outerjoin(User, User.id == LeadSale.owner_user_id)
            .where(and_(*base_where))
            .group_by(LeadSale.owner_user_id, User.username)
            .order_by(func.coalesce(func.sum(LeadSale.case_credits), 0).desc())
        )
        rows = (await self.session.execute(rows_q)).all()

        # Viewer's PERSONAL commission: own leads only (owner == viewer), never
        # downline/team billing — independent of the scope above. Same rule for
        # every role, so admin sees their own personal cheque here too.
        personal_net = int(
            (
                await self.session.execute(
                    select(func.coalesce(func.sum(_NET_CENTS), 0)).where(
                        approved, LeadSale.owner_user_id == user_id
                    )
                )
            ).scalar_one()
            or 0
        )

        return {
            "scope": scope,
            "sale_count": int(totals[0] or 0),
            "total_case_credits": Decimal(str(totals[1] or 0)),
            "total_amount_cents": int(totals[2] or 0),
            "pending_count": pending_count,
            "personal_commission_cents": commission_from_net_cents(personal_net),
            "rows": [
                {
                    "owner_user_id": owner_id,
                    "owner_username": username,
                    "sale_count": int(cnt or 0),
                    "total_case_credits": Decimal(str(cc or 0)),
                    "total_amount_cents": int(amt or 0),
                    "commission_cents": commission_from_net_cents(int(net or 0)),
                }
                for owner_id, username, cnt, cc, amt, net in rows
            ],
        }

    async def trend(self, *, user_id: int, role: str, days: int = 30) -> dict:
        """Daily approved-sales series (CC + approx cheque) over the last ``days``,
        role-scoped. Bucketed by IST calendar day in Python so it is portable
        across Postgres (timestamptz) and the SQLite test DB (naive IST wall clock).
        """
        days = max(1, min(days, 90))
        owner_ids = await self._scope_owner_ids(user_id, role)
        scope = "all" if owner_ids is None else ("downline" if role == "leader" else "self")

        today = today_ist()
        start = today - timedelta(days=days - 1)
        # Coarse DB filter with a buffer to absorb tz boundary fuzz; precise
        # bucketing happens below in IST.
        cutoff = datetime.combine(start - timedelta(days=2), datetime.min.time())

        where = [LeadSale.status == "approved", LeadSale.created_at >= cutoff]
        if owner_ids is not None:
            where.append(LeadSale.owner_user_id.in_(owner_ids))

        rows = (
            await self.session.execute(
                select(
                    LeadSale.approved_at,
                    LeadSale.created_at,
                    func.coalesce(LeadSale.case_credits, 0),
                    _NET_CENTS,
                ).where(and_(*where))
            )
        ).all()

        cc_by_day: dict[date, Decimal] = {}
        net_by_day: dict[date, int] = {}
        for approved_at, created_at, cc, net in rows:
            stamp = approved_at or created_at
            if stamp is None:
                continue
            # Naive stamps (SQLite) are stored in UTC; normalize before IST.
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            d = stamp.astimezone(IST).date()
            if d < start or d > today:
                continue
            cc_by_day[d] = cc_by_day.get(d, Decimal("0")) + Decimal(str(cc or 0))
            net_by_day[d] = net_by_day.get(d, 0) + int(net or 0)

        points = []
        total_cc = Decimal("0")
        total_cheque = 0
        for i in range(days):
            d = start + timedelta(days=i)
            cc = cc_by_day.get(d, Decimal("0"))
            cheque = commission_from_net_cents(net_by_day.get(d, 0))
            total_cc += cc
            total_cheque += cheque
            points.append({"date": d.isoformat(), "case_credits": cc, "cheque_cents": cheque})

        return {
            "scope": scope,
            "days": days,
            "points": points,
            "total_case_credits": total_cc,
            "total_cheque_cents": total_cheque,
        }

    async def _log(self, lead_id: int, user_id: int, action: str, stage: str) -> None:
        self.session.add(
            ActivityLog(
                user_id=user_id,
                action=action,
                entity_type="lead",
                entity_id=lead_id,
                meta={"billing_stage": stage},
            )
        )
