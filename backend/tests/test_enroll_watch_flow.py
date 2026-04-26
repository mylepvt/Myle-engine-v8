from __future__ import annotations

from datetime import datetime, timezone

from app.api.v1.enroll import _sync_lead_for_send, _watch_page_payload
from app.models.enroll_share_link import EnrollShareLink
from app.models.lead import Lead
from app.services import enrollment_video
from app.services.enrollment_video import (
    build_enrollment_stream_source_candidates,
    normalize_video_source_url,
)


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


def test_sync_lead_for_send_does_not_auto_change_call_status() -> None:
    now = datetime.now(timezone.utc)
    lead = Lead(
        id=9,
        name="Test Prospect",
        phone="9999900001",
        status="whatsapp_sent",
        call_status="not_called",
        created_by_user_id=1,
    )

    changed = _sync_lead_for_send(lead, now=now)

    assert changed is True
    assert lead.status == "video_sent"
    assert lead.call_status == "not_called"
    assert lead.whatsapp_sent_at == now
    assert lead.last_action_at == now


def test_normalize_video_source_url_encodes_legacy_upload_paths() -> None:
    assert (
        normalize_video_source_url("/uploads/EARN 30K USING INSTAGRAM  MONTHLY | MYLE COMMUNITY.mp4")
        == "/uploads/EARN%2030K%20USING%20INSTAGRAM%20%20MONTHLY%20%7C%20MYLE%20COMMUNITY.mp4"
    )


def test_stream_candidates_fall_back_to_current_configured_video_for_missing_local_file(
    tmp_path,
    monkeypatch,
) -> None:
    uploads_root = tmp_path / "uploads"
    managed_video = uploads_root / "enrollment_video" / "enrollment_video_test.mp4"
    managed_video.parent.mkdir(parents=True, exist_ok=True)
    managed_video.write_bytes(b"video")
    monkeypatch.setattr(enrollment_video, "_UPLOADS_ROOT", uploads_root)

    candidates = build_enrollment_stream_source_candidates(
        "/uploads/enrollment-demo.mp4",
        "/uploads/enrollment_video/enrollment_video_test.mp4",
    )

    assert candidates == ["/uploads/enrollment_video/enrollment_video_test.mp4"]
