"""Sliding-window rate limit for POST /api/v1/auth/login|dev-login|refresh (Redis-backed with in-memory fallback)."""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core import config
from app.core.errors import error_payload

logger = logging.getLogger("myle.rate_limit")

_AUTH_POST_PATHS = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/dev-login",
        "/api/v1/auth/refresh",
    }
)

_WINDOW_SECONDS = 60.0

_store: dict[str, list[float]] = defaultdict(list)

_redis: Optional[object] = None
_redis_available: Optional[bool] = None


def _get_redis() -> Optional[object]:
    global _redis, _redis_available
    if _redis_available is False:
        return None
    if _redis is not None:
        return _redis
    try:
        import redis.asyncio as aioredis

        url = config.settings.redis_url
        if not url:
            _redis_available = False
            return None
        _redis = aioredis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        _redis_available = True
        logger.debug("Rate limit Redis connected: %s", url)
    except Exception as exc:
        _redis_available = False
        _redis = None
        logger.warning("Rate limit Redis unavailable; falling back to in-memory: %s", exc)
    return _redis


def _reset_rate_limit_store_for_tests() -> None:
    _store.clear()
    global _redis, _redis_available
    _redis = None
    _redis_available = None


async def _redis_check_and_increment(key: str, limit: int) -> tuple[bool, int]:
    r = _get_redis()
    if r is None:
        return False, 0
    try:
        lua = """
        local k = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local count = redis.call('ZCOUNT', k, now - window, now)
        if count >= limit then
            return {0, count}
        end
        redis.call('ZADD', k, now, now .. ':' .. redis.call('ZCOUNT', k, '-inf', '+inf'))
        redis.call('EXPIRE', k, math.ceil(window * 2))
        return {1, count}
        """
        result = await r.eval(lua, 1, key, limit, _WINDOW_SECONDS, time.time())
        allowed = bool(result[0])
        current_count = int(result[1])
        return allowed, current_count
    except Exception as exc:
        logger.warning("Redis rate limit error; falling back to in-memory: %s", exc)
        return False, 0


def _inmemory_check_and_increment(key: str, limit: int) -> tuple[bool, int]:
    now = time.time()
    bucket = _store[key]
    cutoff = now - _WINDOW_SECONDS
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= limit:
        return False, len(bucket)
    bucket.append(now)
    return True, len(bucket)


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        limit = config.settings.auth_login_rate_limit_per_minute
        if limit <= 0:
            return await call_next(request)
        if request.method != "POST" or request.url.path not in _AUTH_POST_PATHS:
            return await call_next(request)

        client_host = request.client.host if request.client else "unknown"
        key = f"ratelimit:auth:{client_host}:{request.url.path}"

        if _redis_available is not False:
            allowed, count = await _redis_check_and_increment(key, limit)
            if _redis_available:
                if not allowed:
                    return self._rate_limited_response(request, limit, count)
                return await call_next(request)

        allowed, count = _inmemory_check_and_increment(key, limit)
        if not allowed:
            return self._rate_limited_response(request, limit, count)
        return await call_next(request)

    def _rate_limited_response(self, request: Request, limit: int, _count: int) -> JSONResponse:
        body = error_payload(
            code="too_many_requests",
            message="Too many requests; try again shortly.",
            request=request,
        )
        return JSONResponse(
            status_code=429,
            content=body,
            headers={"Retry-After": str(int(_WINDOW_SECONDS))},
        )
