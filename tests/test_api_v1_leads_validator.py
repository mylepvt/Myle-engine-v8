from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.deps import AuthUser
from app.validators.leads_validator import parse_status_query, validate_list_flags


def test_parse_status_query_blank_returns_none() -> None:
    assert parse_status_query(None) is None
    assert parse_status_query("   ") is None


def test_parse_status_query_invalid_raises_422() -> None:
    with pytest.raises(HTTPException) as exc:
        parse_status_query("invalid-status")
    assert exc.value.status_code == 422


def test_validate_list_flags_rejects_combination() -> None:
    user = AuthUser(user_id=1, role="admin", email="admin@example.com")
    with pytest.raises(HTTPException) as exc:
        validate_list_flags(archived_only=True, deleted_only=True, user=user)
    assert exc.value.status_code == 422


def test_validate_list_flags_allows_deleted_only_for_non_admin() -> None:
    user = AuthUser(user_id=2, role="leader", email="leader@example.com")
    validate_list_flags(archived_only=False, deleted_only=True, user=user)
