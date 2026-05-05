"""Centralised input validation for payment endpoints."""
from __future__ import annotations

from fastapi import HTTPException
from starlette import status as http_status

from app.api.deps import AuthUser

APPROVER_ROLES = frozenset({"leader", "admin"})  # view-only for leader
STANDARD_AMOUNT_CENTS = 150_000  # ₹1500 min. FLP billing


def require_approver_role(user: AuthUser) -> None:
    """Raise 403 if user is not leader/admin (used for viewing pending queue)."""
    if user.role not in APPROVER_ROLES:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only leader and admin can perform this action",
        )


def require_admin_role(user: AuthUser) -> None:
    """Raise 403 if user is not admin. Only admin can approve/reject payment proofs."""
    if user.role != "admin":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only admin can approve or reject payment proofs.",
        )


def validate_image_upload(content_type: str | None) -> None:
    """Raise 400 if uploaded file is not an image."""
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed",
        )


def validate_payment_amount(payment_amount_cents: int) -> None:
    """Raise 400 if amount is below the standard enrollment fee."""
    if payment_amount_cents < STANDARD_AMOUNT_CENTS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount must be at least ₹{STANDARD_AMOUNT_CENTS // 100}",
        )
