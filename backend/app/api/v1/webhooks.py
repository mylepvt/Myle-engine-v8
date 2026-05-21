"""Inbound webhooks — Meta WhatsApp Cloud API + outreach admin API."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
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
from app.services.whatsapp_removal import get_meta_config, get_verify_token, record_reply, send_removal_whatsapp

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


def _extract_meta_message_value(msg: dict[str, Any]) -> tuple[str, str | None]:
    msg_type = (msg.get("type") or "").strip().lower() or "unknown"

    if msg_type == "text":
        text = ((msg.get("text") or {}).get("body") or "").strip()
        return "text", text or None

    if msg_type == "button":
        button = msg.get("button") or {}
        text = (button.get("text") or button.get("payload") or "").strip()
        return "button", text or None

    if msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        interactive_type = (interactive.get("type") or "").strip().lower()
        if interactive_type == "button_reply":
            reply = interactive.get("button_reply") or {}
            text = (reply.get("title") or reply.get("id") or "").strip()
            return "interactive_button_reply", text or None
        if interactive_type == "list_reply":
            reply = interactive.get("list_reply") or {}
            title = (reply.get("title") or "").strip()
            desc = (reply.get("description") or "").strip()
            text = " — ".join(part for part in [title, desc] if part)
            return "interactive_list_reply", text or None

    return msg_type, None


def _extract_meta_messages(body: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Parse Meta's nested webhook payload and return a flat list of
    supported inbound message dicts.
    """
    results: list[dict[str, Any]] = []
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                message_type, message_text = _extract_meta_message_value(msg)
                if not message_text:
                    continue
                results.append({
                    "phone": msg.get("from", ""),
                    "message": message_text,
                    "message_type": message_type,
                    "wa_message_id": msg.get("id"),
                })
    return results


async def _handle_inbound_message(
    *,
    session: AsyncSession,
    phone: str,
    message: str,
    wa_message_id: str | None,
    message_type_hint: str | None = None,
) -> tuple[str, int | None]:
    """
    Unified inbound handling for Meta and custom/BSP forwarded payloads.

    Returns:
      (message_type_logged, related_user_id)
    """
    from app.services.whatsapp_leader_alerts import (
        alert_leader_member_replied,
        handle_leader_command,
    )
    from app.services.whatsapp_removal import _send_via_meta_api
    from app.services.whatsapp_log_service import log_wa_inbound, log_wa_outbound

    normalized_message = message.strip()
    if not phone or not normalized_message:
        return "inbound_unknown", None

    # First treat it as a possible leader command.
    cmd_reply = await handle_leader_command(phone, normalized_message, session)
    if cmd_reply:
        await log_wa_inbound(
            session,
            phone=phone,
            message=normalized_message,
            message_type="inbound_leader",
            wa_message_id=wa_message_id,
        )
        try:
            phone_number_id, access_token, api_version = await get_meta_config(session)
            if phone_number_id and access_token:
                result = await _send_via_meta_api(
                    phone=phone,
                    message=cmd_reply,
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    api_version=api_version,
                )
                await log_wa_outbound(
                    session,
                    phone=phone,
                    message=cmd_reply,
                    message_type="command_reply",
                    result=result,
                )
        except Exception:
            logger.exception("leader cmd reply send failed phone=%s", phone)
        return "inbound_leader", None

    # Otherwise try to match as a removed-member reply.
    match = await record_reply(
        phone=phone,
        reply_text=normalized_message,
        wa_message_id=wa_message_id,
        session=session,
    )
    logged_type = "inbound_member" if match else (message_type_hint or "inbound_unknown")
    await log_wa_inbound(
        session,
        phone=phone,
        message=normalized_message,
        message_type=logged_type,
        wa_message_id=wa_message_id,
        related_user_id=match.user_id if match else None,
    )
    if match:
        try:
            await alert_leader_member_replied(match.user_id, normalized_message, session)
        except Exception:
            logger.exception("leader reply-forward failed user_id=%s", match.user_id)
        return "inbound_member", match.user_id
    return logged_type, None


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
            return {"ok": True, "matched": False, "note": "no_supported_messages"}

        matched = 0
        for msg in messages:
            if not msg["phone"] or not msg["message"]:
                continue
            logged_type, related_user_id = await _handle_inbound_message(
                session=session,
                phone=msg["phone"],
                message=msg["message"],
                wa_message_id=msg.get("wa_message_id"),
                message_type_hint=msg.get("message_type") or "inbound_unknown",
            )
            if logged_type == "inbound_member" and related_user_id is not None:
                matched += 1

        await session.commit()
        logger.info("meta inbound: %d messages, %d matched outreach records", len(messages), matched)
        return {"ok": True, "matched": matched > 0, "count": matched}

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

    logged_type, related_user_id = await _handle_inbound_message(
        session=session,
        phone=payload.phone,
        message=payload.message,
        wa_message_id=payload.wa_message_id,
        message_type_hint="inbound_unknown",
    )
    if logged_type != "inbound_member" or related_user_id is None:
        logger.info("whatsapp reply: no outreach record matched for phone")
        await session.commit()
        return {"ok": True, "matched": False}

    await session.commit()
    logger.info("whatsapp reply stored related_user_id=%s", related_user_id)
    return {"ok": True, "matched": True, "related_user_id": related_user_id}


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
    items = [_outreach_to_item(r) for r in rows]
    return OutreachListResponse(items=items, total=len(items))


