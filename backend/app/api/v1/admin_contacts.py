"""Admin-only: Day 2 prospects as iPhone contacts (.vcf files + CardDAV sync password)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead import Lead
from app.services.carddav_auth import (
    carddav_username,
    disable_carddav,
    issue_carddav_password,
    carddav_enabled,
)
from app.services.day2_contacts import (
    contact_cards,
    contact_name,
    day2_contact_leads,
    leader_names,
    safe_filename,
)

router = APIRouter()


def _require_admin(user: AuthUser) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _vcf(body: str, filename: str) -> Response:
    return Response(
        content=body.encode("utf-8"),
        media_type="text/vcard; charset=utf-8",
        # inline: iPhone Safari opens its "Create New Contact" / "Add All Contacts" sheet
        # instead of saving a file to Downloads.
        headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.get("/contacts/day2.vcf")
async def download_day2_contacts(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Every Day 2 prospect in one file — open on iPhone → "Add All Contacts"."""
    _require_admin(user)
    leads = await day2_contact_leads(session)
    if not leads:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="No Day 2 contacts yet")
    cards = await contact_cards(session, leads)
    return _vcf("".join(cards.values()), "MYLE_Day2_contacts.vcf")


@router.get("/contacts/lead/{lead_id}.vcf")
async def download_lead_contact(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """One prospect as a contact card — open on iPhone → "Create New Contact"."""
    _require_admin(user)
    lead = await session.get(Lead, lead_id)
    if lead is None or lead.deleted_at is not None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if not (lead.phone or "").strip():
        raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Lead has no phone number")
    card = (await contact_cards(session, [lead]))[lead.id]
    leader = (await leader_names(session, [lead]))[lead.id]
    return _vcf(card, f"{safe_filename(contact_name(lead, leader))}.vcf")


def _server(request: Request) -> str:
    return request.url.hostname or ""


def _server_url(request: Request) -> str:
    """Full account URL for the iPhone "Server" field — skips discovery entirely."""
    host = _server(request)
    local = host in {"localhost", "127.0.0.1", "test", "testserver"}
    port = f":{request.url.port}" if local and request.url.port else ""
    return f"{'http' if local else 'https'}://{host}{port}/carddav/principal/"


@router.get("/contacts/carddav")
async def carddav_status(
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    return {
        "enabled": await carddav_enabled(session, user.user_id),
        "server": _server(request),
        "server_url": _server_url(request),
        "username": carddav_username(user.user_id),
    }


@router.post("/contacts/carddav/password")
async def carddav_new_password(
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Create (or replace) the iPhone sync password. Shown once; only a hash is stored."""
    _require_admin(user)
    password = await issue_carddav_password(session, user.user_id)
    return {
        "enabled": True,
        "server": _server(request),
        "server_url": _server_url(request),
        "username": carddav_username(user.user_id),
        "password": password,
    }


@router.delete("/contacts/carddav")
async def carddav_turn_off(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    await disable_carddav(session, user.user_id)
    return {"enabled": False}
