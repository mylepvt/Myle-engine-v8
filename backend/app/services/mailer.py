"""Outgoing email over SMTP (GoDaddy Titan by default: ``smtp.titan.email``, port 465 SSL).

Configured with ``SMTP_USER`` / ``SMTP_PASSWORD`` (the mailbox login); the mailbox is also the
sender. With no credentials, ``mail_configured()`` is False and callers just skip sending.
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import settings

SMTP_TIMEOUT_SECONDS = 20


class MailError(Exception):
    pass


def mail_configured() -> bool:
    return bool(settings.smtp_user.strip() and settings.smtp_password)


def _build(to: str, subject: str, html: str, text: str) -> EmailMessage:
    sender = settings.smtp_user.strip()
    msg = EmailMessage()
    msg["From"] = formataddr((settings.mail_from_name, sender))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Reply-To"] = sender
    msg["Message-ID"] = make_msgid(domain=sender.rpartition("@")[2] or None)
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


def _send_sync(msg: EmailMessage) -> None:
    ctx = ssl.create_default_context()
    host, port = settings.smtp_host, settings.smtp_port
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT_SECONDS, context=ctx) as smtp:
            smtp.login(settings.smtp_user.strip(), settings.smtp_password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            smtp.starttls(context=ctx)
            smtp.login(settings.smtp_user.strip(), settings.smtp_password)
            smtp.send_message(msg)


async def send_email(*, to: str, subject: str, html: str, text: str) -> None:
    """Send one email. Raises ``MailError`` when it isn't configured or the server refuses."""
    if not mail_configured():
        raise MailError("Email is not configured.")
    try:
        await asyncio.to_thread(_send_sync, _build(to, subject, html, text))
    except (smtplib.SMTPException, OSError) as e:
        raise MailError(str(e)) from e
