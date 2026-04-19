"""
CRM Proxy — FastAPI gateway to CRM Fastify microservice.

Every request hitting /api/v1/crm/* is:
  1. Authenticated via FastAPI JWT cookie (same as all other routes).
  2. Forwarded to CRM_API_URL with the raw access token as Bearer header
     so the CRM can extract sub + role from it.
  3. Response (body + status) is streamed back as-is.

Zero business logic lives here. FastAPI = gate, CRM = brain.
"""

from __future__ import annotations

import hashlib
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

    def _pool_claim_invoice_key(base_idem: str, lead_key: str) -> str:
        return hashlib.sha256(f"{base_idem}|{lead_key}".encode()).hexdigest()[:120]

    def _lead_pool_price_cents(lead: dict) -> int:
        price_raw = lead.get("poolPriceCents") or lead.get("pool_price_cents")
        try:
            return int(price_raw or 0)
        except (TypeError, ValueError):
            return 0

    try:
        from app.services.invoice_records import create_tax_invoice_for_pool_claim

        batch_leads = lead_json.get("leads") if isinstance(lead_json, dict) else None
        if isinstance(batch_leads, list) and batch_leads:
            any_created = False
            for idx, row in enumerate(batch_leads):
                if not isinstance(row, dict):
                    continue
                price_int = _lead_pool_price_cents(row)
                if price_int <= 0:
                    continue
                lk = str(row.get("legacyId") or row.get("legacy_id") or row.get("id") or idx)
                inv_key = _pool_claim_invoice_key(idem, lk)
                created = await create_tax_invoice_for_pool_claim(
                    session,
                    user_id=user.user_id,
                    total_cents=price_int,
                    wallet_ledger_entry_id=None,
                    crm_claim_idempotency_key=inv_key,
                    lead_index=idx + 1,
                )
                if created is not None:
                    any_created = True
            if any_created:
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


@router.post("/crm/{crm_path:path}", tags=["crm"])
async def crm_proxy_post(
    crm_path: str, request: Request, user: AuthDep
) -> Response:
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
