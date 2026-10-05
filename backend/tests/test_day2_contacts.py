"""Day 2 prospects as iPhone contacts: .vcf downloads and the read-only CardDAV address book."""
from __future__ import annotations

import base64

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.lead import Lead
from app.models.user import User
from app.services.day2_contacts import phone_for_contact, vcard_for_lead

ADMIN = 203
LEADER, MEMBER = 9201, 9202
L_DAY2, L_DAY3, L_NEW, L_NOPHONE, L_DELETED = 9101, 9102, 9103, 9104, 9105


@pytest.fixture
async def seeded(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        await s.execute(delete(Lead).where(Lead.id.in_([L_DAY2, L_DAY3, L_NEW, L_NOPHONE, L_DELETED])))
        await s.execute(delete(AppSetting).where(AppSetting.key.like("carddav_admin:%")))
        if await s.get(User, ADMIN) is None:
            s.add(User(id=ADMIN, fbo_id="A00203", email="admin203@test.myle", role="admin", name="Karanveer Singh"))
        if await s.get(User, LEADER) is None:
            s.add(User(id=LEADER, fbo_id="L09201", email="l9201@test.myle", role="leader", name="Priya  Verma",
                       upline_user_id=ADMIN))
            s.add(User(id=MEMBER, fbo_id="T09202", email="t9202@test.myle", role="team", name="Aman",
                       upline_user_id=LEADER))
        await s.flush()

        def lead(i, name, status, phone="9876543210", owner=MEMBER, **kw):
            return Lead(id=i, name=name, status=status, phone=phone, city="Jaipur", created_by_user_id=owner,
                        owner_user_id=owner, assigned_to_user_id=owner, in_pool=False, call_count=0, **kw)

        from datetime import datetime, timezone

        s.add_all([
            lead(L_DAY2, "Rahul Sharma", "day2"),
            lead(L_DAY3, "Neha; Gupta", "day3", phone="+91 98765 11111", owner=ADMIN),  # no leader above
            lead(L_NEW, "New Person", "new_lead"),                         # not Day 2 yet
            lead(L_NOPHONE, "No Phone", "day2", phone=None),
            lead(L_DELETED, "Gone", "day2", deleted_at=datetime.now(timezone.utc)),
        ])
        await s.commit()
    yield


def test_vcard_and_phone_format():
    assert phone_for_contact("98765 43210") == "+919876543210"
    assert phone_for_contact("919876543210") == "+919876543210"
    card = vcard_for_lead(Lead(id=7, name="Neha; Gupta", phone="9876543210", city=None), "Priya Verma")
    assert card.startswith("BEGIN:VCARD\r\nVERSION:3.0\r\n")
    assert "FN:Neha\\; Gupta – Priya Verma – MYLE\r\n" in card
    assert "Leader: Priya Verma" in card
    assert "FN:Neha\\; Gupta – MYLE\r\n" in vcard_for_lead(Lead(id=8, name="Neha; Gupta", phone="1", city=None))
    assert "TEL;TYPE=CELL:+919876543210\r\n" in card
    assert card.endswith("END:VCARD\r\n")


async def test_bulk_vcf_has_only_day2_prospects(seeded, admin_client: AsyncClient):
    r = await admin_client.get("/api/v1/admin/contacts/day2.vcf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/vcard")
    body = r.text
    # prospect – leader – MYLE (leader = owner's nearest leader; none above an admin owner)
    assert "Rahul Sharma – Priya Verma – MYLE" in body and "Neha\\; Gupta – MYLE" in body
    assert "New Person" not in body and "No Phone" not in body and "Gone" not in body


async def test_single_lead_vcf(seeded, admin_client: AsyncClient):
    r = await admin_client.get(f"/api/v1/admin/contacts/lead/{L_DAY2}.vcf")
    assert r.status_code == 200, r.text
    assert "Rahul_Sharma_Priya_Verma_MYLE.vcf" in r.headers["content-disposition"]
    assert (await admin_client.get(f"/api/v1/admin/contacts/lead/{L_NOPHONE}.vcf")).status_code == 422


async def test_contacts_are_admin_only(seeded, leader_client: AsyncClient):
    assert (await leader_client.get("/api/v1/admin/contacts/day2.vcf")).status_code == 403
    assert (await leader_client.get(f"/api/v1/admin/contacts/lead/{L_DAY2}.vcf")).status_code == 403
    assert (await leader_client.post("/api/v1/admin/contacts/carddav/password")).status_code == 403


def _basic(user: str, pw: str) -> dict[str, str]:
    return {"Authorization": "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()}


async def test_carddav_sync(seeded, admin_client: AsyncClient):
    status = (await admin_client.get("/api/v1/admin/contacts/carddav")).json()
    assert status["enabled"] is False and status["username"] == "myle-admin-203"
    creds = (await admin_client.post("/api/v1/admin/contacts/carddav/password")).json()
    user, pw = creds["username"], creds["password"]
    assert len(pw) == 24 and (await admin_client.get("/api/v1/admin/contacts/carddav")).json()["enabled"] is True
    auth = _basic(user, pw)

    # Discovery
    wk = await admin_client.request("PROPFIND", "/.well-known/carddav")
    assert wk.status_code == 301 and wk.headers["location"] == "/carddav/"
    assert (await admin_client.request("PROPFIND", "/carddav/")).status_code == 401
    assert (await admin_client.request("PROPFIND", "/carddav/", headers=_basic(user, "wrong"))).status_code == 401
    root = await admin_client.request("PROPFIND", "/carddav/", headers={**auth, "Depth": "0"})
    assert root.status_code == 207 and "/carddav/principal/" in root.text
    principal = await admin_client.request("PROPFIND", "/carddav/principal/", headers={**auth, "Depth": "0"})
    assert "<card:addressbook-home-set><d:href>/carddav/books/</d:href>" in principal.text
    home = await admin_client.request("PROPFIND", "/carddav/books/", headers={**auth, "Depth": "1"})
    assert "/carddav/books/day2/" in home.text and "<card:addressbook/>" in home.text

    # Listing with etags, then multiget
    book = await admin_client.request("PROPFIND", "/carddav/books/day2/", headers={**auth, "Depth": "1"})
    assert book.status_code == 207 and "cs:getctag" in book.text
    assert f"/carddav/books/day2/{L_DAY2}.vcf" in book.text and f"/carddav/books/day2/{L_DAY3}.vcf" in book.text
    assert f"{L_NEW}.vcf" not in book.text
    multiget = (
        '<?xml version="1.0"?><C:addressbook-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">'
        "<D:prop><D:getetag/><C:address-data/></D:prop>"
        f"<D:href>/carddav/books/day2/{L_DAY2}.vcf</D:href><D:href>/carddav/books/day2/999999.vcf</D:href>"
        "</C:addressbook-multiget>"
    )
    rep = await admin_client.request("REPORT", "/carddav/books/day2/", headers={**auth, "Depth": "1"}, content=multiget)
    assert rep.status_code == 207
    assert "Rahul Sharma – Priya Verma – MYLE" in rep.text and "Neha" not in rep.text
    assert "404 Not Found" in rep.text
    card = await admin_client.get(f"/carddav/books/day2/{L_DAY2}.vcf", headers=auth)
    assert card.status_code == 200 and card.headers["etag"] and "BEGIN:VCARD" in card.text

    # Read-only, and turning sync off revokes the password
    assert (await admin_client.request("PUT", f"/carddav/books/day2/{L_DAY2}.vcf", headers=auth)).status_code == 403
    assert (await admin_client.delete("/api/v1/admin/contacts/carddav")).json() == {"enabled": False}
    assert (await admin_client.request("PROPFIND", "/carddav/", headers=auth)).status_code == 401


async def test_carddav_iphone_style_discovery(seeded, admin_client: AsyncClient):
    """Mimic iOS: probe the site root, capitalised user name, full server URL; every reply is valid XML."""
    import xml.etree.ElementTree as ET

    creds = (await admin_client.post("/api/v1/admin/contacts/carddav/password")).json()
    assert creds["server_url"] == "http://test/carddav/principal/"
    auth = _basic(creds["username"].capitalize(), creds["password"])  # "Myle-admin-203"

    root = await admin_client.request("PROPFIND", "/", headers={"Depth": "0"})
    assert root.status_code == 401 and "Basic" in root.headers["www-authenticate"]
    root = await admin_client.request("PROPFIND", "/", headers={**auth, "Depth": "0"})
    assert root.status_code == 207 and "/carddav/principal/" in root.text
    assert (await admin_client.options("/")).headers["dav"] == "1, 3, addressbook"

    for path, depth in (("/", "0"), ("/carddav/principal/", "0"), ("/carddav/books/", "1"), ("/carddav/books/day2/", "1")):
        r = await admin_client.request("PROPFIND", path, headers={**auth, "Depth": depth})
        assert r.status_code == 207, (path, r.status_code)
        ET.fromstring(r.content)  # well-formed multistatus
    rep = await admin_client.request(
        "REPORT", "/carddav/books/day2/", headers={**auth, "Depth": "1"},
        content='<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"/>',
    )
    tree = ET.fromstring(rep.content)
    data = [e.text for e in tree.iter("{urn:ietf:params:xml:ns:carddav}address-data")]
    assert any("Rahul Sharma – Priya Verma – MYLE" in (d or "") for d in data)

    # GET / is still the web app, not claimed by CardDAV
    assert (await admin_client.get("/")).status_code != 405


async def test_carddav_attempts_are_logged_for_admin(seeded, admin_client: AsyncClient):
    creds = (await admin_client.post("/api/v1/admin/contacts/carddav/password")).json()
    await admin_client.request("PROPFIND", "/.well-known/carddav", headers={"User-Agent": "iOS/18.0 dataaccessd"})
    await admin_client.request("PROPFIND", "/carddav/", headers={"User-Agent": "iOS/18.0 dataaccessd"})
    await admin_client.request("PROPFIND", "/carddav/", headers=_basic(creds["username"], "nope"))
    await admin_client.request("PROPFIND", "/carddav/", headers=_basic(creds["username"], creds["password"]))

    d = (await admin_client.get("/api/v1/admin/contacts/carddav/diagnostics")).json()
    assert d["self_check"] is None
    latest = d["attempts"][:4]  # newest first
    assert [a["status"] for a in latest] == [207, 401, 401, 301]
    assert [a["auth"] for a in latest] == ["ok", "wrong user name or password", "no login sent", "-"]
    assert latest[3]["agent"].startswith("iOS/18.0")
    assert "nope" not in str(d) and creds["password"] not in str(d)


async def test_carddav_diagnostics_admin_only(leader_client: AsyncClient):
    assert (await leader_client.get("/api/v1/admin/contacts/carddav/diagnostics")).status_code == 403


async def test_self_check_reports_status_and_ssl_errors():
    import httpx

    from app.services.carddav_diagnostics import self_check

    def ok(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/.well-known/carddav":
            return httpx.Response(301, headers={"Location": "/carddav/"})
        if request.method == "PROPFIND":
            return httpx.Response(401, headers={"WWW-Authenticate": 'Basic realm="x"'})
        return httpx.Response(200)

    good = await self_check("myle.example", transport=httpx.MockTransport(ok))
    assert [r["ok"] for r in good] == [True, True, True]
    assert good[0]["url"] == "https://myle.example/.well-known/carddav"

    blocked = await self_check("myle.example", transport=httpx.MockTransport(lambda r: httpx.Response(405, text="Method Not Allowed")))
    assert [r["ok"] for r in blocked] == [False, False, False]

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED]")

    failed = await self_check("myle.example", transport=httpx.MockTransport(boom))
    assert failed[0]["ok"] is False and "SSL" in failed[0]["detail"]


def test_server_url_pins_port_443():
    from starlette.requests import Request as _Req

    from app.api.v1.admin_contacts import _server_url

    scope = {"type": "http", "method": "GET", "path": "/", "headers": [(b"host", b"myle.example.com")],
             "scheme": "http", "server": ("myle.example.com", 80), "query_string": b""}
    assert _server_url(_Req(scope)) == "https://myle.example.com:443/carddav/principal/"
