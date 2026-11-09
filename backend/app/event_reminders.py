"""Idempotent in-app reminders; never sends email or calls calendar providers."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text

from app.event_models import OrgEvent
from app.models import Org
from app.notifications import notify
from app.rls import set_current_org


async def deliver_event_reminders(session_factory, *, now=None):
    now = now or datetime.now(UTC)
    async with session_factory() as session:
        if not await session.scalar(select(func.to_regclass("org_events"))):
            return
        # Org is an existing reference table, not a tenant-data RLS exception.
        org_ids = (await session.scalars(select(Org.id))).all()
    for org_id in org_ids:
        async with session_factory() as session:
            await set_current_org(session, org_id)
            events = (
                await session.scalars(
                    select(OrgEvent)
                    .where(
                        OrgEvent.org_id == org_id,
                        OrgEvent.status.in_(("draft", "published")),
                        OrgEvent.starts_at > now,
                        OrgEvent.starts_at <= now + timedelta(hours=24),
                    )
                    .with_for_update(skip_locked=True)
                )
            ).all()
            for event in events:
                # ON CONFLICT also checks recipient-private SELECT visibility.
                # Pin the trusted organiser rather than weakening notification RLS.
                await session.execute(
                    text("select set_config('app.current_user_id', :user_id, true)"),
                    {"user_id": str(event.organiser_id)},
                )
                for hours in (24, 1):
                    if event.starts_at <= now + timedelta(hours=hours):
                        await notify(
                            session,
                            org_id=org_id,
                            recipient_id=event.organiser_id,
                            kind="event_reminder",
                            dedupe_key=f"event:{event.id}:{event.starts_at.isoformat()}:{hours}h",
                        )
            await session.commit()


async def run_event_reminders_forever(session_factory):
    while True:
        try:
            await deliver_event_reminders(session_factory)
        except Exception:
            logging.getLogger(__name__).exception("Event reminder iteration failed")
        await asyncio.sleep(60)
