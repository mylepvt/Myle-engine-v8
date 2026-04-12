"""lead batch slots, daily_reports metrics, training_questions + attempts

Revision ID: 20260412_0019
Revises: 20260412_0018
Create Date: 2026-04-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260412_0019"
down_revision: Union[str, Sequence[str], None] = "20260412_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "d1_morning",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "leads",
        sa.Column(
            "d1_afternoon",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "leads",
        sa.Column(
            "d1_evening",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "leads",
        sa.Column(
            "d2_morning",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "leads",
        sa.Column(
            "d2_afternoon",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "leads",
        sa.Column(
            "d2_evening",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "leads",
        sa.Column(
            "no_response_attempt_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )

    # Preserve legacy day completion timestamps as full batch rows.
    op.execute(
        sa.text(
            """
            UPDATE leads SET d1_morning = true, d1_afternoon = true, d1_evening = true
            WHERE day1_completed_at IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE leads SET d2_morning = true, d2_afternoon = true, d2_evening = true
            WHERE day2_completed_at IS NOT NULL
            """
        )
    )

    _ints = [
        "calls_picked",
        "wrong_numbers",
        "enrollments_done",
        "pending_enroll",
        "underage",
        "plan_2cc",
        "seat_holdings",
        "leads_educated",
        "pdf_covered",
        "videos_sent_actual",
        "calls_made_actual",
        "payments_actual",
    ]
    for col in _ints:
        op.add_column(
            "daily_reports",
            sa.Column(col, sa.Integer(), server_default=sa.text("0"), nullable=False),
        )

    op.create_table(
        "training_questions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("option_a", sa.String(length=500), nullable=False),
        sa.Column("option_b", sa.String(length=500), nullable=False),
        sa.Column("option_c", sa.String(length=500), nullable=False),
        sa.Column("option_d", sa.String(length=500), nullable=False),
        sa.Column("correct_answer", sa.String(length=1), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_training_questions_sort_order", "training_questions", ["sort_order"])

    op.create_table(
        "training_test_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column(
            "passed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "attempted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_training_test_attempts_user_id", "training_test_attempts", ["user_id"])

    op.execute(
        sa.text(
            """
            INSERT INTO training_questions
              (question, option_a, option_b, option_c, option_d, correct_answer, sort_order)
            VALUES
              (
                'What is the first step when contacting a new lead?',
                'Send payment link immediately',
                'Introduce yourself and confirm interest',
                'Add to pool',
                'Skip to Day 2',
                'b',
                1
              ),
              (
                'When should you mark a batch as complete?',
                'After one call',
                'When all scheduled batches for that day are done',
                'Never',
                'Only on Friday',
                'b',
                2
              ),
              (
                'Who may mark Day 1 morning/afternoon/evening batches?',
                'Team members only',
                'Leader or admin',
                'Anyone',
                'Pool leads',
                'b',
                3
              ),
              (
                'Daily report submission typically awards how many score points (legacy rule)?',
                '10',
                '20',
                '5',
                '0',
                'b',
                4
              ),
              (
                'Pass mark for the training certification test is:',
                '40%',
                '50%',
                '60%',
                '80%',
                'c',
                5
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM training_test_attempts"))
    op.execute(sa.text("DELETE FROM training_questions"))
    op.drop_index("ix_training_test_attempts_user_id", table_name="training_test_attempts")
    op.drop_table("training_test_attempts")
    op.drop_index("ix_training_questions_sort_order", table_name="training_questions")
    op.drop_table("training_questions")

    for col in [
        "payments_actual",
        "calls_made_actual",
        "videos_sent_actual",
        "pdf_covered",
        "leads_educated",
        "seat_holdings",
        "plan_2cc",
        "underage",
        "pending_enroll",
        "enrollments_done",
        "wrong_numbers",
        "calls_picked",
    ]:
        op.drop_column("daily_reports", col)

    for col in [
        "no_response_attempt_count",
        "d2_evening",
        "d2_afternoon",
        "d2_morning",
        "d1_evening",
        "d1_afternoon",
        "d1_morning",
    ]:
        op.drop_column("leads", col)
