"""Shared fixtures for HTTP API tests.

Strategy:
- Set DATABASE_URL to SQLite *before* app imports so session.py never loads asyncpg
- SQLite in-memory (aiosqlite + StaticPool) — no PostgreSQL / asyncpg needed
- Schema created once per session via Base.metadata.create_all
- get_db dependency overridden to use the test engine
- require_auth_user overridden with role-specific fake user
- APScheduler patched to suppress background job noise
"""
from __future__ import annotations

import os
import sys

# ── Must happen BEFORE any app import so settings + session.py pick up SQLite ──
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import AuthUser, get_db, require_auth_user
from app.db.base import Base
import app.models  # noqa: F401 — registers all ORM models with Base.metadata

_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ── Database ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def engine():
    """Single shared in-memory SQLite engine; all tables created once."""
    eng = create_async_engine(
        _TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


def _db_override(eng):
    factory = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False, autoflush=False)

    async def _get_db():
        async with factory() as session:
            yield session

    return _get_db


# ── Auth ──────────────────────────────────────────────────────────────────────

def _auth_override(role: str, user_id: int):
    async def _fake_auth():
        return AuthUser(
            user_id=user_id,
            role=role,
            email=f"{role}{user_id}@test.myle",
            fbo_id=f"T{user_id:05d}",
            username=f"{role}_{user_id}",
        )
    return _fake_auth


# ── Client fixtures ───────────────────────────────────────────────────────────

def _stack_overrides(app, engine, auth_override=None):
    """Stack dependency overrides so multiple client fixtures can coexist."""
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = _db_override(engine)
    if auth_override:
        app.dependency_overrides[require_auth_user] = auth_override
    return saved


@pytest_asyncio.fixture
async def team_client(engine):
    """Authenticated as team member (user_id=201)."""
    from main import app
    saved = _stack_overrides(app, engine, _auth_override("team", 201))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides = saved


@pytest_asyncio.fixture
async def leader_client(engine):
    """Authenticated as leader (user_id=202)."""
    from main import app
    saved = _stack_overrides(app, engine, _auth_override("leader", 202))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides = saved


@pytest_asyncio.fixture
async def admin_client(engine):
    """Authenticated as admin (user_id=203)."""
    from main import app
    saved = _stack_overrides(app, engine, _auth_override("admin", 203))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides = saved


@pytest_asyncio.fixture
async def anon_client(engine):
    """No auth — only overrides get_db (for public endpoints like webhooks)."""
    from main import app
    saved = _stack_overrides(app, engine)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides = saved
