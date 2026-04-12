from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.leads import LeadPublic


class WorkboardActionCounts(BaseModel):
    """Lightweight priority counts for dashboard / workboard header (legacy ``today_actions``)."""

    pending_calls: int = Field(
        0,
        description="Scoped active leads whose call_status is not_called or no_answer",
    )
    videos_to_send: int = Field(
        0,
        description="Scoped leads in invited or video_sent (share / follow up on enrollment video)",
    )


class WorkboardColumnOut(BaseModel):
    status: str = Field(description="Pipeline column key (matches Lead.status)")
    total: int = Field(description="All leads in scope with this status")
    items: list[LeadPublic] = Field(description="Newest in column, capped per limit_per_column")


class WorkboardResponse(BaseModel):
    columns: list[WorkboardColumnOut]
    max_rows_fetched: int = Field(description="Cap applied when loading recent leads for bucketing")
    action_counts: WorkboardActionCounts = Field(
        default_factory=WorkboardActionCounts,
        description="Summary counts for today's priorities bar",
    )
