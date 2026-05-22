"""Inbound webhooks — Meta WhatsApp Cloud API + outreach admin API."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.request
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.core.config import settings
from app.models.member_removal_outreach import MemberRemovalOutreach
from app.models.user import User
from app.models.whatsapp_inbound_message import WhatsAppInboundMessage
from app.services.whatsapp_inbox import store_inbound_message
from app.services.whatsapp_removal import get_meta_config, get_verify_token, record_reply

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Meta webhook verification (GET) — Meta sends this to confirm the endpoint
# ---------------------------------------------------------------------------

@router.get("/webhooks/whatsapp/reply")
async def verify_meta_webhook(
    session: Annotated[AsyncSession, Depends(get_db)],
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
) -> PlainTextResponse:
    """
    Meta Developer Console sends a GET request to verify your webhook URL.
    Set WHATSAPP_META_VERIFY_TOKEN env var OR save it in Settings → App → WhatsApp.
    """
    expected = await get_verify_token(session)
    if hub_mode == "subscribe" and hub_verify_token == expected and expected:
        logger.info("meta webhook verification success")
        return PlainTextResponse(hub_challenge)
    logger.warning("meta webhook verification failed mode=%s token_match=%s", hub_mode, hub_verify_token == expected)
    raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Verification failed")


# ---------------------------------------------------------------------------
# Inbound reply — handles both Meta Cloud API format AND simple custom format
# ---------------------------------------------------------------------------

class SimpleReplyPayload(BaseModel):
    """Simple format for non-Meta automation (n8n, custom scripts)."""
    phone: str
    message: str
    wa_message_id: Optional[str] = None


def _extract_meta_message_value(msg: dict[str, Any]) -> tuple[str, str | None, str | None]:
    msg_type = (msg.get("type") or "").strip().lower() or "unknown"

    if msg_type == "text":
        text = ((msg.get("text") or {}).get("body") or "").strip()
        return "text", text or None, None

    if msg_type == "button":
        button = msg.get("button") or {}
        text = (button.get("text") or button.get("payload") or "").strip()
        command_id = (button.get("payload") or button.get("text") or "").strip() or None
        return "button", text or None, command_id

    if msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        interactive_type = (interactive.get("type") or "").strip().lower()
        if interactive_type == "button_reply":
            reply = interactive.get("button_reply") or {}
            title = (reply.get("title") or "").strip()
            command_id = (reply.get("id") or title or "").strip() or None
            return "interactive_button_reply", title or command_id, command_id
        if interactive_type == "list_reply":
            reply = interactive.get("list_reply") or {}
            title = (reply.get("title") or "").strip()
            desc = (reply.get("description") or "").strip()
            command_id = (reply.get("id") or title or "").strip() or None
            text = " — ".join(part for part in [title, desc] if part)
            return "interactive_list_reply", text or command_id, command_id

    if msg_type == "image":
        return "image", "[📷 Image]", None
    if msg_type == "video":
        return "video", "[🎥 Video]", None
    if msg_type == "audio" or msg_type == "voice":
        return msg_type, "[🎵 Voice/Audio Message]", None
    if msg_type == "document":
        return "document", "[📄 Document]", None
    if msg_type == "sticker":
        return "sticker", "[🎨 Sticker]", None
    if msg_type == "location":
        return "location", "[📍 Location]", None
    if msg_type == "contacts":
        return "contacts", "[👤 Contact Card]", None

    return msg_type, f"[{msg_type.capitalize()} Message]", None


def _extract_meta_messages(body: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Parse Meta's nested webhook payload and return a flat list of
    supported inbound message dicts.
    """
    results: list[dict[str, Any]] = []
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            contacts_by_wa_id = {
                str(contact.get("wa_id") or ""): contact
                for contact in value.get("contacts", [])
                if contact.get("wa_id")
            }
            for msg in value.get("messages", []):
                phone = (msg.get("from") or "").strip()
                message_type, message_text, command_id = _extract_meta_message_value(msg)
                if not phone or not message_text:
                    continue
                contact = contacts_by_wa_id.get(phone, {})
                profile_name = ((contact.get("profile") or {}).get("name") or "").strip() or None
                results.append({
                    "phone": phone,
                    "profile_name": profile_name,
                    "message_type": message_type,
                    "message": message_text,
                    "command_id": command_id,
                    "wa_message_id": msg.get("id"),
                    "reply_to_wa_message_id": (msg.get("context") or {}).get("id"),
                    "raw_message": msg,
                })
    return results


