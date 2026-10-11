"""Meta Ads customer-list CSV export."""
from __future__ import annotations

import csv
import io

import pytest

from app.models.lead import Lead
from app.services.meta_audience_export import bad_reason, build_csv, interested_reason, normalize_phone_in


def _lead(**kw) -> Lead:
    base = dict(name="Asha Kumari", status="contacted", phone="98765 43210", email=None, city="Delhi")
    base.update(kw)
    return Lead(**base)


def test_normalize_phone_in():
    assert normalize_phone_in("98765 43210") == "919876543210"
    assert normalize_phone_in("+91-98765-43210") == "919876543210"
    assert normalize_phone_in("09876543210") == "919876543210"
    assert normalize_phone_in("12345") == ""
    assert normalize_phone_in(None) == ""


def test_bad_reason_buckets():
    assert bad_reason(_lead(call_status="not_interested")) == "not_interested"
    assert bad_reason(_lead(call_status="Called - Switch Off")) == "switch_off_unreachable"
    assert bad_reason(_lead(call_status="person_block")) == "switch_off_unreachable"
    assert bad_reason(_lead(drop_reason="wrong_number")) == "wrong_number"
    assert bad_reason(_lead(status="lost")) == "lost_dead"
    assert bad_reason(_lead(call_status="interested")) is None
    # A converted lead is never "bad", whatever its old call status.
    assert bad_reason(_lead(status="converted", call_status="no_answer")) is None


def test_interested_reason():
    assert interested_reason(_lead(call_status="interested")) == "interested"
    assert interested_reason(_lead(call_status="Called - Interested")) == "interested"
    # Tagged via the CTCS "Interested" button (activity log), call status untouched.
    assert interested_reason(_lead(id=7, call_status="call_received"), ctcs_interested_ids=frozenset({7})) == "interested"
    # Converted-only leads are not in this list.
    assert interested_reason(_lead(status="converted", call_status="payment_done")) is None
    # Tagged interested earlier but later marked lost → excluded.
    assert interested_reason(_lead(id=8, status="lost"), ctcs_interested_ids=frozenset({8})) is None
    assert interested_reason(_lead()) is None


def test_build_csv_interested_segment():
    leads = [
        _lead(call_status="interested"),
        _lead(id=9, name="Ravi", phone="9000000001", call_status="call_received"),
        _lead(name="Paid", phone="9000000002", status="converted", call_status="payment_done"),
    ]
    body, count = build_csv(leads, segment="interested", ctcs_interested_ids=frozenset({9}))
    rows = list(csv.reader(io.StringIO(body)))
    assert count == 2
    assert [r[0] for r in rows[1:]] == ["919876543210", "919000000001"]


def test_build_csv_meta_format_dedup_and_filter():
    leads = [
        _lead(call_status="not_interested", gender="Female", age=27),
        _lead(call_status="no_answer"),  # same phone → deduped
        _lead(name="Ravi", phone=None, email="RAVI@X.COM", call_status="call_cut"),
        _lead(name="NoId", phone=None, email=None, status="lost"),  # no identifier → skipped
        _lead(name="Good", phone="9000000000", call_status="interested"),  # not bad
    ]
    body, count = build_csv(leads, segment="bad")
    rows = list(csv.reader(io.StringIO(body)))
    assert rows[0] == ["phone", "email", "fn", "ln", "ct", "country", "gen", "age"]
    assert count == 2
    assert rows[1] == ["919876543210", "", "asha", "kumari", "delhi", "in", "f", "27"]
    assert rows[2][1] == "ravi@x.com"

    body, count = build_csv(leads, segment="bad", reasons={"switch_off_unreachable"}, with_details=True)
    rows = list(csv.reader(io.StringIO(body)))
    assert count == 2  # first phone now classed via the no_answer row
    assert rows[0][-6] == "reason"
    assert all(r[8] == "switch_off_unreachable" for r in rows[1:])


@pytest.mark.asyncio
async def test_export_endpoint_forbidden_for_team(team_client):
    r = await team_client.get("/api/v1/leads/export/meta-audience")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_export_endpoint_admin_csv(admin_client):
    r = await admin_client.get("/api/v1/leads/export/meta-audience?segment=bad")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.text.splitlines()[0] == "phone,email,fn,ln,ct,country,gen,age"
    r = await admin_client.get("/api/v1/leads/export/meta-audience?segment=interested")
    assert r.status_code == 200
    r = await admin_client.get("/api/v1/leads/export/meta-audience?segment=nope")
    assert r.status_code == 422
