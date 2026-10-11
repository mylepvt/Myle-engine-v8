"""Sync Day 2 prospects into the admin's Google Contacts (→ iPhone via the Google account).

Why Google and not our own CardDAV server: the app's host sits behind Cloudflare,
which rejects the WebDAV methods (PROPFIND/REPORT) an iPhone needs, so a self-hosted
CardDAV address book can't be reached. Google Contacts already syncs to the iPhone
through the Google account the admin has on the phone.

Flow
- Admin taps "Connect Google" → Google consent (contacts scope) → callback stores an
  encrypted refresh token in app_settings.
- sync(): every Day 2 prospect becomes a Google contact "Prospect – Leader – MYLE" in a
  "MYLE Day 2" contact group. New leads are created, changed ones updated, and a
  contact the admin deleted in Google is created again. Nothing is ever deleted.
- Runs every 15 minutes (scheduled job) and on "Sync now".

Per-admin state lives in app_settings["google_contacts:<user_id>"] as JSON:
{refresh_token (Fernet-encrypted), email, group, map{lead_id: {rn, fp}}, last_sync, last_count, last_error}
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.services.day2_contacts import (
    BOOK_NAME,
    contact_name,
    day2_contact_leads,
    leader_names,
    phone_for_contact,
)

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
PEOPLE = "https://people.googleapis.com/v1"
SCOPES = "openid email https://www.googleapis.com/auth/contacts"
KEY_PREFIX = "google_contacts:"
BATCH = 200  # People API batch create/update/get limit
STATE_MAX_AGE = 15 * 60
UPDATE_MASK = "names,phoneNumbers,biographies,organizations"


class GoogleContactsError(Exception):
    pass


# ── config / crypto / state ──────────────────────────────────────────────────

def configured() -> bool:
    return bool(settings.google_contacts_client_id and settings.google_contacts_client_secret)


def _fernet() -> Fernet:
    key = hashlib.sha256(f"google-contacts:{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _key(user_id: int) -> str:
    return f"{KEY_PREFIX}{user_id}"


async def load_state(session: AsyncSession, user_id: int) -> dict[str, Any] | None:
    row = await session.get(AppSetting, _key(user_id))
    if row is None or not row.value:
        return None
    try:
        return json.loads(row.value)
    except ValueError:
        return None


async def save_state(session: AsyncSession, user_id: int, state: dict[str, Any]) -> None:
    row = await session.get(AppSetting, _key(user_id))
    value = json.dumps(state)
    if row is None:
        session.add(AppSetting(key=_key(user_id), value=value))
    else:
        row.value = value
    await session.commit()


async def connected_admin_ids(session: AsyncSession) -> list[int]:
    keys = (
        await session.execute(select(AppSetting.key).where(AppSetting.key.like(f"{KEY_PREFIX}%")))
    ).scalars().all()
    return [int(k[len(KEY_PREFIX):]) for k in keys if k[len(KEY_PREFIX):].isdigit()]


def _sign(payload: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"gc-state:{payload}".encode(), hashlib.sha256).hexdigest()[:32]


def make_state(user_id: int, now: float | None = None) -> str:
    payload = f"{user_id}.{int(now if now is not None else time.time())}"
    return f"{payload}.{_sign(payload)}"


def read_state(state: str, now: float | None = None) -> int | None:
    """User id from a signed, fresh OAuth state; None when forged or expired."""
    try:
        user_id, issued, sig = (state or "").split(".")
        if not hmac.compare_digest(sig, _sign(f"{user_id}.{issued}")):
            return None
        if (now if now is not None else time.time()) - int(issued) > STATE_MAX_AGE:
            return None
        return int(user_id)
    except ValueError:
        return None


def redirect_uri(host: str, port: int | None = None) -> str:
    local = host in {"localhost", "127.0.0.1", "test", "testserver"}
    if local:
        return f"http://{host}{f':{port}' if port else ''}/api/v1/admin/contacts/google/callback"
    return f"https://{host}/api/v1/admin/contacts/google/callback"


def auth_url(user_id: int, redirect: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": settings.google_contacts_client_id,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",  # always hand back a refresh token
        "include_granted_scopes": "true",
        "state": make_state(user_id),
    })


def _email_from_id_token(id_token: str | None) -> str | None:
    """The id_token comes straight from Google's token endpoint over TLS; only read the email."""
    try:
        payload = (id_token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except (IndexError, ValueError):
        return None


# ── OAuth ────────────────────────────────────────────────────────────────────

async def exchange_code(
    session: AsyncSession, user_id: int, code: str, redirect: str, client: httpx.AsyncClient
) -> dict[str, Any]:
    r = await client.post(TOKEN_URL, data={
        "code": code,
        "client_id": settings.google_contacts_client_id,
        "client_secret": settings.google_contacts_client_secret,
        "redirect_uri": redirect,
        "grant_type": "authorization_code",
    })
    if r.status_code != 200:
        raise GoogleContactsError(f"Google sign-in failed ({r.status_code}): {r.text[:200]}")
    body = r.json()
    refresh = body.get("refresh_token")
    if not refresh:
        raise GoogleContactsError("Google did not return a refresh token — remove MYLE from your Google account access and connect again.")
    old = await load_state(session, user_id) or {}
    state = {
        "refresh_token": _fernet().encrypt(refresh.encode()).decode(),
        "email": _email_from_id_token(body.get("id_token")),
        # keep the group + mapping when reconnecting the same account
        "group": old.get("group"),
        "map": old.get("map", {}),
        "last_sync": old.get("last_sync"),
        "last_count": old.get("last_count", 0),
        "last_error": None,
    }
    await save_state(session, user_id, state)
    return state


async def _access_token(state: dict[str, Any], client: httpx.AsyncClient) -> str:
    try:
        refresh = _fernet().decrypt(state["refresh_token"].encode()).decode()
    except (InvalidToken, KeyError) as exc:
        raise GoogleContactsError("Google connection is no longer valid — connect again.") from exc
    r = await client.post(TOKEN_URL, data={
        "client_id": settings.google_contacts_client_id,
        "client_secret": settings.google_contacts_client_secret,
        "refresh_token": refresh,
        "grant_type": "refresh_token",
    })
    if r.status_code != 200:
        raise GoogleContactsError(
            "Google access was removed or expired — connect again."
            if "invalid_grant" in r.text
            else f"Google token refresh failed ({r.status_code})"
        )
    return r.json()["access_token"]


async def disconnect(session: AsyncSession, user_id: int, client: httpx.AsyncClient) -> None:
    state = await load_state(session, user_id)
    if state and state.get("refresh_token"):
        try:
            refresh = _fernet().decrypt(state["refresh_token"].encode()).decode()
            await client.post(REVOKE_URL, data={"token": refresh})
        except (InvalidToken, httpx.HTTPError):
            pass  # best effort — the stored token is deleted either way
    row = await session.get(AppSetting, _key(user_id))
    if row is not None:
        await session.delete(row)
        await session.commit()


# ── sync ─────────────────────────────────────────────────────────────────────

def _person(lead: Lead, leader: str | None) -> dict[str, Any]:
    note = f"MYLE lead #{lead.id} (Day 2 prospect)" + (f" · Leader: {leader}" if leader else "")
    return {
        "names": [{"givenName": contact_name(lead, leader)}],
        "phoneNumbers": [{"value": phone_for_contact(lead.phone), "type": "mobile"}],
        "biographies": [{"value": note, "contentType": "TEXT_PLAIN"}],
        "organizations": [{"name": "MYLE Community"}],
    }


def _fingerprint(person: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(person, sort_keys=True).encode()).hexdigest()[:16]


async def _call(client: httpx.AsyncClient, token: str, method: str, url: str, **kw) -> httpx.Response:
    r = await client.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kw)
    if r.status_code == 403 and "SERVICE_DISABLED" in r.text:
        raise GoogleContactsError("Turn on the Google People API for this Google Cloud project.")
    return r


