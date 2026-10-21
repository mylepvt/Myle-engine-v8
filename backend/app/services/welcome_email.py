"""The welcome email a lead gets after agreeing to the deposit terms and giving their email.

Table layout with inline styles only, so it renders the same in Gmail, Outlook and phone
mail apps. Every value is HTML-escaped. Gold and cream from the Myle logo
(``frontend/public/email/myle-logo.png``). It promises nothing beyond the deposit terms, and
leaves the refund to the terms the lead already agreed to.
"""

from __future__ import annotations

from html import escape

LOGO_URL = "https://app.mylecommunity.in/email/myle-logo.png"

_GOLD = "#b8892e"  # darker than the logo's gold, so text on white stays readable
_GOLD_SOFT = "#f3e6c4"
_CREAM = "#fbf6ea"
_INK = "#2b2416"
_MUTED = "#6f6553"
_LINE = "#ece2cb"

_STEPS = (
    (
        "You are never on your own",
        "From today, you have a mentor and a whole community behind you. Any question, any doubt, "
        "big or small, just ask. Someone will always be there to help.",
    ),
    (
        "3 days of guided training",
        "Over the next 3 days we will walk you through everything, step by step and at your pace. "
        "Show up, ask freely, and learn alongside people who started just like you.",
    ),
    (
        "Grow together",
        "Here we cheer for each other's progress, share what we learn and lift each other up. "
        "You're not joining a group, you're joining a family.",
    ),
)


def _day_pills() -> str:
    pills = "".join(
        f'<td style="padding-right:6px;"><div style="background:{_GOLD_SOFT};color:{_GOLD};font-size:12px;'
        f'font-weight:700;letter-spacing:0.5px;border-radius:12px;padding:4px 11px;">DAY {d}</div></td>'
        for d in (1, 2, 3)
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>{pills}</tr></table>'


def _step(n: int, title: str, body: str, *, last: bool) -> str:
    extra = _day_pills() if n == 2 else ""
    return f"""
<tr><td style="padding:0 0 {0 if last else 22}px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="44" valign="top">
      <div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:{_GOLD};color:#ffffff;
        font-size:14px;font-weight:700;text-align:center;">{n}</div>
    </td>
    <td valign="top" style="padding-top:5px;">
      <div style="font-size:16px;font-weight:700;color:{_INK};">{title}</div>
      <div style="font-size:14px;line-height:22px;color:{_MUTED};padding-top:4px;">{body}</div>{extra}
    </td>
  </tr></table>
</td></tr>"""


def render_welcome(*, name: str, business: str, support_email: str, amount_rupees: int) -> tuple[str, str, str]:
    """(subject, html, text) for the lead's welcome email."""
    del amount_rupees  # the welcome is about the journey, not the deposit
    first = (name.strip().split() or ["there"])[0]
    n, biz, mail = escape(first), escape(business), escape(support_email)
    subject = f"Welcome to the {business} family, {first}!"
    steps = "".join(_step(i, t, b, last=i == len(_STEPS)) for i, (t, b) in enumerate(_STEPS, start=1))

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:{_CREAM};-webkit-font-smoothing:antialiased;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">You're part of {biz} now. Your mentor, your community and 3 days of training are ready for you.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:{_CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="max-width:560px;background:#ffffff;border-radius:24px;border:1px solid {_LINE};">

    <tr><td style="padding:40px 32px 0 32px;text-align:center;">
      <img src="{LOGO_URL}" width="112" height="140" alt="{biz}" style="display:block;margin:0 auto;border:0;">
    </td></tr>

    <tr><td style="padding:28px 32px 0 32px;text-align:center;">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:{_GOLD};font-weight:700;">Welcome to the family</div>
      <div style="font-size:28px;line-height:36px;font-weight:700;color:{_INK};padding-top:12px;">Hi {n}, we're so glad you're here</div>
      <div style="font-size:16px;line-height:25px;color:{_MUTED};padding-top:14px;">
        Thank you for choosing {biz}. Every big journey starts with one brave step, and you have just
        taken yours. From here on, you walk with us.
      </div>
    </td></tr>

    <tr><td style="padding:28px 32px 0 32px;"><div style="height:1px;background:{_LINE};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>

    <tr><td style="padding:28px 32px 0 32px;">
      <div style="font-size:19px;font-weight:700;color:{_INK};padding-bottom:22px;">What happens next</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">{steps}</table>
    </td></tr>

    <tr><td style="padding:28px 32px 0 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="background:{_CREAM};border-radius:16px;border:1px solid {_LINE};"><tr><td style="padding:20px 22px;">
        <div style="font-size:15px;line-height:24px;color:{_INK};font-style:italic;">
          &ldquo;Alone we can do so little; together we can do so much.&rdquo;
        </div>
        <div style="font-size:12px;color:{_GOLD};font-weight:700;padding-top:4px;">HELEN KELLER</div>
        <div style="font-size:14px;line-height:22px;color:{_MUTED};padding-top:10px;">
          That is how we work at {biz}. Welcome aboard, {n}. We can't wait to see you grow.
        </div>
      </td></tr></table>
    </td></tr>

    <tr><td style="padding:28px 32px 0 32px;">
      <div style="font-size:15px;line-height:23px;color:{_INK};">With warmth,<br>
        <span style="font-weight:700;color:{_GOLD};">Team {biz}</span></div>
    </td></tr>

    <tr><td style="padding:28px 32px 32px 32px;">
      <div style="border-top:1px solid {_LINE};padding-top:22px;text-align:center;">
        <div style="font-size:14px;line-height:21px;color:{_MUTED};">Questions? Just reply to this email or write to</div>
        <a href="mailto:{mail}" style="font-size:15px;font-weight:700;color:{_GOLD};text-decoration:none;">{mail}</a>
      </div>
    </td></tr>

  </table>
  <div style="font-size:12px;line-height:18px;color:#a39880;padding-top:20px;text-align:center;">&copy; {biz}</div>
</td></tr></table>
</body></html>"""

    text = (
        f"Hi {first}, we're so glad you're here!\n\n"
        f"Thank you for choosing {business}. Every big journey starts with one brave step, and you have "
        "just taken yours. From here on, you walk with us.\n\n"
        "What happens next\n"
        + "".join(f"{i}. {t}: {b}\n" for i, (t, b) in enumerate(_STEPS, start=1))
        + f"\nWelcome aboard, {first}. We can't wait to see you grow.\n\n"
        f"With warmth,\nTeam {business}\n\n"
        f"Questions? Reply to this email or write to {support_email}.\n"
    )
    return subject, html, text
