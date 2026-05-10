from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CriterionOut(BaseModel):
    key: str
    label: str
    passed: bool
    detail: str
    current_value: Optional[str] = None
    required_value: Optional[str] = None


class PromotionEligibilityOut(BaseModel):
    user_id: int
    eligible: bool
    passed_count: int
    total_count: int
    criteria: list[CriterionOut]
