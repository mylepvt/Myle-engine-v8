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


def render_invoice_html(*, invoice: Invoice, member: User) -> str:
    payload: dict[str, Any] = dict(invoice.payload_json or {})
    # Issued documents render from their own snapshot; older ones fall back to live data.
    buyer = payload.get("buyer") or buyer_snapshot(member)
    seller = {**SELLER, **(payload.get("seller") or {})}
    display_name = html.escape(str(buyer.get("name") or f"User #{member.id}"))
    un = str(buyer.get("username") or "")
    username_line = html.escape(f"@{un}") if un else ""
    phone_line = html.escape(str(buyer.get("phone") or ""))

    supplier = f"""
    <div class="block">
      <div class="doctitle">{_doc_title(invoice.doc_type)}</div>
      <p><strong>Name:</strong> {html.escape(seller["name"])}</p>
      <p><strong>GSTIN:</strong> {html.escape(seller["gstin"])}</p>
      <p><strong>Address:</strong> {html.escape(seller["address"])}</p>
      <p><strong>State:</strong> {html.escape(seller["state"])} ({html.escape(seller["state_code"])})</p>
      <p><strong>Constitution:</strong> {html.escape(seller["constitution"])}</p>
    </div>
    """

    recipient = f"""
    <div class="block">
      <p><strong>Bill To</strong></p>
      <p><strong>{display_name}</strong></p>
      {f'<p>{username_line}</p>' if username_line else ''}
      {f'<p>{phone_line}</p>' if phone_line else ''}
    </div>
    """

    issued = invoice.issued_at
    date_s = str(payload.get("issued_on") or (issued_on_ist(issued) if isinstance(issued, datetime) else issued))
    against = payload.get("against_invoice")
    place = payload.get("place_of_supply")

    header_info = f"""
    <table class="meta">
      <tr><td><strong>No.</strong></td><td>{html.escape(invoice.invoice_number)}</td></tr>
      <tr><td><strong>Date of issue</strong></td><td>{html.escape(date_s)}</td></tr>
      <tr><td><strong>Type</strong></td><td>{html.escape(_type_label(invoice.doc_type))}</td></tr>
      {f'<tr><td><strong>Against invoice</strong></td><td>{html.escape(str(against))}</td></tr>' if against else ''}
      {f'<tr><td><strong>Place of supply</strong></td><td>{html.escape(str(place))}</td></tr>' if place else ''}
    </table>
    """

    body_main = ""
    if invoice.doc_type in ("tax_invoice", "credit_note"):
        lines = payload.get("lines") or []
        rows = []
        for row in lines:
            desc = html.escape(str(row.get("description", "")))
            sac = html.escape(str(row.get("sac", "998361")))
            qty = html.escape(str(row.get("qty", 1)))
            unit = html.escape(str(row.get("unit_rate_rupees", "")))
            amt = html.escape(str(row.get("amount_rupees", "")))
            ref = html.escape(str(row.get("lead_ref", "")))
            rows.append(
                f"<tr><td>{ref}</td><td>{desc}</td><td>{sac}</td><td class='r'>{qty}</td>"
                f"<td class='r'>{unit}</td><td class='r'>{amt}</td></tr>"
            )
        sub = float(payload.get("subtotal_rupees", 0))
        tot = float(payload.get("total_rupees", invoice.total_cents / 100.0))
        words = html.escape(str(payload.get("amount_in_words", _rupees_words_from_cents(invoice.total_cents))))
        if "cgst_rupees" in payload:
            tax_rows = (
                f"<p><strong>CGST @9%</strong> <span class=\"r\">₹{float(payload['cgst_rupees']):,.2f}</span></p>"
                f"<p><strong>SGST @9%</strong> <span class=\"r\">₹{float(payload['sgst_rupees']):,.2f}</span></p>"
            )
        else:
            tax_rows = f"<p><strong>IGST @18%</strong> <span class=\"r\">₹{float(payload.get('igst_rupees', 0)):,.2f}</span></p>"
        reason = payload.get("reason")
        reason_html = f"<p><strong>Reason:</strong> {html.escape(str(reason))}</p>" if reason else ""
        body_main = f"""
        {reason_html}
        <h3>Line items</h3>
        <table class="grid">
          <thead>
            <tr>
              <th>Ref</th><th>Description</th><th>SAC</th><th class='r'>Qty</th>
              <th class='r'>Unit Rate (₹)</th><th class='r'>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>{''.join(rows)}</tbody>
        </table>
        <div class="taxbox">
          <p><strong>Subtotal (taxable value)</strong> <span class="r">₹{sub:,.2f}</span></p>
          {tax_rows}
          <p class="big"><strong>{"Total Credit" if invoice.doc_type == "credit_note" else "Total Amount"}</strong> <span class="r">₹{tot:,.2f}</span></p>
          <p class="words"><em>Amount in words:</em> {words}</p>
        </div>
        """
    else:
        ref = html.escape(str(payload.get("payment_reference", "")))
        desc = html.escape(
            str(
                payload.get("receipt_description")
                or "Wallet Recharge — Myle Community Dashboard"
            )
        )
        body_main = f"""
        <h3>Summary</h3>
        <table class="grid">
          <tbody>
            <tr><td><strong>Description</strong></td><td>{desc}</td></tr>
            <tr><td><strong>Amount Received</strong></td><td class='r'>{_fmt_inr(invoice.total_cents)}</td></tr>
            <tr><td><strong>Payment Reference</strong></td><td>{ref}</td></tr>
            <tr><td><strong>Status</strong></td><td class="paid">PAID</td></tr>
          </tbody>
        </table>
        """

    footer = """
    <p class="footer">This is a computer-generated document and does not require a signature.</p>
    <p class="footer muted">Myle Community — dashboard.mylecommunity.in</p>
    """

    css = """
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
           color: #111; margin: 0; padding: 24px; background: #fff; }
    .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .block { max-width: 48%; font-size: 13px; line-height: 1.45; }
    .doctitle { font-size: 18px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.02em; }
    .meta { width: 100%; font-size: 13px; margin: 20px 0; border-collapse: collapse; }
    .meta td { padding: 4px 8px; border: 1px solid #ddd; }
    h3 { font-size: 14px; margin: 20px 0 8px; }
    .grid { width: 100%; border-collapse: collapse; font-size: 12px; }
    .grid th, .grid td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
    .grid th { background: #f5f5f5; text-align: left; }
    .r { text-align: right; }
    .taxbox { margin-top: 16px; max-width: 420px; margin-left: auto; font-size: 13px; }
    .taxbox p { display: flex; justify-content: space-between; gap: 12px; margin: 6px 0; }
    .big { font-size: 15px; }
    .words { display: block !important; margin-top: 10px; font-size: 12px; }
    .paid { color: #15803d; font-weight: 700; }
    .footer { text-align: center; font-size: 11px; color: #444; margin-top: 28px; }
    .muted { color: #666; margin-top: 4px; }
    @media print { body { padding: 12px; } }
    """

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>{html.escape(invoice.invoice_number)}</title>
<style>{css}</style></head><body>
<div class="top">{supplier}{recipient}</div>
{header_info}
{body_main}
{footer}
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