@router.post("/webhooks/whatsapp/reply", status_code=200)
async def receive_whatsapp_reply(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[Optional[str], Header()] = None,
) -> dict:
    """
    Receives inbound WhatsApp messages in two formats:

    **Format A — Meta Cloud API (automatic when you set Meta webhook URL to this endpoint):**
    Meta sends its standard nested JSON. No auth header needed if WHATSAPP_META_VERIFY_TOKEN is set.

    **Format B — Simple / custom automation:**
    {
      "phone": "+919876543210",
      "message": "text here",
      "wa_message_id": "optional"
    }
    Secure with REMOVAL_WHATSAPP_REPLY_SECRET env var.
    """
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    # Detect Meta format by presence of "object" = "whatsapp_business_account"
    is_meta_format = body.get("object") == "whatsapp_business_account"

    if is_meta_format:
        # Meta sends its own signature header (x-hub-signature-256) for security.
        # For now we trust the verify_token handshake is sufficient.
        messages = _extract_meta_messages(body)
        if not messages:
            # Meta sends status updates (delivery, read) too — just ack them
            return {"ok": True, "matched": False, "stored": 0, "note": "no_supported_messages"}

        matched = 0
        stored = 0
        for msg in messages:
            match = None
            if msg["phone"] and msg["message"]:
                match = await record_reply(
                    phone=msg["phone"],
                    reply_text=msg["message"],
                    wa_message_id=msg.get("wa_message_id"),
                    session=session,
                )
                if match:
                    matched += 1
            await store_inbound_message(
                session=session,
                source="meta_cloud_api",
                phone=msg["phone"],
                profile_name=msg.get("profile_name"),
                message_type=msg.get("message_type") or "unknown",
                message_text=msg.get("message"),
                command_id=msg.get("command_id"),
                wa_message_id=msg.get("wa_message_id"),
                reply_to_wa_message_id=msg.get("reply_to_wa_message_id"),
                matched_removal_outreach_id=match.id if match else None,
                raw_payload=msg.get("raw_message"),
            )
            stored += 1
        await session.commit()
        logger.info("meta inbound: %d messages, %d stored, %d matched outreach records", len(messages), stored, matched)
        return {"ok": True, "matched": matched > 0, "count": matched, "stored": stored}

    # Simple format — authenticate with bearer secret
    secret = (settings.removal_whatsapp_reply_secret or "").strip()
    if secret:
        if not authorization or authorization != f"Bearer {secret}":
            raise HTTPException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook secret",
            )

    try:
        payload = SimpleReplyPayload.model_validate(body)
    except Exception:
        raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid payload")

    match = await record_reply(
        phone=payload.phone,
        reply_text=payload.message,
        wa_message_id=payload.wa_message_id,
        session=session,
    )
    inbox = await store_inbound_message(
        session=session,
        source="custom_webhook",
        phone=payload.phone,
        profile_name=None,
        message_type="text",
        message_text=payload.message,
        command_id=None,
        wa_message_id=payload.wa_message_id,
        reply_to_wa_message_id=None,
        matched_removal_outreach_id=match.id if match else None,
        raw_payload=body,
    )
    if match is None:
        logger.info("whatsapp reply: no outreach record matched for phone")
        await session.commit()
        return {"ok": True, "matched": False, "inbox_id": inbox.id}

    await session.commit()
    logger.info("whatsapp reply stored outreach_id=%s user_id=%s", match.id, match.user_id)
    return {"ok": True, "matched": True, "outreach_id": match.id, "inbox_id": inbox.id}


# ---------------------------------------------------------------------------
# Admin: list outreach records + replies
# ---------------------------------------------------------------------------

