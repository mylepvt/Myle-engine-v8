"""Day 2 prospects as iPhone contacts: .vcf downloads and Google Contacts sync."""
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
        await s.execute(delete(AppSetting).where(AppSetting.key.like("google_contacts:%")))
        await s.execute(delete(AppSetting).where(AppSetting.key.like("day2_vcf_export:%")))
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
    assert (await leader_client.get("/api/v1/admin/contacts/google")).status_code == 403
    assert (await leader_client.get("/api/v1/admin/contacts/google/connect")).status_code == 403
    assert (await leader_client.post("/api/v1/admin/contacts/google/sync")).status_code == 403


# ── Google Contacts sync ──────────────────────────────────────────────────────

class FakeGoogle:
    """Just enough of Google's OAuth + People API for the sync."""

    def __init__(self):
        self.people: dict[str, dict] = {}
        self.groups: dict[str, str] = {}
        self.calls: list[str] = []
        self.revoked: list[str] = []
        self.refresh_ok = True
        self._n = 0

    def _id(self, prefix):
        self._n += 1
        return f"{prefix}/c{self._n}"

    def handler(self, request):
        import json as _json

        import httpx

        url, method = request.url, request.method
        self.calls.append(f"{method} {url.path}")
        if url.path == "/token":
            form = dict(x.split("=", 1) for x in request.content.decode().split("&"))
            if form["grant_type"] == "authorization_code":
                payload = base64.urlsafe_b64encode(_json.dumps({"email": "karan@gmail.com"}).encode()).decode().rstrip("=")
                return httpx.Response(200, json={"refresh_token": "r-1", "access_token": "a-1", "id_token": f"x.{payload}.y"})
            if not self.refresh_ok:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "a-2"})
        if url.path == "/revoke":
            self.revoked.append(request.content.decode())
            return httpx.Response(200)
        assert request.headers["authorization"].startswith("Bearer ")
        if url.path == "/v1/contactGroups" and method == "POST":
            rn = self._id("contactGroups")
            self.groups[rn] = _json.loads(request.content)["contactGroup"]["name"]
            return httpx.Response(200, json={"resourceName": rn})
        if url.path.startswith("/v1/contactGroups/") and method == "GET":
            rn = url.path[len("/v1/"):]
            return httpx.Response(200 if rn in self.groups else 404, json={"resourceName": rn})
        if url.path == "/v1/people:batchCreateContacts":
            made = []
            for c in _json.loads(request.content)["contacts"]:
                rn = self._id("people")
                self.people[rn] = {**c["contactPerson"], "etag": "e1"}
                made.append({"person": {"resourceName": rn}})
            return httpx.Response(200, json={"createdPeople": made})
        if url.path == "/v1/people:batchGet":
            names = url.params.get_list("resourceNames")
            return httpx.Response(200, json={"responses": [
                {"requestedResourceName": n, "person": {"resourceName": n, "etag": self.people[n]["etag"]}}
                if n in self.people else {"requestedResourceName": n, "httpStatusCode": 404}
                for n in names
            ]})
        if url.path == "/v1/people:batchUpdateContacts":
            for rn, person in _json.loads(request.content)["contacts"].items():
                assert person["etag"] == self.people[rn]["etag"]
                self.people[rn] = {**self.people[rn], **person, "etag": "e2"}
            return httpx.Response(200, json={"updateResult": {}})
        return httpx.Response(404)

    def client(self):
        import httpx

        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


