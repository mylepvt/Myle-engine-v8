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
    out.cgst_cents = 47_566  # ₹475.66
    out.sgst_cents = 47_566  # ₹475.66
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

        for tbl in ("lead_sales", "crm_outbox", "leads", "users"):
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
    assert out.cgst_cents == 47_566  # ₹475.66 — adjacent equal pair in the row
    assert out.sgst_cents == 47_566
    assert out.fbo_id == "910711594952"
    assert out.sponsor_id == "910711242522"
    assert out.order_count == 2
    assert out.invoice_date.isoformat() == "2026-05-25"
    assert out.confidence == 1.0


def test_parser_cgst_sgst_uses_summary_row_not_line_items():
    """Per-item rows carry their own equal CGST/SGST pair — must use the Total row."""
    text = (
        "1 5207 FOREVER BEE HONEY 0.105 2094.00 2. 52.35 2. 52.35 0.00 2198.70\n"
        "1 5815 ALOE VERA GEL 0.102 1935.00 2. 48.38 2. 48.38 0.00 2031.75\n"
        "z Total : 1.002 19026.33 475.66 475.66 0.00 19977.65\n"
        "Invoice Total : 19978.00\n"
    )
    out = ExtractedInvoice(raw_text=text)
    _extract_fields(text, out)
    assert out.cgst_cents == 47_566  # ₹475.66 from the summary, not ₹52.35 item tax
    assert out.sgst_cents == 47_566


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

    # OCR missed CC → approving without entering it must be blocked, otherwise
    # the booked sale would count 0 CC.
    ok, msg, _ = await svc.approve_sale(sale_id=sale.id, admin_user_id=ids["admin"])
    assert ok is False and "case credits" in msg.lower()

    # Admin enters the real CC at approval → booked correctly.
    from app.schemas.sales import SaleApproveRequest

    ok, _, approved = await svc.approve_sale(
        sale_id=sale.id,
        admin_user_id=ids["admin"],
        overrides=SaleApproveRequest(case_credits=Decimal("2.500")),
    )
    assert ok and approved.status == "approved"
    assert approved.case_credits == Decimal("2.500")
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


# ── Flow: pending → approve → data metrics ─────────────────────────────────────