async def _ensure_group(client: httpx.AsyncClient, token: str, state: dict[str, Any]) -> str:
    group = state.get("group")
    if group:
        r = await _call(client, token, "GET", f"{PEOPLE}/{group}")
        if r.status_code == 200:
            return group
    r = await _call(client, token, "POST", f"{PEOPLE}/contactGroups", json={"contactGroup": {"name": BOOK_NAME}})
    if r.status_code == 200:
        return r.json()["resourceName"]
    if r.status_code == 409:  # a group with this name already exists — reuse it
        listing = await _call(client, token, "GET", f"{PEOPLE}/contactGroups", params={"pageSize": 1000})
        for g in listing.json().get("contactGroups", []):
            if g.get("name") == BOOK_NAME or g.get("formattedName") == BOOK_NAME:
                return g["resourceName"]
    raise GoogleContactsError(f"Could not create the “{BOOK_NAME}” label in Google ({r.status_code})")


def _chunks(items: list, size: int = BATCH):
    for i in range(0, len(items), size):
        yield items[i : i + size]


async def sync(
    session: AsyncSession, user_id: int, client: httpx.AsyncClient | None = None
) -> dict[str, Any]:
    """Push Day 2 prospects to the admin's Google Contacts. Returns a summary."""
    state = await load_state(session, user_id)
    if not state:
        raise GoogleContactsError("Google is not connected")
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=30)
    created = updated = 0
    try:
        token = await _access_token(state, client)
        group = await _ensure_group(client, token, state)
        if group != state.get("group"):
            state["group"] = group
            state["map"] = {}  # new label → put everyone in it again

        leads = await day2_contact_leads(session)
        leaders = await leader_names(session, leads)
        mapping: dict[str, dict[str, str]] = state.get("map") or {}
        people = {lead.id: _person(lead, leaders.get(lead.id)) for lead in leads}

        to_create = [lid for lid in people if str(lid) not in mapping]
        to_update = [
            lid for lid in people
            if str(lid) in mapping and mapping[str(lid)]["fp"] != _fingerprint(people[lid])
        ]

        # Updates need fresh etags; a contact deleted in Google is created again.
        for chunk in _chunks(to_update):
            names = [mapping[str(lid)]["rn"] for lid in chunk]
            got = await _call(client, token, "GET", f"{PEOPLE}/people:batchGet",
                              params=[("personFields", "metadata")] + [("resourceNames", n) for n in names])
            etags: dict[str, str] = {}
            for resp in got.json().get("responses", []):
                person = resp.get("person")
                if person and person.get("etag"):
                    etags[resp.get("requestedResourceName") or person["resourceName"]] = person["etag"]
            body = {}
            for lid in chunk:
                rn = mapping[str(lid)]["rn"]
                if rn in etags:
                    body[rn] = {**people[lid], "etag": etags[rn]}
                else:
                    to_create.append(lid)
            if body:
                r = await _call(client, token, "POST", f"{PEOPLE}/people:batchUpdateContacts",
                                json={"contacts": body, "updateMask": UPDATE_MASK, "readMask": "names"})
                if r.status_code != 200:
                    raise GoogleContactsError(f"Google update failed ({r.status_code}): {r.text[:160]}")
                for lid in chunk:
                    if mapping[str(lid)]["rn"] in body:
                        mapping[str(lid)]["fp"] = _fingerprint(people[lid])
                        updated += 1

        membership = [{"contactGroupMembership": {"contactGroupResourceName": group}}]
        for chunk in _chunks(to_create):
            r = await _call(client, token, "POST", f"{PEOPLE}/people:batchCreateContacts", json={
                "contacts": [{"contactPerson": {**people[lid], "memberships": membership}} for lid in chunk],
                "readMask": "names",
            })
            if r.status_code != 200:
                raise GoogleContactsError(f"Google create failed ({r.status_code}): {r.text[:160]}")
            for lid, made in zip(chunk, r.json().get("createdPeople", [])):
                rn = (made.get("person") or {}).get("resourceName")
                if rn:
                    mapping[str(lid)] = {"rn": rn, "fp": _fingerprint(people[lid])}
                    created += 1
            state["map"] = mapping
            await save_state(session, user_id, state)  # keep progress if a later batch fails

        state.update(
            map=mapping,
            last_sync=datetime.now(timezone.utc).isoformat(),
            last_count=len(mapping),
            last_error=None,
        )
        await save_state(session, user_id, state)
        return {"created": created, "updated": updated, "total": len(mapping)}
    except (GoogleContactsError, httpx.HTTPError) as exc:
        message = str(exc) if isinstance(exc, GoogleContactsError) else f"Network error talking to Google: {exc}"
        state["last_error"] = message[:300]
        await save_state(session, user_id, state)
        raise GoogleContactsError(message) from exc
    finally:
        if own_client:
            await client.aclose()


def public_status(state: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "configured": configured(),
        "connected": bool(state and state.get("refresh_token")),
        "email": (state or {}).get("email"),
        "last_sync": (state or {}).get("last_sync"),
        "last_count": (state or {}).get("last_count", 0),
        "last_error": (state or {}).get("last_error"),
    }
