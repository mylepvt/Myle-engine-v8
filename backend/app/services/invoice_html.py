"""Print-ready HTML for tax invoices and payment receipts."""

from __future__ import annotations

import html
from datetime import datetime
from typing import Any

from app.models.invoice import Invoice
from app.models.user import User
from app.services.invoice_rupees_words import rupees_int_to_words


def _fmt_inr(cents: int) -> str:
    rupees = cents / 100.0
    return f"₹{rupees:,.2f}"


def _gst_from_inclusive_total_cents(total_cents: int) -> tuple[float, float, float]:
    """GST-inclusive total → (base, igst, total) in rupees, 2 dp."""
    total_r = round(total_cents / 100.0, 2)
    base_r = round(total_r / 1.18, 2)
    igst_r = round(total_r - base_r, 2)
    return base_r, igst_r, total_r


def _doc_title(doc_type: str) -> str:
    return "TAX INVOICE" if doc_type == "tax_invoice" else "PAYMENT RECEIPT"


def _type_label(doc_type: str) -> str:
    return "Tax Invoice" if doc_type == "tax_invoice" else "Payment Receipt"


def render_invoice_html(*, invoice: Invoice, member: User) -> str:
    payload: dict[str, Any] = dict(invoice.payload_json or {})
    display_name = html.escape(
        (member.name or member.username or member.email or f"User #{member.id}").strip()
    )
    un = (member.username or "").strip()
    username_line = html.escape(f"@{un}") if un else ""
    phone_line = html.escape(member.phone.strip()) if member.phone and member.phone.strip() else ""

    supplier = """
    <div class="block">
      <div class="doctitle">{doctitle}</div>
      <p><strong>Name:</strong> M/S KARAN VEER SINGH</p>
      <p><strong>GSTIN:</strong> 08HKSPS3607C1ZS</p>
      <p><strong>Address:</strong> Karanpur, Sri Ganganagar, Rajasthan – 335073</p>
      <p><strong>Constitution:</strong> Proprietorship</p>
    </div>
    """.format(
        doctitle=_doc_title(invoice.doc_type),
    )

    recipient = f"""
    <div class="block">
      <p><strong>Bill To</strong></p>
      <p><strong>{display_name}</strong></p>
      {f'<p>{username_line}</p>' if username_line else ''}
      {f'<p>{phone_line}</p>' if phone_line else ''}
    </div>
    """

    issued = invoice.issued_at
    if isinstance(issued, datetime):
        date_s = issued.strftime("%d-%b-%Y")
    else:
        date_s = str(issued)

    header_info = f"""
    <table class="meta">
      <tr><td><strong>No.</strong></td><td>{html.escape(invoice.invoice_number)}</td></tr>
      <tr><td><strong>Date of issue</strong></td><td>{html.escape(date_s)}</td></tr>
      <tr><td><strong>Type</strong></td><td>{html.escape(_type_label(invoice.doc_type))}</td></tr>
    </table>
    """

    body_main = ""
    if invoice.doc_type == "tax_invoice":
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
        igst = float(payload.get("igst_rupees", 0))
        tot = float(payload.get("total_rupees", invoice.total_cents / 100.0))
        words = html.escape(str(payload.get("amount_in_words", rupees_int_to_words(invoice.total_cents))))
        body_main = f"""
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
          <p><strong>IGST @18%</strong> <span class="r">₹{igst:,.2f}</span></p>
          <p class="big"><strong>Total Amount</strong> <span class="r">₹{tot:,.2f}</span></p>
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


def build_tax_payload_for_single_lead(*, total_cents: int, lead_index: int = 1) -> dict[str, Any]:
    base_r, igst_r, total_r = _gst_from_inclusive_total_cents(total_cents)
    unit = round(base_r, 2)
    return {
        "lines": [
            {
                "lead_ref": f"Lead #{lead_index}",
                "description": "Digital Lead Generation Services",
                "sac": "998361",
                "qty": 1,
                "unit_rate_rupees": f"{unit:,.2f}",
                "amount_rupees": f"{unit:,.2f}",
            }
        ],
        "subtotal_rupees": base_r,
        "igst_rupees": igst_r,
        "total_rupees": total_r,
        "amount_in_words": rupees_int_to_words(total_cents),
    }
