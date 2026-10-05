"""Read-only CardDAV server: the admin's iPhone syncs a "MYLE Day 2" address book.

iPhone setup: Settings → Contacts → Accounts → Add Account → Other →
Add CardDAV Account → Server = this site's domain, User Name / Password from
Settings → Day 2 contacts sync in the app.

Only what iOS Contacts needs is implemented: discovery (/.well-known/carddav →
principal → address-book home → address book), PROPFIND with etags + getctag,
REPORT addressbook-multiget / addressbook-query, and GET of single cards. Writes
are refused (the phone copy is read-only). Request bodies are never parsed as
XML (hrefs are read with a bounded regex), so XML entity tricks don't apply.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
from typing import Annotated
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.carddav_auth import authenticate_carddav
from app.services.day2_contacts import BOOK_NAME, contact_cards, day2_contact_leads, etag_for

router = APIRouter(include_in_schema=False)

ROOT = "/carddav/"
PRINCIPAL = "/carddav/principal/"
HOME = "/carddav/books/"
BOOK = "/carddav/books/day2/"
_CARD_RE = re.compile(r"^/carddav/books/day2/(\d+)\.vcf$")
_HREF_RE = re.compile(r"<(?:[A-Za-z0-9_-]+:)?href[^>]*>\s*([^<\s]+)\s*</(?:[A-Za-z0-9_-]+:)?href>")
_MAX_BODY = 512 * 1024

_DAV_HEADERS = {
    "DAV": "1, 3, addressbook",
    "Allow": "OPTIONS, GET, HEAD, PROPFIND, REPORT",
}
_METHODS = ["OPTIONS", "GET", "HEAD", "PROPFIND", "REPORT", "PUT", "DELETE", "PROPPATCH", "MKCOL", "POST"]
_NS = 'xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"'


def _multistatus(responses: list[str]) -> Response:
    body = f'<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus {_NS}>' + "".join(responses) + "</d:multistatus>"
    return Response(content=body, status_code=207, media_type="application/xml; charset=utf-8", headers=_DAV_HEADERS)


def _response(href: str, props: str) -> str:
    return (
        f"<d:response><d:href>{escape(href)}</d:href>"
        f"<d:propstat><d:prop>{props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>"
        "</d:response>"
    )


def _unauthorized() -> Response:
    return Response(
        status_code=401,
        content="Authentication required",
        headers={"WWW-Authenticate": 'Basic realm="MYLE Contacts", charset="UTF-8"', **_DAV_HEADERS},
    )


async def _auth(request: Request, session: AsyncSession):
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("basic "):
        return None
    try:
        decoded = base64.b64decode(header[6:].strip()).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    username, _, password = decoded.partition(":")
    return await authenticate_carddav(session, username, password)


def _principal_props(user_name: str) -> str:
    return (
        f"<d:current-user-principal><d:href>{PRINCIPAL}</d:href></d:current-user-principal>"
        f"<d:principal-URL><d:href>{PRINCIPAL}</d:href></d:principal-URL>"
        f"<card:addressbook-home-set><d:href>{HOME}</d:href></card:addressbook-home-set>"
        f"<d:displayname>{escape(user_name)}</d:displayname>"
    )


def _book_props(ctag: str) -> str:
    return (
        "<d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>"
        f"<d:displayname>{escape(BOOK_NAME)}</d:displayname>"
        f"<cs:getctag>{escape(ctag)}</cs:getctag>"
        f"<d:getetag>{escape(ctag)}</d:getetag>"
        "<d:supported-report-set>"
        "<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>"
        "<d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>"
        "</d:supported-report-set>"
        f"<d:current-user-principal><d:href>{PRINCIPAL}</d:href></d:current-user-principal>"
        "<d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>"
    )


def _card_href(lead_id: int) -> str:
    return f"{BOOK}{lead_id}.vcf"


async def _cards(session: AsyncSession) -> dict[int, str]:
    return await contact_cards(session, await day2_contact_leads(session))


def _ctag(cards: dict[int, str]) -> str:
    digest = hashlib.sha256("".join(f"{i}:{etag_for(c)}" for i, c in sorted(cards.items())).encode()).hexdigest()
    return f'"{digest[:32]}"'


def _norm(path: str) -> str:
    return path if path.endswith("/") or path.endswith(".vcf") else path + "/"


@router.api_route("/.well-known/carddav", methods=_METHODS)
async def well_known(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response(status_code=200, headers=_DAV_HEADERS)
    return Response(status_code=301, headers={"Location": ROOT})


# The iPhone may probe the site root before /.well-known/carddav. Only DAV methods are
# claimed here — GET / still falls through to the web app.
@router.api_route("/", methods=["OPTIONS", "PROPFIND", "REPORT"])
@router.api_route("/carddav", methods=_METHODS)
@router.api_route("/carddav/{rest:path}", methods=_METHODS)
async def carddav(request: Request, session: Annotated[AsyncSession, Depends(get_db)]) -> Response:
    method = request.method
    if method == "OPTIONS":
        return Response(status_code=200, headers=_DAV_HEADERS)

    user = await _auth(request, session)
    if user is None:
        return _unauthorized()
    if method not in ("GET", "HEAD", "PROPFIND", "REPORT"):
        return Response(status_code=403, content="Read-only address book", headers=_DAV_HEADERS)

    path = _norm(request.url.path)
    depth = (request.headers.get("depth") or "0").strip().lower()
    name = user.name or user.username or "MYLE Admin"

    card_match = _CARD_RE.match(path)
    if card_match:
        lead_id = int(card_match.group(1))
        cards = await _cards(session)
        card = cards.get(lead_id)
        if card is None:
            return Response(status_code=404, headers=_DAV_HEADERS)
        if method in ("GET", "HEAD"):
            return Response(
                content=b"" if method == "HEAD" else card.encode("utf-8"),
                media_type="text/vcard; charset=utf-8",
                headers={"ETag": etag_for(card), **_DAV_HEADERS},
            )
        return _multistatus([
            _response(
                _card_href(lead_id),
                f"<d:getetag>{escape(etag_for(card))}</d:getetag>"
                "<d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype><d:resourcetype/>",
            )
        ])

    if method in ("GET", "HEAD"):
        return Response(status_code=200, content=b"" if method == "HEAD" else b"MYLE CardDAV", headers=_DAV_HEADERS)

    if path in ("/", ROOT, PRINCIPAL):
        props = _principal_props(name) + (
            "<d:resourcetype><d:collection/><d:principal/></d:resourcetype>"
            if path == PRINCIPAL
            else "<d:resourcetype><d:collection/></d:resourcetype>"
        )
        return _multistatus([_response(path, props)])

    if path == HOME:
        out = [_response(HOME, "<d:resourcetype><d:collection/></d:resourcetype>" + _principal_props(name))]
        if depth != "0":
            out.append(_response(BOOK, _book_props(_ctag(await _cards(session)))))
        return _multistatus(out)

    if path == BOOK:
        cards = await _cards(session)
        if method == "PROPFIND":
            out = [_response(BOOK, _book_props(_ctag(cards)))]
            if depth != "0":
                out += [
                    _response(
                        _card_href(i),
                        f"<d:getetag>{escape(etag_for(c))}</d:getetag>"
                        "<d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype><d:resourcetype/>",
                    )
                    for i, c in sorted(cards.items())
                ]
            return _multistatus(out)

        # REPORT
        body = (await request.body())[:_MAX_BODY].decode("utf-8", errors="replace")
        if "addressbook-multiget" in body:
            ids: list[int] = []
            for href in _HREF_RE.findall(body):
                m = _CARD_RE.match(re.sub(r"^https?://[^/]+", "", href))
                if m:
                    ids.append(int(m.group(1)))
        else:  # addressbook-query (or anything else): everything
            ids = sorted(cards)
        out = []
        for i in ids:
            card = cards.get(i)
            if card is None:
                out.append(
                    f"<d:response><d:href>{escape(_card_href(i))}</d:href>"
                    "<d:status>HTTP/1.1 404 Not Found</d:status></d:response>"
                )
                continue
            out.append(
                _response(
                    _card_href(i),
                    f"<d:getetag>{escape(etag_for(card))}</d:getetag>"
                    f"<card:address-data>{escape(card)}</card:address-data>",
                )
            )
        return _multistatus(out)

    return Response(status_code=404, headers=_DAV_HEADERS)
