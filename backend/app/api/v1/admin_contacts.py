"""Admin-only: Day 2 prospects as iPhone contacts (.vcf files + Google Contacts sync)."""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status as http_status

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead import Lead
from app.services import google_contacts as gc
from app.services.day2_contacts import (
    contact_cards,
    contact_name,
    create_new_export,
    day2_contact_leads,
    export_batch_leads,
    leader_names,
    mark_exported,
    new_contact_leads,
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
    await mark_exported(session, user.user_id, list(cards))
    return _vcf("".join(cards.values()), "MYLE_Day2_contacts.vcf")


@router.get("/contacts/day2/new-count")
async def count_new_day2_contacts(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """How many Day 2 prospects this admin hasn't saved to the phone yet."""
    _require_admin(user)
    return {"new": len(await new_contact_leads(session, user.user_id))}


@router.post("/contacts/day2/new-export")
async def export_new_day2_contacts(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Batch only the not-yet-saved prospects; the phone then opens the returned .vcf URL."""
    _require_admin(user)
    token, count = await create_new_export(session, user.user_id)
    return {"count": count, "path": f"/api/v1/admin/contacts/day2/export/{token}.vcf" if token else None}


@router.get("/contacts/day2/export/{token}.vcf")
async def download_day2_export(
    token: str,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    _require_admin(user)
    leads = await export_batch_leads(session, user.user_id, token)
    if not leads:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="This contact file has expired")
    cards = await contact_cards(session, leads)
    return _vcf("".join(cards.values()), "MYLE_Day2_new_contacts.vcf")


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
    await mark_exported(session, user.user_id, [lead.id])
    return _vcf(card, f"{safe_filename(contact_name(lead, leader))}.vcf")


def _redirect_uri(request: Request) -> str:
    return gc.redirect_uri(request.url.hostname or "", request.url.port)


@router.get("/contacts/google")
async def google_status(
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    return {**gc.public_status(await gc.load_state(session, user.user_id)), "redirect_uri": _redirect_uri(request)}


@router.get("/contacts/google/connect")
async def google_connect(
    request: Request,
    user: Annotated[AuthUser, Depends(require_auth_user)],
) -> dict:
    """URL of Google's consent screen; the browser goes there and comes back to /callback."""
    _require_admin(user)
    if not gc.configured():
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Contacts is not set up yet: add GOOGLE_CONTACTS_CLIENT_ID and GOOGLE_CONTACTS_CLIENT_SECRET on the server.",
        )
    return {"url": gc.auth_url(user.user_id, _redirect_uri(request))}


@router.get("/contacts/google/callback", include_in_schema=False)
async def google_callback(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    code: str | None = Query(default=None),
    state: str = Query(default=""),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """Google sends the admin back here. Trust comes from the signed `state`, not cookies."""
    back = "/dashboard?google_contacts="
    user_id = gc.read_state(state)
    if error or not code or user_id is None:
        return RedirectResponse(back + "cancelled", status_code=303)
    from app.models.user import User

    admin = await session.get(User, user_id)
    if admin is None or admin.role != "admin" or admin.removed_at is not None:
        return RedirectResponse(back + "cancelled", status_code=303)
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            await gc.exchange_code(session, user_id, code, _redirect_uri(request), client)
            await gc.sync(session, user_id, client)
        except gc.GoogleContactsError:
            return RedirectResponse(back + "error", status_code=303)
    return RedirectResponse(back + "connected", status_code=303)


@router.post("/contacts/google/sync")
async def google_sync_now(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_admin(user)
    try:
        result = await gc.sync(session, user.user_id)
    except gc.GoogleContactsError as exc:
        raise HTTPException(status_code=http_status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {**result, **gc.public_status(await gc.load_state(session, user.user_id))}


@router.delete("/contacts/google")
async def google_disconnect(
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Stop syncing and revoke MYLE's Google access. Contacts already in Google stay."""
    _require_admin(user)
    async with httpx.AsyncClient(timeout=15) as client:
        await gc.disconnect(session, user.user_id, client)
    return gc.public_status(None)
