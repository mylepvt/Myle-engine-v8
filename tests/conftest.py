from __future__ import annotations

import asyncio
import os
import sys
import tempfile

import pytest
from collections.abc import AsyncGenerator
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
_TEST_DB_FD, _TEST_DB_NAME = tempfile.mkstemp(prefix="myle-vl2-test-", suffix=".sqlite3")
os.close(_TEST_DB_FD)
_TEST_DB_PATH = Path(_TEST_DB_NAME)
sys.path.insert(0, str(_BACKEND))

# Disable APScheduler background jobs during tests — prevents DB connection hangs
os.environ.setdefault("DISABLE_SCHEDULER", "1")

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.core.passwords import DEV_LOGIN_BCRYPT_HASH
import app.models  # noqa: F401 — registers all ORM models with Base.metadata
# Models not yet in app.models.__init__ but needed for schema creation
from app.models.follow_up import FollowUp  # noqa: F401
from app.models.push_subscription import PushSubscription  # noqa: F401
from app.models.xp_event import XpEvent  # noqa: F401
from app.models.xp_monthly_archive import XpMonthlyArchive  # noqa: F401
from app.models.user import User
from app.constants.roles import DEV_FBO_BY_ROLE
from app.services.dev_users import DEV_EMAIL_BY_ROLE


async def _setup_sqlite() -> tuple[object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{_TEST_DB_PATH}",
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                User(
                    fbo_id=DEV_FBO_BY_ROLE["admin"],
                    email=DEV_EMAIL_BY_ROLE["admin"],
                    role="admin",
                    hashed_password=DEV_LOGIN_BCRYPT_HASH,
                    registration_status="approved",
                ),
                User(
                    fbo_id=DEV_FBO_BY_ROLE["leader"],
                    username="TestLeaderDisplay",
                    email=DEV_EMAIL_BY_ROLE["leader"],
                    role="leader",
                    hashed_password=DEV_LOGIN_BCRYPT_HASH,
                    registration_status="approved",
                ),
                User(
                    fbo_id=DEV_FBO_BY_ROLE["team"],
                    email=DEV_EMAIL_BY_ROLE["team"],
                    role="team",
                    hashed_password=DEV_LOGIN_BCRYPT_HASH,
                    upline_user_id=2,
                    registration_status="approved",
                ),
            ]
        )
        await session.commit()
    return engine, factory


_engine, _session_factory = asyncio.run(_setup_sqlite())


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _session_factory() as session:
        yield session


from app.api.deps import get_db
from app.db.session import get_session_factory
from main import app

app.dependency_overrides[get_db] = _override_get_db
app.dependency_overrides[get_session_factory] = lambda: _session_factory


@pytest.fixture(autouse=True)
def _disable_auth_rate_limit_for_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.core.config as cfg

    monkeypatch.setattr(
        cfg,
        "settings",
        cfg.settings.model_copy(update={"auth_login_rate_limit_per_minute": 0}),
    )


def get_test_session_factory() -> async_sessionmaker[AsyncSession]:
    """For tests that need to seed/query the same DB as the app override."""
    return _session_factory
