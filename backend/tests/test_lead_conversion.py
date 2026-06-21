"""Post-close onboarding: register-link helpers + auto-archive on not-closed."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.lead import Lead
from app.models.user import User
from app.services.lead_conversion import (
    build_manual_share_url,
    build_register_message,
    build_register_url,
    handle_lead_converted,
    link_registered_user,
    new_register_token,
    resolve_register_link,
)
from app.services.leads_service import _apply_status_side_effects


def test_register_token_is_urlsafe_and_bounded():
    tok = new_register_token()
    assert 0 < len(tok) <= 64
    assert tok.strip() == tok


def test_build_register_url_and_message():
    url = build_register_url("https://app.example.io/", "abc123")
    assert url == "https://app.example.io/register?rt=abc123"
    msg = build_register_message("Asha", url)
    assert "Asha" in msg
    assert url in msg


def test_manual_share_url_needs_ten_digits():
    assert build_manual_share_url("98765 43210", "hi").startswith("https://wa.me/9876543210")
    assert build_manual_share_url("12345", "hi") is None
    assert build_manual_share_url(None, "hi") is None


def _lead(status: str) -> Lead:
    return Lead(name="L", status=status, archived_at=None)


def test_lost_and_inactive_auto_archive():
    now = datetime.now(timezone.utc)
    for terminal in ("lost", "inactive"):
        lead = _lead(terminal)
        _apply_status_side_effects(lead, previous_status="day1", new_status=terminal, now=now)
        assert lead.archived_at is not None, terminal


def test_converted_does_not_archive():
    now = datetime.now(timezone.utc)
    lead = _lead("converted")
    _apply_status_side_effects(lead, previous_status="day3", new_status="converted", now=now)
    assert lead.archived_at is None


@pytest_asyncio.fixture
async def session(engine) -> AsyncSession:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest.mark.asyncio
async def test_conversion_mints_link_and_register_binds_user(session: AsyncSession):
    closer = User(fbo_id="FBO9001", email="closer@example.com", role="leader", name="Closer")
    session.add(closer)
    await session.commit()
    await session.refresh(closer)

    lead = Lead(
        name="Prospect",
        status="converted",
        phone="9876543210",
        created_by_user_id=closer.id,
        assigned_to_user_id=closer.id,
    )
    session.add(lead)
    await session.commit()

    # Conversion side-effects: token minted (WhatsApp/alert are best-effort, may no-op).
    await handle_lead_converted(session, lead=lead, public_app_url="https://app.example.io")
    await session.commit()
    assert lead.register_token
    token = lead.register_token

    # Public resolve → prefill carries the closer as upline.
    info = await resolve_register_link(session, token)
    assert info and info["found"] and not info.get("already_used")
    assert info["name"] == "Prospect"
    assert info["phone"] == "9876543210"
    assert info["upline_fbo_id"] == "FBO9001"

    # Registering binds the new member back to the lead (token now spent).
    await link_registered_user(session, token=token, user_id=closer.id)
    await session.commit()
    await session.refresh(lead)
    assert lead.registered_user_id == closer.id
    assert lead.registered_at is not None

    spent = await resolve_register_link(session, token)
    assert spent and spent.get("already_used") is True
