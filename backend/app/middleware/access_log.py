"""One JSON line per successful HTTP response (request id + timing)."""

from __future__ import annotations

import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.observation_logger import set_request_context

logger = logging.getLogger("myle.access")
logger_perf = logging.getLogger("myle.perf")

SLOW_REQUEST_THRESHOLD_MS = 300


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = getattr(request.state, "request_id", None)
        if rid:
            set_request_context(request_id=str(rid))
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)
        line = {
            "msg": "http_request",
            "request_id": rid,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        }
        logger.info(json.dumps(line))
        if duration_ms > SLOW_REQUEST_THRESHOLD_MS:
            logger_perf.warning(json.dumps({
                "msg": "slow_request",
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
            }))
        return response
