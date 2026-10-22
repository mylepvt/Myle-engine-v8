"""Payment receipts: say what they are for (paid recharge / free credit / admin credit) and
carry the admin's note — backfilled onto receipts already issued

Revision ID: 20261022_0300
Revises: 20261022_0200
Create Date: 2026-10-22
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261022_0300"
down_revision: Union[str, Sequence[str], None] = "20261022_0200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _clean(note):
    text = (note or "").strip()
    if text.lower().startswith("promo:"):
        text = text[6:].strip()
    return text or None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT i.id, i.payload_json, i.wallet_recharge_id, w.note FROM invoices i "
            "LEFT JOIN wallet_ledger_entries w ON w.id = i.wallet_ledger_entry_id "
            "WHERE i.doc_type = 'payment_receipt'"
        )
    ).fetchall()
    invoices = sa.table("invoices", sa.column("id", sa.Integer), sa.column("payload_json", sa.JSON().with_variant(postgresql.JSONB(), "postgresql")))
    for inv_id, raw, recharge_id, note in rows:
        payload = raw if isinstance(raw, dict) else (json.loads(raw) if isinstance(raw, str) and raw else {})
        if not isinstance(payload, dict) or payload.get("receipt_type"):
            continue
        if recharge_id is not None:
            payload["receipt_type"] = "paid_recharge"
        elif (note or "").strip().lower().startswith("promo"):
            payload["receipt_type"] = "free_credit"
            payload["payment_reference"] = "Free credit"
        else:
            payload["receipt_type"] = "admin_credit"
            payload["payment_reference"] = "Admin adjustment"
        if recharge_id is None:
            text = _clean(note)
            if text:
                payload["receipt_description"] = text[:300]
            else:
                payload.pop("receipt_description", None)  # the old fixed line
        bind.execute(invoices.update().where(invoices.c.id == inv_id).values(payload_json=payload))


def downgrade() -> None:
    pass  # the extra keys are harmless to older code
