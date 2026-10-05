"""Why won't the iPhone connect? Two admin-visible diagnostics for CardDAV setup.

1. Every request that reaches /carddav, /.well-known/carddav or a DAV probe of "/"
   is logged (time, method, path, status, auth result, user agent) — the last 25
   are kept in app_settings. An empty log while the iPhone says "Cannot connect"
   means the request never reached the app.
2. A self-check: the server calls its own public HTTPS address the way an iPhone
   does and reports what came back (or the SSL / network error).

Passwords are never stored.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

logger = logging.getLogger(__name__)

LOG_KEY = "carddav_log"
LOG_LIMIT = 25
SELF_CHECK_UA = "MYLE self-check"


async def record_attempt(
    session: AsyncSession, *, method: str, path: str, status: int, auth: str, user_agent: str | None
) -> None:
    """Append one request to the rolling log. Never raises (diagnostics must not break sync)."""
    try:
        row = await session.get(AppSetting, LOG_KEY)
        entries: list[dict[str, Any]] = json.loads(row.value) if row and row.value else []
        entries.append({
            "at": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": path[:120],
            "status": status,
            "auth": auth,
            "agent": (user_agent or "")[:80],
        })
        value = json.dumps(entries[-LOG_LIMIT:])
        if row is None:
            session.add(AppSetting(key=LOG_KEY, value=value))
        else:
            row.value = value
        await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("carddav log write failed: %s", exc)
        await session.rollback()


async def recent_attempts(session: AsyncSession) -> list[dict[str, Any]]:
    row = await session.get(AppSetting, LOG_KEY)
    try:
        entries = json.loads(row.value) if row and row.value else []
    except ValueError:
        entries = []
    return list(reversed(entries))  # newest first


async def self_check(host: str, transport: httpx.AsyncBaseTransport | None = None) -> list[dict[str, Any]]:
    """Hit our own public HTTPS address like an iPhone would (no credentials)."""
    base = f"https://{host}"
    probes = [
        ("PROPFIND", "/.well-known/carddav", (301, 302, 207, 401)),
        ("PROPFIND", "/carddav/principal/", (401,)),
        ("OPTIONS", "/carddav/", (200,)),
    ]
    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient(
        timeout=15, follow_redirects=False, headers={"User-Agent": SELF_CHECK_UA}, transport=transport
    ) as client:
        for method, path, ok_codes in probes:
            entry: dict[str, Any] = {"method": method, "url": base + path}
            try:
                r = await client.request(method, base + path, headers={"Depth": "0"})
                entry["status"] = r.status_code
                entry["ok"] = r.status_code in ok_codes
                if r.status_code in (301, 302):
                    entry["detail"] = f"redirects to {r.headers.get('location', '?')}"
                elif r.status_code == 401:
                    entry["detail"] = "asks for login (correct)"
                    if "basic" not in r.headers.get("www-authenticate", "").lower():
                        entry["ok"] = False
                        entry["detail"] = "401 without a Basic login prompt"
                elif not entry["ok"]:
                    entry["detail"] = (r.headers.get("server") or "") + " " + r.text[:120].replace("\n", " ")
            except httpx.HTTPError as exc:
                entry.update(status=None, ok=False, detail=f"{type(exc).__name__}: {exc}"[:200])
            results.append(entry)
    return results
