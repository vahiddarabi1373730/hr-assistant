"""Organization invites, access boundaries and deactivate-only member removal."""

import re
from urllib.parse import unquote

import sqlalchemy as sa

PASSWORD = "correct-horse-battery"


async def test_admin_list_and_unconnected_mailbox_status(api_client):
    """Both settings reads must work before any Gmail account is connected."""
    for path in ("/api/admin/users", "/api/admin/system-mailbox"):
        assert (await api_client.get(path)).status_code == 401
    await api_client.post(
        "/auth/signup",
        json={
            "email": "admin-settings@example.com",
            "password": PASSWORD,
            "org_name": "Settings",
        },
    )
    listed = await api_client.get("/api/admin/users")
    assert listed.status_code == 200, listed.text
    assert len(listed.json()["users"]) == 1
    assert listed.json()["users"][0]["email"] == "admin-settings@example.com"
    assert listed.json()["invitations"] == []
    mailbox = await api_client.get("/api/admin/system-mailbox")
    assert mailbox.status_code == 200, mailbox.text
    assert mailbox.json() == {"connected": False, "email": None}


async def test_invite_accept_and_deactivate_preserves_membership(
    api_client, superuser_engine, monkeypatch
):
    sent_messages: list[tuple[str, str]] = []

    async def fake_send_system_email(session, org_id, recipient, subject, body):
        sent_messages.append((subject, body))

    monkeypatch.setattr("app.user_admin.send_system_email", fake_send_system_email)
    signup = await api_client.post(
        "/auth/signup",
        json={
            "email": "owner@example.com",
            "password": PASSWORD,
            "org_name": "Invite Test",
        },
    )
    assert signup.status_code == 201, signup.text
    me = await api_client.get("/api/me")
    org_id = me.json()["org"]["id"]

    async with superuser_engine.begin() as conn:
        await conn.execute(
            sa.text(
                "insert into system_mailboxes (org_id, google_email, encrypted_refresh_token) "
                "values (:org_id, 'system@example.com', :token)"
            ),
            {"org_id": org_id, "token": b"test-token"},
        )

    verification_request = await api_client.post(
        "/auth/request-verify-token", json={"email": "owner@example.com"}
    )
    assert verification_request.status_code == 202
    assert sent_messages[-1][0] == "تأیید رایانامه"
    verify_match = re.search(r"/verify-email\?token=([^\s]+)", sent_messages[-1][1])
    assert verify_match
    verified = await api_client.post("/auth/verify", json={"token": unquote(verify_match.group(1))})
    assert verified.status_code == 200, verified.text

    reset_request = await api_client.post(
        "/auth/forgot-password", json={"email": "owner@example.com"}
    )
    assert reset_request.status_code == 202
    assert sent_messages[-1][0] == "بازیابی گذرواژه"
    reset_match = re.search(r"/reset-password\?token=([^\s]+)", sent_messages[-1][1])
    assert reset_match
    reset = await api_client.post(
        "/auth/reset-password",
        json={"token": unquote(reset_match.group(1)), "password": PASSWORD},
    )
    assert reset.status_code == 200, reset.text

    invite = await api_client.post(
        "/api/admin/invitations", json={"email": "member@example.com", "role": "admin"}
    )
    assert invite.status_code == 201, invite.text
    assert sent_messages
    match = re.search(r"/accept-invite\?token=([^\s]+)", sent_messages[-1][1])
    assert match
    token = unquote(match.group(1))

    accepted = await api_client.post(
        "/api/invitations/accept",
        json={"token": token, "password": PASSWORD},
    )
    assert accepted.status_code == 200, accepted.text

    async with superuser_engine.connect() as conn:
        member = (
            await conn.execute(
                sa.text(
                    "select u.id, u.is_active, u.is_verified, m.role "
                    "from users u join memberships m on m.user_id = u.id "
                    "where u.email = 'member@example.com' and m.org_id = :org_id"
                ),
                {"org_id": org_id},
            )
        ).one()
        assert member.is_active is True
        assert member.is_verified is True
        assert member.role == "admin"

    deactivated = await api_client.post(f"/api/admin/users/{member.id}/deactivate")
    assert deactivated.status_code == 204, deactivated.text

    async with superuser_engine.connect() as conn:
        status = (
            await conn.execute(
                sa.text(
                    "select u.is_active, m.role from users u "
                    "join memberships m on m.user_id = u.id "
                    "where u.id = :user_id"
                ),
                {"user_id": member.id},
            )
        ).one()
        assert status == (False, "member")
        activities = (
            (
                await conn.execute(
                    sa.text(
                        "select event_type from org_activity where org_id = :org_id order by id"
                    ),
                    {"org_id": org_id},
                )
            )
            .scalars()
            .all()
        )
        assert activities[-2:] == ["invitation_accepted", "user_deactivated"]

    listed = await api_client.get("/api/admin/users")
    assert listed.status_code == 200, listed.text
    member_item = next(user for user in listed.json()["users"] if user["id"] == str(member.id))
    assert member_item["is_active"] is False

    reused = await api_client.post(
        "/api/invitations/accept",
        json={"token": token, "password": PASSWORD},
    )
    assert reused.status_code == 400


