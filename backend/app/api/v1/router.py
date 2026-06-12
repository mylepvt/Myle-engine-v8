"""
Aggregate all v1 routers here. New domains: add `your_module.router` + `include_router`.
"""

from fastapi import APIRouter

from app.api.v1 import (
    admin_activity,
    admin_dashboard,
    admin_management_updates,
    admin_performer_insights,
    admin_training,
    action_queue,
    automation,
    blocker_intelligence,
    eos_health,
    leader_command_center,
    leader_effectiveness,
    lead_outcomes,
    lead_timeline,
    missions,
    org_execution,
    predictive_risk,
    training_campaign,
    verification,
    invoices,
    analytics,
    auth,
    location,
    media,
    certificate,
    downloads,
    enrollment,
    flp_min_billing,
    execution,
    finance_surfaces,
    follow_ups,
    free_lead_pool,
    gate_assistant,
    hello,
    lead_notes,
    lead_pool,
    leads,
    meta,
    notifications,
    org,
    other_pages,
    payments,
    pending_as,
    realtime_ws,
    reports,
    retarget,
    sales,
    settings_enhanced,
    settings_pages,
    system,
    team,
    team_tracking,
    wallet,
    wallet_enhanced,
    webhooks,
    workboard,
    crm_proxy,
    xp,
)

api_router = APIRouter()
api_router.include_router(meta.router, prefix="/meta", tags=["meta"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin_training.router, prefix="/admin", tags=["admin"])
api_router.include_router(admin_dashboard.router, prefix="/admin", tags=["admin"])
api_router.include_router(admin_performer_insights.router, prefix="/admin", tags=["admin"])
api_router.include_router(admin_management_updates.router, prefix="/admin", tags=["admin"])
api_router.include_router(admin_activity.router, prefix="/admin", tags=["admin"])
api_router.include_router(action_queue.router, tags=["action-queue"])
api_router.include_router(automation.router, tags=["automation"])
api_router.include_router(blocker_intelligence.router, tags=["blocker-intelligence"])
api_router.include_router(eos_health.router, tags=["eos-health"])
api_router.include_router(media.router, prefix="/media", tags=["media"])
api_router.include_router(hello.router, prefix="/hello", tags=["hello"])
api_router.include_router(leads.router, prefix="/leads", tags=["leads"])
api_router.include_router(leads.watch_router, tags=["watch"])
api_router.include_router(team.router, prefix="/team", tags=["team"])
api_router.include_router(team_tracking.router, prefix="/team", tags=["team-tracking"])
api_router.include_router(system.router, prefix="/system", tags=["system"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(execution.router, prefix="/execution", tags=["execution"])
api_router.include_router(org.router, prefix="/org", tags=["org"])
api_router.include_router(finance_surfaces.router, prefix="/finance", tags=["finance"])
api_router.include_router(other_pages.router, prefix="/other", tags=["other"])
api_router.include_router(settings_pages.router, prefix="/settings", tags=["settings"])
api_router.include_router(
    settings_enhanced.router,
    prefix="/settings-enhanced",
    tags=["settings-enhanced"],
)
api_router.include_router(wallet.router, prefix="/wallet", tags=["wallet"])
api_router.include_router(invoices.router, tags=["invoices"])
api_router.include_router(lead_pool.router, prefix="/lead-pool", tags=["lead-pool"])
api_router.include_router(free_lead_pool.router, prefix="/free-lead-pool", tags=["free-lead-pool"])
api_router.include_router(retarget.router, prefix="/retarget", tags=["retarget"])
api_router.include_router(pending_as.router, prefix="/pending-as", tags=["pending-as"])
api_router.include_router(follow_ups.router, prefix="/follow-ups", tags=["follow-ups"])
api_router.include_router(lead_notes.router, prefix="/leads", tags=["lead-notes"])
api_router.include_router(workboard.router, prefix="/workboard", tags=["workboard"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(
    gate_assistant.router, prefix="/gate-assistant", tags=["gate-assistant"]
)
api_router.include_router(realtime_ws.router, tags=["realtime"])
api_router.include_router(flp_min_billing.router, prefix="/flp-min-billing", tags=["flp-min-billing"])
# Public watch route — no /flp-min-billing prefix so the URL is /api/v1/watch/{token}
api_router.include_router(flp_min_billing.watch_router, tags=["watch"])
api_router.include_router(enrollment.router, prefix="/enroll", tags=["enroll-secure"])
api_router.include_router(enrollment.public_router, tags=["enroll-secure"])
api_router.include_router(certificate.router, tags=["certificate"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(sales.router, tags=["sales"])
api_router.include_router(wallet_enhanced.router, prefix="/wallet", tags=["wallet-enhanced"])
api_router.include_router(crm_proxy.router, tags=["crm"])
api_router.include_router(xp.router, prefix="/xp", tags=["xp"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(location.router, prefix="/location", tags=["location"])
api_router.include_router(downloads.router, prefix="/downloads", tags=["downloads"])
api_router.include_router(verification.router, prefix="/verification", tags=["verification"])
api_router.include_router(leader_command_center.router, tags=["leader-command-center"])
api_router.include_router(leader_effectiveness.router, tags=["leader-effectiveness"])
api_router.include_router(lead_outcomes.router, tags=["lead-outcomes"])
api_router.include_router(lead_timeline.router, tags=["lead-timeline"])
api_router.include_router(missions.router, tags=["missions"])
api_router.include_router(org_execution.router, tags=["org-execution"])
api_router.include_router(predictive_risk.router, tags=["predictive-risk"])
api_router.include_router(training_campaign.router, tags=["training-campaign"])
api_router.include_router(webhooks.router, tags=["webhooks"])
