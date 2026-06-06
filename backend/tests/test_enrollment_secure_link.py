"""Unit tests for the secure enrollment-video logic (no DB needed).

Covers the security guarantees:
- first-device lock
- view cap / open-based expiry
- watermark label composition
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.enrollment_share_link import EnrollmentShareLink
from app.services import enrollment_video as ev


def _link(**kw) -> EnrollmentShareLink:
    base = dict(
        token="tok_abc123def456",
        created_by_user_id=1,
        video_source="videos/enrollment/master.mp4",
        title="Enrollment video",
        max_views=1,
        view_count=0,
        window_seconds=ev.DEFAULT_WINDOW_SECONDS,
        revoked=False,
        device_fingerprint=None,
        opened_at=None,
        expires_at=None,
        creation_expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    base.update(kw)
    return EnrollmentShareLink(**base)


def test_device_lock_first_bind_then_reject_other():
    link = _link(device_fingerprint=None)
    # not yet bound → any device matches
    assert ev.device_matches(link, "abc123") is True
    # bind
    link.device_fingerprint = "abc123"
    assert ev.device_matches(link, "abc123") is True
    assert ev.device_matches(link, "different") is False


def test_open_countdown_expiry():
    now = datetime.now(timezone.utc)
    link = _link(opened_at=now - timedelta(minutes=20), expires_at=now - timedelta(minutes=4))
    assert ev.is_dead(link, now=now) is True


def test_alive_within_window():
    now = datetime.now(timezone.utc)
    link = _link(opened_at=now, expires_at=now + timedelta(minutes=10))
    assert ev.is_dead(link, now=now) is False


def test_revoked_is_dead():
    now = datetime.now(timezone.utc)
    link = _link(revoked=True)
    assert ev.is_dead(link, now=now) is True


def test_effective_expiry_picks_earliest():
    now = datetime.now(timezone.utc)
    soon = now + timedelta(minutes=5)
    far = now + timedelta(days=2)
    link = _link(expires_at=soon, creation_expires_at=far)
    assert ev.effective_expiry(link) == soon.replace(tzinfo=timezone.utc)


def test_creation_cap_expires_unopened_link():
    now = datetime.now(timezone.utc)
    link = _link(expires_at=None, creation_expires_at=now - timedelta(seconds=1))
    assert ev.is_dead(link, now=now) is True


def test_watermark_label_has_name_masked_phone_and_short_id():
    link = _link(viewer_name="Rahul Sharma", viewer_phone="9876543210")
    label = ev.watermark_label(link)
    assert "Rahul Sharma" in label
    assert "3210" in label          # last 4 visible
    assert "9876543210" not in label  # full phone never shown
    assert "#tok_ab" in label        # short token id


def test_phone_normalisation_keeps_last_10():
    assert ev.normalize_phone("+91 98765-43210") == "9876543210"


def test_sanitize_fingerprint_strips_and_caps():
    fp = ev.sanitize_fingerprint("ab!!cd  ef$$")
    assert fp == "abcdef"
