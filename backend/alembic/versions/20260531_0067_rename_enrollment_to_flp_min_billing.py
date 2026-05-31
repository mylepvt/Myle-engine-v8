"""rename enrollment -> flp_min_billing (share-link table + app_setting keys)

Renames the ``enroll_share_links`` table to ``flp_min_billing_share_links`` and
migrates the admin-configurable ``enrollment_video_*`` / ``enrollment_*`` content
app_setting keys to their ``flp_min_billing_*`` equivalents. Stored values, the
``/uploads/enrollment_video`` directory, JWT ``enroll_watch`` claims, SSE event
names and the Meta WhatsApp template ids are intentionally left untouched
(external / on-disk / already-issued contracts).

Revision ID: 20260531_0067
Revises: 20260526_0066
Create Date: 2026-05-31

"""
from alembic import op
import sqlalchemy as sa

revision = "20260531_0067"
down_revision = "20260526_0066"
branch_labels = None
depends_on = None


_APP_SETTING_KEY_MAP = {
    "enrollment_video_title": "flp_min_billing_video_title",
    "enrollment_video_source_url": "flp_min_billing_video_source_url",
    "enrollment_video_url": "flp_min_billing_video_url",
    "enrollment_social_proof_count": "flp_min_billing_social_proof_count",
    "enrollment_total_seats": "flp_min_billing_total_seats",
    "enrollment_seats_left": "flp_min_billing_seats_left",
    "enrollment_trust_note": "flp_min_billing_trust_note",
}


def _remap_app_setting_keys(mapping: dict[str, str]) -> None:
    bind = op.get_bind()
    stmt = sa.text(
        "UPDATE app_setting SET key = :new WHERE key = :old "
        "AND NOT EXISTS (SELECT 1 FROM app_setting a2 WHERE a2.key = :new)"
    )
    for old, new in mapping.items():
        bind.execute(stmt, {"old": old, "new": new})


def upgrade() -> None:
    op.rename_table("enroll_share_links", "flp_min_billing_share_links")
    _remap_app_setting_keys(_APP_SETTING_KEY_MAP)


def downgrade() -> None:
    _remap_app_setting_keys({new: old for old, new in _APP_SETTING_KEY_MAP.items()})
    op.rename_table("flp_min_billing_share_links", "enroll_share_links")
