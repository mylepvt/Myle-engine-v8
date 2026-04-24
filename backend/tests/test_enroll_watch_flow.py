from __future__ import annotations

from datetime import datetime, timezone

from app.api.v1.enroll import _sync_lead_for_watch, _watch_page_payload
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead


def test_watch_page_payload_distinguishes_started_vs_completed() -> None:
    now = datetime.now(timezone.utc)
    lead = Lead(
        id=9,
        name="Test Prospect",
        phone="9999900001",
        created_by_user_id=1,
    )
    link = EnrollShareLink(
        token="demo-token",
        lead_id=lead.id,
        created_by_user_id=1,
        title="Enrollment video",
        first_viewed_at=now,
        status_synced=False,
        expires_at=now,
    )

    payload = _watch_page_payload(link=link, lead=lead, access_granted=True)

    assert payload.watch_started is True
    assert payload.watch_completed is False
    assert payload.stream_url == "/api/v1/watch/demo-token/stream"


def test_sync_lead_for_watch_only_marks_video_watched_on_completion() -> None:
    now = datetime.now(timezone.utc)
    lead = Lead(
        id=9,
        name="Test Prospect",
        phone="9999900001",
        created_by_user_id=1,
        status="video_sent",
        call_status="video_sent",
    )

    changed = _sync_lead_for_watch(lead, now=now)

    assert changed is True
    assert lead.status == "video_watched"
    assert lead.call_status == "video_watched"
    assert lead.last_action_at == now
