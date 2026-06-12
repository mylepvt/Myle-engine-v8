"""
EOS Constitution — MYLE Execution Operating System

Non-negotiable rules. No feature, developer, or AI shall break these rules.

Rule 1 — Owner Is Permanent
    lead.owner_user_id is immutable once assigned.
    Enforced at: models/lead.py:_prevent_owner_reassignment (SQLAlchemy before_update hook).

Rule 2 — Worker Is Changeable
    lead.assigned_to_user_id can be reassigned for operational flexibility.
    lead.is_reassigned tracks reassignment status.
    Owner remains unchanged regardless of worker changes.

Rule 3 — No Zombie Leads
    Every active lead must have activity within 7 days.
    Zombie leads (>7d inactive) must be flagged and actioned.
    Enforced via: automation rule "Zombie Lead Alert" and lead_outcome_service zombie detection.

Rule 4 — Every Lead Has Outcome
    Every lead must have a final outcome: active | converted | dead | recycle.
    No lead stays in indeterminate state indefinitely.
    Enforced via: Lead Outcome Engine.

Rule 5 — Every Member Has Mission
    Every active team member gets a daily mission.
    Mission completion is tracked and scored.
    Enforced via: DailyMission auto-creation on first open.

Rule 6 — Every Leader Has Score
    Every leader with a team receives an effectiveness score.
    Score = weighted composite of mission completion (25%) + verification rate (25%) + conversion rate (20%) + zombie score (20%) + blocker resolution (10%).
    Enforced via: Leader Effectiveness Engine.

Rule 7 — Every Training Has Implementation
    Every training/webinar must have a campaign with verifiable actions.
    Implementation = evidence submission + leader verification.
    Enforced via: Training Campaign Engine.

Rule 8 — Nothing Exists Without Visibility
    Every action, score, risk, and outcome must be visible to the appropriate role.
    No hidden states. No silent failures.
    Enforced via: Admin War Room, Leader Command Center, Risk Engine, Lead Timeline.
"""

# Machine-readable rule definitions for system-level enforcement
EOS_RULES: dict[str, dict] = {
    "owner_permanent": {
        "name": "Owner Is Permanent",
        "description": "lead.owner_user_id is immutable once assigned",
        "enforcement": "database",
        "module": "app.models.lead",
        "hook": "_prevent_owner_reassignment",
    },
    "worker_changeable": {
        "name": "Worker Is Changeable",
        "description": "lead.assigned_to_user_id can be reassigned; owner stays",
        "enforcement": "application",
        "module": "app.models.lead",
        "fields": ["assigned_to_user_id", "is_reassigned", "reassigned_at"],
    },
    "no_zombie_leads": {
        "name": "No Zombie Leads",
        "description": "Active leads must have activity within 7 days",
        "enforcement": "automation",
        "module": "app.services.lead_outcome_service",
        "automation_rule": "Zombie Lead Alert",
    },
    "every_lead_has_outcome": {
        "name": "Every Lead Has Outcome",
        "description": "Every lead has a final outcome: active | converted | dead | recycle",
        "enforcement": "application",
        "module": "app.models.lead",
        "fields": ["outcome", "outcome_changed_at", "drop_reason"],
    },
    "every_member_has_mission": {
        "name": "Every Member Has Mission",
        "description": "Active team members get daily missions",
        "enforcement": "application",
        "module": "app.services.mission_service",
    },
    "every_leader_has_score": {
        "name": "Every Leader Has Score",
        "description": "Leaders with teams receive an effectiveness score",
        "enforcement": "application",
        "module": "app.services.leader_effectiveness_service",
    },
    "every_training_has_implementation": {
        "name": "Every Training Has Implementation",
        "description": "Training/webinars must have campaigns with verifiable actions",
        "enforcement": "application",
        "module": "app.services.training_campaign_service",
    },
    "no_invisible_activity": {
        "name": "Nothing Exists Without Visibility",
        "description": "Every action, score, risk, and outcome must be visible",
        "enforcement": "architecture",
        "modules": [
            "app.services.lead_timeline_service",
            "app.services.predictive_risk_service",
            "app.services.blocker_intelligence_service",
        ],
    },
}
