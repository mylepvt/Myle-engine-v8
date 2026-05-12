"""Baseline security headers for production-facing API + SPA, including Content-Security-Policy."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


def _build_csp() -> str:
    api_origins = settings.cors_origin_list
    ws_hosts: list[str] = []
    connect_hosts: list[str] = []

    for origin in api_origins:
        if "://" in origin:
            proto, rest = origin.split("://", 1)
            host = rest.split(":")[0] if ":" in rest else rest
            connect_hosts.append(f"{proto}://{host}:*")
            ws_proto = "wss" if proto == "https" else "ws"
            ws_hosts.append(f"{ws_proto}://{host}:*")

    if not connect_hosts:
        connect_hosts.append("'self'")
    else:
        connect_hosts.insert(0, "'self'")

    policies = [
        "default-src 'self'",
        f"script-src 'self'",
        f"style-src 'self' 'unsafe-inline'",
        f"img-src 'self' data: blob:",
        f"font-src 'self'",
        f"connect-src {' '.join(connect_hosts)} {' '.join(ws_hosts)}",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "manifest-src 'self'",
        "worker-src 'self'",
    ]

    return "; ".join(policies)


_csp_value: str | None = None


def _get_csp() -> str:
    global _csp_value
    if _csp_value is None:
        _csp_value = _build_csp()
    return _csp_value


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        response.headers.setdefault("Content-Security-Policy", _get_csp())
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        response.headers.setdefault("X-XSS-Protection", "0")
        if settings.session_cookie_secure:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response