async def test_user_can_create_another_organization(api_client):
    first = await api_client.post(
        "/auth/signup",
        json={
            "email": "second-org-owner@example.com",
            "password": PASSWORD,
            "org_name": "First Company",
        },
    )
    assert first.status_code == 201, first.text

    created = await api_client.post(
        "/api/organizations",
        json={"name": "Second Company"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["name"] == "Second Company"

    me = await api_client.get(
        "/api/me",
        headers={"X-Organization-ID": created.json()["id"]},
    )
    assert me.status_code == 200, me.text
    assert me.json()["org"]["name"] == "Second Company"
    assert len(me.json()["organizations"]) == 2


async def test_member_cannot_access_admin_user_management(api_client, superuser_engine):
    signup = await api_client.post(
        "/auth/signup",
        json={
            "email": "member-admin-check@example.com",
            "password": PASSWORD,
            "org_name": "Member Access",
        },
    )
    assert signup.status_code == 201, signup.text
    async with superuser_engine.begin() as conn:
        await conn.execute(
            sa.text(
                "update memberships set role = 'member' where user_id = "
                "(select id from users where email = 'member-admin-check@example.com')"
            )
        )

    response = await api_client.get("/api/admin/users")
    assert response.status_code == 403
    assert response.json()["detail"] == "ADMIN_REQUIRED"

    invite = await api_client.post("/api/admin/invitations", json={"email": "blocked@example.com"})
    assert invite.status_code == 403
    assert invite.json()["detail"] == "ADMIN_REQUIRED"


async def test_admin_adds_existing_account_and_changes_its_role(api_client, superuser_engine):
    owner = await api_client.post(
        "/auth/signup",
        json={
            "email": "transfer-owner@example.com",
            "password": PASSWORD,
            "org_name": "Destination",
        },
    )
    assert owner.status_code == 201, owner.text

    await api_client.post("/auth/logout")
    existing = await api_client.post(
        "/auth/signup",
        json={
            "email": "existing-account@example.com",
            "password": PASSWORD,
            "org_name": "Accidental organisation",
        },
    )
    assert existing.status_code == 201, existing.text
    original_org_id = existing.json()["org"]["id"]

    await api_client.post("/auth/logout")
    login = await api_client.post(
        "/auth/login",
        data={"username": "transfer-owner@example.com", "password": PASSWORD},
    )
    assert login.status_code == 204, login.text

    added = await api_client.post(
        "/api/admin/users/transfer",
        json={"email": "existing-account@example.com", "role": "member"},
    )
    assert added.status_code == 201, added.text
    assert added.json()["status"] == "added"
    async with superuser_engine.connect() as conn:
        original_membership = await conn.scalar(
            sa.text(
                "select exists(select 1 from memberships "
                "where user_id = :user_id and org_id = :org_id)"
            ),
            {"user_id": existing.json()["id"], "org_id": original_org_id},
        )
        assert original_membership is True

    listed = await api_client.get("/api/admin/users")
    assert listed.status_code == 200, listed.text
    existing_user = next(
        user for user in listed.json()["users"] if user["email"] == "existing-account@example.com"
    )
    assert existing_user["role"] == "member"

    promoted = await api_client.patch(
        f"/api/admin/users/{existing_user['id']}/role", json={"role": "admin"}
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json() == {"status": "updated", "role": "admin"}


async def test_admin_cannot_change_own_role_or_transfer_unknown_account(api_client):
    signup = await api_client.post(
        "/auth/signup",
        json={
            "email": "role-owner@example.com",
            "password": PASSWORD,
            "org_name": "Role guard",
        },
    )
    assert signup.status_code == 201, signup.text
    owner_id = signup.json()["id"]

    own_role = await api_client.patch(f"/api/admin/users/{owner_id}/role", json={"role": "member"})
    assert own_role.status_code == 409
    assert own_role.json()["detail"] == "CANNOT_CHANGE_OWN_ROLE"

    unknown = await api_client.post(
        "/api/admin/users/transfer",
        json={"email": "missing@example.com", "role": "member"},
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "EXISTING_USER_NOT_FOUND"
