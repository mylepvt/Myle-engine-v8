from datetime import date

from app.core.config import settings
from app.services.member_compliance import (
    discipline_warning_pause_note,
    discipline_warnings_paused,
)


def test_discipline_warnings_are_unpaused_by_default() -> None:
    assert settings.discipline_warning_pause_until is None
    assert discipline_warnings_paused(date(2026, 5, 2)) is False
    assert discipline_warning_pause_note(date(2026, 5, 2)) is None


def test_discipline_warnings_pause_window_is_active_through_may_3() -> None:
    original = settings.discipline_warning_pause_until
    settings.discipline_warning_pause_until = date(2026, 5, 4)
    try:
        assert discipline_warnings_paused(date(2026, 4, 27)) is True
        assert discipline_warnings_paused(date(2026, 5, 3)) is True
        assert discipline_warnings_paused(date(2026, 5, 4)) is False
    finally:
        settings.discipline_warning_pause_until = original


def test_discipline_warning_pause_note_mentions_last_muted_day() -> None:
    original = settings.discipline_warning_pause_until
    settings.discipline_warning_pause_until = date(2026, 5, 4)
    try:
        assert discipline_warning_pause_note(date(2026, 4, 27)) == (
            "Development pause active. Inactivity warnings are muted through 2026-05-03."
        )
        assert discipline_warning_pause_note(date(2026, 5, 4)) is None
    finally:
        settings.discipline_warning_pause_until = original
