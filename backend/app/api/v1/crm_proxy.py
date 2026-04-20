"""
CRM Proxy — FastAPI gateway to the CRM Fastify microservice.

Every request hitting /api/v1/crm/* is:
  1. Authenticated via FastAPI JWT cookie (same as all other routes).
  2. Forwarded to CRM_API_URL with the raw access token as Bearer header
     so the CRM can extract sub + role from it.
  3. Response (body + status) is streamed back as-is.

FastAPI is the single writer for lead lifecycle. CRM remains for wallet,
pool-claim, leaderboard, and shadow-read surfaces only.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db
from app.core.auth_cookie import MYLE_ACCESS_COOKIE
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared async client — reused across requests (connection pooling).
_crm_client: httpx.AsyncClient | None = None


def get_crm_client() -> httpx.AsyncClient:
    global _crm_client
    if _crm_client is None or _crm_client.is_closed:
        _crm_client = httpx.AsyncClient(
            base_url=settings.crm_api_url,
            timeout=httpx.Timeout(30.0),
        )
    return _crm_client


# ---------------------------------------------------------------------------
# Dependency: require authenticated user (reuses existing FastAPI JWT check)
# ---------------------------------------------------------------------------

from app.api.deps import require_auth_user  # noqa: E402 — after router definition
from app.models.lead import Lead
from sqlalchemy import select


async def _proxy(
    request: Request,
    crm_path: str,
    user: AuthUser,
) -> Response:
    """Forward a request to CRM API, injecting the caller's JWT as Bearer."""
    token = request.cookies.get(MYLE_ACCESS_COOKIE, "")

    # Build forwarded headers — drop hop-by-hop and host, inject auth.
    skip = {"host", "cookie", "content-length", "transfer-encoding", "connection"}
    headers: dict[str, str] = {
        k: v for k, v in request.headers.items() if k.lower() not in skip
    }
    headers["authorization"] = f"Bearer {token}"

    body = await request.body()

    crm_url = f"/api/v1{crm_path}"
    client = get_crm_client()

    try:
        crm_resp = await client.request(
            method=request.method,
            url=crm_url,
            headers=headers,
            content=body,
            params=dict(request.query_params),
        )
    except httpx.ConnectError:
        logger.error("CRM proxy: cannot connect to %s", settings.crm_api_url)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRM service unavailable",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="CRM service timed out",
        )

    # Strip hop-by-hop response headers before forwarding.
    skip_resp = {"transfer-encoding", "connection", "keep-alive", "content-encoding"}
    resp_headers = {
        k: v for k, v in crm_resp.headers.items() if k.lower() not in skip_resp
    }

    return Response(
        content=crm_resp.content,
        status_code=crm_resp.status_code,
        headers=resp_headers,
        media_type=crm_resp.headers.get("content-type", "application/json"),
    )


# ---------------------------------------------------------------------------
# Catch-all proxy routes  (/api/v1/crm/<anything>)
# ---------------------------------------------------------------------------

AuthDep = Annotated[AuthUser, Depends(require_auth_user)]


def _crm_lifecycle_gone(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_410_GONE, detail=detail)


@router.post("/crm/leads/{lead_id}/transition", tags=["crm"])
async def crm_lead_transition_blocked(lead_id: int, user: AuthDep) -> Response:
    _ = (lead_id, user)
    raise _crm_lifecycle_gone("Lead lifecycle moved to /api/v1/leads/{id}/transition")


@router.get("/crm/leads", tags=["crm"])
async def crm_lead_list_blocked(user: AuthDep) -> Response:
    _ = user
    raise _crm_lifecycle_gone("Lead reads are no longer served from CRM")


@router.post("/crm/leads", tags=["crm"])
async def crm_lead_create_blocked(user: AuthDep) -> Response:
    _ = user
    raise _crm_lifecycle_gone("Lead creation moved to /api/v1/leads")


@router.post("/crm/leads/{lead_id}/reassign", tags=["crm"])
async def crm_lead_reassign_blocked(lead_id: int, user: AuthDep) -> Response:
    _ = (lead_id, user)
    raise _crm_lifecycle_gone("Lead reassignment is no longer handled through CRM")


@router.post("/crm/leads/{lead_id}/close", tags=["crm"])
async def crm_lead_close_blocked(lead_id: int, user: AuthDep) -> Response:
    _ = (lead_id, user)
    raise _crm_lifecycle_gone("Lead closing is no longer handled through CRM")


@router.get("/crm/escalations", tags=["crm"])
async def crm_escalations_blocked(user: AuthDep) -> Response:
    _ = user
    raise _crm_lifecycle_gone("Escalations are no longer served from CRM")


@router.post("/crm/escalations", tags=["crm"])
async def crm_create_escalation_blocked(user: AuthDep) -> Response:
    _ = user
    raise _crm_lifecycle_gone("Escalations are no longer created through CRM")


@router.post("/crm/escalations/{escalation_id}/ack", tags=["crm"])
async def crm_ack_escalation_blocked(escalation_id: str, user: AuthDep) -> Response:
    _ = (escalation_id, user)
    raise _crm_lifecycle_gone("Escalations are no longer acknowledged through CRM")


