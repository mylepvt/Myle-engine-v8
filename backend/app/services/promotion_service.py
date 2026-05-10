"""Leader promotion eligibility service.

Evaluates whether a team member meets all criteria to be promoted to leader.
All seven criteria must pass for overall eligibility.

Criteria:
  1. training_done        — Training completed (or not required)
  2. xp_level_pro         — Current season XP level is pro / elite / legend (≥ 300 XP)
  3. compliance_clean     — No active warnings, blocks, or grace states
  4. tenure_30_days       — At least 30 days since joining_date
  5. login_streak_7       — Login streak of 7+ consecutive days
  6. leads_won_3          — At least 3 leads with payment approved (lifetime)
  7. reports_no_streak    — Zero consecutive missing-report days right now
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_ist import today_ist
from app.models.lead import Lead
from app.models.user import User
from app.services.lead_owner import lead_owner_clause
from app.services.member_compliance import build_compliance_snapshots


# ---------------------------------------------------------------------------
# Thresholds — single source of truth
# ---------------------------------------------------------------------------

REQUIRED_XP_LEVELS = {"pro", "elite", "legend"}
MIN_TENURE_DAYS = 30
MIN_LOGIN_STREAK = 7
MIN_LEADS_WON = 3


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class CriterionResult:
    key: str
    label: str
    passed: bool
    detail: str
    current_value: Optional[str] = None
    required_value: Optional[str] = None


@dataclass(slots=True)
class PromotionEligibility:
    user_id: int
    eligible: bool
    criteria: list[CriterionResult] = field(default_factory=list)
    passed_count: int = 0
    total_count: int = 0


# ---------------------------------------------------------------------------
# Core check
# ---------------------------------------------------------------------------

async def check_leader_promotion_eligibility(
    session: AsyncSession,
    user: User,
    *,
    today: date | None = None,
) -> PromotionEligibility:
    """Return full promotion eligibility for a team-role user."""
    today_date = today or today_ist()
    criteria: list[CriterionResult] = []

    # ── 1. Training done ────────────────────────────────────────────────────
    training_done = (not user.training_required) or (
        (user.training_status or "") == "completed"
    )
    criteria.append(CriterionResult(
        key="training_done",
        label="Training completed",
        passed=training_done,
        detail=(
            "Training marked as completed."
            if training_done
            else f"Training status: {user.training_status or 'not started'}. Must complete all training days."
        ),
        current_value=user.training_status or "not_required",
        required_value="completed",
    ))

    # ── 2. XP level ≥ Pro ───────────────────────────────────────────────────
    current_level = user.xp_level or "rookie"
    xp_ok = current_level in REQUIRED_XP_LEVELS
    criteria.append(CriterionResult(
        key="xp_level_pro",
        label="XP level Pro or above (300+ XP this season)",
        passed=xp_ok,
        detail=(
            f"Current XP level: {current_level.title()} ({user.xp_total or 0} XP)."
            if xp_ok
            else f"Current XP level: {current_level.title()} ({user.xp_total or 0} XP). Need at least Pro (300 XP)."
        ),
        current_value=current_level,
        required_value="pro / elite / legend",
    ))

    # ── 3. Clean compliance ─────────────────────────────────────────────────
    if user.access_blocked or (user.discipline_status or "").lower() in {"removed", "grace"}:
        compliance_clean = False
        compliance_detail = (
            "Access is blocked or account is in grace/removed state."
        )
    else:
        snapshot_map = await build_compliance_snapshots(
            session,
            [user.id],
            today=today_date,
            apply_actions=False,
        )
        snap = snapshot_map.get(user.id)
        if snap is None:
            compliance_clean = True
            compliance_detail = "No compliance data found — treated as clear."
        else:
            bad_levels = {"warning", "strong_warning", "final_warning", "grace", "grace_ending", "removed"}
            compliance_clean = snap.compliance_level not in bad_levels
            if compliance_clean:
                compliance_detail = "No active compliance warnings."
            else:
                compliance_detail = f"Compliance status: {snap.compliance_title}. {snap.compliance_summary}"

    criteria.append(CriterionResult(
        key="compliance_clean",
        label="Clean compliance record (no active warnings)",
        passed=compliance_clean,
        detail=compliance_detail,
        current_value="clean" if compliance_clean else "warning",
        required_value="clean",
    ))

    # ── 4. Tenure ≥ 30 days ─────────────────────────────────────────────────
    joining = user.joining_date
    if joining is None:
        tenure_ok = False
        tenure_detail = "Joining date not set. Contact admin to set your joining date."
        tenure_days = 0
    else:
        tenure_days = (today_date - joining).days
        tenure_ok = tenure_days >= MIN_TENURE_DAYS
        if tenure_ok:
            tenure_detail = f"Member for {tenure_days} days (joined {joining.isoformat()})."
        else:
            remaining = MIN_TENURE_DAYS - tenure_days
            tenure_detail = f"Member for {tenure_days} days. Need {remaining} more day(s) (joined {joining.isoformat()})."

    criteria.append(CriterionResult(
        key="tenure_30_days",
        label=f"At least {MIN_TENURE_DAYS} days tenure",
        passed=tenure_ok,
        detail=tenure_detail,
        current_value=str(tenure_days),
        required_value=str(MIN_TENURE_DAYS),
    ))

    # ── 5. Login streak ≥ 7 ────────────────────────────────────────────────
    streak = user.login_streak or 0
    streak_ok = streak >= MIN_LOGIN_STREAK
    criteria.append(CriterionResult(
        key="login_streak_7",
        label=f"Login streak of {MIN_LOGIN_STREAK}+ consecutive days",
        passed=streak_ok,
        detail=(
            f"Current login streak: {streak} days."
            if streak_ok
            else f"Current login streak: {streak} days. Need {MIN_LOGIN_STREAK - streak} more consecutive day(s)."
        ),
        current_value=str(streak),
        required_value=str(MIN_LOGIN_STREAK),
    ))

    # ── 6. Leads won ≥ 3 (lifetime) ────────────────────────────────────────
    won_count_result = await session.execute(
        select(func.count())
        .select_from(Lead)
        .where(lead_owner_clause(user.id))
        .where(Lead.payment_status == "approved")
        .where(Lead.deleted_at.is_(None))
    )
    won_count = int(won_count_result.scalar_one())
    leads_ok = won_count >= MIN_LEADS_WON
    criteria.append(CriterionResult(
        key="leads_won_3",
        label=f"At least {MIN_LEADS_WON} leads won (payment approved, lifetime)",
        passed=leads_ok,
        detail=(
            f"Total leads won: {won_count}."
            if leads_ok
            else f"Total leads won: {won_count}. Need {MIN_LEADS_WON - won_count} more."
        ),
        current_value=str(won_count),
        required_value=str(MIN_LEADS_WON),
    ))

    # ── 7. No missing-report streak ─────────────────────────────────────────
    # Re-use the compliance snapshot computed above (or compute fresh if needed).
    snap_map2 = await build_compliance_snapshots(
        session,
        [user.id],
        today=today_date,
        apply_actions=False,
    )
    snap2 = snap_map2.get(user.id)
    if snap2 is None or not snap2.eligible:
        reports_ok = True
        reports_detail = "No report tracking active — treated as clear."
        report_streak = 0
    else:
        report_streak = snap2.missing_report_streak
        reports_ok = report_streak == 0
        if reports_ok:
            reports_detail = "Daily reports submitted consistently."
        else:
            reports_detail = (
                f"Missing daily reports for {report_streak} consecutive day(s). "
                "Submit today's report to start recovering."
            )

    criteria.append(CriterionResult(
        key="reports_no_streak",
        label="No consecutive missing daily reports",
        passed=reports_ok,
        detail=reports_detail,
        current_value=str(report_streak),
        required_value="0",
    ))

    # ── Summary ─────────────────────────────────────────────────────────────
    passed_count = sum(1 for c in criteria if c.passed)
    eligible = passed_count == len(criteria)

    return PromotionEligibility(
        user_id=user.id,
        eligible=eligible,
        criteria=criteria,
        passed_count=passed_count,
        total_count=len(criteria),
    )
