"""Lead claim records: paid and free leads per member, kept apart; backfilled from history

Revision ID: 20261022_0200
Revises: 20261022_0100
Create Date: 2026-10-22
"""
import json
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261022_0200"
down_revision: Union[str, Sequence[str], None] = "20261022_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_REFUND_KEY = re.compile(r"^lead_refund_\d+_(\d+)$")


def _meta(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            out = json.loads(raw)
            return out if isinstance(out, dict) else {}
        except ValueError:
            return {}
    return {}


def upgrade() -> None:
    op.create_table(
        "lead_claim_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("reason", sa.String(length=64), nullable=True),
        sa.Column("given_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refund_cents", sa.Integer(), nullable=True),
    )
    op.create_index("ix_lead_claim_records_user_id", "lead_claim_records", ["user_id"])
    op.create_index("ix_lead_claim_records_lead_id", "lead_claim_records", ["lead_id"])
    op.create_index("ix_lead_claim_records_claimed_at", "lead_claim_records", ["claimed_at"])

    # History: every pool claim and admin gift so far (activity log), then refunds (wallet).
    bind = op.get_bind()
    logs = bind.execute(
        sa.text(
            "SELECT user_id, action, entity_type, entity_id, meta, created_at FROM activity_log "
            "WHERE action IN ('lead.claimed', 'lead.waived') ORDER BY id"
        )
    ).fetchall()
    rows = []
    for user_id, action, entity_type, entity_id, raw, created_at in logs:
        meta = _meta(raw)
        if action == "lead.claimed" and entity_type == "lead" and entity_id:
            try:
                price = max(0, int(meta.get("price_cents") or 0))
            except (TypeError, ValueError):
                price = 0
            source = "free_pool" if price == 0 else ("booking" if meta.get("source") == "booking" else "pool")
            rows.append(
                {"user_id": user_id, "lead_id": entity_id, "kind": "paid" if price else "free", "source": source,
                 "price_cents": price, "reason": None, "given_by_user_id": None, "claimed_at": created_at}
            )
        elif action == "lead.waived" and entity_type == "user" and entity_id:
            for lead_id in meta.get("lead_ids") or []:
                rows.append(
                    {"user_id": entity_id, "lead_id": int(lead_id), "kind": "free", "source": "admin_gift",
                     "price_cents": 0, "reason": (str(meta.get("reason") or "") or None) and str(meta["reason"])[:64],
                     "given_by_user_id": user_id, "claimed_at": created_at}
                )
    table = sa.table(
        "lead_claim_records",
        sa.column("user_id", sa.Integer), sa.column("lead_id", sa.Integer), sa.column("kind", sa.String),
        sa.column("source", sa.String), sa.column("price_cents", sa.Integer), sa.column("reason", sa.String),
        sa.column("given_by_user_id", sa.Integer), sa.column("claimed_at"),  # passed through as read
    )
    for i in range(0, len(rows), 1000):
        op.bulk_insert(table, rows[i : i + 1000])

    refunds = bind.execute(
        sa.text(
            "SELECT user_id, idempotency_key, amount_cents, created_at FROM wallet_ledger_entries "
            "WHERE idempotency_key LIKE 'lead\\_refund\\_%' ESCAPE '\\'"
        )
    ).fetchall()
    for user_id, key, amount, created_at in refunds:
        m = _REFUND_KEY.match(key or "")
        if not m:
            continue
        rec = bind.execute(
            sa.text(
                "SELECT id FROM lead_claim_records WHERE user_id = :u AND lead_id = :l AND refunded_at IS NULL "
                "AND kind = 'paid' ORDER BY claimed_at DESC, id DESC LIMIT 1"
            ),
            {"u": user_id, "l": int(m.group(1))},
        ).scalar()
        if rec is not None:
            bind.execute(
                sa.text("UPDATE lead_claim_records SET refunded_at = :t, refund_cents = :c WHERE id = :i"),
                {"t": created_at, "c": int(amount), "i": rec},
            )


def downgrade() -> None:
    op.drop_index("ix_lead_claim_records_claimed_at", table_name="lead_claim_records")
    op.drop_index("ix_lead_claim_records_lead_id", table_name="lead_claim_records")
    op.drop_index("ix_lead_claim_records_user_id", table_name="lead_claim_records")
    op.drop_table("lead_claim_records")
