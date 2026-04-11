"""Archival store: every legacy SQLite row as JSON for lossless re-import / audit."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LegacyRowSnapshot(Base):
    """One row per legacy SQLite row (see ``scripts/import_legacy_sqlite.py`` full snapshot)."""

    __tablename__ = "legacy_row_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "import_run_id",
            "table_name",
            "row_key",
            name="uq_legacy_row_snap_run_table_key",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    import_run_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    sqlite_label: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        default="",
        comment="Basename or label of the source .db file",
    )
    table_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    row_key: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        comment="Stable id within table, e.g. id:42 or rowid:7",
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
