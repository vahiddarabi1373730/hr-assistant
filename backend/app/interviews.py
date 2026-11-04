"""Human-controlled interview scheduling and Google Calendar integration."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.google_calendar import (
    access_token,
    authorization_url,
    booking_message,
    decrypt,
    encrypt,
    exchange_code,
    google_json,
    make_state,
    read_state,
    send_booking_email,
)
from app.models import (
    Candidate,
    CandidateApplication,
    GoogleConnection,
    Interview,
    InterviewInterviewer,
    InterviewSlot,
)
from app.pipeline import application_event, application_for
from app.resumes import SessionDep
from app.rls import set_current_org
from app.tenancy import TenantContextDep

router = APIRouter(prefix="/api", tags=["interviews"])


class InterviewerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=320)

    @field_validator("name", "email")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("empty value")
        return value.strip()


class SlotInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: datetime
    ends_at: datetime

    @field_validator("ends_at")
    @classmethod
    def after_start(cls, value: datetime, info) -> datetime:
        start = info.data.get("starts_at")
        if value.tzinfo is None or (start and start.tzinfo is None) or (start and value <= start):
            raise ValueError("invalid slot")
        return value


class InterviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    duration_minutes: int = Field(ge=15, le=240)
    slots: list[SlotInput] = Field(min_length=2, max_length=4)
    interviewers: list[InterviewerInput] = Field(default_factory=list, max_length=12)


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _booking_token(org_id: UUID) -> tuple[str, str]:
    secret = secrets.token_urlsafe(32)
    return f"{org_id}.{secret}", _hash(secret)


def interview_data(
    interview: Interview, slots: list[InterviewSlot], people: list[InterviewInterviewer]
) -> dict:
    return {
        "id": interview.id,
        "title": interview.title,
        "duration_minutes": interview.duration_minutes,
        "status": interview.status,
        "meet_url": interview.meet_url,
        "created_at": interview.created_at,
        "slots": [
            {"id": s.id, "starts_at": s.starts_at, "ends_at": s.ends_at, "status": s.status}
            for s in slots
        ],
        "interviewers": [{"id": p.id, "name": p.name, "email": p.email} for p in people],
    }


async def _interview_parts(
    session, org_id: UUID, interview: Interview
) -> tuple[list[InterviewSlot], list[InterviewInterviewer]]:
    slots = (
        await session.scalars(
            select(InterviewSlot)
            .where(InterviewSlot.org_id == org_id, InterviewSlot.interview_id == interview.id)
            .order_by(InterviewSlot.starts_at)
        )
    ).all()
    people = (
        await session.scalars(
            select(InterviewInterviewer)
            .where(
                InterviewInterviewer.org_id == org_id,
                InterviewInterviewer.interview_id == interview.id,
            )
            .order_by(InterviewInterviewer.name)
        )
    ).all()
    return slots, people


@router.get("/google/connection")
async def google_connection(ctx: TenantContextDep, session: SessionDep) -> dict:
    connection = await session.scalar(
        select(GoogleConnection).where(
            GoogleConnection.org_id == ctx.org.id, GoogleConnection.user_id == ctx.user.id
        )
    )
    return {
        "connected": connection is not None,
        "email": connection.google_email if connection else None,
    }


@router.post("/google/connect")
async def connect_google(ctx: TenantContextDep) -> dict:
    state = make_state({"org_id": str(ctx.org.id), "user_id": str(ctx.user.id)})
    return {"authorization_url": authorization_url(state)}


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    code: Annotated[str, Query(min_length=1)],
    state: Annotated[str, Query(min_length=1)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RedirectResponse:
    payload = read_state(state)
    org_id, user_id = UUID(payload["org_id"]), UUID(payload["user_id"])
    await set_current_org(session, org_id)
    tokens = await exchange_code(code)
    refresh = tokens.get("refresh_token")
    if not refresh:
        raise HTTPException(409, "GOOGLE_RECONNECT_REQUIRED")
    profile = await google_json(
        tokens["access_token"], "GET", "https://www.googleapis.com/oauth2/v2/userinfo"
    )
    connection = await session.scalar(
        select(GoogleConnection).where(
            GoogleConnection.org_id == org_id, GoogleConnection.user_id == user_id
        )
    )
    values = {
        "google_email": profile.get("email"),
        "encrypted_refresh_token": encrypt(refresh),
        "encrypted_access_token": encrypt(tokens["access_token"]),
        "access_token_expires_at": datetime.now(UTC)
        + timedelta(seconds=int(tokens.get("expires_in", 3600))),
    }
    if connection is None:
        session.add(GoogleConnection(org_id=org_id, user_id=user_id, **values))
    else:
        for key, value in values.items():
            setattr(connection, key, value)
    await session.commit()
    return RedirectResponse(
        f"{settings.public_frontend_url}/board?google=connected", status_code=303
    )


@router.get("/applications/{application_id}/interviews")
async def list_interviews(application_id: UUID, ctx: TenantContextDep, session: SessionDep) -> dict:
    interviews = (
        await session.scalars(
            select(Interview)
            .where(Interview.org_id == ctx.org.id, Interview.application_id == application_id)
            .order_by(Interview.created_at.desc())
        )
    ).all()
    return {
        "items": [
            interview_data(interview, *(await _interview_parts(session, ctx.org.id, interview)))
            for interview in interviews
        ]
    }


@router.post("/applications/{application_id}/interviews", status_code=201)
async def create_interview(
    application_id: UUID, data: InterviewCreate, ctx: TenantContextDep, session: SessionDep
) -> dict:
    application = await application_for(session, ctx.org.id, application_id)
    now = datetime.now(UTC)
    if any(slot.starts_at <= now for slot in data.slots):
        raise HTTPException(422, "SLOT_MUST_BE_FUTURE")
    connection = await session.scalar(
        select(GoogleConnection).where(
            GoogleConnection.org_id == ctx.org.id,
            GoogleConnection.user_id == ctx.user.id,
        )
    )
    if connection is None:
        raise HTTPException(409, "GOOGLE_RECONNECT_REQUIRED")
    calendar = await google_json(
        await access_token(session, connection),
        "POST",
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
            "timeMin": min(slot.starts_at for slot in data.slots).isoformat(),
            "timeMax": max(slot.ends_at for slot in data.slots).isoformat(),
            "items": [{"id": "primary"}],
        },
    )
    busy_ranges = calendar.get("calendars", {}).get("primary", {}).get("busy", [])
    for slot in data.slots:
        for busy in busy_ranges:
            starts_at = datetime.fromisoformat(busy["start"].replace("Z", "+00:00"))
            ends_at = datetime.fromisoformat(busy["end"].replace("Z", "+00:00"))
            if slot.starts_at < ends_at and starts_at < slot.ends_at:
                raise HTTPException(409, "SLOT_CONFLICTS_WITH_CALENDAR")
    token, token_hash = _booking_token(ctx.org.id)
    interview = Interview(
        org_id=ctx.org.id,
        application_id=application.id,
        proposer_user_id=ctx.user.id,
        title=data.title.strip(),
        duration_minutes=data.duration_minutes,
        booking_token_hash=token_hash,
        encrypted_booking_token=encrypt(token),
    )
    session.add(interview)
    await session.flush()
    session.add_all(
        [
            InterviewSlot(
                org_id=ctx.org.id,
                interview_id=interview.id,
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
            )
            for slot in data.slots
        ]
    )
    session.add_all(
        [
            InterviewInterviewer(
                org_id=ctx.org.id,
                interview_id=interview.id,
                name=person.name,
                email=person.email.lower(),
            )
            for person in data.interviewers
        ]
    )
    application_event(
        session,
        application,
        "interview_proposed",
        ctx.user.id,
        interview_id=str(interview.id),
        title=interview.title,
    )
    await session.commit()
    slots, people = await _interview_parts(session, ctx.org.id, interview)
    return {
        **interview_data(interview, slots, people),
        "booking_url": f"{settings.public_frontend_url}/book/{quote(token, safe='.')}",
    }


@router.post("/interviews/{interview_id}/send-invitation")
async def send_invitation(interview_id: UUID, ctx: TenantContextDep, session: SessionDep) -> dict:
    interview = await session.scalar(
        select(Interview).where(Interview.org_id == ctx.org.id, Interview.id == interview_id)
    )
    if interview is None:
        raise HTTPException(404, "INTERVIEW_NOT_FOUND")
    application = await application_for(session, ctx.org.id, interview.application_id)
    candidate = await session.scalar(
        select(Candidate).where(
            Candidate.org_id == ctx.org.id, Candidate.id == application.candidate_id
        )
    )
    if candidate is None or not candidate.email:
        raise HTTPException(422, "CANDIDATE_EMAIL_REQUIRED")
    connection = await session.scalar(
        select(GoogleConnection).where(
            GoogleConnection.org_id == ctx.org.id, GoogleConnection.user_id == ctx.user.id
        )
    )
    if connection is None:
        raise HTTPException(409, "GOOGLE_RECONNECT_REQUIRED")
    booking_token = quote(decrypt(interview.encrypted_booking_token), safe=".")
    booking_url = f"{settings.public_frontend_url}/book/{booking_token}"
    await send_booking_email(
        await access_token(session, connection),
        candidate.email,
        f"هماهنگی مصاحبه: {interview.title}",
        booking_message(booking_url, candidate.full_name, interview.title),
    )
    application_event(
        session,
        application,
        "interview_invitation_sent",
        ctx.user.id,
        interview_id=str(interview.id),
    )
    await session.commit()
    return {"sent": True, "booking_url": booking_url}


async def _public_interview(session: AsyncSession, token: str, lock: bool = False):
    try:
        org_text, secret = token.split(".", 1)
        org_id = UUID(org_text)
    except ValueError as exc:
        raise HTTPException(404, "BOOKING_NOT_FOUND") from exc
    await set_current_org(session, org_id)
    statement = select(Interview).where(
        Interview.org_id == org_id, Interview.booking_token_hash == _hash(secret)
    )
    if lock:
        statement = statement.with_for_update()
    interview = await session.scalar(statement)
    if interview is None:
        raise HTTPException(404, "BOOKING_NOT_FOUND")
    return org_id, interview


@router.get("/public/bookings/{token}")
async def public_booking(
    token: str, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict:
    org_id, interview = await _public_interview(session, token)
    application = await session.scalar(
        select(CandidateApplication).where(
            CandidateApplication.org_id == org_id,
            CandidateApplication.id == interview.application_id,
        )
    )
    candidate = (
        await session.scalar(
            select(Candidate).where(
                Candidate.org_id == org_id, Candidate.id == application.candidate_id
            )
        )
        if application
        else None
    )
    slots, people = await _interview_parts(session, org_id, interview)
    return {
        "title": interview.title,
        "candidate_name": candidate.full_name if candidate else "",
        "status": interview.status,
        "duration_minutes": interview.duration_minutes,
        "slots": [
            {"id": s.id, "starts_at": s.starts_at, "ends_at": s.ends_at}
            for s in slots
            if s.status == "offered"
        ],
        "interviewers": [{"name": p.name} for p in people],
    }


class BookingChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slot_id: UUID


@router.post("/public/bookings/{token}/confirm")
async def confirm_public_booking(
    token: str, choice: BookingChoice, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict:
    org_id, interview = await _public_interview(session, token, lock=True)
    if interview.status != "open":
        raise HTTPException(409, "BOOKING_UNAVAILABLE")
    slot = await session.scalar(
        select(InterviewSlot)
        .where(
            InterviewSlot.org_id == org_id,
            InterviewSlot.interview_id == interview.id,
            InterviewSlot.id == choice.slot_id,
        )
        .with_for_update()
    )
    if slot is None or slot.status != "offered":
        raise HTTPException(409, "SLOT_UNAVAILABLE")
    application = await session.scalar(
        select(CandidateApplication).where(
            CandidateApplication.org_id == org_id,
            CandidateApplication.id == interview.application_id,
        )
    )
    candidate = (
        await session.scalar(
            select(Candidate).where(
                Candidate.org_id == org_id, Candidate.id == application.candidate_id
            )
        )
        if application
        else None
    )
    connection = await session.scalar(
        select(GoogleConnection).where(
            GoogleConnection.org_id == org_id,
            GoogleConnection.user_id == interview.proposer_user_id,
        )
    )
    if candidate is None or not candidate.email or connection is None:
        raise HTTPException(409, "BOOKING_SETUP_INCOMPLETE")
    people = (
        await session.scalars(
            select(InterviewInterviewer).where(
                InterviewInterviewer.org_id == org_id,
                InterviewInterviewer.interview_id == interview.id,
            )
        )
    ).all()
    attendees = [{"email": candidate.email}] + [{"email": p.email} for p in people]
    event = await google_json(
        await access_token(session, connection),
        "POST",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
        {
            "summary": interview.title,
            "description": "مصاحبهٔ هماهنگ‌شده در HR Assist",
            "start": {"dateTime": slot.starts_at.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": slot.ends_at.isoformat(), "timeZone": "UTC"},
            "attendees": attendees,
            "conferenceData": {
                "createRequest": {
                    "requestId": str(interview.id),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        },
    )
    interview.status, interview.booked_slot_id, interview.booked_at = (
        "booked",
        slot.id,
        datetime.now(UTC),
    )
    interview.google_event_id = event.get("id")
    interview.meet_url = event.get("hangoutLink")
    slot.status = "booked"
    others = (
        await session.scalars(
            select(InterviewSlot).where(
                InterviewSlot.org_id == org_id,
                InterviewSlot.interview_id == interview.id,
                InterviewSlot.id != slot.id,
            )
        )
    ).all()
    for other in others:
        other.status = "released"
    application_event(
        session,
        application,
        "interview_booked",
        None,
        interview_id=str(interview.id),
        slot_id=str(slot.id),
    )
    await session.commit()
    return {
        "status": "booked",
        "meet_url": interview.meet_url,
        "starts_at": slot.starts_at,
        "ends_at": slot.ends_at,
    }
