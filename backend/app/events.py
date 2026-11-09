"""Tenant-scoped event planning and individual, revocable guest RSVP links."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, model_validator
from sqlalchemy import func, select

from app.config import settings
from app.event_models import EventGuest, EventTask, OrgEvent
from app.models import MembershipRole, OrgActivity
from app.pipeline import owner_for
from app.resumes import SessionDep
from app.rls import set_current_org
from app.tenancy import TenantContextDep

router = APIRouter(prefix="/api/events", tags=["events"])
public_router = APIRouter(prefix="/api/event-rsvp", tags=["event-rsvp"])


class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    location: str = Field(default="", max_length=300)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    capacity: int | None = Field(default=None, ge=1, le=100000)
    budget_toman: int | None = Field(default=None, ge=0, le=10**12)

    @model_validator(mode="after")
    def valid_range(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("end must follow start")
        return self


class EventEdit(EventInput):
    revision: int = Field(ge=1)


class StatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["published", "completed", "cancelled"]
    revision: int = Field(ge=1)


class GuestInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr


class TaskInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=300)
    assignee_id: UUID | None = None
    due_at: AwareDatetime | None = None


class DoneInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    done: bool


class AttendanceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attended: bool


class RSVPInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response: Literal["accepted", "declined"]


class FeedbackInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    rating: int = Field(ge=1, le=5)
    feedback: str = Field(default="", max_length=2000)


def can_manage(ctx, event):
    return ctx.membership.role == MembershipRole.ADMIN or ctx.user.id == event.organiser_id


async def event_for(session, org_id, event_id, *, lock=False):
    statement = select(OrgEvent).where(OrgEvent.org_id == org_id, OrgEvent.id == event_id)
    event = await session.scalar(statement.with_for_update() if lock else statement)
    if event is None:
        raise HTTPException(404, "EVENT_NOT_FOUND")
    return event


async def managed_event(session, ctx, event_id, *, active=True):
    event = await event_for(session, ctx.org.id, event_id, lock=True)
    if not can_manage(ctx, event):
        raise HTTPException(403, "EVENT_MANAGER_REQUIRED")
    if active and event.status in {"completed", "cancelled"}:
        raise HTTPException(409, "EVENT_CLOSED")
    return event


def audit(session, ctx, event, action, **details):
    session.add(
        OrgActivity(
            org_id=ctx.org.id,
            actor_user_id=ctx.user.id,
            event_type=action,
            data={"event_id": str(event.id), **details},
        )
    )


def event_data(event):
    return {
        key: getattr(event, key)
        for key in (
            "id",
            "title",
            "description",
            "location",
            "starts_at",
            "ends_at",
            "capacity",
            "budget_toman",
            "status",
            "organiser_id",
            "revision",
            "created_at",
        )
    }


def guest_data(guest):
    return {
        key: getattr(guest, key)
        for key in (
            "id",
            "name",
            "email",
            "response",
            "attended",
            "rating",
            "feedback",
        )
    }


def task_data(task):
    return {key: getattr(task, key) for key in ("id", "title", "assignee_id", "due_at", "done")}


async def event_detail(session, ctx, event):
    guests = (
        await session.scalars(
            select(EventGuest)
            .where(
                EventGuest.org_id == event.org_id,
                EventGuest.event_id == event.id,
            )
            .order_by(EventGuest.name, EventGuest.id)
        )
    ).all()
    tasks = (
        await session.scalars(
            select(EventTask)
            .where(
                EventTask.org_id == event.org_id,
                EventTask.event_id == event.id,
            )
            .order_by(EventTask.done, EventTask.due_at.nulls_last(), EventTask.id)
        )
    ).all()
    return {
        **event_data(event),
        "can_manage": can_manage(ctx, event),
        "guests": [guest_data(g) for g in guests],
        "tasks": [task_data(t) for t in tasks],
    }


@router.get("")
async def list_events(
    ctx: TenantContextDep,
    session: SessionDep,
    status: Literal["draft", "published", "completed", "cancelled"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict:
    statement = select(OrgEvent).where(OrgEvent.org_id == ctx.org.id)
    if status:
        statement = statement.where(OrgEvent.status == status)
    events = (
        await session.scalars(statement.order_by(OrgEvent.starts_at.desc()).limit(limit))
    ).all()
    counts = (
        (
            await session.execute(
                select(
                    EventGuest.event_id,
                    func.count(),
                    func.count().filter(EventGuest.response == "accepted"),
                )
                .where(
                    EventGuest.org_id == ctx.org.id,
                    EventGuest.event_id.in_([e.id for e in events]),
                )
                .group_by(EventGuest.event_id)
            )
        ).all()
        if events
        else []
    )
    totals = {event_id: (invited, accepted) for event_id, invited, accepted in counts}
    return {
        "items": [
            {
                **event_data(e),
                "guest_count": totals.get(e.id, (0, 0))[0],
                "accepted_count": totals.get(e.id, (0, 0))[1],
                "can_manage": can_manage(ctx, e),
            }
            for e in events
        ]
    }


@router.post("", status_code=201)
async def create_event(data: EventInput, ctx: TenantContextDep, session: SessionDep) -> dict:
    event = OrgEvent(org_id=ctx.org.id, organiser_id=ctx.user.id, **data.model_dump())
    session.add(event)
    await session.flush()
    audit(session, ctx, event, "event_created")
    result = await event_detail(session, ctx, event)
    await session.commit()
    return result


@router.get("/{event_id}")
async def get_event(event_id: UUID, ctx: TenantContextDep, session: SessionDep) -> dict:
    return await event_detail(session, ctx, await event_for(session, ctx.org.id, event_id))


@router.put("/{event_id}")
async def edit_event(
    event_id: UUID,
    data: EventEdit,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await managed_event(session, ctx, event_id)
    if event.revision != data.revision:
        raise HTTPException(409, "EVENT_STALE")
    accepted = await session.scalar(
        select(func.count())
        .select_from(EventGuest)
        .where(
            EventGuest.org_id == ctx.org.id,
            EventGuest.event_id == event.id,
            EventGuest.response == "accepted",
        )
    )
    if data.capacity is not None and data.capacity < accepted:
        raise HTTPException(409, "EVENT_CAPACITY_TOO_SMALL")
    for key, value in data.model_dump(exclude={"revision"}).items():
        setattr(event, key, value)
    event.revision += 1
    audit(session, ctx, event, "event_updated")
    result = await event_detail(session, ctx, event)
    await session.commit()
    return result


@router.post("/{event_id}/status")
async def change_status(
    event_id: UUID,
    data: StatusInput,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await managed_event(session, ctx, event_id)
    if event.revision != data.revision:
        raise HTTPException(409, "EVENT_STALE")
    allowed = {
        ("draft", "published"),
        ("draft", "cancelled"),
        ("published", "completed"),
        ("published", "cancelled"),
    }
    if (event.status, data.status) not in allowed:
        raise HTTPException(409, "EVENT_INVALID_TRANSITION")
    now = datetime.now(UTC)
    if data.status == "published" and event.starts_at <= now:
        raise HTTPException(409, "EVENT_START_IN_PAST")
    if data.status == "completed" and event.ends_at > now:
        raise HTTPException(409, "EVENT_NOT_ENDED")
    event.status = data.status
    event.revision += 1
    audit(session, ctx, event, "event_status_changed", status=event.status)
    result = await event_detail(session, ctx, event)
    await session.commit()
    return result


@router.post("/{event_id}/guests", status_code=201)
async def add_guest(
    event_id: UUID,
    data: GuestInput,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await managed_event(session, ctx, event_id)
    email = str(data.email).casefold()
    existing = await session.scalar(
        select(EventGuest.id).where(
            EventGuest.org_id == ctx.org.id,
            EventGuest.event_id == event.id,
            EventGuest.email == email,
        )
    )
    if existing:
        raise HTTPException(409, "EVENT_GUEST_EXISTS")
    count = await session.scalar(
        select(func.count())
        .select_from(EventGuest)
        .where(
            EventGuest.org_id == ctx.org.id,
            EventGuest.event_id == event.id,
        )
    )
    if count >= 500:
        raise HTTPException(409, "EVENT_GUEST_LIMIT")
    guest = EventGuest(org_id=ctx.org.id, event_id=event.id, name=data.name, email=email)
    session.add(guest)
    await session.flush()
    audit(session, ctx, event, "event_guest_added", guest_id=str(guest.id))
    result = guest_data(guest)
    await session.commit()
    return result


async def guest_for(session, event, guest_id):
    guest = await session.scalar(
        select(EventGuest).where(
            EventGuest.org_id == event.org_id,
            EventGuest.event_id == event.id,
            EventGuest.id == guest_id,
        )
    )
    if guest is None:
        raise HTTPException(404, "EVENT_GUEST_NOT_FOUND")
    return guest


@router.delete("/{event_id}/guests/{guest_id}", status_code=204)
async def remove_guest(
    event_id: UUID,
    guest_id: UUID,
    ctx: TenantContextDep,
    session: SessionDep,
):
    event = await managed_event(session, ctx, event_id)
    await session.delete(await guest_for(session, event, guest_id))
    audit(session, ctx, event, "event_guest_removed", guest_id=str(guest_id))
    await session.commit()


@router.post("/{event_id}/guests/{guest_id}/link")
async def invite_link(
    event_id: UUID,
    guest_id: UUID,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await managed_event(session, ctx, event_id, active=False)
    if event.status not in {"published", "completed"}:
        raise HTTPException(409, "EVENT_NOT_PUBLISHED")
    guest = await guest_for(session, event, guest_id)
    secret = secrets.token_urlsafe(32)
    guest.token_hash = hashlib.sha256(secret.encode()).hexdigest()
    audit(session, ctx, event, "event_invitation_link_created", guest_id=str(guest_id))
    url = f"{settings.public_frontend_url.rstrip('/')}/event-rsvp/{event.org_id}.{secret}"
    await session.commit()
    return {"url": url}


@router.patch("/{event_id}/guests/{guest_id}/attendance")
async def attendance(
    event_id: UUID,
    guest_id: UUID,
    data: AttendanceInput,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await managed_event(session, ctx, event_id, active=False)
    if event.status == "cancelled" or event.starts_at > datetime.now(UTC):
        raise HTTPException(409, "EVENT_NOT_STARTED")
    guest = await guest_for(session, event, guest_id)
    if data.attended and guest.response != "accepted":
        raise HTTPException(409, "EVENT_GUEST_NOT_ACCEPTED")
    guest.attended = data.attended
    audit(session, ctx, event, "event_attendance_updated", guest_id=str(guest_id))
    result = guest_data(guest)
    await session.commit()
    return result


@router.post("/{event_id}/tasks", status_code=201)
async def add_task(
    event_id: UUID,
    data: TaskInput,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await managed_event(session, ctx, event_id)
    await owner_for(session, ctx.org.id, data.assignee_id)
    count = await session.scalar(
        select(func.count())
        .select_from(EventTask)
        .where(
            EventTask.org_id == ctx.org.id,
            EventTask.event_id == event.id,
        )
    )
    if count >= 100:
        raise HTTPException(409, "EVENT_TASK_LIMIT")
    task = EventTask(org_id=ctx.org.id, event_id=event.id, **data.model_dump())
    session.add(task)
    await session.flush()
    audit(session, ctx, event, "event_task_added", task_id=str(task.id))
    result = task_data(task)
    await session.commit()
    return result


async def task_for(session, event, task_id):
    task = await session.scalar(
        select(EventTask).where(
            EventTask.org_id == event.org_id,
            EventTask.event_id == event.id,
            EventTask.id == task_id,
        )
    )
    if task is None:
        raise HTTPException(404, "EVENT_TASK_NOT_FOUND")
    return task


@router.patch("/{event_id}/tasks/{task_id}")
async def complete_task(
    event_id: UUID,
    task_id: UUID,
    data: DoneInput,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict:
    event = await event_for(session, ctx.org.id, event_id, lock=True)
    if event.status in {"cancelled", "completed"}:
        raise HTTPException(409, "EVENT_CLOSED")
    task = await task_for(session, event, task_id)
    if not can_manage(ctx, event) and ctx.user.id != task.assignee_id:
        raise HTTPException(403, "EVENT_MANAGER_REQUIRED")
    task.done = data.done
    audit(session, ctx, event, "event_task_updated", task_id=str(task.id))
    result = task_data(task)
    await session.commit()
    return result


@router.delete("/{event_id}/tasks/{task_id}", status_code=204)
async def remove_task(
    event_id: UUID,
    task_id: UUID,
    ctx: TenantContextDep,
    session: SessionDep,
):
    event = await managed_event(session, ctx, event_id)
    await session.delete(await task_for(session, event, task_id))
    audit(session, ctx, event, "event_task_removed", task_id=str(task_id))
    await session.commit()


async def public_invitation(session, token, *, lock=False):
    try:
        org, secret = token.split(".", 1)
        org_id = UUID(org)
        if len(secret) != 43:
            raise ValueError("invalid secret")
    except ValueError:
        raise HTTPException(404, "EVENT_INVITATION_NOT_FOUND") from None
    await set_current_org(session, org_id)
    digest = hashlib.sha256(secret.encode()).hexdigest()
    query = select(EventGuest).where(EventGuest.org_id == org_id, EventGuest.token_hash == digest)
    guest = await session.scalar(query)
    if guest is None:
        raise HTTPException(404, "EVENT_INVITATION_NOT_FOUND")
    event = await event_for(session, org_id, guest.event_id, lock=lock)
    if lock:
        # Recheck after locking the parent, in case an organiser rotated/deleted the link.
        guest = await session.scalar(query.execution_options(populate_existing=True))
        if guest is None:
            raise HTTPException(404, "EVENT_INVITATION_NOT_FOUND")
    if event.status == "draft" or datetime.now(UTC) > event.ends_at + timedelta(days=30):
        raise HTTPException(410, "EVENT_INVITATION_EXPIRED")
    return event, guest


def public_data(event, guest):
    now = datetime.now(UTC)
    return {
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "status": event.status,
        "guest_name": guest.name,
        "response": guest.response,
        "can_respond": event.status == "published" and now < event.starts_at,
        "can_feedback": event.status != "cancelled"
        and now >= event.ends_at
        and guest.response == "accepted",
        "rating": guest.rating,
        "feedback": guest.feedback,
    }


@public_router.get("/{token}")
async def get_invitation(token: str, session: SessionDep, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return public_data(*(await public_invitation(session, token)))


@public_router.post("/{token}/response")
async def respond(token: str, data: RSVPInput, session: SessionDep, response: Response) -> dict:
    event, guest = await public_invitation(session, token, lock=True)
    if not public_data(event, guest)["can_respond"]:
        raise HTTPException(409, "EVENT_RSVP_CLOSED")
    if data.response == "accepted" and guest.response != "accepted" and event.capacity is not None:
        count = await session.scalar(
            select(func.count())
            .select_from(EventGuest)
            .where(
                EventGuest.org_id == event.org_id,
                EventGuest.event_id == event.id,
                EventGuest.response == "accepted",
            )
        )
        if count >= event.capacity:
            raise HTTPException(409, "EVENT_FULL")
    guest.response = data.response
    session.add(
        OrgActivity(
            org_id=event.org_id,
            event_type="event_rsvp_updated",
            data={"event_id": str(event.id), "guest_id": str(guest.id), "response": guest.response},
        )
    )
    result = public_data(event, guest)
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@public_router.post("/{token}/feedback")
async def give_feedback(
    token: str,
    data: FeedbackInput,
    session: SessionDep,
    response: Response,
) -> dict:
    event, guest = await public_invitation(session, token, lock=True)
    if not public_data(event, guest)["can_feedback"]:
        raise HTTPException(409, "EVENT_FEEDBACK_CLOSED")
    guest.rating, guest.feedback = data.rating, data.feedback
    result = public_data(event, guest)
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    return result
