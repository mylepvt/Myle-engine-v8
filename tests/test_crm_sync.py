from datetime import datetime, timezone

from app.api.v1.crm_sync import crm_shadow_stage_for_lead
from app.models.lead import Lead


def _lead(status: str, **overrides) -> Lead:
    base = {
        "id": 1,
        "name": "Shadow Lead",
        "status": status,
        "created_by_user_id": 1,
        "assigned_to_user_id": 1,
    }
    base.update(overrides)
    return Lead(**base)


def test_paid_maps_to_payment_done_without_mindset():
    assert crm_shadow_stage_for_lead(_lead("paid")) == "PAYMENT_DONE"


def test_mindset_and_day1_have_dedicated_shadow_stages():
    assert crm_shadow_stage_for_lead(_lead("mindset_lock")) == "MINDSET_LOCK"
    assert crm_shadow_stage_for_lead(_lead("day1", mindset_lock_state="leader_assigned")) == "DAY1_UPLINE"


def test_day2_and_day3_have_dedicated_shadow_stages():
    assert crm_shadow_stage_for_lead(_lead("day2")) == "DAY2_ADMIN"
    lead = _lead("day3", day3_completed_at=datetime(2026, 4, 20, tzinfo=timezone.utc))
    assert crm_shadow_stage_for_lead(lead) == "DAY3_CLOSER"


def test_close_side_statuses_collapse_to_closed_or_day3():
    assert crm_shadow_stage_for_lead(_lead("interview")) == "DAY3_CLOSER"
    assert crm_shadow_stage_for_lead(_lead("converted")) == "CLOSED"
    assert crm_shadow_stage_for_lead(_lead("lost")) == "CLOSED"


def test_invited_with_whatsapp_timestamp_promotes_shadow_stage():
    lead = _lead(
        "invited",
        whatsapp_sent_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
    )
    assert crm_shadow_stage_for_lead(lead) == "WHATSAPP_SENT"


def test_whatsapp_sent_status_maps_directly_to_whatsapp_stage():
    assert crm_shadow_stage_for_lead(_lead("whatsapp_sent")) == "WHATSAPP_SENT"
