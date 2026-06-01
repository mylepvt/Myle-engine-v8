"""Day 2 cheat-proof test session — one locked attempt per unique link.

Each session locks a random question subset + per-question option shuffle at start
time, runs a server-enforced timer, records a no-back answer trail, and tallies
anti-cheat telemetry (tab-blur / page-hidden / copy / paste). Correct answers live
only in the question bank on the server; the client never receives them.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_JSON = JSON().with_variant(JSONB(), "postgresql")


class Day2TestSession(Base):
    __tablename__ = "day2_test_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"), default=1)

    # Locked at start: ordered question id subset + {question_id: [option key order]}.
    question_ids: Mapped[Optional[list[int]]] = mapped_column(_JSON, nullable=True)
    option_orders: Mapped[Optional[dict[str, Any]]] = mapped_column(_JSON, nullable=True)
    # Answer trail: {question_id: chosen_display_index}.
    answers: Mapped[Optional[dict[str, Any]]] = mapped_column(_JSON, nullable=True)
    current_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)

    # 'created' (link issued, not started) | 'active' | 'submitted' | 'expired'.
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'created'"), default="created"
    )
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    # Prospect identity gate (entered on the link before the test unlocks).
    prospect_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    prospect_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # Anti-cheat telemetry counters.
    blur_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    hidden_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    copy_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)
    paste_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"), default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
