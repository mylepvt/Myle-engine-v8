from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


ActionKey = Literal["alert_leader", "create_recovery", "escalate"]


class ActionQueueItem(BaseModel):
    id: str
    item_type: Literal["zombie_lead", "missed_missions", "inactive_member", "stuck_verification"]
    severity: float
    entity_type: Literal["lead", "member"]
    entity_id: int
    member_id: Optional[int] = None
    member_name: Optional[str] = None
    leader_name: Optional[str] = None
    title: str
    subtitle: str
    age_days: float
    actions: list[ActionKey]
    last_actioned_at: Optional[datetime] = None


class ActionQueueResponse(BaseModel):
    items: list[ActionQueueItem]
    total: int
    computed_at: datetime


class ActionExecuteRequest(BaseModel):
    item_type: str
    entity_type: Literal["lead", "member"]
    entity_id: int
    action: ActionKey


class ActionExecuteResult(BaseModel):
    status: str
    action: ActionKey
    detail: Optional[dict] = None