@pytest.mark.asyncio
async def test_pending_then_approve_flows_into_dashboard(session, monkeypatch, tmp_path):
    """A manual (non-auto) invoice stays out of the dashboard until admin approves."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    unavail = ExtractedInvoice(ocr_available=False)
    unavail.recompute_confidence()
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: unavail)
    ids = await _seed(session)
    svc = SalesService(session)

    _, _, sale, auto = await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()),
        manual=SaleManualFields(case_credits=Decimal("1.002"), amount_cents=1_997_800),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert auto is False and sale.status == "pending"

    # Pending sale → not yet in the team's CC rollup.
    before = await svc.dashboard(user_id=ids["team"], role="team")
    assert before["sale_count"] == 0
    assert before["pending_count"] == 1
    assert before["total_case_credits"] == Decimal("0")

    ok, _, approved = await svc.approve_sale(sale_id=sale.id, admin_user_id=ids["admin"])
    assert ok and approved.status == "approved"

    # After approval → CC + revenue flow into the dashboard metric.
    after = await svc.dashboard(user_id=ids["team"], role="team")
    assert after["sale_count"] == 1
    assert after["pending_count"] == 0
    assert after["total_case_credits"] == Decimal("1.002")
    assert after["total_amount_cents"] == 1_997_800


@pytest.mark.asyncio
async def test_system_overview_includes_approved_sale_revenue(session, monkeypatch, tmp_path):
    """The admin data-metric overview rolls up approved CC/sale revenue."""
    from app.services.analytics_service import AnalyticsService

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)
    svc = SalesService(session)

    _, _, sale, auto = await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert auto is True and sale.status == "approved"

    overview = await AnalyticsService(session).get_system_overview(days=30)
    assert overview["sales"]["sale_count"] == 1
    assert overview["sales"]["total_amount_cents"] == 1_997_800
    assert overview["sales"]["total_case_credits"] == pytest.approx(1.002)


# ── HTTP end-to-end: upload proof → admin approve → metrics ────────────────────

@pytest.mark.asyncio
async def test_http_upload_approve_dashboard_flow(session, team_client, monkeypatch, tmp_path):
    """Full HTTP path: team uploads invoice → admin approves → dashboard reflects it.

    OCR is unavailable in the test image path, so the invoice lands pending and
    must be admin-approved before it counts — the real production gate. The auth
    identity is flipped per request (client fixtures share one app override).
    """
    from main import app
    from app.api.deps import AuthUser, require_auth_user

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))

    def as_role(role: str, uid: int):
        async def _fake() -> AuthUser:
            return AuthUser(
                user_id=uid, role=role, email=f"{role}{uid}@t",
                fbo_id=f"F{uid}", username=f"{role}{uid}",
            )
        return _fake

    team = User(id=201, fbo_id="F201", email="t201@t", role="team", username="team201")
    admin = User(id=203, fbo_id="F203", email="a203@t", role="admin", username="adm203")
    session.add_all([team, admin])
    await session.flush()
    lead = Lead(id=7001, name="Pinky", created_by_user_id=201, owner_user_id=201)
    session.add(lead)
    await session.commit()

    # 1) Team uploads the invoice (multipart). OCR unavailable → pending.
    app.dependency_overrides[require_auth_user] = as_role("team", 201)
    files = {"file": ("inv.png", _png_bytes(), "image/png")}
    data = {"billing_stage": "day3", "case_credits": "1.002", "amount_cents": "1997800"}
    res = await team_client.post("/api/v1/leads/7001/sales", data=data, files=files)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["auto_approved"] is False
    assert body["sale"]["status"] == "pending"
    sale_id = body["sale"]["id"]

    # 2) Admin sees it in the pending queue and approves.
    app.dependency_overrides[require_auth_user] = as_role("admin", 203)
    pending = await team_client.get("/api/v1/sales/pending")
    assert pending.status_code == 200
    assert any(r["id"] == sale_id for r in pending.json()["items"])
    appr = await team_client.post(f"/api/v1/sales/{sale_id}/approve")
    assert appr.status_code == 200, appr.text
    assert appr.json()["status"] == "approved"

    # 3) Team dashboard now rolls up the CC + revenue (scope = self).
    app.dependency_overrides[require_auth_user] = as_role("team", 201)
    dash = await team_client.get("/api/v1/sales/dashboard")
    assert dash.status_code == 200
    dbody = dash.json()
    assert dbody["scope"] == "self"
    assert dbody["sale_count"] == 1
    assert float(dbody["total_case_credits"]) == pytest.approx(1.002)
    assert dbody["total_amount_cents"] == 1_997_800


# ── Payment-proof → CC/sale-engine bridge ──────────────────────────────────────

@pytest.mark.asyncio
async def test_approved_payment_proof_creates_approved_sale(session):
    """Approving a Day-3 payment proof links it into the CC/sale revenue rollup."""
    from app.services.analytics_service import AnalyticsService
    from app.services.payment_service import PaymentService

    ids = await _seed(session)
    lead = await session.get(Lead, ids["lead"])
    lead.status = "day3"
    lead.payment_amount_cents = 150_000  # ₹1500 Min. FLP billing
    lead.payment_proof_url = "https://example/proof.png"
    lead.payment_proof_uploaded_at = datetime.now(timezone.utc)
    lead.payment_status = "proof_uploaded"
    await session.commit()

    ok, msg = await PaymentService(session).approve_payment_proof(
        lead_id=ids["lead"], approved_by_user_id=ids["admin"], approved_by_role="admin",
    )
    assert ok, msg

    sale = (
        await session.execute(
            LeadSale.__table__.select().where(LeadSale.lead_id == ids["lead"])
        )
    ).first()
    assert sale is not None
    assert sale.billing_stage == "day3"
    assert sale.status == "approved"
    assert sale.amount_cents == 150_000
    assert sale.case_credits is None  # payment proof carries no CC

    overview = await AnalyticsService(session).get_system_overview(days=30)
    assert overview["sales"]["sale_count"] == 1
    assert overview["sales"]["total_amount_cents"] == 150_000


@pytest.mark.asyncio
async def test_payment_approval_does_not_clobber_existing_cc_sale(session, monkeypatch, tmp_path):
    """If a CC invoice already exists for the stage, payment approval keeps its CC."""
    from app.services.payment_service import PaymentService

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)

    # Real FOREVER invoice first → approved sale with CC 1.002.
    _, _, sale, auto = await SalesService(session).submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert auto is True and sale.status == "approved"

    lead = await session.get(Lead, ids["lead"])
    lead.status = "day3"
    lead.payment_amount_cents = 150_000
    lead.payment_proof_url = "https://example/proof.png"
    lead.payment_proof_uploaded_at = datetime.now(timezone.utc)
    lead.payment_status = "proof_uploaded"
    await session.commit()

    ok, _ = await PaymentService(session).approve_payment_proof(
        lead_id=ids["lead"], approved_by_user_id=ids["admin"], approved_by_role="admin",
    )
    assert ok

    rows = (
        await session.execute(
            LeadSale.__table__.select().where(LeadSale.lead_id == ids["lead"])
        )
    ).all()
    assert len(rows) == 1  # upsert on (lead, stage), not a duplicate
    assert rows[0].case_credits == Decimal("1.002")  # CC preserved
    assert rows[0].amount_cents == 1_997_800  # original invoice amount preserved


# ── Personal-sale commission ("approx cheque") = (amount − CGST − SGST) × 25% ────

def test_commission_helper_floors_25_percent_of_net():
    from app.services.sales_service import commission_from_net_cents

    # net = 1_997_800 − 47_566 − 47_566 = 1_902_668 ; 25% = 475_667 (floored)
    assert commission_from_net_cents(1_902_668) == 475_667
    assert commission_from_net_cents(0) == 0
    assert commission_from_net_cents(-100) == 0  # negative clamps


@pytest.mark.asyncio
async def test_dashboard_shows_personal_commission(session, monkeypatch, tmp_path):
    """A personal sale's cheque = 25% of net; shown on the owner's dashboard + row."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)
    svc = SalesService(session)

    await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )

    dash = await svc.dashboard(user_id=ids["team"], role="team")
    assert dash["personal_commission_cents"] == 475_667
    assert dash["rows"][0]["owner_user_id"] == 301
    assert dash["rows"][0]["commission_cents"] == 475_667


