"""Organisational events over HTTP and actual restricted-role PostgreSQL."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.event_reminders import deliver_event_reminders
from app.rls import set_current_org

from .test_ingest_api import PASSWORD, signup
from .test_notes_notifications import seed_member


def event_input(**changes):
    start = datetime.now(UTC) + timedelta(days=3)
    return {
        "title": "دورهمی تیم",
        "description": "گفت‌وگو و برنامه‌ریزی فصل بعد",
        "location": "دفتر مرکزی",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=2)).isoformat(),
        "capacity": 2,
        "budget_toman": 2_000_000,
        **changes,
    }


async def make_event(client, **changes):
    response = await client.post("/api/events", json=event_input(**changes))
    assert response.status_code == 201, response.text
    return response.json()


async def guest_link(client, event, email="guest@example.com"):
    response = await client.post(
        f"/api/events/{event['id']}/guests",
        json={
            "name": "مهمان",
            "email": email,
        },
    )
    assert response.status_code == 201, response.text
    guest = response.json()
    response = await client.post(f"/api/events/{event['id']}/guests/{guest['id']}/link")
    assert response.status_code == 200, response.text
    return guest, response.json()["url"].split("/event-rsvp/")[1]


async def test_event_create_edit_complete_and_validation(api_client):
    await signup(api_client, "event-admin@example.com", "Events")
    me = (await api_client.get("/api/me")).json()
    event = await make_event(api_client)
    assert event["status"] == "published" and event["can_manage"] is True
    assert event["guests"] == event["tasks"] == []
    updated = await api_client.put(
        f"/api/events/{event['id']}",
        json={
            **event_input(title="کارگاه تیمی"),
            "revision": 1,
        },
    )
    assert updated.status_code == 200, updated.text
    event = updated.json()
    assert event["revision"] == 2
    no_publish_action = await api_client.post(
        f"/api/events/{event['id']}/status",
        json={"status": "published", "revision": event["revision"]},
    )
    assert no_publish_action.status_code == 422
    stale = await api_client.put(
        f"/api/events/{event['id']}",
        json={
            **event_input(),
            "revision": 1,
        },
    )
    assert stale.status_code == 409 and stale.json()["detail"] == "EVENT_STALE"
    premature = await api_client.post(
        f"/api/events/{event['id']}/status",
        json={
            "status": "completed",
            "revision": event["revision"],
        },
    )
    assert premature.status_code == 409
    task = await api_client.post(
        f"/api/events/{event['id']}/tasks",
        json={
            "title": "رزرو محل",
            "assignee_id": me["id"],
        },
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]
    done = await api_client.patch(f"/api/events/{event['id']}/tasks/{task_id}", json={"done": True})
    assert done.status_code == 200 and done.json()["done"] is True
    assert (
        await api_client.delete(f"/api/events/{event['id']}/tasks/{task_id}")
    ).status_code == 204
    items = (await api_client.get("/api/events?status=published")).json()["items"]
    assert len(items) == 1 and items[0]["guest_count"] == 0
    invalid = [
        {"title": " "},
        {"capacity": 0},
        {"budget_toman": -1},
        {"starts_at": "2027-01-01T10:00:00"},
        {"ends_at": "2020-01-01T10:00:00Z"},
        {"description": "x" * 5001},
    ]
    for changes in invalid:
        response = await api_client.post("/api/events", json=event_input(**changes))
        assert response.status_code == 422, response.text


async def test_public_rsvp_is_private_idempotent_and_capacity_safe(api_client):
    await signup(api_client, "rsvp-admin@example.com", "RSVP")
    event = await make_event(api_client, capacity=1)
    guest, token = await guest_link(api_client, event)
    _, second_token = await guest_link(api_client, event, "second@example.com")
    invitation = await api_client.get(f"/api/event-rsvp/{token}")
    assert invitation.status_code == 200
    assert invitation.headers["cache-control"] == "no-store"
    assert (
        not {"email", "guests", "budget_toman", "organiser_id", "org_id"} & invitation.json().keys()
    )
    responses = await asyncio.gather(
        *[
            api_client.post(f"/api/event-rsvp/{value}/response", json={"response": "accepted"})
            for value in (token, second_token)
        ]
    )
    assert sorted(response.status_code for response in responses) == [200, 409]
    winning_token = (token, second_token)[
        next(i for i, r in enumerate(responses) if r.status_code == 200)
    ]
    losing_token = second_token if winning_token == token else token
    repeat = await api_client.post(
        f"/api/event-rsvp/{winning_token}/response", json={"response": "accepted"}
    )
    assert repeat.status_code == 200
    assert (await api_client.get("/api/events")).json()["items"][0]["accepted_count"] == 1
    await api_client.post(
        f"/api/event-rsvp/{winning_token}/response", json={"response": "declined"}
    )
    assert (
        await api_client.post(
            f"/api/event-rsvp/{losing_token}/response", json={"response": "accepted"}
        )
    ).status_code == 200
    duplicate = await api_client.post(
        f"/api/events/{event['id']}/guests",
        json={"name": "Duplicate", "email": "GUEST@example.com"},
    )
    assert duplicate.status_code == 409
    extra = await api_client.post(
        f"/api/event-rsvp/{token}/response", json={"response": "accepted", "attended": True}
    )
    assert extra.status_code == 422
    assert "token_hash" not in (await api_client.get(f"/api/events/{event['id']}")).text


async def test_invite_organization_members_by_email_and_keep_accepted_members(
    api_client, superuser_engine, monkeypatch
):
    await signup(api_client, "event-invite-admin@example.com", "Team Invitations")
    me = (await api_client.get("/api/me")).json()
    member_id = await seed_member(
        superuser_engine, me["org"]["id"], "event-invite-member@example.com"
    )
    async with superuser_engine.begin() as conn:
        await conn.execute(
            text(
                "insert into system_mailboxes (org_id, google_email, encrypted_refresh_token) "
                "values (:org_id, 'events@example.com', :token)"
            ),
            {"org_id": me["org"]["id"], "token": b"test-token"},
        )

    sent_messages: list[tuple[str, str, str]] = []

    async def fake_access_token(session, mailbox):
        return "test-access-token"

    async def fake_send_email(token, recipient, subject, body):
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("app.events.access_token", fake_access_token)
    monkeypatch.setattr("app.events.send_email", fake_send_email)

    event = await make_event(api_client)
    members = (await api_client.get("/api/pipeline/owners")).json()["items"]
    assert {member["role"] for member in members} == {"admin", "member"}
    assert {member["id"] for member in members} == {me["id"], member_id}

    invitations = await api_client.post(
        f"/api/events/{event['id']}/invitations",
        json={"member_ids": [me["id"], member_id]},
    )
    assert invitations.status_code == 200, invitations.text
    result = invitations.json()
    assert set(result["sent"]) == {
        "event-invite-admin@example.com",
        "event-invite-member@example.com",
    }
    assert result["failed"] == result["skipped"] == []
    assert len(sent_messages) == 2
    assert all(
        "دورهمی تیم" in subject and "لینک اختصاصی" in body
        for _, subject, body in sent_messages
    )

    member_message = next(
        body for email, _, body in sent_messages if email == "event-invite-member@example.com"
    )
    token = member_message.split("/event-rsvp/", 1)[1].strip()
    accepted = await api_client.post(
        f"/api/event-rsvp/{token}/response", json={"response": "accepted"}
    )
    assert accepted.status_code == 200, accepted.text

    resent = await api_client.post(
        f"/api/events/{event['id']}/invitations",
        json={"member_ids": [me["id"], member_id]},
    )
    assert resent.status_code == 200, resent.text
    assert resent.json()["sent"] == ["event-invite-admin@example.com"]
    assert resent.json()["skipped"] == ["event-invite-member@example.com"]

    detail = (await api_client.get(f"/api/events/{event['id']}")).json()
    accepted_guest = next(
        guest for guest in detail["guests"] if guest["email"] == "event-invite-member@example.com"
    )
    assert accepted_guest["response"] == "accepted"

    async def fail_email(token, recipient, subject, body):
        raise HTTPException(502, "GOOGLE_API_FAILED")

    monkeypatch.setattr("app.events.send_email", fail_email)
    partial = await api_client.post(
        f"/api/events/{event['id']}/invitations",
        json={"member_ids": [me["id"], member_id]},
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["sent"] == []
    assert partial.json()["failed"] == [
        {"email": "event-invite-admin@example.com", "reason": "GOOGLE_API_FAILED"}
    ]
    assert partial.json()["skipped"] == ["event-invite-member@example.com"]


async def test_rotated_links_cancelled_events_and_guest_removal(api_client):
    await signup(api_client, "rotation@example.com", "Rotation")
    event = await make_event(api_client)
    guest_response = await api_client.post(
        f"/api/events/{event['id']}/guests", json={"name": "Guest", "email": "guest@example.com"}
    )
    guest = guest_response.json()
    no_link = await api_client.post(f"/api/events/{event['id']}/guests/{guest['id']}/link")
    assert no_link.status_code == 200
    link_path = f"/api/events/{event['id']}/guests/{guest['id']}/link"
    token1 = (await api_client.post(link_path)).json()["url"].split("/event-rsvp/")[1]
    token2 = (await api_client.post(link_path)).json()["url"].split("/event-rsvp/")[1]
    assert (await api_client.get(f"/api/event-rsvp/{token1}")).status_code == 404
    assert (await api_client.get(f"/api/event-rsvp/{token2}")).status_code == 200
    disposable, disposable_token = await guest_link(api_client, event, "remove@example.com")
    removed = await api_client.delete(f"/api/events/{event['id']}/guests/{disposable['id']}")
    assert removed.status_code == 204
    assert (await api_client.get(f"/api/event-rsvp/{disposable_token}")).status_code == 404
    cancelled = await api_client.post(
        f"/api/events/{event['id']}/status",
        json={"status": "cancelled", "revision": event["revision"]},
    )
    assert cancelled.status_code == 200
    page = (await api_client.get(f"/api/event-rsvp/{token2}")).json()
    assert page["status"] == "cancelled" and not page["can_respond"] and not page["can_feedback"]
    assert (
        await api_client.post(f"/api/event-rsvp/{token2}/response", json={"response": "accepted"})
    ).status_code == 409
    assert (
        await api_client.post(f"/api/events/{event['id']}/tasks", json={"title": "late"})
    ).status_code == 409
    assert (await api_client.post(link_path)).status_code == 409


async def move_to_past(engine, event_id):
    now = datetime.now(UTC)
    async with engine.begin() as conn:
        await conn.execute(
            text("update org_events set starts_at=:start,ends_at=:end where id=:id"),
            {
                "id": UUID(event_id),
                "start": now - timedelta(hours=2),
                "end": now - timedelta(hours=1),
            },
        )


async def test_attendance_feedback_and_invitation_expiry(api_client, superuser_engine):
    await signup(api_client, "feedback@example.com", "Feedback")
    event = await make_event(api_client)
    guest, token = await guest_link(api_client, event)
    assert (
        await api_client.patch(
            f"/api/events/{event['id']}/guests/{guest['id']}/attendance", json={"attended": True}
        )
    ).status_code == 409
    assert (
        await api_client.post(f"/api/event-rsvp/{token}/feedback", json={"rating": 5})
    ).status_code == 409
    await api_client.post(f"/api/event-rsvp/{token}/response", json={"response": "accepted"})
    await move_to_past(superuser_engine, event["id"])
    assert (
        await api_client.post(f"/api/event-rsvp/{token}/response", json={"response": "declined"})
    ).status_code == 409
    attendance = await api_client.patch(
        f"/api/events/{event['id']}/guests/{guest['id']}/attendance", json={"attended": True}
    )
    assert attendance.status_code == 200 and attendance.json()["attended"]
    completed = await api_client.post(
        f"/api/events/{event['id']}/status",
        json={"status": "completed", "revision": event["revision"]},
    )
    assert completed.status_code == 200, completed.text
    feedback = await api_client.post(
        f"/api/event-rsvp/{token}/feedback", json={"rating": 4, "feedback": "برنامهٔ خوبی بود"}
    )
    assert feedback.status_code == 200, feedback.text
    assert (
        await api_client.post(f"/api/event-rsvp/{token}/feedback", json={"rating": 6})
    ).status_code == 422
    detail = (await api_client.get(f"/api/events/{event['id']}")).json()
    assert detail["guests"][0]["rating"] == 4
    async with superuser_engine.begin() as conn:
        await conn.execute(
            text(
                "update org_events set starts_at=starts_at-interval '31 days',"
                "ends_at=ends_at-interval '31 days' where id=:id"
            ),
            {"id": UUID(event["id"])},
        )
    assert (await api_client.get(f"/api/event-rsvp/{token}")).status_code == 410


async def test_member_permissions_and_assigned_checklist(api_client, superuser_engine):
    await signup(api_client, "organiser@example.com", "Permissions")
    me = (await api_client.get("/api/me")).json()
    event = await make_event(api_client)
    member = await seed_member(superuser_engine, me["org"]["id"], "event-member@example.com")
    task = (
        await api_client.post(
            f"/api/events/{event['id']}/tasks",
            json={"title": "Prepare", "assignee_id": str(member)},
        )
    ).json()
    await api_client.post("/auth/logout")
    login = await api_client.post(
        "/auth/login", data={"username": "event-member@example.com", "password": PASSWORD}
    )
    assert login.status_code == 204, login.text
    detail = (await api_client.get(f"/api/events/{event['id']}")).json()
    assert detail["can_manage"] is False
    forbidden = await api_client.post(
        f"/api/events/{event['id']}/guests", json={"name": "No", "email": "no@example.com"}
    )
    assert forbidden.status_code == 403
    assert (
        await api_client.patch(f"/api/events/{event['id']}/tasks/{task['id']}", json={"done": True})
    ).status_code == 200
    assert (
        await api_client.delete(f"/api/events/{event['id']}/tasks/{task['id']}")
    ).status_code == 403
    own_event = await make_event(api_client)
    assert own_event["can_manage"] is True


async def test_tenant_rls_child_keys_and_public_token_tampering(
    api_client,
    app_session_factory,
    superuser_engine,
):
    await signup(api_client, "event-first@example.com", "First")
    first = (await api_client.get("/api/me")).json()
    event = await make_event(api_client)
    _, token = await guest_link(api_client, event)
    await api_client.post("/auth/logout")
    assert (await api_client.get("/api/events")).status_code == 401
    await signup(api_client, "event-second@example.com", "Second")
    second = (await api_client.get("/api/me")).json()
    assert (await api_client.get("/api/events")).json()["items"] == []
    assert (await api_client.get(f"/api/events/{event['id']}")).status_code == 404
    assert (
        await api_client.post(f"/api/events/{event['id']}/tasks", json={"title": "Leak"})
    ).status_code == 404
    tampered = f"{second['org']['id']}.{token.split('.')[1]}"
    assert (await api_client.get(f"/api/event-rsvp/{tampered}")).status_code == 404
    assert (await api_client.get("/api/event-rsvp/invalid")).status_code == 404
    async with app_session_factory() as session:
        for table in ("org_events", "event_guests", "event_tasks"):
            assert await session.scalar(text(f"select count(*) from {table}")) == 0
        await set_current_org(session, UUID(second["org"]["id"]))
        assert await session.scalar(text("select count(*) from org_events")) == 0
        await session.rollback()
    async with app_session_factory() as session:
        await set_current_org(session, UUID(first["org"]["id"]))
        with pytest.raises(DBAPIError):
            await session.execute(
                text("update org_events set org_id=:other where id=:id"),
                {"other": UUID(second["org"]["id"]), "id": UUID(event["id"])},
            )
        await session.rollback()
    async with superuser_engine.begin() as conn:
        with pytest.raises(DBAPIError):
            await conn.execute(
                text(
                    "insert into event_guests(org_id,event_id,name,email) "
                    "values (:org,:event,'Invalid','invalid@example.com')"
                ),
                {"org": UUID(second["org"]["id"]), "event": UUID(event["id"])},
            )
    async with superuser_engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "select relrowsecurity,relforcerowsecurity from pg_class "
                    "where relname in ('org_events','event_guests','event_tasks')"
                )
            )
        ).all()
        assert len(rows) == 3 and all(enabled and forced for enabled, forced in rows)


async def test_reminders_are_idempotent_and_cancelled_events_are_excluded(
    api_client,
    app_session_factory,
):
    await signup(api_client, "event-reminders@example.com", "Reminders")
    now = datetime.now(UTC)
    event = await make_event(
        api_client,
        starts_at=(now + timedelta(minutes=45)).isoformat(),
        ends_at=(now + timedelta(hours=2)).isoformat(),
    )
    await deliver_event_reminders(app_session_factory, now=now)
    await deliver_event_reminders(app_session_factory, now=now)
    notifications = (await api_client.get("/api/notifications")).json()
    assert notifications["unread_count"] == 2
    assert all(item["href"] == f"/events/{event['id']}" for item in notifications["items"])
    for item in notifications["items"]:
        await api_client.patch(f"/api/notifications/{item['id']}", json={"read": True})
    await deliver_event_reminders(app_session_factory, now=now)
    assert (await api_client.get("/api/notifications")).json()["unread_count"] == 0
    await api_client.post(
        f"/api/events/{event['id']}/status",
        json={"status": "cancelled", "revision": event["revision"]},
    )
    await deliver_event_reminders(app_session_factory, now=now + timedelta(minutes=10))
    assert len((await api_client.get("/api/notifications")).json()["items"]) == 2


async def test_capacity_cannot_drop_below_confirmed_and_reminders_stay_in_org(
    api_client,
    app_session_factory,
):
    await signup(api_client, "capacity-admin@example.com", "Capacity")
    event = await make_event(api_client)
    for email in ("one@example.com", "two@example.com"):
        _, token = await guest_link(api_client, event, email)
        await api_client.post(f"/api/event-rsvp/{token}/response", json={"response": "accepted"})
    smaller = await api_client.put(
        f"/api/events/{event['id']}",
        json={
            **event_input(capacity=1),
            "revision": event["revision"],
        },
    )
    assert smaller.status_code == 409
    assert smaller.json()["detail"] == "EVENT_CAPACITY_TOO_SMALL"
    await api_client.post("/auth/logout")
    await signup(api_client, "reminder-other@example.com", "Other")
    now = datetime.now(UTC)
    other = await make_event(
        api_client,
        starts_at=(now + timedelta(hours=2)).isoformat(),
        ends_at=(now + timedelta(hours=3)).isoformat(),
    )
    await deliver_event_reminders(app_session_factory, now=now)
    inbox = (await api_client.get("/api/notifications")).json()
    assert len(inbox["items"]) == 1
    assert inbox["items"][0]["href"] == f"/events/{other['id']}"
