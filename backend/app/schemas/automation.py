from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class AutomationRulePublic(BaseModel):
    id: int
    name: str
    description: str | None = None
    trigger_type: str
    trigger_config: dict[str, Any] | None = None
    action_type: str
    action_config: dict[str, Any] | None = None
    cooldown_hours: int = 24
    is_active: bool = True
    created_at: str
    updated_at: str

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class AutomationRuleCreate(BaseModel):
    name: str
    description: str | None = None
    trigger_type: str
    trigger_config: dict[str, Any] | None = None
    action_type: str
    action_config: dict[str, Any] | None = None
    cooldown_hours: int = 24
    is_active: bool = True


class AutomationRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    trigger_config: dict[str, Any] | None = None
    action_type: str | None = None
    action_config: dict[str, Any] | None = None
    cooldown_hours: int | None = None
    is_active: bool | None = None


class AutomationActionLogPublic(BaseModel):
    id: int
    rule_id: int
    trigger_type: str
    trigger_entity_type: str
    trigger_entity_id: int
    trigger_detail: dict[str, Any] | None = None
    action_type: str
    action_result: dict[str, Any] | None = None
    created_at: str

    @field_validator("created_at", mode="before")
    @classmethod
    def fmt_dt(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class AutomationEvaluateResponse(BaseModel):
    triggered: int
    actions: list[AutomationActionLogPublic]
