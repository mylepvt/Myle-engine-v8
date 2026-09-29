from datetime import date, datetime, timedelta, timezone

from app.models.user import User
from app.services.member_compliance import (
    PRACTICE_WINDOW_DAYS,
    _completed_business_days,
    _missing_report_streak,
    start_practice_window,
)
from app.services.report_eligibility import is_user_report_eligible

POLICY_START = date(2026, 5, 2)


def _trained_member(registered: date) -> User:
    return User(
        id=1,
        role="team",
        registration_status="approved",
        access_blocked=False,
        removed_at=None,
        training_required=False,
        training_status="completed",
        discipline_status="active",
        created_at=datetime(registered.year, registered.month, registered.day, tzinfo=timezone.utc),
    )


def test_unlock_after_training_does_not_count_training_days_as_missed_reports() -> None:
    registered = date(2026, 9, 1)
    unlock_day = registered + timedelta(days=8)
    user = _trained_member(registered)
    start_practice_window(user, unlock_day)

    # Practice days: unlock day + next 3 days → no rules at all.
    for offset in range(PRACTICE_WINDOW_DAYS):
        assert is_user_report_eligible(user, unlock_day + timedelta(days=offset)) is False

    # First rule day: eligible, but nothing from training / practice counts yet.
    first_rule_day = unlock_day + timedelta(days=PRACTICE_WINDOW_DAYS)
    assert is_user_report_eligible(user, first_rule_day) is True
    assert _missing_report_streak(
        user=user,
        days=_completed_business_days(first_rule_day),
        submitted_reports=set(),
        policy_start_date=POLICY_START,
    ) == 0

    # Missing the first rule day's report → only a single warning next day.
    next_day = first_rule_day + timedelta(days=1)
    assert _missing_report_streak(
        user=user,
        days=_completed_business_days(next_day),
        submitted_reports=set(),
        policy_start_date=POLICY_START,
    ) == 1


def test_without_practice_window_training_days_would_trigger_removal() -> None:
    registered = date(2026, 9, 1)
    unlock_day = registered + timedelta(days=8)
    user = _trained_member(registered)
    assert _missing_report_streak(
        user=user,
        days=_completed_business_days(unlock_day),
        submitted_reports=set(),
        policy_start_date=POLICY_START,
    ) == 4
