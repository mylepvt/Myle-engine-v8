from __future__ import annotations

from datetime import datetime, timezone

from app.api.v1.enroll import _watch_page_payload
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


def test_watch_page_payload_includes_room_snapshot() -> None:
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
        status_synced=True,
        expires_at=now,
    )

    payload = _watch_page_payload(
        link=link,
        lead=lead,
        access_granted=True,
        room_snapshot={
            "social_proof_count": 300,
            "total_seats": 50,
            "seats_left": 12,
            "trust_note": "Private room access is limited to the current batch window.",
        },
    )

    assert payload.watch_completed is True
    assert payload.social_proof_count == 300
    assert payload.total_seats == 50
    assert payload.seats_left == 12
    assert payload.trust_note == "Private room access is limited to the current batch window."
