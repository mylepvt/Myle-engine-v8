"""Read optional fields from dict-like rows, ORM objects, or legacy sqlite3.Row."""

from __future__ import annotations

from typing import Any


def mapping_get(row: Any, key: str, default: Any = None) -> Any:
    """
    Optional field read from a mapping, ORM instance, or sqlite3.Row.

    Legacy name in monolith: ``sqlite_row_get``.
    """
    if row is None:
        return default
    if isinstance(row, dict):
        return row.get(key, default)
    if callable(getattr(row, "get", None)):
        return row.get(key, default)
    if hasattr(row, "keys") and key in row.keys():
        return row[key]
    return getattr(row, key, default)
