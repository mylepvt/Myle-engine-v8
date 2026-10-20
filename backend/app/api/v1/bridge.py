"""Myle Bridge endpoint: Myle Ledger puts leads straight into the shared pool.

No user session — the request is signed with ``MYLE_BRIDGE_SECRET``
(``app.services.ledger_bridge``). Same lead rows as the admin Excel import
(``lead_pool.import_lead_pool_xlsx``), plus ``external_ref`` = the Ledger's lead key, so
a retried or repeated batch adds each lead once.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import get_db
from app.api.v1.lead_pool import _fulfill_bookings_bg
from app.core.realtime_hub import notify_topics
from app.db.session import AsyncSessionLocal
from app.models.activity_log import ActivityLog
from app.models.lead import Lead
from app.models.user import User
from app.services import ledger_bridge
from app.services.crm_outbox import enqueue_lead_shadow_upsert
from app.services.lead_pool_defaults import get_default_pool_price_cents
from app.services.push_service import send_push_to_roles_bg
from app.services.sheet_sync import normalize_phone

router = APIRouter()

_MAX_BODY_BYTES = 2_000_000
_MAX_LEADS = 500


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()[:limit] or None


def _parse_leads(body: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in (body.get("leads") or [])[:_MAX_LEADS]:
        if not isinstance(raw, dict):
            continue
        ref = _text(raw.get("myle_lead_id"), 200)
        phone = normalize_phone(raw.get("phone") if isinstance(raw.get("phone"), str) else None)
        if not ref or not phone:
            continue
        submitted = None
        try:
            submitted = datetime.fromisoformat(str(raw.get("submitted_at") or "").replace("Z", "+00:00"))
        except ValueError:
            pass
        out.append(
            {
                "external_ref": ref,
                "name": _text(raw.get("name"), 255) or "Lead",
                "phone": phone,
                "city": _text(raw.get("city"), 100),
                "age": _text(raw.get("age"), 32),
                "gender": _text(raw.get("gender"), 32),
                "ad_name": _text(raw.get("ad_name"), 255),
                "submitted_at": submitted,
            }
        )
    return out


@router.post("/pool-ingest")
async def pool_ingest(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES or not ledger_bridge.verify(
        request.headers.get("x-myle-timestamp"), request.headers.get("x-myle-signature"), raw
    ):
        raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Bad signature")
    try:
        body = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Bad JSON")
    leads = _parse_leads(body if isinstance(body, dict) else {})

    # Bridged leads are created by the first admin (the import's owner too).
    admin_id = (
        await session.execute(select(User.id).where(User.role == "admin").order_by(User.id).limit(1))
    ).scalar_one_or_none()
    if admin_id is None:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail="No admin user")

    refs = [l["external_ref"] for l in leads]
    known: set[str] = set()
    for i in range(0, len(refs), 200):
        known |= set(
            (await session.execute(select(Lead.external_ref).where(Lead.external_ref.in_(refs[i : i + 200])))).scalars()
        )

    default_cents = await get_default_pool_price_cents(session)
    created = 0
    for row in leads:
        if row["external_ref"] in known:
            continue
        known.add(row["external_ref"])
        lead = Lead(
            name=row["name"],
            status="new_lead",
            created_by_user_id=admin_id,
            assigned_to_user_id=None,
            phone=row["phone"],
            city=row["city"],
            age=row["age"],
            gender=row["gender"],
            ad_name=row["ad_name"],
            source="other",
            notes=None,
            in_pool=True,
            pool_price_cents=default_cents if default_cents > 0 else None,
            external_ref=row["external_ref"],
        )
        if row["submitted_at"] is not None:
            lead.created_at = row["submitted_at"]
        session.add(lead)
        await session.flush()
        enqueue_lead_shadow_upsert(session, lead)
        created += 1

    if created:
        session.add(
            ActivityLog(
                user_id=admin_id,
                action="lead.pool_bridge",
                entity_type="lead_pool",
                entity_id=None,
                meta={"created": created, "batch_id": str(body.get("batch_id") or "")[:64]},
            )
        )
    await session.commit()
    if created:
        await notify_topics("leads")
        background_tasks.add_task(_fulfill_bookings_bg)
        background_tasks.add_task(
            send_push_to_roles_bg,
            AsyncSessionLocal,
            ("leader", "team"),
            title="Lead Pool Updated",
            body=f"{created} new leads are in the lead pool. Claim your leads now!",
            url="/dashboard/work/lead-pool",
        )
    return {"ok": True, "received": len(leads), "created": created, "skipped": len(leads) - created}
