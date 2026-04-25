from __future__ import annotations

from app.services import enrollment_video_uploads


def test_cleanup_replaced_managed_enrollment_video_removes_old_local_file(tmp_path, monkeypatch) -> None:
    uploads_root = tmp_path / "uploads"
    managed_root = uploads_root / "enrollment_video"
    managed_root.mkdir(parents=True, exist_ok=True)
    local_file = managed_root / "enrollment_video_old.mp4"
    local_file.write_bytes(b"video")

    monkeypatch.setattr(enrollment_video_uploads, "_UPLOADS_ROOT", uploads_root)
    monkeypatch.setattr(enrollment_video_uploads, "_ENROLLMENT_VIDEO_ROOT", managed_root)

    enrollment_video_uploads.cleanup_replaced_managed_enrollment_video(
        "/uploads/enrollment_video/enrollment_video_old.mp4",
        "https://videos.example.com/enrollment.mp4",
    )

    assert not local_file.exists()


def test_cleanup_replaced_managed_enrollment_video_keeps_same_encoded_file(tmp_path, monkeypatch) -> None:
    uploads_root = tmp_path / "uploads"
    managed_root = uploads_root / "enrollment_video"
    managed_root.mkdir(parents=True, exist_ok=True)
    local_file = managed_root / "enrollment video.mp4"
    local_file.write_bytes(b"video")

    monkeypatch.setattr(enrollment_video_uploads, "_UPLOADS_ROOT", uploads_root)
    monkeypatch.setattr(enrollment_video_uploads, "_ENROLLMENT_VIDEO_ROOT", managed_root)

    enrollment_video_uploads.cleanup_replaced_managed_enrollment_video(
        "/uploads/enrollment_video/enrollment video.mp4",
        "/uploads/enrollment_video/enrollment%20video.mp4",
    )

    assert local_file.exists()