class OutreachItem(BaseModel):
    id: int
    user_id: int
    phone: Optional[str]
    member_name: str
    removal_reason: Optional[str]
    send_status: str
    sent_at: Optional[str]
    manual_share_url: Optional[str]
    reply_text: Optional[str]
    replied_at: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class OutreachListResponse(BaseModel):
    items: list[OutreachItem]
    total: int


class WhatsAppInboxItem(BaseModel):
    id: int
    source: str
    phone: Optional[str]
    profile_name: Optional[str]
    message_type: str
    message_text: Optional[str]
    command_key: Optional[str]
    wa_message_id: Optional[str]
    reply_to_wa_message_id: Optional[str]
    matched_lead_id: Optional[int]
    matched_user_id: Optional[int]
    matched_removal_outreach_id: Optional[int]
    received_at: str

    model_config = {"from_attributes": True}


class WhatsAppInboxListResponse(BaseModel):
    items: list[WhatsAppInboxItem]
    total: int


@router.get("/team/removal-outreach", response_model=OutreachListResponse)
async def list_removal_outreach(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    replied_only: bool = False,
) -> OutreachListResponse:
    """Admin: list all removal outreach records with member replies."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    stmt = select(MemberRemovalOutreach).order_by(MemberRemovalOutreach.created_at.desc())
    if replied_only:
        stmt = stmt.where(MemberRemovalOutreach.reply_text.isnot(None))

    rows = (await session.execute(stmt)).scalars().all()
    items = [
        OutreachItem(
            id=r.id,
            user_id=r.user_id,
            phone=r.phone,
            member_name=r.member_name,
            removal_reason=r.removal_reason,
            send_status=r.send_status,
            sent_at=r.sent_at.isoformat() if r.sent_at else None,
            manual_share_url=r.manual_share_url,
            reply_text=r.reply_text,
            replied_at=r.replied_at.isoformat() if r.replied_at else None,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
    return OutreachListResponse(items=items, total=len(items))


@router.get("/webhooks/whatsapp/inbox", response_model=WhatsAppInboxListResponse)
async def list_whatsapp_inbox(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    unmatched_only: bool = False,
) -> WhatsAppInboxListResponse:
    """Admin: inspect recent inbound WhatsApp replies and commands."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    safe_limit = max(1, min(limit, 200))
    stmt = select(WhatsAppInboundMessage)
    if unmatched_only:
        stmt = stmt.where(WhatsAppInboundMessage.matched_removal_outreach_id.is_(None))
    stmt = stmt.order_by(WhatsAppInboundMessage.received_at.desc()).limit(safe_limit)

    rows = (await session.execute(stmt)).scalars().all()
    items = [
        WhatsAppInboxItem(
            id=row.id,
            source=row.source,
            phone=row.phone,
            profile_name=row.profile_name,
            message_type=row.message_type,
            message_text=row.message_text,
            command_key=row.command_key,
            wa_message_id=row.wa_message_id,
            reply_to_wa_message_id=row.reply_to_wa_message_id,
            matched_lead_id=row.matched_lead_id,
            matched_user_id=row.matched_user_id,
            matched_removal_outreach_id=row.matched_removal_outreach_id,
            received_at=row.received_at.isoformat(),
        )
        for row in rows
    ]
    return WhatsAppInboxListResponse(items=items, total=len(items))


# ---------------------------------------------------------------------------
# WhatsApp connection status
# ---------------------------------------------------------------------------

class WhatsAppStatusResponse(BaseModel):
    configured: bool
    connected: Optional[bool] = None
    display_phone_number: Optional[str] = None
    verified_name: Optional[str] = None
    error: Optional[str] = None


def _get_json_sync(url: str, headers: dict[str, str], timeout: float) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return int(resp.status), resp.read().decode("utf-8", errors="replace")[:2000]


