"""One-time migration: upload existing local video files to Cloudflare R2.

Usage (from backend/ directory):
    python scripts/migrate_videos_to_r2.py [--dry-run] [--folder enrollment|batch|all]

Requirements:
    - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME, R2_PUBLIC_URL must be set in .env

What it does:
    - Scans uploads/enrollment_video/ → uploads to videos/enrollment/
    - Scans uploads/batch_day_video/  → uploads to videos/batch/
    - Prints R2 public URL for each file (copy to DB / admin settings as needed)
    - Does NOT delete local files (safe to re-run)
    - Does NOT touch existing R2 uploads (skips if key already exists)
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Allow running from repo root or backend/
_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv

load_dotenv(_BACKEND / ".env")

from app.core.config import settings  # noqa: E402 — after sys.path fix
from app.services.r2_storage import r2_enabled  # noqa: E402


_UPLOADS_ROOT = _BACKEND / "uploads"

_FOLDER_MAP = {
    "enrollment": (_UPLOADS_ROOT / "enrollment_video", "videos/enrollment"),
    "batch": (_UPLOADS_ROOT / "batch_day_video", "videos/batch"),
}

_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".mpeg", ".mpg", ".avi"}

_EXT_CONTENT_TYPE = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".avi": "video/x-msvideo",
}


def _object_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def migrate(folder: str = "all", dry_run: bool = False) -> None:
    if not r2_enabled():
        print("ERROR: R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, "
              "R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL in .env")
        sys.exit(1)

    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    folders = _FOLDER_MAP if folder == "all" else {folder: _FOLDER_MAP[folder]}
    total = uploaded = skipped = failed = 0

    for folder_name, (local_dir, r2_prefix) in folders.items():
        if not local_dir.exists():
            print(f"[SKIP] {local_dir} — directory not found")
            continue

        files = [f for f in local_dir.iterdir()
                 if f.is_file() and f.suffix.lower() in _VIDEO_EXTENSIONS]
        print(f"\n[{folder_name}] {len(files)} video file(s) in {local_dir}")

        for filepath in sorted(files):
            total += 1
            key = f"{r2_prefix}/{filepath.name}"
            content_type = _EXT_CONTENT_TYPE.get(filepath.suffix.lower(), "video/mp4")
            size_mb = filepath.stat().st_size / (1024 * 1024)
            public_url = f"{settings.r2_public_url.rstrip('/')}/{key}"

            if not dry_run and _object_exists(client, settings.r2_bucket_name, key):
                print(f"  [SKIP] {filepath.name} — already in R2")
                print(f"         URL: {public_url}")
                skipped += 1
                continue

            if dry_run:
                print(f"  [DRY ] {filepath.name} ({size_mb:.1f} MB) → {key}")
                print(f"         URL: {public_url}")
                continue

            try:
                print(f"  [UP  ] {filepath.name} ({size_mb:.1f} MB) ...", end=" ", flush=True)
                with filepath.open("rb") as fh:
                    client.put_object(
                        Bucket=settings.r2_bucket_name,
                        Key=key,
                        Body=fh.read(),
                        ContentType=content_type,
                    )
                print("OK")
                print(f"         URL: {public_url}")
                uploaded += 1
            except Exception as exc:
                print(f"FAILED — {exc}")
                failed += 1

    print(f"\n{'DRY RUN — ' if dry_run else ''}Done. "
          f"Total: {total} | Uploaded: {uploaded} | Skipped: {skipped} | Failed: {failed}")

    if not dry_run and uploaded:
        print("\nNext steps:")
        print("  1. Copy R2 URLs above into admin settings or DB as needed.")
        print("  2. Test playback in app.")
        print("  3. Delete local files once confirmed (optional).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local video uploads to Cloudflare R2.")
    parser.add_argument("--dry-run", action="store_true", help="List files without uploading.")
    parser.add_argument(
        "--folder",
        choices=["enrollment", "batch", "all"],
        default="all",
        help="Which upload folder to migrate (default: all).",
    )
    args = parser.parse_args()
    migrate(folder=args.folder, dry_run=args.dry_run)
