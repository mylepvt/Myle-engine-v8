"""Alembic revision introspection for `/health/migrations` (ops / deploy verification)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _script_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def alembic_head_revisions() -> list[str]:
    """Head revision id(s) from local Alembic scripts (no DB)."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        ini = _script_dir() / "alembic.ini"
        if not ini.is_file():
            return []
        cfg = Config(str(ini))
        script = ScriptDirectory.from_config(cfg)
        return list(script.get_heads())
    except Exception:
        return []


async def db_alembic_revision(session: AsyncSession) -> str | None:
    """Current revision from ``alembic_version`` table, if present."""
    try:
        r = await session.execute(text("SELECT version_num FROM alembic_version"))
        row = r.fetchone()
        return str(row[0]) if row else None
    except Exception:
        return None