@router.post("/crm/pool/claim", tags=["crm"])
async def crm_proxy_pool_claim(
    request: Request,
    user: AuthDep,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Forward pool claim to CRM; on success create vl2 tax invoice (CRM wallet is source of truth)."""
    body_bytes = await request.body()
    token = request.cookies.get(MYLE_ACCESS_COOKIE, "")

    skip = {"host", "cookie", "content-length", "transfer-encoding", "connection"}
    headers: dict[str, str] = {
        k: v for k, v in request.headers.items() if k.lower() not in skip
    }
    headers["authorization"] = f"Bearer {token}"

    client = get_crm_client()
    try:
        crm_resp = await client.request(
            method="POST",
            url="/api/v1/pool/claim",
            headers=headers,
            content=body_bytes,
        )
    except httpx.ConnectError:
        logger.error("CRM proxy: cannot connect to %s", settings.crm_api_url)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRM service unavailable",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="CRM service timed out",
        )

    skip_resp = {"transfer-encoding", "connection", "keep-alive", "content-encoding"}
    resp_headers = {
        k: v for k, v in crm_resp.headers.items() if k.lower() not in skip_resp
    }
    resp = Response(
        content=crm_resp.content,
        status_code=crm_resp.status_code,
        headers=resp_headers,
        media_type=crm_resp.headers.get("content-type", "application/json"),
    )

    if not (200 <= crm_resp.status_code < 300):
        return resp

    try:
        req_json = json.loads(body_bytes.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return resp
    idem = str(req_json.get("idempotencyKey") or "").strip()
    if len(idem) < 8:
        return resp

    try:
        lead_json = json.loads(crm_resp.content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return resp

    def _lead_pool_price_cents(lead: dict) -> int:
        price_raw = lead.get("poolPriceCents") or lead.get("pool_price_cents")
        try:
            return int(price_raw or 0)
        except (TypeError, ValueError):
            return 0

    def _lead_ref(lead: dict, index: int) -> str:
        raw_id = lead.get("legacyId") or lead.get("legacy_id") or lead.get("id")
        return f"Lead #{raw_id or index}"

    try:
        from app.services.invoice_records import create_tax_invoice_for_pool_claim, create_tax_invoice_for_pool_claims

        batch_leads = lead_json.get("leads") if isinstance(lead_json, dict) else None
        if isinstance(batch_leads, list) and batch_leads:
            claims: list[dict[str, int | str]] = []
            for idx, row in enumerate(batch_leads):
                if not isinstance(row, dict):
                    continue
                price_int = _lead_pool_price_cents(row)
                if price_int <= 0:
                    continue
                claims.append(
                    {
                        "lead_ref": _lead_ref(row, idx + 1),
                        "total_cents": price_int,
                    }
                )
            if claims:
                created = await create_tax_invoice_for_pool_claims(
                    session,
                    user_id=user.user_id,
                    claims=claims,
                    wallet_ledger_entry_id=None,
                    crm_claim_idempotency_key=idem,
                )
                if created is not None:
                    await session.commit()
        else:
            if not isinstance(lead_json, dict):
                return resp
            price_int = _lead_pool_price_cents(lead_json)
            if price_int <= 0:
                return resp
            created = await create_tax_invoice_for_pool_claim(
                session,
                user_id=user.user_id,
                total_cents=price_int,
                wallet_ledger_entry_id=None,
                crm_claim_idempotency_key=idem,
                lead_index=1,
                lead_ref=_lead_ref(lead_json, 1),
            )
            if created is not None:
                await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Pool claim invoice hook failed: %s", exc)
        await session.rollback()

    return resp


@router.get("/crm/{crm_path:path}", tags=["crm"])
async def crm_proxy_get(
    crm_path: str, request: Request, user: AuthDep
) -> Response:
    return await _proxy(request, f"/{crm_path}", user)


# FSM events that require an approved payment proof before CRM is allowed to process them.
_PAYMENT_GATE_EVENTS = frozenset({"PAYMENT_DONE"})
# Lead transition path pattern: /leads/{id}/transition
import re as _re
_LEAD_TRANSITION_RE = _re.compile(r"^leads/(\d+)/transition$")


async def _enforce_payment_gate_if_needed(
    crm_path: str,
    request: Request,
    user: AuthUser,
    session: AsyncSession,
) -> None:
    """For PAYMENT_DONE FSM event, verify approved proof before forwarding to CRM."""
    if user.role == "admin":
        return
    m = _LEAD_TRANSITION_RE.match(crm_path)
    if not m:
        return
    body_bytes = await request.body()
    try:
        payload = json.loads(body_bytes.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return
    if payload.get("event") not in _PAYMENT_GATE_EVENTS:
        return
    lead_id = int(m.group(1))
    result = await session.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if lead is None or lead.payment_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment proof must be approved before marking payment done.",
        )


@router.post("/crm/{crm_path:path}", tags=["crm"])
async def crm_proxy_post(
    crm_path: str,
    request: Request,
    user: AuthDep,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await _enforce_payment_gate_if_needed(crm_path, request, user, session)
    return await _proxy(request, f"/{crm_path}", user)


@router.patch("/crm/{crm_path:path}", tags=["crm"])
async def crm_proxy_patch(
    crm_path: str, request: Request, user: AuthDep
) -> Response:
    return await _proxy(request, f"/{crm_path}", user)


@router.put("/crm/{crm_path:path}", tags=["crm"])
async def crm_proxy_put(
    crm_path: str, request: Request, user: AuthDep
) -> Response:
    return await _proxy(request, f"/{crm_path}", user)


@router.delete("/crm/{crm_path:path}", tags=["crm"])
async def crm_proxy_delete(
    crm_path: str, request: Request, user: AuthDep
) -> Response:
    return await _proxy(request, f"/{crm_path}", user)
