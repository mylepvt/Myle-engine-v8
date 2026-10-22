"""Print-ready HTML for tax invoices and payment receipts."""

from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Any, Iterable

from app.core.time_ist import IST
from app.models.invoice import Invoice
from app.models.user import User
from app.services.invoice_rupees_words import amount_in_words_from_cents, rupees_int_to_words

# The supplier on every document. Snapshotted into each new invoice's payload at issue time,
# so a later change here never rewrites an invoice that was already issued.
SELLER: dict[str, str] = {
    "name": "M/S KARAN VEER SINGH",
    "gstin": "08HKSPS3607C1ZS",
    "address": "Karanpur, Sri Ganganagar, Rajasthan – 335073",
    "state": "Rajasthan",
    "state_code": "08",
    "constitution": "Proprietorship",
}
GST_RATE = 0.18
# "igst" (default): IGST 18% on every tax invoice.
# "by_state": CGST 9% + SGST 9% when the buyer is in the seller's state or their state is
# unknown (B2C place of supply = supplier's location); IGST 18% for another state.
GST_MODE_KEY = "invoice.gst_mode"


def gst_split(*, mode: str, buyer_state_code: str | None) -> str:
    """"igst" or "cgst_sgst" for a new tax invoice."""
    if mode != "by_state":
        return "igst"
    if buyer_state_code and buyer_state_code != SELLER["state_code"]:
        return "igst"
    return "cgst_sgst"


def buyer_snapshot(member: User) -> dict[str, str]:
    """Bill-To as it was when the invoice was issued (a rename or removal never changes it)."""
    out = {
        "name": (member.name or member.username or member.email or f"User #{member.id}").strip(),
        "username": (member.username or "").strip(),
        "phone": (member.phone or "").strip(),
        "fbo_id": (member.fbo_id or "").strip(),
    }
    return {k: v for k, v in out.items() if v}


def issued_on_ist(when: datetime | None = None) -> str:
    when = when or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when.astimezone(IST).strftime("%d-%b-%Y")


def _fmt_inr(cents: int) -> str:
    rupees = cents / 100.0
    return f"₹{rupees:,.2f}"


def _rupees_words_from_cents(total_cents: int) -> str:
    return rupees_int_to_words(int(round(total_cents / 100.0)))


def _gst_from_inclusive_total_cents(total_cents: int) -> tuple[float, float, float]:
    """GST-inclusive total → (base, igst, total) in rupees, 2 dp."""
    total_r = round(total_cents / 100.0, 2)
    base_r = round(total_r / 1.18, 2)
    igst_r = round(total_r - base_r, 2)
    return base_r, igst_r, total_r


_TITLES = {"tax_invoice": "TAX INVOICE", "payment_receipt": "PAYMENT RECEIPT", "credit_note": "CREDIT NOTE"}
_LABELS = {"tax_invoice": "Tax Invoice", "payment_receipt": "Payment Receipt", "credit_note": "Credit Note"}


def _doc_title(doc_type: str) -> str:
    return _TITLES.get(doc_type, "PAYMENT RECEIPT")


def _type_label(doc_type: str) -> str:
    return _LABELS.get(doc_type, "Payment Receipt")


# What a payment receipt is for: money paid in, free (promo) credit, or an admin credit.
RECEIPT_TYPES: dict[str, dict[str, str]] = {
    "paid_recharge": {
        "title": "PAYMENT RECEIPT",
        "party": "Received from",
        "stamp": "PAID RECHARGE",
        "status": "PAID",
        "total": "Received",
        "desc": "Wallet Recharge — Myle Community",
    },
    "free_credit": {
        "title": "CREDIT RECEIPT",
        "party": "Credited to",
        "stamp": "FREE CREDIT · NOT PAID",
        "status": "FREE",
        "total": "Credited",
        "desc": "Free wallet credit — not paid by the member",
    },
    "admin_credit": {
        "title": "CREDIT RECEIPT",
        "party": "Credited to",
        "stamp": "ADMIN CREDIT",
        "status": "CREDITED",
        "total": "Credited",
        "desc": "Wallet credit by admin",
    },
}


def receipt_type(invoice: Invoice, payload: dict[str, Any]) -> str:
    """Stored on receipts issued since this was added; older ones are told apart by their link."""
    kind = payload.get("receipt_type")
    if kind in RECEIPT_TYPES:
        return kind
    if invoice.wallet_recharge_id is not None:
        return "paid_recharge"
    if str(payload.get("payment_reference") or "").lower().startswith("admin"):
        return "admin_credit"
    return "paid_recharge"


