"""India Standard Time (Asia/Kolkata) helpers for business calendar logic."""

from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo

APP_TIMEZONE_NAME = "Asia/Kolkata"
IST = ZoneInfo(APP_TIMEZONE_NAME)

# Postgres uses timestamptz; legacy SQLite used IST wall clock via offset.
# Keep string for SQL fragments in offline import scripts only.
SQLITE_NOW_IST = "datetime('now', '+5 hours', '+30 minutes')"


def now_ist() -> datetime.datetime:
    """Current wall-clock time in IST (aware datetime)."""
    return datetime.datetime.now(tz=IST)


def today_ist() -> datetime.date:
    """Today's calendar date in IST."""
    return now_ist().date()


def ist_date_iso(d: datetime.date | None = None) -> str:
    """ISO date string (YYYY-MM-DD) for IST calendar day."""
    day = d if d is not None else today_ist()
    return day.isoformat()
