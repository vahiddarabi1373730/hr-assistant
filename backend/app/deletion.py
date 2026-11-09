"""Shared cleanup for deleting applications and their external calendar events."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.google_calendar import access_token, delete_calendar_event
from app.models import GoogleConnection, Interview


async def cancel_application_interviews(
    session: AsyncSession, org_id: UUID, application_ids: list[UUID]
) -> None:
    if not application_ids:
        return

    interviews = (
        await session.scalars(
            select(Interview).where(
                Interview.org_id == org_id,
                Interview.application_id.in_(application_ids),
            )
        )
    ).all()
    connections: dict[UUID, GoogleConnection | None] = {}
    events: list[tuple[str, str]] = []
    for interview in interviews:
        if interview.status == "booked" and not interview.google_event_id:
            raise HTTPException(409, "INTERVIEW_CANCELLATION_UNAVAILABLE")
        if not interview.google_event_id:
            continue
        if interview.proposer_user_id not in connections:
            connections[interview.proposer_user_id] = await session.scalar(
                select(GoogleConnection).where(
                    GoogleConnection.org_id == org_id,
                    GoogleConnection.user_id == interview.proposer_user_id,
                )
            )
        connection = connections[interview.proposer_user_id]
        if connection is None:
            raise HTTPException(409, "INTERVIEW_CANCELLATION_UNAVAILABLE")
        token = await access_token(session, connection)
        events.append((token, interview.google_event_id))

    for token, event_id in events:
        await delete_calendar_event(token, event_id)