def render_invoice_html(*, invoice: Invoice, member: User) -> str:
    """The same look as Myle Ledger's invoices (components/InvoicePrintView.tsx there):
    a fixed "paper" palette, brand band, supplier left / document right, a tinted Bill-To
    panel, clean line items and totals with a gradient Total bar. System-generated, so no
    signatory line."""
    payload: dict[str, Any] = dict(invoice.payload_json or {})
    # Issued documents render from their own snapshot; older ones fall back to live data.
    buyer = payload.get("buyer") or buyer_snapshot(member)
    seller = {**SELLER, **(payload.get("seller") or {})}
    esc = lambda v: html.escape(str(v))  # noqa: E731
    display_name = esc(buyer.get("name") or f"User #{member.id}")
    un = str(buyer.get("username") or "")
    phone = str(buyer.get("phone") or "")
    fbo = str(buyer.get("fbo_id") or "")

    issued = invoice.issued_at
    date_s = str(payload.get("issued_on") or (issued_on_ist(issued) if isinstance(issued, datetime) else issued))
    against = payload.get("against_invoice")
    place = payload.get("place_of_supply")
    is_tax = invoice.doc_type in ("tax_invoice", "credit_note")
    rtype = None if is_tax else receipt_type(invoice, payload)
    rinfo = RECEIPT_TYPES[rtype] if rtype else None

    bill_meta = []
    if against:
        bill_meta.append(("Against invoice", esc(against)))
    if place:
        bill_meta.append(("Place of supply", esc(place)))
    if is_tax:
        bill_meta.append(("SAC", "998361"))
    if fbo:
        bill_meta.append(("FBO ID", esc(fbo)))
    meta_html = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in bill_meta)

    header = f"""
    <header class="head">
      <div class="supplier">
        <p class="trade">{esc(seller["name"])}</p>
        <p class="addr">{esc(seller["address"])}<br/>
          GSTIN <span class="gstin">{esc(seller["gstin"])}</span> · {esc(seller["state"])} ({esc(seller["state_code"])})</p>
      </div>
      <div class="doc">
        <p class="kind">{rinfo["title"] if rinfo else _doc_title(invoice.doc_type)}</p>
        <p class="num">{esc(invoice.invoice_number)}</p>
        <p class="date">{esc(date_s)}</p>
        {f'<p class="stamp stamp-{rtype}">{rinfo["stamp"]}</p>' if rinfo else ''}
      </div>
    </header>
    <section class="bill">
      <div>
        <p class="label">{"Bill to" if is_tax else rinfo["party"]}</p>
        <p class="name">{display_name}</p>
        {f'<p class="sub">@{esc(un)}</p>' if un else ''}
        {f'<p class="sub">{esc(phone)}</p>' if phone else ''}
      </div>
      {f'<dl>{meta_html}</dl>' if meta_html else ''}
    </section>
    """

    if is_tax:
        rows = []
        for i, row in enumerate(payload.get("lines") or [], start=1):
            ref = esc(row.get("lead_ref", ""))
            rows.append(
                f"<tr><td class='n'>{i}</td>"
                f"<td><p class='desc'>{esc(row.get('description', ''))}</p>"
                f"{f'<p class=sub>{ref}</p>' if ref else ''}</td>"
                f"<td class='r'>{esc(row.get('qty', 1))}</td>"
                f"<td class='r muted'>₹{esc(row.get('unit_rate_rupees', ''))}</td>"
                f"<td class='r strong'>₹{esc(row.get('amount_rupees', ''))}</td></tr>"
            )
        sub = float(payload.get("subtotal_rupees", 0))
        tot = float(payload.get("total_rupees", invoice.total_cents / 100.0))
        words = esc(payload.get("amount_in_words", _rupees_words_from_cents(invoice.total_cents)))
        if "cgst_rupees" in payload:
            tax_rows = (
                f"<div class='row'><span>CGST @9%</span><span>₹{float(payload['cgst_rupees']):,.2f}</span></div>"
                f"<div class='row'><span>SGST @9%</span><span>₹{float(payload['sgst_rupees']):,.2f}</span></div>"
            )
        else:
            tax_rows = f"<div class='row'><span>IGST @18%</span><span>₹{float(payload.get('igst_rupees', 0)):,.2f}</span></div>"
        reason = payload.get("reason")
        body = f"""
        {f'<p class="reason"><span class="label">Reason</span> {esc(reason)}</p>' if reason else ''}
        <table class="items">
          <thead><tr><th class="n">#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
          <tbody>{''.join(rows) or '<tr><td colspan="5" class="empty">No line items on file.</td></tr>'}</tbody>
        </table>
        <p class="note">Rate and amount are before GST.</p>
        <section class="totals">
          <div class="words"><p class="label">Amount in words</p><p>{words}</p></div>
          <div class="sum">
            <div class="row"><span>Taxable value</span><span>₹{sub:,.2f}</span></div>
            {tax_rows}
            <div class="total"><span>{"Total credit" if invoice.doc_type == "credit_note" else "Total"}</span><span>₹{tot:,.2f}</span></div>
          </div>
        </section>
        """
    else:
        ref = esc(payload.get("payment_reference", ""))
        desc = esc(payload.get("receipt_description") or rinfo["desc"])
        body = f"""
        <table class="items">
          <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
          <tbody><tr><td><p class="desc">{desc}</p>{f'<p class="sub">Payment reference {ref}</p>' if ref else ''}</td>
            <td class="r strong">{_fmt_inr(invoice.total_cents)}</td></tr></tbody>
        </table>
        <section class="totals">
          <div class="words">
            <p class="label">Amount in words</p><p>{esc(_rupees_words_from_cents(invoice.total_cents))}</p>
            <div class="seal seal-{rtype}">{rinfo["stamp"]}</div>
          </div>
          <div class="sum">
            <div class="row"><span>Status</span><span class="status-{rtype}">{rinfo["status"]}</span></div>
            <div class="total total-{rtype}"><span>{rinfo["total"]}</span><span>{_fmt_inr(invoice.total_cents)}</span></div>
          </div>
        </section>
        """

    footer = f"""
    <footer class="foot">
      <p class="sys">This is a system-generated document and does not require a signature.<br/>
        {esc(seller["name"])} · GSTIN {esc(seller["gstin"])}</p>
    </footer>
    """

    css = """
    * { box-sizing: border-box; }
    html { background: #EEF2F7; }
    body { margin: 0; padding: 24px 12px; color: #0F172A; -webkit-font-smoothing: antialiased;
           font: 14px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    p { margin: 0; }
    .paper { max-width: 52rem; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden;
             box-shadow: 0 24px 60px -24px rgba(15,23,42,.35), 0 0 0 1px rgba(15,23,42,.06); }
    .band { height: 6px; background: linear-gradient(90deg, #1D4ED8, #4F46E5, #0EA5E9); }
    .inner { padding: 36px; }
    .head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
    .trade { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .addr { margin-top: 2px; max-width: 17rem; font-size: 10px; line-height: 1.45; color: #64748B; }
    .gstin { font-weight: 500; color: #475569; letter-spacing: .03em; }
    .doc { text-align: right; flex-shrink: 0; }
    .kind { font-size: 11px; font-weight: 600; letter-spacing: .18em; color: #1D4ED8; }
    .num { margin-top: 4px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .date { margin-top: 2px; color: #64748B; }
    .bill { margin-top: 28px; display: flex; justify-content: space-between; gap: 32px; background: #F6F8FC; border-radius: 16px; padding: 20px; }
    .label { font-size: 10.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #94A3B8; }
    .name { margin-top: 4px; font-size: 15px; font-weight: 600; }
    .sub { font-size: 12px; color: #64748B; font-variant-numeric: tabular-nums; }
    .bill dl { margin: 0; display: grid; grid-template-columns: auto auto; gap: 4px 16px; font-size: 12px; text-align: right; align-content: start; }
    .bill dt { color: #64748B; } .bill dd { margin: 0; font-weight: 500; }
    .reason { margin-top: 20px; font-size: 13px; }
    .items { width: 100%; margin-top: 24px; border-collapse: collapse; font-size: 14px; }
    .items th { padding: 10px 12px 10px 0; text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: .12em;
                text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #E2E8F0; }
    .items td { padding: 12px 12px 12px 0; vertical-align: top; border-bottom: 1px solid #EEF2F7; }
    .items .n { width: 2rem; color: #94A3B8; font-variant-numeric: tabular-nums; }
    .desc { font-weight: 500; }
    .r { text-align: right; font-variant-numeric: tabular-nums; } .items th.r, .items td.r { text-align: right; padding-right: 0; padding-left: 12px; }
    .muted { color: #64748B; } .strong { font-weight: 500; }
    .empty { text-align: center; color: #94A3B8; padding: 20px 0; }
    .note { margin-top: 8px; font-size: 11px; color: #94A3B8; }
    .totals { margin-top: 24px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; break-inside: avoid; }
    .words p:nth-of-type(2) { margin-top: 4px; font-size: 14px; font-weight: 500; line-height: 1.35; }
    .sum { width: 17rem; flex-shrink: 0; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; font-variant-numeric: tabular-nums; }
    .row span:first-child { color: #64748B; }
    .total { margin-top: 8px; display: flex; justify-content: space-between; align-items: center; border-radius: 12px;
             padding: 12px 16px; color: #fff; background: linear-gradient(90deg, #1D4ED8, #4F46E5); }
    .total span:first-child { font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; opacity: .9; }
    .total span:last-child { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .paid, .status-paid_recharge { color: #15803D; font-weight: 700; }
    .status-free_credit { color: #B45309; font-weight: 700; }
    .status-admin_credit { color: #475569; font-weight: 700; }
    .total-free_credit { background: linear-gradient(90deg, #B45309, #D97706); }
    .total-admin_credit { background: linear-gradient(90deg, #334155, #475569); }
    .stamp { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 999px; font-size: 10.5px;
             font-weight: 700; letter-spacing: .12em; }
    .stamp-paid_recharge { color: #15803D; background: #DCFCE7; }
    .stamp-free_credit { color: #B45309; background: #FEF3C7; }
    .stamp-admin_credit { color: #334155; background: #E2E8F0; }
    .seal { display: inline-block; margin-top: 16px; padding: 6px 14px; border: 2px solid currentColor; border-radius: 8px;
            font-size: 12px; font-weight: 800; letter-spacing: .16em; transform: rotate(-4deg); opacity: .85; }
    .seal-paid_recharge { color: #15803D; } .seal-free_credit { color: #B45309; } .seal-admin_credit { color: #475569; }
    .foot { margin-top: 48px; padding-top: 20px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between;
            align-items: flex-end; gap: 24px; break-inside: avoid; }
    .sys { font-size: 11px; line-height: 1.6; color: #94A3B8; }
    @media (max-width: 640px) {
      .inner { padding: 20px; } .head, .bill, .totals, .foot { flex-direction: column; align-items: stretch; }
      .doc, .bill dl { text-align: left; } .sum { width: 100%; }
    }
    @media print {
      html { background: #fff; } body { padding: 0; } .paper { max-width: none; border-radius: 0; box-shadow: none; }
      .inner { padding: 24px 0 0; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    """

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{esc(invoice.invoice_number)}</title>
<style>{css}</style></head><body>
<article class="paper"><div class="band"></div><div class="inner">
{header}
{body}
{footer}
</div></article>
</body></html>"""


def build_tax_payload_for_claims(
    *, claims: Iterable[dict[str, Any]], split: str = "igst"
) -> dict[str, Any]:
    """Lines + GST from GST-inclusive prices. ``split`` is "igst" or "cgst_sgst"."""
    lines: list[dict[str, Any]] = []
    subtotal_rupees = 0.0
    total_cents = 0

    for index, raw in enumerate(claims, start=1):
        line_total_cents = int(raw.get("total_cents") or 0)
        if line_total_cents <= 0:
            continue

        qty = max(1, int(raw.get("qty") or 1))
        lead_ref = str(raw.get("lead_ref") or f"Lead #{index}")
        description = str(raw.get("description") or "Digital Lead Generation Services")
        sac = str(raw.get("sac") or "998361")

        line_subtotal_rupees, _line_igst_rupees, _line_total_rupees = _gst_from_inclusive_total_cents(line_total_cents)
        unit_rate_rupees = round(line_subtotal_rupees / qty, 2)

        lines.append(
            {
                "lead_ref": lead_ref,
                "description": description,
                "sac": sac,
                "qty": qty,
                "unit_rate_rupees": f"{unit_rate_rupees:,.2f}",
                "amount_rupees": f"{line_subtotal_rupees:,.2f}",
            }
        )
        subtotal_rupees = round(subtotal_rupees + line_subtotal_rupees, 2)
        total_cents += line_total_cents

    total_rupees = round(total_cents / 100.0, 2)
    tax_rupees = round(total_rupees - subtotal_rupees, 2)
    out: dict[str, Any] = {
        "lines": lines,
        "subtotal_rupees": subtotal_rupees,
        "total_rupees": total_rupees,
        "amount_in_words": amount_in_words_from_cents(total_cents),
    }
    if split == "cgst_sgst":
        cgst = round(tax_rupees / 2, 2)
        out["cgst_rupees"] = cgst
        out["sgst_rupees"] = round(tax_rupees - cgst, 2)
    else:
        out["igst_rupees"] = tax_rupees
    return out


def build_tax_payload_for_single_lead(*, total_cents: int, lead_index: int = 1, lead_ref: str | None = None) -> dict[str, Any]:
    return build_tax_payload_for_claims(
        claims=[
            {
                "lead_ref": lead_ref or f"Lead #{lead_index}",
                "total_cents": total_cents,
            }
        ]
    )