# ---------------------------------------------------------------------------
# Admin: manually trigger outreach for a single removed member
# ---------------------------------------------------------------------------

def _outreach_to_item(r: MemberRemovalOutreach) -> OutreachItem:
    return OutreachItem(
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


# ---------------------------------------------------------------------------
# Admin: test Meta API with a real phone number — shows full response
# ---------------------------------------------------------------------------

class TestSendRequest(BaseModel):
    phone: str


@router.post("/webhooks/whatsapp/test-send")
async def test_whatsapp_send(
    body: TestSendRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: send a test WhatsApp message and return Meta's raw response for debugging."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    from app.services.whatsapp_removal import _whatsapp_digits, _post_json_sync

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if not phone_number_id or not access_token:
        return {"ok": False, "error": "WhatsApp credentials not configured in Settings"}

    digits = _whatsapp_digits(body.phone)
    if not digits:
        return {"ok": False, "error": f"Invalid phone number: {body.phone}"}

    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": digits,
        "type": "text",
        "text": {"preview_url": False, "body": "Myle test message — agar yeh aaya toh API kaam kar rahi hai ✓"},
    }
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        import urllib.error as _ue
        status_code, resp_body = await asyncio.to_thread(_post_json_sync, url, payload, headers, 15.0)
        parsed = json.loads(resp_body) if resp_body else {}
        return {
            "ok": 200 <= status_code < 300,
            "http_status": status_code,
            "to_digits": digits,
            "phone_number_id": phone_number_id,
            "api_version": api_version,
            "meta_response": parsed,
        }
    except _ue.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")[:1000] if exc.fp else ""
        try:
            parsed_err = json.loads(raw)
        except Exception:
            parsed_err = raw
        return {
            "ok": False,
            "http_status": exc.code,
            "to_digits": digits,
            "phone_number_id": phone_number_id,
            "api_version": api_version,
            "meta_response": parsed_err,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "to_digits": digits}


class ManualSendRequest(BaseModel):
    phone: Optional[str] = None


@router.post("/team/removal-outreach/{user_id}/send", response_model=OutreachItem)
async def send_removal_outreach_manual(
    user_id: int,
    body: ManualSendRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    force: bool = False,
) -> OutreachItem:
    """Admin: manually send (or re-send) WhatsApp outreach for a removed member.
    Pass ?force=true to resend even if already marked sent.
    Pass {phone} in body to override/set the phone number for members missing one."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    # Only block if a real Meta send succeeded — stub means phone was missing, always allow retry
    if not force:
        already_sent = (
            await session.execute(
                select(MemberRemovalOutreach)
                .where(
                    MemberRemovalOutreach.user_id == user_id,
                    MemberRemovalOutreach.send_status == "sent",
                )
                .order_by(MemberRemovalOutreach.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if already_sent:
            return _outreach_to_item(already_sent)

    target = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    # If admin supplies a phone, save it to the user record so future sends work automatically
    if body.phone and body.phone.strip():
        target.phone = body.phone.strip()
        await session.flush()

    record = await send_removal_whatsapp(user=target, session=session)
    await session.commit()
    return _outreach_to_item(record)


# ---------------------------------------------------------------------------
# Admin: test leader alert functions without waiting for real events
# ---------------------------------------------------------------------------

class TestLeaderAlertRequest(BaseModel):
    alert_type: str  # "removal" | "grace" | "approval" | "reply" | "summary" | "command"
    member_user_id: Optional[int] = None
    leader_user_id: Optional[int] = None  # for summary/command, send to this leader
    message: Optional[str] = None  # for "reply" and "command" types


@router.post("/webhooks/whatsapp/test-leader-alerts")
async def test_leader_alerts(
    body: TestLeaderAlertRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Admin: fire leader alert functions manually to verify they work end-to-end."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    from app.services.whatsapp_leader_alerts import (
        alert_leader_grace_requested,
        alert_leader_member_removed,
        alert_leader_member_replied,
        alert_leader_new_member_approved,
        handle_leader_command,
        send_daily_team_summary,
    )
    from app.core.time_ist import today_ist

    alert_type = body.alert_type.strip().lower()

    if alert_type in {"removal", "grace", "approval", "reply"}:
        if not body.member_user_id:
            return {"ok": False, "error": "member_user_id required for this alert_type"}
        member = (await session.execute(select(User).where(User.id == body.member_user_id))).scalar_one_or_none()
        if not member:
            return {"ok": False, "error": f"User {body.member_user_id} not found"}

        if alert_type == "removal":
            await alert_leader_member_removed(member, "Test removal reason", session)
            return {"ok": True, "sent": "removal alert to leader of user " + str(body.member_user_id)}

        if alert_type == "grace":
            await alert_leader_grace_requested(member, "Test grace reason", None, session)
            return {"ok": True, "sent": "grace alert to leader of user " + str(body.member_user_id)}

        if alert_type == "approval":
            await alert_leader_new_member_approved(member, session)
            return {"ok": True, "sent": "approval alert to leader of user " + str(body.member_user_id)}

        if alert_type == "reply":
            reply_text = body.message or "Test reply message from member"
            await alert_leader_member_replied(member.id, reply_text, session)
            return {"ok": True, "sent": "reply-forward alert to leader of user " + str(body.member_user_id)}

    if alert_type == "summary":
        if not body.leader_user_id:
            return {"ok": False, "error": "leader_user_id required for summary"}
        leader = (await session.execute(select(User).where(User.id == body.leader_user_id))).scalar_one_or_none()
        if not leader:
            return {"ok": False, "error": f"User {body.leader_user_id} not found"}
        await send_daily_team_summary(leader, today_ist(), session)
        return {"ok": True, "sent": f"daily summary to leader_id={body.leader_user_id}"}

    if alert_type == "command":
        if not body.leader_user_id or not body.message:
            return {"ok": False, "error": "leader_user_id and message required for command"}
        leader = (await session.execute(select(User).where(User.id == body.leader_user_id))).scalar_one_or_none()
        if not leader or not leader.phone:
            return {"ok": False, "error": "Leader not found or has no phone"}
        reply = await handle_leader_command(leader.phone, body.message, session)
        if reply is None:
            return {"ok": False, "error": "Command not recognized or user is not a leader", "tried_phone": leader.phone}
        from app.services.whatsapp_removal import _send_via_meta_api
        phone_number_id, access_token, api_version = await get_meta_config(session)
        if phone_number_id and access_token:
            result = await _send_via_meta_api(
                phone=leader.phone,
                message=reply,
                phone_number_id=phone_number_id,
                access_token=access_token,
                api_version=api_version,
            )
            return {"ok": result.get("ok", False), "command_reply_preview": reply[:200], "meta": result}
        return {"ok": False, "error": "WhatsApp not configured", "reply_would_be": reply[:200]}

    return {"ok": False, "error": f"Unknown alert_type: {body.alert_type}. Use: removal|grace|approval|reply|summary|command"}


# ---------------------------------------------------------------------------
# Admin: WhatsApp activity log
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
    """Admin: paginated WhatsApp activity log with today's stats."""
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    from datetime import date, timezone as _tz
    import datetime as _dt

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
    from app.core.time_ist import today_ist
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

    from app.services.whatsapp_removal import _send_via_meta_api
    from app.services.whatsapp_log_service import log_wa_outbound

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
# Admin: broadcast custom message to all leaders or all team
# ---------------------------------------------------------------------------

class BroadcastRequest(BaseModel):
    message: str
    recipients: str  # "leaders" | "team" | "all"


class BroadcastResultItem(BaseModel):
    user_id: int
    name: str
    phone_tail: str
    status: str  # "sent" | "failed" | "no_phone"


class BroadcastResponse(BaseModel):
    sent: int
    failed: int
    no_phone: int
    results: list[BroadcastResultItem]


@router.post("/webhooks/whatsapp/broadcast", response_model=BroadcastResponse)
async def broadcast_whatsapp(
    body: BroadcastRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BroadcastResponse:
    """Admin: send a custom message to all leaders, all team, or everyone."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="message required")

    from app.models.user import User
    from app.services.whatsapp_removal import _send_via_meta_api
    from app.services.whatsapp_log_service import log_wa_outbound

    roles: list[str] = []
    if body.recipients == "leaders":
        roles = ["leader"]
    elif body.recipients == "team":
        roles = ["team"]
    else:
        roles = ["leader", "team"]

    users = (
        await session.execute(
            select(User).where(
                User.role.in_(roles),
                User.registration_status == "approved",
                User.removed_at.is_(None),
                User.access_blocked.is_(False),
                User.phone.isnot(None),
            ).order_by(User.name.asc())
        )
    ).scalars().all()

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if not phone_number_id or not access_token:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="WhatsApp not configured in Settings")

    sent = failed = no_phone = 0
    results: list[BroadcastResultItem] = []

    for user in users:
        phone = getattr(user, "phone", None) or ""
        name = (user.name or getattr(user, "username", None) or user.fbo_id or "Member").strip()
        phone_tail = phone[-4:] if phone else "—"

        if not phone:
            no_phone += 1
            results.append(BroadcastResultItem(user_id=user.id, name=name, phone_tail="—", status="no_phone"))
            continue

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
            related_user_id=user.id,
        )
        if result.get("ok"):
            sent += 1
            results.append(BroadcastResultItem(user_id=user.id, name=name, phone_tail=phone_tail, status="sent"))
        else:
            failed += 1
            results.append(BroadcastResultItem(user_id=user.id, name=name, phone_tail=phone_tail, status="failed"))

    await session.commit()
    return BroadcastResponse(sent=sent, failed=failed, no_phone=no_phone, results=results)


# ---------------------------------------------------------------------------
# Admin: send personalized performance insights to members/leaders
# ---------------------------------------------------------------------------

class InsightsBroadcastRequest(BaseModel):
    recipients: str   # "leaders" | "team" | "all"
    period: int       # 7 or 30


@router.post("/webhooks/whatsapp/send-insights", response_model=BroadcastResponse)
async def send_insights_broadcast(
    body: InsightsBroadcastRequest,
    auth_user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BroadcastResponse:
    """Admin: send personalized 7/30-day performance insight to each member via WhatsApp."""
    if auth_user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin only")

    if body.period not in (7, 30):
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="period must be 7 or 30")

    from app.models.user import User
    from app.services.whatsapp_insights import build_insight_message
    from app.services.whatsapp_removal import _send_via_meta_api
    from app.services.whatsapp_log_service import log_wa_outbound

    roles: list[str] = []
    if body.recipients == "leaders":
        roles = ["leader"]
    elif body.recipients == "team":
        roles = ["team"]
    else:
        roles = ["leader", "team"]

    users = (
        await session.execute(
            select(User).where(
                User.role.in_(roles),
                User.registration_status == "approved",
                User.removed_at.is_(None),
                User.access_blocked.is_(False),
                User.phone.isnot(None),
            ).order_by(User.name.asc())
        )
    ).scalars().all()

    phone_number_id, access_token, api_version = await get_meta_config(session)
    if not phone_number_id or not access_token:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="WhatsApp not configured")

    sent = failed = no_phone = 0
    results: list[BroadcastResultItem] = []

    for user in users:
        phone = getattr(user, "phone", None) or ""
        name = (user.name or getattr(user, "username", None) or user.fbo_id or "Member").strip()
        phone_tail = phone[-4:] if phone else "—"

        if not phone:
            no_phone += 1
            results.append(BroadcastResultItem(user_id=user.id, name=name, phone_tail="—", status="no_phone"))
            continue

        message = await build_insight_message(user=user, period=body.period, session=session)
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
            related_user_id=user.id,
        )
        if result.get("ok"):
            sent += 1
            results.append(BroadcastResultItem(user_id=user.id, name=name, phone_tail=phone_tail, status="sent"))
        else:
            failed += 1
            results.append(BroadcastResultItem(user_id=user.id, name=name, phone_tail=phone_tail, status="failed"))

    await session.commit()
    return BroadcastResponse(sent=sent, failed=failed, no_phone=no_phone, results=results)


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

    from app.services.whatsapp_leader_alerts import send_daily_team_summary
    from app.core.time_ist import today_ist

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
