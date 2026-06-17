"""End-to-end flow for member lead-capture links (real services, in-memory SQLite).

Covers the full journey:
  member creates link → prospect opens public info → prospect submits form →
  Lead created (owner + source + capture_link_id) → "Generated" pill shows it
  (generated_only=True) while the default Calling Board excludes it (generated_only=False).
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — register all mappers
from app.api.deps import AuthUser
from app.db.base import Base
from app.models.lead import Lead
from app.models.user import User
from app.repositories.leads_repository import SqlAlchemyLeadsRepository
from app.services import capture_service
from app.services.leads_service import LeadsService


async def _noop_notifier(*_topics: str) -> None:
    return None


async def _run_flow() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        member = User(fbo_id="FBO100", email="member@example.com", role="admin", name="Karan")
        session.add(member)
        await session.commit()
        await session.refresh(member)

        # 1. Member creates a capture link
        link = await capture_service.create_link(
            session, owner_user_id=member.id, category="referral"
        )
        assert link.token
        assert link.category == "referral"
        assert link.leads_count == 0

        # invalid category rejected
        with pytest.raises(capture_service.CaptureError):
            await capture_service.create_link(
                session, owner_user_id=member.id, category="not_a_real_category"
            )

        # 2. Public form info
        info = await capture_service.get_public_info(session, link.token)
        assert info["owner_name"] == "Karan"
        assert info["category"] == "referral"
        assert info["category_label"] == "Referral"

        # 3. Prospect submits the public form
        await capture_service.submit_public_lead(
            session,
            link.token,
            name="Prospect One",
            phone="9990001111",
            city="Delhi",
            age=27,
        )

        # 4. Lead created correctly
        leads = (await session.execute(Lead.__table__.select())).fetchall()
        assert len(leads) == 1
        lead = (await session.get(Lead, leads[0].id))
        assert lead.name == "Prospect One"
        assert lead.phone == "9990001111"
        assert lead.city == "Delhi"
        assert lead.age == 27
        assert lead.status == "new_lead"
        assert lead.source == "referral"
        assert lead.owner_user_id == member.id
        assert lead.assigned_to_user_id == member.id
        assert lead.capture_link_id == link.id

        # link counter incremented
        await session.refresh(link)
        assert link.leads_count == 1

        # 5. Add a NORMAL (non-captured) lead to prove isolation
        normal = Lead(
            name="Walk-in Lead",
            status="new_lead",
            created_by_user_id=member.id,
            owner_user_id=member.id,
            assigned_to_user_id=member.id,
            phone="8887776666",
        )
        session.add(normal)
        await session.commit()

        service = LeadsService(
            repository=SqlAlchemyLeadsRepository(session),
            notifier=_noop_notifier,
            session=session,
        )
        admin = AuthUser(user_id=member.id, role="admin", email="member@example.com")

        # Default Calling Board view → only the normal lead, generated EXCLUDED
        default_list = await service.list_leads(
            user=admin, limit=50, offset=0, q=None, status=None,
            archived_only=False, deleted_only=False,
        )
        default_names = {it.name for it in default_list.items}
        assert "Walk-in Lead" in default_names
        assert "Prospect One" not in default_names

        # "Generated" pill → only the captured lead
        gen_list = await service.list_leads(
            user=admin, limit=50, offset=0, q=None, status=None,
            archived_only=False, deleted_only=False, generated_only=True,
        )
        gen_names = {it.name for it in gen_list.items}
        assert gen_names == {"Prospect One"}

        # 6. Deactivated link rejects new submissions
        await capture_service.deactivate_link(
            session, owner_user_id=member.id, link_id=link.id
        )
        with pytest.raises(capture_service.CaptureError):
            await capture_service.get_public_info(session, link.token)
        with pytest.raises(capture_service.CaptureError):
            await capture_service.submit_public_lead(
                session, link.token, name="Late", phone="7776665555", city=None, age=None
            )

    await engine.dispose()


def test_capture_link_full_flow() -> None:
    asyncio.run(_run_flow())


async def _run_http_public_flow() -> None:
    """Drive the real FastAPI app over HTTP for the public (no-auth) endpoints."""
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.pool import StaticPool

    from app.db.session import get_db
    from main import app

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with Session() as seed:
            member = User(fbo_id="FBO200", email="m2@example.com", role="leader", name="Asha")
            seed.add(member)
            await seed.commit()
            await seed.refresh(member)
            link = await capture_service.create_link(
                seed, owner_user_id=member.id, category="known_zone"
            )
            token = link.token

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # public info
            r = await client.get(f"/api/capture/{token}")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["owner_name"] == "Asha"
            assert body["category_label"] == "Known Zone"

            # bad token → 404
            r404 = await client.get("/api/capture/does-not-exist")
            assert r404.status_code == 404

            # submit form
            r2 = await client.post(
                f"/api/capture/{token}",
                json={"name": "Web Lead", "phone": "9001234567", "city": "Pune", "age": 30},
            )
            assert r2.status_code == 200, r2.text
            assert r2.json()["ok"] is True

            # validation: missing phone → 422
            r422 = await client.post(f"/api/capture/{token}", json={"name": "NoPhone"})
            assert r422.status_code == 422

        async with Session() as verify:
            rows = (await verify.execute(Lead.__table__.select())).fetchall()
            assert len(rows) == 1
            lead = await verify.get(Lead, rows[0].id)
            assert lead.name == "Web Lead"
            assert lead.source == "known_zone"
            assert lead.capture_link_id is not None
            assert lead.owner_user_id == member.id
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


def test_capture_public_http_flow() -> None:
    asyncio.run(_run_http_public_flow())


async def _run_http_authed_flow() -> None:
    """Drive the authed member endpoints over HTTP (catches AuthUser attr mistakes)."""
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.pool import StaticPool

    from app.api.deps import require_auth_user
    from app.db.session import get_db
    from main import app

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as seed:
        member = User(fbo_id="FBO300", email="m3@example.com", role="team", name="Ravi")
        seed.add(member)
        await seed.commit()
        await seed.refresh(member)
        member_id = member.id

    async def _override_get_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[require_auth_user] = lambda: AuthUser(
        user_id=member_id, role="team", email="m3@example.com"
    )
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # categories
            rc = await client.get("/api/v1/capture/categories")
            assert rc.status_code == 200, rc.text
            assert any(c["slug"] == "referral" for c in rc.json())

            # create link
            r = await client.post("/api/v1/capture/links", json={"category": "referral"})
            assert r.status_code == 201, r.text
            link = r.json()
            assert link["category"] == "referral"
            assert link["token"]

            # invalid category → 400
            rbad = await client.post("/api/v1/capture/links", json={"category": "nope"})
            assert rbad.status_code == 400

            # list links
            rl = await client.get("/api/v1/capture/links")
            assert rl.status_code == 200, rl.text
            assert len(rl.json()["links"]) == 1

            # deactivate
            rd = await client.delete(f"/api/v1/capture/links/{link['id']}")
            assert rd.status_code == 200, rd.text
            assert rd.json()["active"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(require_auth_user, None)
        await engine.dispose()


def test_capture_authed_http_flow() -> None:
    asyncio.run(_run_http_authed_flow())
