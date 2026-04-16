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

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.deps import AuthUser
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
