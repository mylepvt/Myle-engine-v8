"""Cloudflare R2 storage — S3-compatible upload helper.

Usage:
    from app.services.r2_storage import r2_enabled, upload_to_r2

    if r2_enabled():
        url = await upload_to_r2(data=raw_bytes, key="videos/enrollment/abc.mp4", content_type="video/mp4")
    else:
        # fall back to local disk
        ...

All 5 env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET_NAME, R2_PUBLIC_URL) must be set for R2 to be active.
When any is missing the helpers are no-ops and callers fall back to disk.
"""
from __future__ import annotations

import asyncio
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Content-type map for video extensions
_EXT_CONTENT_TYPE: dict[str, str] = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".avi": "video/x-msvideo",
}


def r2_enabled() -> bool:
    """Return True when all R2 env vars are configured."""
    return bool(
        settings.r2_account_id
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
        and settings.r2_bucket_name
        and settings.r2_public_url
    )


def content_type_for_ext(ext: str) -> str:
    return _EXT_CONTENT_TYPE.get(ext.lower(), "video/mp4")


def _upload_sync(data: bytes, key: str, content_type: str) -> None:
    """Blocking S3 put_object — run inside asyncio.to_thread."""
    import boto3  # lazy import — only needed when R2 is enabled
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    client.put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    logger.info("R2 upload OK: %s (%d bytes)", key, len(data))


def _delete_sync(key: str) -> None:
    """Blocking S3 delete_object — run inside asyncio.to_thread."""
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
    client.delete_object(Bucket=settings.r2_bucket_name, Key=key)
    logger.info("R2 delete OK: %s", key)


async def upload_to_r2(*, data: bytes, key: str, content_type: str) -> str:
    """Upload *data* to R2 at *key*, return public URL.

    Raises RuntimeError if R2 is not configured.
    Raises botocore.exceptions.ClientError on upload failure.
    """
    if not r2_enabled():
        raise RuntimeError("R2 not configured — check R2_* env vars")
    await asyncio.to_thread(_upload_sync, data, key, content_type)
    return f"{settings.r2_public_url.rstrip('/')}/{key}"


def _presign_get_sync(key: str, expires_seconds: int) -> str:
    """Blocking presigned GET URL — run inside asyncio.to_thread."""
    import boto3  # lazy import — only needed when R2 is enabled
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket_name, "Key": key},
        ExpiresIn=expires_seconds,
    )


async def presign_get_url(*, key: str, expires_seconds: int = 120) -> str:
    """Return a short-lived presigned GET URL for *key*.

    The URL is consumed server-side only (the streaming proxy fetches it) and is
    never handed to the browser, so the bucket can stay fully private.
    Raises RuntimeError if R2 is not configured.
    """
    if not r2_enabled():
        raise RuntimeError("R2 not configured — check R2_* env vars")
    return await asyncio.to_thread(_presign_get_sync, key, expires_seconds)


async def delete_from_r2(key: str) -> None:
    """Delete *key* from R2 bucket. No-op if R2 not configured."""
    if not r2_enabled():
        return
    try:
        await asyncio.to_thread(_delete_sync, key)
    except Exception:
        logger.warning("R2 delete failed for key: %s", key, exc_info=True)


def r2_key_from_url(public_url: str) -> str | None:
    """Extract R2 object key from a public R2 URL.

    Returns None if the URL does not belong to our R2 bucket.
    """
    base = settings.r2_public_url.rstrip("/")
    if not base or not public_url.startswith(base + "/"):
        return None
    return public_url[len(base) + 1:]
