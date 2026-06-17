from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.call_event import CallEvent
from app.models.lead import Lead
from app.models.lead_note import LeadNote
from app.models.lead_sale import LeadSale
from app.models.user import User
from app.schemas.lead_timeline import LeadTimelineResponse, TimelineEvent


async def _actor_name(session: AsyncSession, user_id: int | None) -> str:
    if user_id is None:
        return "System"
    user = await session.get(User, user_id)
    if user:
        return user.name or user.fbo_id or f"User #{user_id}"
    return f"User #{user_id}"


def _fmt(ts: datetime | None) -> str | None:
    if ts is None:
        return None
    return ts.isoformat()


async def get_lead_timeline(
    session: AsyncSession,
    lead_id: int,
) -> LeadTimelineResponse | None:
    lead = await session.get(Lead, lead_id)
    if not lead:
        return None

    owner_name = await _actor_name(session, lead.owner_user_id)
    assigned_name = await _actor_name(session, lead.assigned_to_user_id)
    events: list[TimelineEvent] = []

    # 1 — Lead created
    events.append(TimelineEvent(
        type="created",
        label="Lead Created",
        timestamp=lead.created_at.isoformat(),
        actor=await _actor_name(session, lead.created_by_user_id),
        detail=f"Source: {lead.source or 'N/A'}",
    ))

    # 2 — Claimed (owner assigned)
    if lead.owner_user_id and lead.owner_user_id != lead.created_by_user_id:
        events.append(TimelineEvent(
            type="claimed",
            label="Claimed by Owner",
            timestamp=lead.created_at.isoformat(),  # approx — actual claim time unknown without activity log
            actor=owner_name,
            detail="Lead claimed from pool",
        ))

    # 3 — Assignment changes (check activity log for assign actions)
    assign_logs = (
        await session.execute(
            select(ActivityLog)
            .where(
                ActivityLog.entity_type == "lead",
                ActivityLog.entity_id == lead_id,
                ActivityLog.action.in_(["assign_lead", "reassign_lead"]),
            )
            .order_by(ActivityLog.created_at.asc())
        )
    ).scalars().all()

    for log in assign_logs:
        meta = log.meta or {}
        from_user = meta.get("from_user_id") or meta.get("previous_assignee_id")
        to_user = meta.get("to_user_id") or meta.get("assigned_to_user_id")
        from_name = await _actor_name(session, from_user) if from_user else "Unassigned"
        to_name = await _actor_name(session, to_user) if to_user else "Unassigned"
        events.append(TimelineEvent(
            type="assigned",
            label="Lead Assigned" if log.action == "assign_lead" else "Lead Reassigned",
            timestamp=log.created_at.isoformat(),
            actor=await _actor_name(session, log.user_id),
            detail=f"{from_name} → {to_name}",
        ))

    # 4 — Reassigned field on lead
    if lead.is_reassigned and lead.reassigned_at:
        events.append(TimelineEvent(
            type="reassigned",
            label="Lead Reassigned (flag)",
            timestamp=lead.reassigned_at.isoformat(),
            actor="System",
            detail="Reassignment flag set",
        ))

    # 5 — Calls
    calls = (
        await session.execute(
            select(CallEvent)
            .where(CallEvent.lead_id == lead_id)
            .order_by(CallEvent.called_at.asc())
        )
    ).scalars().all()

    for call in calls:
        events.append(TimelineEvent(
            type="called",
            label="Call Made",
            timestamp=call.called_at.isoformat(),
            actor=await _actor_name(session, call.user_id),
            detail=f"Outcome: {call.outcome}" + (f" · {call.duration_seconds}s" if call.duration_seconds else ""),
        ))

    # 6 — Call status changes (last_called_at)
    if lead.last_called_at:
        events.append(TimelineEvent(
            type="last_called",
            label="Last Call Attempt",
            timestamp=lead.last_called_at.isoformat(),
            actor=assigned_name,
            detail=f"Call count: {lead.call_count}",
        ))

    # 7 — WhatsApp sent
    if lead.whatsapp_sent_at:
        events.append(TimelineEvent(
            type="whatsapp_sent",
            label="WhatsApp Sent",
            timestamp=lead.whatsapp_sent_at.isoformat(),
            actor=assigned_name,
            detail="WhatsApp message sent to lead",
        ))

    # 8 — Mindset
    if lead.mindset_started_at:
        events.append(TimelineEvent(
            type="mindset_started",
            label="Mindset Started",
            timestamp=lead.mindset_started_at.isoformat(),
            actor=await _actor_name(session, lead.mindset_completed_by_user_id) if lead.mindset_completed_by_user_id else assigned_name,
            detail="Mindset session initiated",
        ))
    if lead.mindset_completed_at:
        events.append(TimelineEvent(
            type="mindset_completed",
            label="Mindset Completed",
            timestamp=lead.mindset_completed_at.isoformat(),
            actor=await _actor_name(session, lead.mindset_completed_by_user_id) if lead.mindset_completed_by_user_id else assigned_name,
            detail="Mindset session completed",
        ))

    # 9 — Day completions
    day_map = [
        ("day1", "Day 1 Completed", lead.day1_completed_at),
        ("day2", "Day 2 Completed", lead.day2_completed_at),
        ("day3", "Day 3 Completed", lead.day3_completed_at),
        ("day4", "Day 4 Completed", lead.day4_completed_at),
        ("day5", "Day 5 Completed", lead.day5_completed_at),
    ]
    for day_type, day_label, day_ts in day_map:
        if day_ts:
            events.append(TimelineEvent(
                type=day_type,
                label=day_label,
                timestamp=day_ts.isoformat(),
                actor=assigned_name,
                detail=f"Lead progressed to {day_type.replace('_', ' ').title()}",
            ))

    # 10 — Day 2 test
    if lead.day2_test_completed_at:
        test_label = "Day 2 Test Passed" if lead.day2_test_status == "passed" else "Day 2 Test Failed"
        events.append(TimelineEvent(
            type="day2_test" if lead.day2_test_status == "passed" else "day2_test_failed",
            label=test_label,
            timestamp=lead.day2_test_completed_at.isoformat(),
            actor=assigned_name,
            detail=f"Score: {lead.day2_test_score}/{100} · Attempts: {lead.day2_test_attempts}",
        ))

    # 11 — Payment / Sale
    if lead.payment_proof_uploaded_at:
        events.append(TimelineEvent(
            type="payment_uploaded",
            label="Payment Proof Uploaded",
            timestamp=lead.payment_proof_uploaded_at.isoformat(),
            actor=assigned_name,
            detail=f"Amount: ₹{lead.payment_amount_cents / 100 if lead.payment_amount_cents else 'N/A'}",
        ))

    sales = (
        await session.execute(
            select(LeadSale)
            .where(LeadSale.lead_id == lead_id)
            .order_by(LeadSale.created_at.asc())
        )
    ).scalars().all()
    for sale in sales:
        events.append(TimelineEvent(
            type="sale" if sale.status == "approved" else "sale_pending",
            label=f"Sale Submitted ({sale.billing_stage})" if sale.status == "pending" else f"Sale Approved ({sale.billing_stage})",
            timestamp=(sale.approved_at or sale.created_at).isoformat(),
            actor=await _actor_name(session, sale.approved_by_user_id or sale.submitted_by_user_id),
            detail=f"Case credits: {sale.case_credits} · Amount: ₹{sale.amount_cents / 100 if sale.amount_cents else 'N/A'}",
        ))

    # 12 — Stage selection (Day 3)
    if lead.stage_selected:
        events.append(TimelineEvent(
            type="stage_selected",
            label="Stage Selected",
            timestamp=lead.outcome_changed_at.isoformat() if lead.outcome_changed_at else lead.updated_at.isoformat() if hasattr(lead, 'updated_at') else lead.created_at.isoformat(),
            actor=assigned_name,
            detail=f"Stage: {lead.stage_selected} · Seat hold: ₹{lead.seat_hold_amount_cents / 100 if lead.seat_hold_amount_cents else 'N/A'}",
        ))

    # 13 — Outcome changes
    if lead.outcome:
        ts = lead.outcome_changed_at or lead.dropped_at or lead.created_at
        detail_parts = []
        if lead.drop_reason:
            detail_parts.append(f"Reason: {lead.drop_reason}")
        if lead.drop_notes:
            detail_parts.append(f"Notes: {lead.drop_notes}")
        if lead.recycle_reason:
            detail_parts.append(f"Recycle: {lead.recycle_reason}")
        events.append(TimelineEvent(
            type=lead.outcome,
            label=f"Outcome: {lead.outcome.title()}",
            timestamp=ts.isoformat(),
            actor=await _actor_name(session, lead.drop_recorded_by_user_id) if lead.drop_recorded_by_user_id else assigned_name,
            detail=" · ".join(detail_parts),
        ))

    # 14 — Notes
    notes = (
        await session.execute(
            select(LeadNote)
            .where(LeadNote.lead_id == lead_id)
            .order_by(LeadNote.created_at.asc())
        )
    ).scalars().all()
    for note in notes:
        events.append(TimelineEvent(
            type="note",
            label="Note Added",
            timestamp=note.created_at.isoformat(),
            actor=await _actor_name(session, note.user_id),
            detail=note.body[:200],
        ))

    # 15 — Activity log entries (general lead actions)
    other_logs = (
        await session.execute(
            select(ActivityLog)
            .where(
                ActivityLog.entity_type == "lead",
                ActivityLog.entity_id == lead_id,
                ActivityLog.action.notin_(["assign_lead", "reassign_lead"]),
            )
            .order_by(ActivityLog.created_at.asc())
        )
    ).scalars().all()
    for log in other_logs:
        meta = log.meta or {}
        detail = meta.get("detail") or meta.get("note") or ""
        events.append(TimelineEvent(
            type="activity",
            label=log.action.replace("_", " ").title(),
            timestamp=log.created_at.isoformat(),
            actor=await _actor_name(session, log.user_id),
            detail=str(detail)[:200],
        ))

    # Sort by timestamp
    events.sort(key=lambda e: e.timestamp)

    return LeadTimelineResponse(
        lead_id=lead.id,
        lead_name=lead.name,
        owner=owner_name,
        assigned_to=assigned_name,
        outcome=lead.outcome or "unknown",
        events=events,
    )
