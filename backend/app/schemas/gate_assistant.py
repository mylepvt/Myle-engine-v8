"""Gate Assistant — compact checklist derived from live data (no duplicate business rules in the client)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class GateChecklistItem(BaseModel):
    id: str
    label: str
    done: bool
    href: Optional[str] = Field(
        default=None,
        description="Dashboard path segment, e.g. work/follow-ups — client prefixes /dashboard/",
    )


class GateAssistantResponse(BaseModel):
    role: Literal["team", "leader", "admin"]
    risk_level: Literal["green", "yellow", "red"]
    progress_done: int
    progress_total: int
    next_action: str
    next_href: Optional[str] = None
    next_label: Optional[str] = None
    checklist: list[GateChecklistItem]
    fresh_leads_today: int = 0
    calls_today: int = 0
    call_target: int = 0
    pending_proof_count: int = 0
    members_below_call_gate: int = 0
    open_follow_ups: int = 0
    overdue_follow_ups: int = 0
    active_pipeline_leads: int = 0
    note: Optional[str] = None
