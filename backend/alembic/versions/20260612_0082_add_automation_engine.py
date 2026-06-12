"""Automation Engine (automation_rules, automation_action_logs)

Revision ID: 20260612_0082
Revises: 20260612_0081
Create Date: 2026-06-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260612_0082"
down_revision: Union[str, Sequence[str], None] = "20260612_0081"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "automation_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("trigger_config", sa.JSON(), nullable=True),
        sa.Column("action_type", sa.String(32), nullable=False),
        sa.Column("action_config", sa.JSON(), nullable=True),
        sa.Column("cooldown_hours", sa.Integer(), nullable=False, server_default=sa.text("24")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "automation_action_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("trigger_entity_type", sa.String(16), nullable=False),
        sa.Column("trigger_entity_id", sa.Integer(), nullable=False),
        sa.Column("trigger_detail", sa.JSON(), nullable=True),
        sa.Column("action_type", sa.String(32), nullable=False),
        sa.Column("action_result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_automation_action_logs_rule"), "automation_action_logs", ["rule_id"])
    op.create_index(op.f("ix_automation_action_logs_entity"), "automation_action_logs", ["trigger_entity_type", "trigger_entity_id"])

    # Seed default rules
    op.execute(
        """
        INSERT INTO automation_rules (name, description, trigger_type, trigger_config, action_type, action_config, cooldown_hours)
        VALUES
        ('Missed Missions — Alert Leader', '3+ missed missions in 7 days → alert leader', 'missed_missions', '{"missed_count": 3, "days": 7}', 'alert_leader', '{"message": "{member_name} has missed {missed_count} missions in the last 7 days. Immediate follow-up required."}', 24),
        ('Missed Missions — Recovery Mission', '3+ missed missions → auto-create recovery mission', 'missed_missions', '{"missed_count": 3, "days": 7}', 'create_recovery_mission', '{"recovery_items": [{"key": "catchup", "label": "Complete pending missions", "target": 1}, {"key": "calls", "label": "Make 3 lead calls today", "target": 3}, {"key": "review", "label": "Review this week blockers", "target": 1}]}', 48),
        ('Zombie Lead — Alert Leader', 'Lead untouched for 14+ days → alert leader', 'zombie_lead', '{"days": 14}', 'alert_leader', '{"message": "Zombie lead detected: {lead_name} — no activity for {days} days. Review and take action.", "action": "review_lead"}', 48),
        ('Zombie Lead — Create Review Task', 'Lead untouched 14+ days → auto-create review task', 'zombie_lead', '{"days": 14}', 'create_task', '{"task_type": "follow_up", "message": "Review zombie lead: {lead_name} — {days} days inactive.", "due_hours": 24}', 72),
        ('Verification SLA — Escalate', 'Verification pending > 48h → escalate to admin', 'verification_sla', '{"hours": 48}', 'escalate', '{"message": "Verification pending for {member_name} — exceeded 48h SLA.", "priority": "high"}', 24),
        ('Campaign Incomplete — Alert Leader', 'Campaign past deadline → alert leader', 'campaign_incomplete', '{}', 'alert_leader', '{"message": "{member_name} has {campaign_count} incomplete campaign(s) past deadline."}', 48),
        ('Inactivity — Create Review Task', '7+ days no lead activity → auto-create review task', 'inactivity', '{"days": 7}', 'create_task', '{"task_type": "follow_up", "message": "{member_name} has no lead activity for {days} days. Check member status.", "due_hours": 24}', 24)
        """
    )


def downgrade() -> None:
    op.drop_table("automation_action_logs")
    op.drop_table("automation_rules")
