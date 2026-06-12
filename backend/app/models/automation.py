from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AutomationRule(Base):
    """Configurable rule that defines: when to trigger → what action to take."""

    __tablename__ = "automation_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Trigger
    trigger_type: Mapped[str] = mapped_column(
        String(32), nullable=False,
        comment="missed_missions | zombie_lead | verification_sla | campaign_incomplete | risk_threshold | inactivity",
    )
    trigger_config: Mapped[Optional[Any]] = mapped_column(
        JSON, nullable=True,
        comment="e.g. {'missed_count': 3, 'days': 7}",
    )

    # Action
    action_type: Mapped[str] = mapped_column(
        String(32), nullable=False,
        comment="alert_leader | create_task | escalate",
    )
    action_config: Mapped[Optional[Any]] = mapped_column(
        JSON, nullable=True,
        comment="e.g. {'task_type': 'follow_up', 'priority': 'high', 'message': '...'}",
    )

    cooldown_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=func.text("24"), default=24,
        comment="Skip if same entity was actioned within this window",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.text("true"), default=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )


class AutomationActionLog(Base):
    """Audit trail of every action the automation engine took."""

    __tablename__ = "automation_action_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False,
    )
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_entity_type: Mapped[str] = mapped_column(
        String(16), nullable=False,
        comment="member | lead",
    )
    trigger_entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger_detail: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    action_type: Mapped[str] = mapped_column(String(32), nullable=False)
    action_result: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
