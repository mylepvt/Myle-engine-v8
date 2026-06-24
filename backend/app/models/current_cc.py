from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# JSON on SQLite (tests), JSONB on Postgres (prod).
_JSON = JSON().with_variant(JSONB(), "postgresql")


class CurrentCcSheet(Base):
    """One "CURRENT CCs v/s TARGET CCs" daily sheet per team member per day.

    Subject = the team member the sheet is about. A member fills their own; a
    leader/admin may fill it for any downline member. One row per (subject, date),
    upsert, ``filled_by_user_id`` records who saved last.
    """

    __tablename__ = "current_cc_sheets"
    __table_args__ = (
        UniqueConstraint("subject_user_id", "sheet_date", name="uq_current_cc_subject_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subject_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sheet_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    filled_by_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Header — current vs target CCs.
    target_ccs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # 1. Direct Person's (Team) — list of names + their total CCs.
    direct_persons: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    direct_total_ccs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # 2/3. Real / Light active person name lists.
    real_active_persons: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    light_active_persons: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )

    # 4. Closed person's list (CC tracking) — [{name, ccs, current_state, next_task}]
    closed_persons: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    # 5. Pending person CCs (prospect) — same row shape as closed.
    pending_persons: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )

    # 6. Enrollment (prospect) — [{name, fresh_lead, old_lead}]
    enrollment_rows: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )

    # 7. Lead cycle daily (team) — [{name, enrollment, budget_check, checked}]
    lead_cycle_rows: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    lead_covered: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    process_check: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 8. Enrollment tracking (prospect) — [{name, current_state, drop_continue, day1}]
    enrollment_tracking_rows: Mapped[list[Any]] = mapped_column(
        _JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    drop_reason_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 9. Improvement area (your & team).
    improvement_area: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
