from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models.verification_task import TASK_TYPE_CHOICES
from app.models.task_assignment import TASK_STATUS_CHOICES, BLOCKER_REASON_CHOICES


class VerificationTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    task_type: str = Field(default="CUSTOM", max_length=32)
    evidence_instructions: Optional[str] = Field(default=None, max_length=5000)

    @classmethod
    def task_type_allowed(cls, v: str) -> str:
        s = v.strip().upper()
        if s not in TASK_TYPE_CHOICES:
            raise ValueError(f"Invalid task_type; must be one of {TASK_TYPE_CHOICES}")
        return s


class VerificationTaskPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    title: str
    description: Optional[str] = None
    task_type: str
    evidence_instructions: Optional[str] = None
    created_by_user_id: Optional[int] = None
    is_active: bool
    created_at: datetime


class TaskAssignmentCreate(BaseModel):
    verification_task_id: int
    assigned_to_user_id: int
    due_at: Optional[datetime] = None


class TaskAssignmentBulkCreate(BaseModel):
    verification_task_id: int
    user_ids: list[int] = Field(min_length=1, max_length=200)
    due_at: Optional[datetime] = None


class TaskEvidenceSubmit(BaseModel):
    evidence_text: Optional[str] = Field(default=None, max_length=10000)
    evidence_file_url: Optional[str] = Field(default=None, max_length=500)


class TaskBlocked(BaseModel):
    blocker_reason: str = Field(max_length=32)
    blocker_notes: Optional[str] = Field(default=None, max_length=2000)


class TaskVerification(BaseModel):
    action: str = Field(max_length=20)  # "verify" | "reject" | "result_produced"
    rejection_reason: Optional[str] = Field(default=None, max_length=2000)
    result_notes: Optional[str] = Field(default=None, max_length=2000)


class TaskAssignmentPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    verification_task_id: int
    task_title: Optional[str] = None
    task_type: Optional[str] = None
    evidence_instructions: Optional[str] = None
    assigned_to_user_id: int
    assigned_to_name: Optional[str] = None
    assigned_by_user_id: Optional[int] = None
    leader_user_id: Optional[int] = None
    leader_name: Optional[str] = None
    leader_chain_snapshot: Optional[dict[str, Any]] = None
    status: str
    evidence_text: Optional[str] = None
    evidence_file_url: Optional[str] = None
    submitted_at: Optional[datetime] = None
    verified_by_user_id: Optional[int] = None
    verified_by_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    blocker_reason: Optional[str] = None
    blocker_notes: Optional[str] = None
    result_produced: bool = False
    result_notes: Optional[str] = None
    due_at: Optional[datetime] = None
    escalation_level: int = 0
    escalated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class MemberTasksResponse(BaseModel):
    today_tasks: list[TaskAssignmentPublic]
    pending_verifications: list[TaskAssignmentPublic]
    blocked_tasks: list[TaskAssignmentPublic]
    execution_score: int = 0


class AdminVerificationSummary(BaseModel):
    total_members: int
    members_active_today: int
    evidence_today: int
    verified_today: int
    pending_verifications: int
    blocked_tasks: int
    ignored_leads: int
    verification_rate_pct: float
    leader_ranking: list[dict[str, Any]]
    task_type_breakdown: list[dict[str, Any]]
