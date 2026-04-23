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

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.core.passwords import DEV_LOGIN_BCRYPT_HASH
from app.models.activity_log import ActivityLog  # noqa: F401
from app.models.announcement import Announcement  # noqa: F401
from app.models.call_event import CallEvent  # noqa: F401
from app.models.batch_share_link import BatchShareLink  # noqa: F401
from app.models.crm_outbox import CrmOutbox  # noqa: F401
from app.models.daily_member_stat import DailyMemberStat  # noqa: F401
from app.models.follow_up import FollowUp  # noqa: F401
from app.models.lead import Lead  # noqa: F401
from app.models.user import User
from app.models.user_presence_session import UserPresenceSession  # noqa: F401
from app.models.wallet_ledger import WalletLedgerEntry  # noqa: F401
from app.models.password_reset_token import PasswordResetToken  # noqa: F401
from app.models.training_video import TrainingVideo  # noqa: F401
from app.models.training_progress import TrainingProgress  # noqa: F401
from app.models.daily_report import DailyReport  # noqa: F401
from app.models.daily_score import DailyScore  # noqa: F401
from app.models.xp_event import XpEvent  # noqa: F401
from app.models.xp_monthly_archive import XpMonthlyArchive  # noqa: F401
from app.models.app_setting import AppSetting  # noqa: F401
from app.models.training_question import TrainingQuestion  # noqa: F401
from app.models.training_test_attempt import TrainingTestAttempt  # noqa: F401
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
