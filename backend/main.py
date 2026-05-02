from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.api.deps import get_db
from app.api.invoice_public import router as invoice_public_router
from app.api.v1 import api_router
from app.core.config import settings
from app.health_migrations import alembic_head_revisions, db_alembic_revision
from app.core.errors import register_exception_handlers
from app.db.session import engine
from app.middleware.access_log import AccessLogMiddleware
from app.middleware.auth_rate_limit import AuthRateLimitMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.services.scheduled_jobs import (
    job_call_target_reminder,
    job_daily_report_reminder,
    job_enrollment_proof_alert,
    job_watch_archive_maintenance,
    job_weekly_compliance_digest,
)

import os as _os

_scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
_SCHEDULER_ENABLED = _os.environ.get("DISABLE_SCHEDULER", "").lower() not in {"1", "true", "yes"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if _SCHEDULER_ENABLED:
        _scheduler.add_job(
            job_enrollment_proof_alert,
            IntervalTrigger(minutes=30),
            id="enrollment_proof_alert",
            replace_existing=True,
            misfire_grace_time=120,
        )
        _scheduler.add_job(
            job_weekly_compliance_digest,
            CronTrigger(day_of_week="mon", hour=9, minute=0),
            id="weekly_compliance_digest",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        _scheduler.add_job(
            job_daily_report_reminder,
            CronTrigger(hour=20, minute=0),
            id="daily_report_reminder",
            replace_existing=True,
            misfire_grace_time=1800,
        )
        _scheduler.add_job(
            job_call_target_reminder,
            CronTrigger(hour=17, minute=0),
            id="call_target_reminder",
            replace_existing=True,
            misfire_grace_time=1800,
        )
        _scheduler.add_job(
            job_watch_archive_maintenance,
            IntervalTrigger(minutes=30),
            id="watch_archive_maintenance",
            replace_existing=True,
            misfire_grace_time=120,
        )
        _scheduler.start()
    yield
    if _SCHEDULER_ENABLED:
        _scheduler.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(title="Myle vl2 API", version="0.1.0", lifespan=lifespan)

register_exception_handlers(app)

app.add_middleware(AccessLogMiddleware)
app.add_middleware(AuthRateLimitMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(invoice_public_router)

_uploads_dir = Path(__file__).resolve().parent / "uploads"
_uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
async def health_db(session: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"db": "ok"}


@app.get("/health/migrations")
async def health_migrations(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Compare DB ``alembic_version`` to script heads (deploy / drift checks)."""
    heads = alembic_head_revisions()
    current = await db_alembic_revision(session)
    at_head: bool | None = None
    if len(heads) == 1 and current is not None:
        at_head = current == heads[0]
    return {
        "alembic_heads": heads,
        "current_revision": current,
        "at_head": at_head,
    }


_spa_dir = Path(settings.frontend_dist).resolve() if settings.frontend_dist else None
_index = _spa_dir / "index.html" if _spa_dir is not None else None

# Avoid stale ``index.html`` referencing deleted hashed chunks after deploy (blank / black screen).
_SPA_INDEX_CACHE_HEADERS = {"Cache-Control": "no-cache, no-store, must-revalidate"}


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def spa_fallback(full_path: str) -> FileResponse:
    """Serve Vite assets from disk; unknown paths → ``index.html`` (client router). Registered last."""
    if _spa_dir is None or _index is None or not _index.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    root = _spa_dir
    if full_path.startswith("api") or full_path.startswith("invoice/"):
        raise HTTPException(status_code=404, detail="Not found")
    safe = (root / full_path).resolve()
    try:
        safe.relative_to(root)
    except ValueError:
        return FileResponse(_index, headers=_SPA_INDEX_CACHE_HEADERS)
    if safe.is_file():
        if safe.name == "index.html":
            return FileResponse(safe, headers=_SPA_INDEX_CACHE_HEADERS)
        return FileResponse(safe)
    return FileResponse(_index, headers=_SPA_INDEX_CACHE_HEADERS)
