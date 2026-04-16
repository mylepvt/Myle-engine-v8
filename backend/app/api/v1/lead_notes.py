from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthUser, get_db, require_auth_user
from app.models.lead_note import LeadNote
from app.models.user import User
from app.services.lead_access import require_visible_lead

router = APIRouter()


class NoteCreate(BaseModel):
    body: str


class NoteOut(BaseModel):
    id: int
    lead_id: int
    user_id: int | None
    display_name: str | None
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _to_out(note: LeadNote, display_name: str | None) -> NoteOut:
    return NoteOut(
        id=note.id,
        lead_id=note.lead_id,
        user_id=note.user_id,
        display_name=display_name,
        body=note.body,
        created_at=note.created_at,
    )


@router.get("/{lead_id}/notes", response_model=list[NoteOut])
async def list_lead_notes(
    lead_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[NoteOut]:
    await require_visible_lead(session, user, lead_id)
    q = (
        select(LeadNote, User.username)
        .outerjoin(User, LeadNote.user_id == User.id)
        .where(LeadNote.lead_id == lead_id)
        .order_by(LeadNote.created_at.asc())
    )
    rows = (await session.execute(q)).all()
    return [_to_out(note, username) for note, username in rows]


@router.post("/{lead_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def create_lead_note(
    lead_id: int,
    body: NoteCreate,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NoteOut:
    await require_visible_lead(session, user, lead_id)
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="body cannot be empty")
    note = LeadNote(lead_id=lead_id, user_id=user.user_id, body=text)
    session.add(note)
    await session.commit()
    await session.refresh(note)
    # Fetch display name
    u = await session.get(User, user.user_id)
    display_name = u.username if u else None
    return _to_out(note, display_name)


@router.delete("/{lead_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead_note(
    lead_id: int,
    note_id: int,
    user: Annotated[AuthUser, Depends(require_auth_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await require_visible_lead(session, user, lead_id)
    note = await session.get(LeadNote, note_id)
    if note is None or note.lead_id != lead_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if user.role != "admin" and note.user_id != user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    await session.delete(note)
    await session.commit()
