"""CC/sale engine tests — OCR parse, hybrid auto-verify, scoping, approvals."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.lead import Lead
from app.models.lead_sale import LeadSale
from app.models.user import User
from app.schemas.sales import SaleManualFields
from app.services import sales_service as sales_mod
from app.services.forever_invoice_ocr import ExtractedInvoice, _extract_fields
from app.services.sales_service import SalesService


# ── Helpers ───────────────────────────────────────────────────────────────────

def _png_bytes() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (255, 255, 255)).save(buf, format="PNG")
    return buf.getvalue()


class _FakeUpload:
    """Minimal UploadFile stand-in (only .read() is used by the service)."""

    def __init__(self, data: bytes) -> None:
        self._data = data

    async def read(self) -> bytes:
        return self._data


def _good_ocr(invoice_number: str = "2627-027-006305") -> ExtractedInvoice:
    out = ExtractedInvoice(ocr_available=True, raw_text="stub")
    out.invoice_number = invoice_number
    out.amount_cents = 1_997_800  # ₹19,978
    out.case_credits = Decimal("1.002")
    out.fbo_id = "910711594952"
    out.sponsor_id = "910711242522"
    out.order_count = 2
    out.invoice_date = datetime.now(timezone.utc).date()
    out.recompute_confidence()
    return out


@pytest_asyncio.fixture
async def session(engine) -> AsyncSession:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        # Session-scoped engine isn't reset between tests; wipe rows this
        # module touches so fixed seed IDs don't collide across tests.
        from sqlalchemy import text

        for tbl in ("lead_sales", "leads", "users"):
            await s.execute(text(f"DELETE FROM {tbl}"))
        await s.commit()
        yield s


async def _seed(session: AsyncSession) -> dict[str, int]:
    """team(301) under leader(302); admin(303); plus an out-of-tree team(304)."""
    leader = User(id=302, fbo_id="F302", email="l@t", role="leader", username="lead302")
    team = User(id=301, fbo_id="F301", email="t@t", role="team", username="team301",
                upline_user_id=302)
    admin = User(id=303, fbo_id="F303", email="a@t", role="admin", username="adm303")
    other = User(id=304, fbo_id="F304", email="o@t", role="team", username="team304")
    session.add_all([leader, team, admin, other])
    await session.flush()

    lead = Lead(id=9001, name="Sonali", created_by_user_id=301, owner_user_id=301)
    lead_other = Lead(id=9002, name="Other", created_by_user_id=304, owner_user_id=304)
    session.add_all([lead, lead_other])
    await session.commit()
    return {"team": 301, "leader": 302, "admin": 303, "other": 304,
            "lead": 9001, "lead_other": 9002}


# ── OCR parser (offline, no tesseract) ─────────────────────────────────────────

def test_parser_extracts_forever_invoice_fields():
    text = (
        "TAX Invoice\nOrder Count 2\n"
        "Invoice Number : 2627-027-006305 PCP\n"
        "Invoice Date : 25 May 2026\n"
        "FBO ID : 910711594952\n"
        "Sponsors Id : 910711242522 TANDRA MONDAL\n"
        "7 Total : 1.002 19026.33 475.66 475.66 0.00 19977.65\n"
        "Invoice Total : 19978.00\n"
    )
    out = ExtractedInvoice(raw_text=text)
    _extract_fields(text, out)
    out.recompute_confidence()
    assert out.invoice_number == "2627-027-006305"
    assert out.amount_cents == 1_997_800
    assert out.case_credits == Decimal("1.002")
    assert out.fbo_id == "910711594952"
    assert out.sponsor_id == "910711242522"
    assert out.order_count == 2
    assert out.invoice_date.isoformat() == "2026-05-25"
    assert out.confidence == 1.0


# ── Service: hybrid auto-verify ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_auto_approves_clean_invoice(session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)

    svc = SalesService(session)
    ok, msg, sale, auto = await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert ok and auto is True
    assert sale.status == "approved" and sale.auto_verified is True
    assert sale.case_credits == Decimal("1.002")
    assert sale.amount_cents == 1_997_800
    assert sale.owner_user_id == 301


@pytest.mark.asyncio
async def test_submit_pending_when_ocr_unavailable(session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    unavail = ExtractedInvoice(ocr_available=False, raw_text="")
    unavail.recompute_confidence()
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: unavail)
    ids = await _seed(session)

    svc = SalesService(session)
    ok, _, sale, auto = await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert ok and auto is False
    assert sale.status == "pending"
    assert "OCR unavailable" in (sale.verify_notes or "")


@pytest.mark.asyncio
async def test_duplicate_invoice_number_not_auto_approved(session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)
    svc = SalesService(session)

    # First lead's day3 — clean, auto-approved with the invoice number stored.
    await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    # Second lead re-uses the SAME invoice number → must NOT auto-approve,
    # and the duplicate number must not be persisted (fraud guard + unique).
    ok, _, sale2, auto2 = await svc.submit_sale(
        lead_id=ids["lead_other"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["other"], actor_role="team",
    )
    assert ok and auto2 is False
    assert sale2.status == "pending"
    assert sale2.invoice_number is None
    assert "duplicate" in (sale2.verify_notes or "").lower()


@pytest.mark.asyncio
async def test_admin_approve_and_reject(session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    unavail = ExtractedInvoice(ocr_available=False)
    unavail.recompute_confidence()
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: unavail)
    ids = await _seed(session)
    svc = SalesService(session)

    _, _, sale, _ = await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day6",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(amount_cents=1_997_800),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert sale.status == "pending"

    ok, _, approved = await svc.approve_sale(sale_id=sale.id, admin_user_id=ids["admin"])
    assert ok and approved.status == "approved"
    assert approved.approved_by_user_id == ids["admin"]
    assert approved.auto_verified is False


@pytest.mark.asyncio
async def test_dashboard_scoping(session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)
    svc = SalesService(session)

    # team 301 (in leader 302's downline) logs an approved sale.
    await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    # out-of-tree team 304 logs one too (different invoice number).
    monkeypatch.setattr(
        sales_mod, "extract_forever_invoice",
        lambda data: _good_ocr("2627-027-009999"),
    )
    await svc.submit_sale(
        lead_id=ids["lead_other"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["other"], actor_role="team",
    )

    team_dash = await svc.dashboard(user_id=ids["team"], role="team")
    assert team_dash["scope"] == "self"
    assert team_dash["sale_count"] == 1
    assert team_dash["total_case_credits"] == Decimal("1.002")

    leader_dash = await svc.dashboard(user_id=ids["leader"], role="leader")
    assert leader_dash["scope"] == "downline"
    assert leader_dash["sale_count"] == 1  # only its downline's team 301, not 304

    admin_dash = await svc.dashboard(user_id=ids["admin"], role="admin")
    assert admin_dash["scope"] == "all"
    assert admin_dash["sale_count"] == 2  # sees both
    assert admin_dash["total_case_credits"] == Decimal("2.004")


@pytest.mark.asyncio
async def test_team_cannot_access_out_of_scope_lead(session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)
    svc = SalesService(session)

    ok, msg, sale, _ = await svc.submit_sale(
        lead_id=ids["lead_other"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert ok is False and sale is None
    assert msg == "Access denied"
