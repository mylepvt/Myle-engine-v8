"""Finish a prospect's enrollment from their enrollment link (no staff login on that side).

The prospect agreed and registered; when their screenshot matched (or a leader approved a
mismatch): receipt → the leader's Day 1 → premium welcome email. If finishing fails (say the
Transaction ID is already on another receipt), the registration is kept as a mismatch with
the reason, and the upline is told.
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser
from app.models.deposit import DepositConsent
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services import deposits
from app.services.leads_service import LeadsService, get_leads_service
from app.services.push_service import send_push_to_user_bg

logger = logging.getLogger(__name__)


async def _uploader(session: AsyncSession, consent: DepositConsent) -> AuthUser:
    u = await session.get(User, consent.created_by_user_id) if consent.created_by_user_id else None
    if u is None:
        raise HTTPException(status_code=409, detail="The member who uploaded this payment is no longer on Myle.")
    return AuthUser(user_id=u.id, role=u.role, email=u.email or "", fbo_id=u.fbo_id or "", username=u.username or "")


async def finish_enrollment(session: AsyncSession, consent: DepositConsent) -> tuple[LeadsService, str]:
    """Returns (service with queued pushes, ``done`` | ``mismatch``). Commits."""
    service = get_leads_service(session)
    consent_id = consent.id
    try:
        actor = await _uploader(session, consent)
        lead, receipt, leader_id = await service.complete_prospect_enrollment(consent=consent, actor=actor)
    except HTTPException as exc:
        await session.rollback()
        consent = await session.get(DepositConsent, consent_id)
        consent.match_status = "mismatch"
        consent.match_detail = f"Screenshot checked, but the enrollment couldn't finish: {exc.detail}"[:300]
        await session.commit()
        logger.info("enrollment %s not finished: %s", consent_id, exc.detail)
        await service.queue_registration_mismatch_pushes(consent, consent.payer_name)
        return service, "mismatch"
    leader = await session.get(User, leader_id) if leader_id else None
    leader_name = ((leader.name or "").strip() or None) if leader is not None else None
    await deposits.deliver_welcome(
        session, consent=consent, receipt_number=receipt.receipt_number, leader_name=leader_name
    )
    await session.commit()
    return service, "done"


def send_queued_pushes(background_tasks: BackgroundTasks, service: LeadsService) -> None:
    """Deliver the service's queued pushes after the response."""
    for user_id, title, body_text, url in service.queued_pushes:
        background_tasks.add_task(send_push_to_user_bg, AsyncSessionLocal, user_id, title=title, body=body_text, url=url)
    service.queued_pushes.clear()
