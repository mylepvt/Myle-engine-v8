"""CSRF protection via Double-Submit Cookie pattern for cookie-based JWT auth."""
from __future__ import annotations

import logging
import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core import config
from app.core.errors import error_payload

logger = logging.getLogger("myle.csrf")

_CSRF_COOKIE = "csrf_token"
_CSRF_HEADER = "X-CSRF-Token"
_TOKEN_BYTES = 32

_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})

_SKIP_PREFIXES = frozenset(
    {
        "/health",
        "/api/v1/auth/login",
        "/api/v1/auth/dev-login",
        "/api/v1/auth/refresh",
        "/uploads/",
        "/docs",
        "/openapi.json",
        "/invoice/public/",
    }
)


def _should_skip_csrf(path: str) -> bool:
    return any(path.startswith(p) for p in _SKIP_PREFIXES)


def _generate_token() -> str:
    return secrets.token_hex(_TOKEN_BYTES)


def _extract_cookie_value(request: Request) -> str:
    for item in request.headers.get("cookie", "").split(";"):
        kv = item.strip().split("=", 1)
        if len(kv) == 2 and kv[0].strip() == _CSRF_COOKIE:
            return kv[1].strip()
    return ""


def _set_csrf_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        _CSRF_COOKIE,
        token,
        path="/",
        samesite=config.settings.auth_cookie_samesite or "lax",
        secure=config.settings.session_cookie_secure,
        httponly=False,
        max_age=86400,
    )


class CsrfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not config.settings.csrf_enabled:
            return await call_next(request)

        method = request.method.upper()
        path = request.url.path
        skipped = _should_skip_csrf(path)

        if method not in _SAFE_METHODS and not skipped:
            cookie_val = _extract_cookie_value(request)
            header_val = request.headers.get(_CSRF_HEADER, "")
            if not cookie_val or not header_val or not secrets.compare_digest(cookie_val, header_val):
                logger.debug("CSRF rejected: method=%s path=%s", method, path)
                body = error_payload(
                    code="csrf_invalid",
                    message="CSRF token missing or invalid.",
                    request=request,
                )
                response = JSONResponse(status_code=403, content=body)
                _set_csrf_cookie(response, _generate_token())
                return response

        response = await call_next(request)

        if _extract_cookie_value(request) == "":
            _set_csrf_cookie(response, _generate_token())

        return response
