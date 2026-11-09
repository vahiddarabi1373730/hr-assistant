"""Organisational events are independent of the recruitment domain."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class OrgEvent(Base):
    __tablename__ = "org_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"))
    organiser_id: Mapped[uuid.UUID] = mapped_column()
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int | None] = mapped_column(Integer)
    budget_toman: Mapped[int | None] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(Text, default="published")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("org_id", "id"),
        ForeignKeyConstraint(
            ["org_id", "organiser_id"], ["memberships.org_id", "memberships.user_id"]
        ),
        CheckConstraint("ends_at > starts_at"),
        CheckConstraint("capacity is null or capacity > 0"),
        CheckConstraint("budget_toman is null or budget_toman >= 0"),
        CheckConstraint("status in ('draft','published','completed','cancelled')"),
        Index("org_events_schedule_idx", "org_id", "status", "starts_at"),
        Index("org_events_organiser_idx", "org_id", "organiser_id"),
    )


class EventGuest(Base):
    __tablename__ = "event_guests"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"))
    event_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    response: Mapped[str] = mapped_column(Text, default="pending")
    attended: Mapped[bool] = mapped_column(Boolean, default=False)
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    rating: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("org_id", "event_id", "email"),
        ForeignKeyConstraint(
            ["org_id", "event_id"], ["org_events.org_id", "org_events.id"], ondelete="CASCADE"
        ),
        CheckConstraint("response in ('pending','accepted','declined')"),
        CheckConstraint("rating is null or rating between 1 and 5"),
    )


class EventTask(Base):
    __tablename__ = "event_tasks"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"))
    event_id: Mapped[uuid.UUID] = mapped_column()
    title: Mapped[str] = mapped_column(Text)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column()
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        ForeignKeyConstraint(
            ["org_id", "event_id"], ["org_events.org_id", "org_events.id"], ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["org_id", "assignee_id"], ["memberships.org_id", "memberships.user_id"]
        ),
        Index("event_tasks_event_idx", "org_id", "event_id"),
        Index("event_tasks_assignee_idx", "org_id", "assignee_id"),
    )