@pytest.fixture
def google_env(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "google_contacts_client_id", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_contacts_client_secret", "csecret")
    monkeypatch.setattr("app.services.google_contacts.TOKEN_URL", "https://oauth2.example/token")
    monkeypatch.setattr("app.services.google_contacts.REVOKE_URL", "https://oauth2.example/revoke")
    monkeypatch.setattr("app.services.google_contacts.PEOPLE", "https://people.example/v1")


def _names(fake: FakeGoogle) -> list[str]:
    return sorted(p["names"][0]["givenName"] for p in fake.people.values())


async def test_google_connect_needs_server_config(seeded, admin_client: AsyncClient):
    status = (await admin_client.get("/api/v1/admin/contacts/google")).json()
    assert status["configured"] is False and status["connected"] is False
    assert status["redirect_uri"] == "http://test/api/v1/admin/contacts/google/callback"
    assert (await admin_client.get("/api/v1/admin/contacts/google/connect")).status_code == 503


async def test_google_connect_url(seeded, google_env, admin_client: AsyncClient):
    from urllib.parse import parse_qs, urlparse

    url = (await admin_client.get("/api/v1/admin/contacts/google/connect")).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert url.startswith("https://accounts.google.com/")
    assert q["scope"] == ["openid email https://www.googleapis.com/auth/contacts"]
    assert q["access_type"] == ["offline"] and q["prompt"] == ["consent"]
    from app.services import google_contacts as gc

    assert gc.read_state(q["state"][0]) == ADMIN


def test_state_is_signed_and_expires():
    from app.services import google_contacts as gc

    st = gc.make_state(ADMIN, now=1000)
    assert gc.read_state(st, now=1100) == ADMIN
    assert gc.read_state(st, now=1000 + 16 * 60) is None          # expired
    assert gc.read_state(st.replace(f"{ADMIN}.", "999."), now=1100) is None  # forged user
    assert gc.read_state("garbage") is None


async def test_google_sync_creates_updates_and_recreates(seeded, google_env, engine):
    from app.services import google_contacts as gc

    fake = FakeGoogle()
    async with AsyncSession(engine, expire_on_commit=False) as s, fake.client() as client:
        state = await gc.exchange_code(s, ADMIN, "code-1", "https://x/cb", client)
        assert state["email"] == "karan@gmail.com"
        assert "r-1" not in str(state)  # refresh token stored encrypted

        first = await gc.sync(s, ADMIN, client)
        assert (first["created"], first["updated"], first["total"]) == (2, 0, 2)
        assert list(fake.groups.values()) == ["MYLE Day 2"]
        assert _names(fake) == ["Neha; Gupta – MYLE", "Rahul Sharma – Priya Verma – MYLE"]
        rahul = next(p for p in fake.people.values() if p["names"][0]["givenName"].startswith("Rahul"))
        assert rahul["phoneNumbers"][0]["value"] == "+919876543210"
        assert rahul["memberships"][0]["contactGroupMembership"]["contactGroupResourceName"] in fake.groups

        # nothing changed → no writes
        fake.calls.clear()
        again = await gc.sync(s, ADMIN, client)
        assert (again["created"], again["updated"]) == (0, 0)
        assert not any("batchCreate" in c or "batchUpdate" in c for c in fake.calls)

        # rename a lead → updated in place; a contact deleted in Google → created again
        lead = await s.get(Lead, L_DAY2)
        lead.name = "Rahul K Sharma"
        await s.commit()
        neha_rn = next(rn for rn, p in fake.people.items() if p["names"][0]["givenName"].startswith("Neha"))
        del fake.people[neha_rn]
        lead3 = await s.get(Lead, L_DAY3)
        lead3.phone = "9000000000"
        await s.commit()
        third = await gc.sync(s, ADMIN, client)
        assert (third["created"], third["updated"]) == (1, 1)
        assert "Rahul K Sharma – Priya Verma – MYLE" in _names(fake)
        assert len(fake.people) == 2

        status = gc.public_status(await gc.load_state(s, ADMIN))
        assert status["connected"] and status["last_count"] == 2 and status["last_error"] is None


async def test_google_sync_reports_revoked_access(seeded, google_env, engine):
    from app.services import google_contacts as gc

    fake = FakeGoogle()
    async with AsyncSession(engine, expire_on_commit=False) as s, fake.client() as client:
        await gc.exchange_code(s, ADMIN, "code-1", "https://x/cb", client)
        fake.refresh_ok = False
        with pytest.raises(gc.GoogleContactsError, match="connect again"):
            await gc.sync(s, ADMIN, client)
        assert "connect again" in gc.public_status(await gc.load_state(s, ADMIN))["last_error"]

        await gc.disconnect(s, ADMIN, client)
        assert fake.revoked == ["token=r-1"]
        assert await gc.load_state(s, ADMIN) is None


async def test_google_callback_rejects_bad_state(seeded, google_env, anon_client: AsyncClient):
    r = await anon_client.get("/api/v1/admin/contacts/google/callback", params={"code": "x", "state": "1.2.bad"})
    assert r.status_code == 303 and r.headers["location"] == "/dashboard?google_contacts=cancelled"
    r = await anon_client.get("/api/v1/admin/contacts/google/callback", params={"error": "access_denied", "state": ""})
    assert r.headers["location"] == "/dashboard?google_contacts=cancelled"


# ── "Save only new" ──────────────────────────────────────────────────────────

async def test_save_only_new_contacts(seeded, admin_client: AsyncClient, engine):
    assert (await admin_client.get("/api/v1/admin/contacts/day2/new-count")).json() == {"new": 2}

    # saving one lead from the Workboard counts as saved
    await admin_client.get(f"/api/v1/admin/contacts/lead/{L_DAY2}.vcf")
    assert (await admin_client.get("/api/v1/admin/contacts/day2/new-count")).json() == {"new": 1}

    made = (await admin_client.post("/api/v1/admin/contacts/day2/new-export")).json()
    assert made["count"] == 1 and made["path"].endswith(".vcf")
    # the file can be opened more than once (the app pre-checks, then the phone opens it)
    for _ in range(2):
        r = await admin_client.get(made["path"])
        assert r.status_code == 200
        assert "Neha\\; Gupta – MYLE" in r.text and "Rahul" not in r.text
    assert (await admin_client.get("/api/v1/admin/contacts/day2/new-count")).json() == {"new": 0}
    assert (await admin_client.post("/api/v1/admin/contacts/day2/new-export")).json() == {"count": 0, "path": None}

    # a new Day 2 prospect shows up as new
    async with AsyncSession(engine, expire_on_commit=False) as s:
        s.add(Lead(id=L_NEW + 50, name="Fresh One", status="day2", phone="9811111111", created_by_user_id=MEMBER,
                   owner_user_id=MEMBER, assigned_to_user_id=MEMBER, in_pool=False, call_count=0))
        await s.commit()
    try:
        made = (await admin_client.post("/api/v1/admin/contacts/day2/new-export")).json()
        assert made["count"] == 1
        assert "Fresh One – Priya Verma – MYLE" in (await admin_client.get(made["path"])).text
    finally:
        async with AsyncSession(engine) as s:
            await s.execute(delete(Lead).where(Lead.id == L_NEW + 50))
            await s.commit()

    assert (await admin_client.get("/api/v1/admin/contacts/day2/export/not-a-token.vcf")).status_code == 404


async def test_save_all_marks_everyone_saved(seeded, admin_client: AsyncClient):
    assert (await admin_client.get("/api/v1/admin/contacts/day2.vcf")).status_code == 200
    assert (await admin_client.get("/api/v1/admin/contacts/day2/new-count")).json() == {"new": 0}


async def test_new_contacts_admin_only(seeded, leader_client: AsyncClient):
    assert (await leader_client.get("/api/v1/admin/contacts/day2/new-count")).status_code == 403
    assert (await leader_client.post("/api/v1/admin/contacts/day2/new-export")).status_code == 403
