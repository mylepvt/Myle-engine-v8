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
L_DAY2, L_DAY3, L_NEW, L_NOPHONE, L_DELETED = 9101, 9102, 9103, 9104, 9105


@pytest.fixture
async def seeded(engine):
    async with AsyncSession(engine, expire_on_commit=False) as s:
        await s.execute(delete(Lead).where(Lead.id.in_([L_DAY2, L_DAY3, L_NEW, L_NOPHONE, L_DELETED])))
        await s.execute(delete(AppSetting).where(AppSetting.key.like("carddav_admin:%")))
        if await s.get(User, ADMIN) is None:
            s.add(User(id=ADMIN, fbo_id="A00203", email="admin203@test.myle", role="admin", name="Karanveer Singh"))
        await s.flush()

        def lead(i, name, status, phone="9876543210", **kw):
            return Lead(id=i, name=name, status=status, phone=phone, city="Jaipur", created_by_user_id=ADMIN,
                        owner_user_id=ADMIN, assigned_to_user_id=ADMIN, in_pool=False, call_count=0, **kw)

        from datetime import datetime, timezone

        s.add_all([
            lead(L_DAY2, "Rahul Sharma", "day2"),
            lead(L_DAY3, "Neha; Gupta", "day3", phone="+91 98765 11111"),  # moved on, still a contact
            lead(L_NEW, "New Person", "new_lead"),                         # not Day 2 yet
            lead(L_NOPHONE, "No Phone", "day2", phone=None),
            lead(L_DELETED, "Gone", "day2", deleted_at=datetime.now(timezone.utc)),
        ])
        await s.commit()
    yield


def test_vcard_and_phone_format():
    assert phone_for_contact("98765 43210") == "+919876543210"
    assert phone_for_contact("919876543210") == "+919876543210"
    card = vcard_for_lead(Lead(id=7, name="Neha; Gupta", phone="9876543210", city=None))
    assert card.startswith("BEGIN:VCARD\r\nVERSION:3.0\r\n")
    assert "FN:Neha\\; Gupta – MYLE Day 2\r\n" in card
    assert "TEL;TYPE=CELL:+919876543210\r\n" in card
    assert card.endswith("END:VCARD\r\n")


async def test_bulk_vcf_has_only_day2_prospects(seeded, admin_client: AsyncClient):
    r = await admin_client.get("/api/v1/admin/contacts/day2.vcf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/vcard")
    body = r.text
    assert "Rahul Sharma – MYLE Day 2" in body and "Neha\\; Gupta – MYLE Day 2" in body
    assert "New Person" not in body and "No Phone" not in body and "Gone" not in body


async def test_single_lead_vcf(seeded, admin_client: AsyncClient):
    r = await admin_client.get(f"/api/v1/admin/contacts/lead/{L_DAY2}.vcf")
    assert r.status_code == 200, r.text
    assert "Rahul_Sharma_MYLE_Day_2.vcf" in r.headers["content-disposition"]
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
    assert "Rahul Sharma – MYLE Day 2" in rep.text and "Neha" not in rep.text
    assert "404 Not Found" in rep.text
    card = await admin_client.get(f"/carddav/books/day2/{L_DAY2}.vcf", headers=auth)
    assert card.status_code == 200 and card.headers["etag"] and "BEGIN:VCARD" in card.text

    # Read-only, and turning sync off revokes the password
    assert (await admin_client.request("PUT", f"/carddav/books/day2/{L_DAY2}.vcf", headers=auth)).status_code == 403
    assert (await admin_client.delete("/api/v1/admin/contacts/carddav")).json() == {"enabled": False}
    assert (await admin_client.request("PROPFIND", "/carddav/", headers=auth)).status_code == 401
