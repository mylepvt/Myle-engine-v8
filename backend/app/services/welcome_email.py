"""The welcome email a lead gets after agreeing to the deposit terms and giving their email.

Table layout with inline styles only, so it renders the same in Gmail, Outlook and phone
mail apps. Every value is HTML-escaped. It promises nothing beyond the deposit terms, and
leaves the refund to the terms the lead already agreed to.
"""

from __future__ import annotations

from html import escape

LOGO_URL = "https://app.mylecommunity.in/pwa-192.png"

_BLUE = "#007aff"
_INK = "#1d1d1f"
_MUTED = "#6e6e73"
_BG = "#f5f5f7"


def _step(n: int, title: str, body: str) -> str:
    return f"""
<tr><td style="padding:0 0 18px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="40" valign="top">
      <div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:{_BLUE};color:#ffffff;
        font-size:14px;font-weight:700;text-align:center;">{n}</div>
    </td>
    <td valign="top" style="padding-top:4px;">
      <div style="font-size:16px;font-weight:600;color:{_INK};">{title}</div>
      <div style="font-size:14px;line-height:21px;color:{_MUTED};padding-top:3px;">{body}</div>
    </td>
  </tr></table>
</td></tr>"""


def render_welcome(*, name: str, business: str, support_email: str, amount_rupees: int) -> tuple[str, str, str]:
    """(subject, html, text) for the lead's welcome email."""
    first = (name.strip().split() or ["there"])[0]
    n, biz, mail = escape(first), escape(business), escape(support_email)
    subject = f"Welcome to {business}, {first}!"

    steps = "".join(
        (
            _step(1, "Your consent is saved", "You agreed to the deposit terms. They are kept safely with your enrollment."),
            _step(
                2,
                "Pay your deposit and get your receipt",
                f"After your ₹{amount_rupees} deposit is paid, your official receipt comes to you on WhatsApp.",
            ),
            _step(
                3,
                "Your journey begins",
                "The person who invited you will guide you through every next step, one at a time.",
            ),
        )
    )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:{_BG};-webkit-font-smoothing:antialiased;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">You are now part of {biz}. Here is what happens next.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:{_BG};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">

    <tr><td style="border-radius:24px 24px 0 0;background:{_BLUE};
      background-image:linear-gradient(135deg,#0a84ff 0%,#5e5ce6 100%);padding:40px 32px 36px 32px;text-align:center;">
      <img src="{LOGO_URL}" width="64" height="64" alt="{biz}"
        style="display:block;margin:0 auto 18px auto;border:0;border-radius:16px;">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#dbe9ff;font-weight:600;">Welcome to the family</div>
      <div style="font-size:30px;line-height:36px;font-weight:700;color:#ffffff;padding-top:10px;">Hi {n}, you're in! &#127881;</div>
      <div style="font-size:16px;line-height:24px;color:#eaf2ff;padding-top:12px;">
        Thank you for choosing {biz}. We're truly glad to have you with us.
      </div>
    </td></tr>

    <tr><td style="background:#ffffff;padding:32px 32px 18px 32px;">
      <div style="font-size:19px;font-weight:700;color:{_INK};padding-bottom:20px;">What happens next</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">{steps}</table>
    </td></tr>

    <tr><td style="background:#ffffff;border-radius:0 0 24px 24px;border-top:1px solid #e8e8ed;padding:24px 32px;text-align:center;">
      <div style="font-size:14px;line-height:21px;color:{_MUTED};">Questions? Just reply to this email or write to</div>
      <a href="mailto:{mail}" style="font-size:15px;font-weight:600;color:{_BLUE};text-decoration:none;">{mail}</a>
    </td></tr>

    <tr><td style="padding:20px 16px 0 16px;text-align:center;font-size:12px;line-height:18px;color:#86868b;">
      &copy; {biz}
    </td></tr>

  </table>
</td></tr></table>
</body></html>"""

    text = (
        f"Hi {first}, you're in!\n\n"
        f"Thank you for choosing {business}. We're truly glad to have you with us.\n\n"
        "What happens next\n"
        "1. Your consent is saved: you agreed to the deposit terms. They are kept safely with your enrollment.\n"
        f"2. Pay your deposit and get your receipt: after your Rs. {amount_rupees} deposit is paid, "
        "your official receipt comes to you on WhatsApp.\n"
        "3. Your journey begins: the person who invited you will guide you through every next step.\n\n"
        f"Questions? Reply to this email or write to {support_email}.\n\n"
        f"{business}\n"
    )
    return subject, html, text