@router.get("/webhooks/whatsapp/status", response_model=WhatsAppStatusResponse)
async def get_whatsapp_status(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WhatsAppStatusResponse:
    """Check WhatsApp Meta Cloud API connection by pinging the phone number endpoint."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if not phone_number_id or not access_token:
        return WhatsAppStatusResponse(configured=False)

    url = (
        f"https://graph.facebook.com/{api_version}/{phone_number_id}"
        "?fields=display_phone_number,verified_name"
    )
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        status_code, body = await asyncio.to_thread(_get_json_sync, url, headers, 10.0)
        data: dict[str, Any] = json.loads(body) if body else {}
        if 200 <= status_code < 300:
            return WhatsAppStatusResponse(
                configured=True,
                connected=True,
                display_phone_number=data.get("display_phone_number"),
                verified_name=data.get("verified_name"),
            )
        err_msg = (data.get("error") or {}).get("message") or f"HTTP {status_code}"
        return WhatsAppStatusResponse(configured=True, connected=False, error=err_msg)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")[:500] if exc.fp else ""
        try:
            err_msg = (json.loads(raw).get("error") or {}).get("message") or f"HTTP {exc.code}"
        except Exception:
            err_msg = f"HTTP {exc.code}"
        return WhatsAppStatusResponse(configured=True, connected=False, error=err_msg)
    except Exception as exc:
        return WhatsAppStatusResponse(configured=True, connected=False, error=str(exc))


# ---------------------------------------------------------------------------
# Admin: WhatsApp activity log (includes inbound replies — fixes received_today)
# ---------------------------------------------------------------------------

from app.models.whatsapp_log import WhatsAppLog as _WhatsAppLog
from sqlalchemy import func as _func, and_ as _and_


class WhatsAppLogItem(BaseModel):
    id: int
    created_at: str
    direction: str
    message_type: str
    phone: Optional[str]
    message_preview: Optional[str]
    status: str
    error: Optional[str]
    wa_message_id: Optional[str]
    related_user_id: Optional[int]

    model_config = {"from_attributes": True}


class WhatsAppLogListResponse(BaseModel):
    items: list[WhatsAppLogItem]
    total: int
    sent_today: int
    failed_today: int
    received_today: int


@router.get("/webhooks/whatsapp/logs", response_model=WhatsAppLogListResponse)
async def get_whatsapp_logs(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    message_type: Optional[str] = None,
) -> WhatsAppLogListResponse:
    """Admin: paginated WhatsApp activity log with today's stats including inbound replies."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    import datetime as _dt
    from datetime import timezone as _tz

    from app.core.time_ist import today_ist

    filters = []
    if direction:
        filters.append(_WhatsAppLog.direction == direction)
    if status:
        filters.append(_WhatsAppLog.status == status)
    if message_type:
        filters.append(_WhatsAppLog.message_type == message_type)

    base_stmt = select(_WhatsAppLog)
    if filters:
        base_stmt = base_stmt.where(_and_(*filters))

    total_row = (await session.execute(
        select(_func.count()).select_from(base_stmt.subquery())
    )).scalar_one()

    rows = (await session.execute(
        base_stmt.order_by(_WhatsAppLog.created_at.desc()).limit(limit).offset(offset)
    )).scalars().all()

    # Today's stats (IST midnight → now)
    today_dt = today_ist()
    today_start = _dt.datetime(today_dt.year, today_dt.month, today_dt.day, tzinfo=_tz.utc)

    sent_today = (await session.execute(
        select(_func.count()).where(
            _WhatsAppLog.direction == "out",
            _WhatsAppLog.status == "sent",
            _WhatsAppLog.created_at >= today_start,
        )
    )).scalar_one()

    failed_today = (await session.execute(
        select(_func.count()).where(
            _WhatsAppLog.direction == "out",
            _WhatsAppLog.status == "failed",
            _WhatsAppLog.created_at >= today_start,
        )
    )).scalar_one()

    received_today = (await session.execute(
        select(_func.count()).where(
            _WhatsAppLog.direction == "in",
            _WhatsAppLog.created_at >= today_start,
        )
    )).scalar_one()

    items = [
        WhatsAppLogItem(
            id=r.id,
            created_at=r.created_at.isoformat(),
            direction=r.direction,
            message_type=r.message_type,
            phone=r.phone,
            message_preview=r.message_preview,
            status=r.status,
            error=r.error,
            wa_message_id=r.wa_message_id,
            related_user_id=r.related_user_id,
        )
        for r in rows
    ]

    return WhatsAppLogListResponse(
        items=items,
        total=total_row,
        sent_today=sent_today,
        failed_today=failed_today,
        received_today=received_today,
    )


# ---------------------------------------------------------------------------
# Admin: send a custom WhatsApp message to any phone
# ---------------------------------------------------------------------------

class CustomSendRequest(BaseModel):
    phone: str
    message: str


@router.post("/webhooks/whatsapp/send-custom")
async def send_custom_whatsapp(
    body: CustomSendRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: send any custom message to any phone number via Meta API."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    from app.services.whatsapp_log_service import log_wa_outbound
    from app.services.whatsapp_removal import _send_via_meta_api

    phone = body.phone.strip()
    message = body.message.strip()
    if not phone or not message:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="phone and message required")

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if not phone_number_id or not access_token:
        return {"ok": False, "error": "WhatsApp not configured in Settings"}

    result = await _send_via_meta_api(
        phone=phone,
        message=message,
        phone_number_id=phone_number_id,
        access_token=access_token,
        api_version=api_version,
    )
    await log_wa_outbound(
        session,
        phone=phone,
        message=message,
        message_type="leader_alert",
        result=result,
        related_user_id=auth_user.id,
    )
    await session.commit()
    return {
        "ok": result.get("ok", False),
        "wa_message_id": result.get("wa_message_id"),
        "error": result.get("error") or result.get("detail") if not result.get("ok") else None,
    }


# ---------------------------------------------------------------------------
# Admin: trigger daily summary for all leaders (or one) right now
# ---------------------------------------------------------------------------

class TriggerSummaryRequest(BaseModel):
    leader_user_id: Optional[int] = None  # None = all leaders


@router.post("/webhooks/whatsapp/trigger-daily-summary")
async def trigger_daily_summary(
    body: TriggerSummaryRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: fire the daily WhatsApp summary to all leaders (or a specific leader) right now."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    from app.core.time_ist import today_ist
    from app.services.whatsapp_leader_alerts import send_daily_team_summary

    today = today_ist()

    if body.leader_user_id:
        leader = (await session.execute(select(User).where(User.id == body.leader_user_id))).scalar_one_or_none()
        if not leader:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Leader not found")
        await send_daily_team_summary(leader, today, session)
        await session.commit()
        return {"ok": True, "sent_to": 1, "leader_id": leader.id}

    # All active leaders with phones
    leaders = (
        await session.execute(
            select(User).where(
                User.role == "leader",
                User.registration_status == "approved",
                User.removed_at.is_(None),
                User.phone.isnot(None),
            )
        )
    ).scalars().all()

    sent = 0
    for leader in leaders:
        try:
            await send_daily_team_summary(leader, today, session)
            sent += 1
        except Exception:
            logger.exception("daily summary failed for leader_id=%s", leader.id)

    await session.commit()
    return {"ok": True, "sent_to": sent, "total_leaders": len(leaders)}


# ---------------------------------------------------------------------------
# Admin: list all leaders with their WhatsApp phone status
# ---------------------------------------------------------------------------

@router.get("/webhooks/whatsapp/leaders")
async def list_leaders_phone_status(
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: returns all approved leaders with name, phone, and whether WA commands will work."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    from app.services.whatsapp_removal import _whatsapp_digits

    leaders = (
        await session.execute(
            select(User).where(
                User.role == "leader",
                User.registration_status == "approved",
                User.removed_at.is_(None),
            ).order_by(User.name)
        )
    ).scalars().all()

    items = []
    for u in leaders:
        normalized = _whatsapp_digits(u.phone)
        items.append({
            "id": u.id,
            "name": u.name or u.username or u.fbo_id or "—",
            "phone_raw": u.phone,
            "phone_normalized": normalized,
            "wa_enabled": normalized is not None,
        })

    return {
        "leaders": items,
        "total": len(items),
        "wa_enabled": sum(1 for i in items if i["wa_enabled"]),
        "no_phone": sum(1 for i in items if not i["wa_enabled"]),
    }