@pytest.mark.asyncio
async def test_commission_is_personal_only_not_team(session, monkeypatch, tmp_path):
    """Leader's own cheque counts only leads they own — never downline/team billing."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)
    svc = SalesService(session)

    # team 301 (in leader 302's downline) logs a personal sale on their own lead.
    await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )

    leader_dash = await svc.dashboard(user_id=ids["leader"], role="leader")
    assert leader_dash["scope"] == "downline"
    assert leader_dash["sale_count"] == 1            # CC rollup still sees the team sale
    assert leader_dash["personal_commission_cents"] == 0  # but cheque is personal-only

    team_dash = await svc.dashboard(user_id=ids["team"], role="team")
    assert team_dash["personal_commission_cents"] == 475_667  # the seller gets the cheque


@pytest.mark.asyncio
async def test_system_overview_includes_total_commission(session, monkeypatch, tmp_path):
    """Admin overview rolls up the grand-total personal commission."""
    from app.services.analytics_service import AnalyticsService

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)

    await SalesService(session).submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )

    overview = await AnalyticsService(session).get_system_overview(days=30)
    assert overview["sales"]["total_commission_cents"] == 475_667


# ── Reverse bridge: approved Day-3 sale unlocks the Day-4 payment gate ──────────

@pytest.mark.asyncio
async def test_day3_auto_approved_sale_opens_payment_gate(session, monkeypatch, tmp_path):
    """One OCR invoice books the CC AND sets lead.payment_status=approved (Day-4 unlock)."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)

    _, _, sale, auto = await SalesService(session).submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert auto is True and sale.status == "approved"

    lead = await session.get(Lead, ids["lead"])
    await session.refresh(lead)
    assert lead.payment_status == "approved"
    assert lead.payment_amount_cents == 1_997_800
    assert (lead.payment_proof_url or "") == sale.proof_url
    assert lead.payment_proof_uploaded_at is not None


@pytest.mark.asyncio
async def test_day3_manual_approve_opens_payment_gate(session, monkeypatch, tmp_path):
    """Manual admin approval of a pending Day-3 sale also unlocks the gate."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    unavail = ExtractedInvoice(ocr_available=False)
    unavail.recompute_confidence()
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: unavail)
    ids = await _seed(session)
    svc = SalesService(session)

    _, _, sale, auto = await svc.submit_sale(
        lead_id=ids["lead"], billing_stage="day3",
        file=_FakeUpload(_png_bytes()),
        manual=SaleManualFields(case_credits=Decimal("1.002"), amount_cents=1_997_800),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert auto is False and sale.status == "pending"

    lead = await session.get(Lead, ids["lead"])
    await session.refresh(lead)
    assert (lead.payment_status or "") != "approved"  # not yet — pending

    ok, _, approved = await svc.approve_sale(sale_id=sale.id, admin_user_id=ids["admin"])
    assert ok and approved.status == "approved"

    await session.refresh(lead)
    assert lead.payment_status == "approved"


@pytest.mark.asyncio
async def test_day6_sale_does_not_open_day4_gate(session, monkeypatch, tmp_path):
    """Day-6 closing billing must NOT retroactively satisfy the Day-4 gate."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(sales_mod, "extract_forever_invoice", lambda data: _good_ocr())
    ids = await _seed(session)

    _, _, sale, auto = await SalesService(session).submit_sale(
        lead_id=ids["lead"], billing_stage="day6",
        file=_FakeUpload(_png_bytes()), manual=SaleManualFields(),
        actor_user_id=ids["team"], actor_role="team",
    )
    assert auto is True and sale.status == "approved"

    lead = await session.get(Lead, ids["lead"])
    await session.refresh(lead)
    assert (lead.payment_status or "") != "approved"  # day6 leaves the gate shut
