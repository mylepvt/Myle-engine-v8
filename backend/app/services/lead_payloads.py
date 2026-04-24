from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.schemas.leads import LeadPublic
from app.services.lead_owner import resolved_owner_user_id
from app.services.user_hierarchy import load_user_hierarchy_entries, nearest_leader_entry


def _response_owner_user_id(lead: Lead) -> int | None:
    if lead.owner_user_id is not None:
        return int(lead.owner_user_id)
    if lead.in_pool:
        return None
    return resolved_owner_user_id(lead)


async def build_lead_public_payloads(
    session: AsyncSession,
    leads: Sequence[Lead],
) -> list[LeadPublic]:
    """Attach owner/leader display metadata so clients do not need to reconstruct hierarchy."""
    if not leads:
        return []

    related_user_ids = {
        int(user_id)
        for lead in leads
        for user_id in (_response_owner_user_id(lead), lead.assigned_to_user_id)
        if user_id is not None
    }
    entries = await load_user_hierarchy_entries(session, related_user_ids)

    items: list[LeadPublic] = []
    for lead in leads:
        payload = LeadPublic.model_validate(lead)
        owner_user_id = _response_owner_user_id(lead)
        owner_entry = entries.get(owner_user_id)
        leader_entry = nearest_leader_entry(owner_user_id, entries)
        assignee_entry = entries.get(payload.assigned_to_user_id) if payload.assigned_to_user_id is not None else None

        payload.owner_user_id = owner_user_id
        payload.owner_name = owner_entry.display_name if owner_entry is not None else None
        payload.leader_user_id = leader_entry.id if leader_entry is not None else None
        payload.leader_name = leader_entry.display_name if leader_entry is not None else None
        payload.assigned_to_name = assignee_entry.display_name if assignee_entry is not None else None
        items.append(payload)
    return items
