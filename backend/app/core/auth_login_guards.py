"""Post-password checks — pending/rejected/blocked/discipline (legacy login gates)."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models.user import User


def ensure_may_issue_session_cookies(user: User) -> None:
    """After password verification or refresh user load — block login if legacy gates apply."""
    if user.access_blocked or (user.discipline_status or "").strip().lower() == "removed":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "System se remove kiya gaya due to non-performance. Admin se contact karein."
            ),
        )
    st = (user.registration_status or "").strip().lower()
    if st == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending admin approval. Please check back soon.",
        )
    if st == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your registration request was rejected. Contact the admin for help.",
        )
