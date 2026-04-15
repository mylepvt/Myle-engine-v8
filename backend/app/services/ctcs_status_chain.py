"""Advance ``Lead.status`` toward a target slug using legacy FSM rules (per role)."""

from __future__ import annotations

from fastapi import HTTPException
from starlette import status as http_status

from app.core.lead_status import LEAD_STATUS_LABELS
from app.core.pipeline_rules import STATUS_FLOW_ORDER, normalize_flow_status, validate_vl2_status_transition_for_role
from app.models.lead import Lead
from app.services.ctcs_heat import bump_heat_on_entering_contacted


def _label_to_slug() -> dict[str, str]:
    return {LEAD_STATUS_LABELS[k]: k for k in LEAD_STATUS_LABELS}


_LABEL_TO_SLUG = _label_to_slug()


def advance_lead_status_toward(*, lead: Lead, target_slug: str, role: str) -> None:
    """Mutate ``lead.status`` in-place until ``target_slug`` is reached or validation fails."""
    if lead.status == target_slug:
        return

    ok, msg = validate_vl2_status_transition_for_role(
        current_slug=lead.status,
        target_slug=target_slug,
        role=role,
    )
    if ok:
        prev = lead.status
        lead.status = target_slug
        bump_heat_on_entering_contacted(lead, prev)
        return

    if role == "admin":
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg or "Invalid transition")

    flow_idx = {s: i for i, s in enumerate(STATUS_FLOW_ORDER)}
    cur_label = normalize_flow_status(LEAD_STATUS_LABELS.get(lead.status, lead.status))
    tgt_label = normalize_flow_status(LEAD_STATUS_LABELS.get(target_slug, target_slug))

    if cur_label not in flow_idx or tgt_label not in flow_idx:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg or "Invalid transition")

    max_steps = 24
    for _ in range(max_steps):
        if lead.status == target_slug:
            return
        ok_mid, msg_mid = validate_vl2_status_transition_for_role(
            current_slug=lead.status,
            target_slug=target_slug,
            role=role,
        )
        if ok_mid:
            prev = lead.status
            lead.status = target_slug
            bump_heat_on_entering_contacted(lead, prev)
            return
        ci = flow_idx[normalize_flow_status(LEAD_STATUS_LABELS.get(lead.status, lead.status))]
        ti = flow_idx[tgt_label]
        if ci >= ti:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg_mid or "Invalid transition")
        next_label = STATUS_FLOW_ORDER[ci + 1]
        next_slug = _LABEL_TO_SLUG.get(next_label)
        if next_slug is None:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Unknown pipeline label")
        ok_step, msg_step = validate_vl2_status_transition_for_role(
            current_slug=lead.status,
            target_slug=next_slug,
            role=role,
        )
        if not ok_step:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=msg_step or "Invalid transition")
        prev = lead.status
        lead.status = next_slug
        bump_heat_on_entering_contacted(lead, prev)

    raise HTTPException(
        status_code=http_status.HTTP_400_BAD_REQUEST,
        detail="Could not advance status toward target",
    )
