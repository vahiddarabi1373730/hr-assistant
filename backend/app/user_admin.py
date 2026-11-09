"""Organization user administration and the org-designated Gmail mailbox."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi_users import InvalidPasswordException
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.config import settings
from app.db import get_session
from app.google_calendar import (
    SYSTEM_MAILBOX_SCOPES,
    access_token,
    authorization_url,
    decrypt,
    encrypt,
    exchange_code,
    google_json,
    make_state,
    read_state,
    revoke_google_token,
    send_email,
)
from app.models import (
    AccessToken,
    GoogleConnection,
    Membership,
    MembershipRole,
    OrgActivity,
    OrgInvitation,
    SystemMailbox,
    User,
)
from app.profiles import lock_org
from app.rls import set_current_org
from app.tenancy import TenantContext, TenantContextDep
from app.users import UserManagerDep

router = APIRouter(tags=["user administration"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]
_INVITE_LIFETIME = timedelta(days=7)


class UserItem(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    is_verified: bool
    joined_at: datetime


class InvitationItem(BaseModel):
    id: uuid.UUID
    email: str
    expires_at: datetime
    created_at: datetime
    expired: bool


class UsersResponse(BaseModel):
    users: list[UserItem]
    invitations: list[InvitationItem]


class InviteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr


class AcceptInvitationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=30, max_length=160)
    password: str = Field(min_length=1, max_length=1024)


class MailboxStatus(BaseModel):
    connected: bool
    email: str | None


def _require_admin(ctx: TenantContext) -> None:
    if ctx.membership.role != MembershipRole.ADMIN:
        raise HTTPException(403, "ADMIN_REQUIRED")


def _invite_token(
    org_id: uuid.UUID, invitation_id: uuid.UUID | None = None
) -> tuple[str, str, uuid.UUID]:
    invitation_id = invitation_id or uuid.uuid4()
    secret = secrets.token_urlsafe(32)
    return (
        f"{org_id}.{invitation_id}.{secret}",
        hashlib.sha256(secret.encode()).hexdigest(),
        invitation_id,
    )


def _parse_invite_token(token: str) -> tuple[uuid.UUID, uuid.UUID, str]:
    try:
        org_id, invitation_id, secret = token.split(".", 2)
        parsed_org_id = uuid.UUID(org_id)
        parsed_id = uuid.UUID(invitation_id)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(400, "INVALID_INVITATION") from exc
    if len(secret) < 32 or len(secret) > 100:
        raise HTTPException(400, "INVALID_INVITATION")
    return parsed_org_id, parsed_id, hashlib.sha256(secret.encode()).hexdigest()


async def send_system_email(
    session: AsyncSession, org_id: uuid.UUID, recipient: str, subject: str, body: str
) -> None:
    connection = await session.get(SystemMailbox, org_id)
    if connection is None:
        raise HTTPException(409, "SYSTEM_MAILBOX_NOT_CONNECTED")
    token = await access_token(session, connection)
    await send_email(token, recipient, subject, body)


async def _deliver_invitation(
    session: AsyncSession, invitation: OrgInvitation, org_name: str
) -> None:
    token, token_hash, _ = _invite_token(invitation.org_id, invitation.id)
    invitation.token_hash = token_hash
    invitation.expires_at = datetime.now(UTC) + _INVITE_LIFETIME
    await session.flush()
    await session.commit()

    await set_current_org(session, invitation.org_id)
    link = f"{settings.public_frontend_url.rstrip('/')}/accept-invite?token={quote(token, safe='')}"
    await send_system_email(
        session,
        invitation.org_id,
        invitation.email,
        f"دعوت به فضای کار {org_name}",
        f"سلام،\n\nشما به فضای کار «{org_name}» دعوت شده‌اید. "
        f"برای پیوستن و ساخت گذرواژه، تا ۷ روز آینده از این پیوند استفاده کنید:\n{link}\n\n"
        "این دعوت را فقط در صورتی بپذیرید که منتظر آن بوده‌اید.",
    )
    session.add(
        OrgActivity(
            org_id=invitation.org_id,
            actor_user_id=invitation.invited_by,
            event_type="user_invited",
            data={"email": invitation.email},
        )
    )
    await session.commit()


@router.get("/api/admin/users", response_model=UsersResponse)
async def list_org_users(ctx: TenantContextDep, session: SessionDep) -> UsersResponse:
    _require_admin(ctx)
    rows = (
        await session.execute(
            select(
                User.id,
                User.email,
                User.is_active,
                User.is_verified,
                Membership.role,
                Membership.created_at,
            )
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.org_id == ctx.org.id)
            .order_by(User.is_active.desc(), User.email)
        )
    ).all()
    now = datetime.now(UTC)
    invitations = (
        await session.scalars(
            select(OrgInvitation)
            .where(
                OrgInvitation.org_id == ctx.org.id,
                OrgInvitation.accepted_at.is_(None),
            )
            .order_by(OrgInvitation.created_at.desc())
        )
    ).all()
    return UsersResponse(
        users=[
            UserItem(
                id=user_id,
                email=email,
                role=role.value,
                is_active=is_active,
                is_verified=is_verified,
                joined_at=joined_at,
            )
            for user_id, email, is_active, is_verified, role, joined_at in rows
        ],
        invitations=[
            InvitationItem(
                id=invite.id,
                email=invite.email,
                expires_at=invite.expires_at,
                created_at=invite.created_at,
                expired=invite.expires_at <= now,
            )
            for invite in invitations
        ],
    )


@router.get("/api/admin/system-mailbox", response_model=MailboxStatus)
async def get_system_mailbox(ctx: TenantContextDep, session: SessionDep) -> MailboxStatus:
    _require_admin(ctx)
    email = await session.scalar(
        select(SystemMailbox.google_email).where(SystemMailbox.org_id == ctx.org.id)
    )
    return MailboxStatus(
        connected=email is not None,
        email=email,
    )


@router.post("/api/admin/system-mailbox/connect")
async def connect_system_mailbox(ctx: TenantContextDep) -> dict[str, str]:
    _require_admin(ctx)
    state = make_state(
        {
            "org_id": str(ctx.org.id),
            "user_id": str(ctx.user.id),
            "purpose": "system_mailbox",
        }
    )
    return {
        "authorization_url": authorization_url(
            state,
            redirect_uri=settings.google_system_mailbox_redirect_uri,
            scopes=SYSTEM_MAILBOX_SCOPES,
        )
    }


@router.get("/api/system-mailbox/google/callback")
async def system_mailbox_callback(
    session: SessionDep,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    frontend = settings.public_frontend_url.rstrip("/")
    if error or not code or not state:
        return RedirectResponse(f"{frontend}/settings/users?mailbox=error")
    try:
        payload = read_state(state)
        if payload.get("purpose") != "system_mailbox":
            raise HTTPException(400, "INVALID_GOOGLE_STATE")
        org_id = uuid.UUID(payload["org_id"])
        user_id = uuid.UUID(payload["user_id"])
        actor_id = await session.scalar(
            select(User.id)
            .join(Membership, Membership.user_id == User.id)
            .where(
                User.id == user_id,
                User.is_active.is_(True),
                Membership.org_id == org_id,
                Membership.role == MembershipRole.ADMIN,
            )
        )
        if actor_id is None:
            raise HTTPException(403, "ADMIN_REQUIRED")

        await set_current_org(session, org_id)
        connection = await session.get(SystemMailbox, org_id)
        token_data = await exchange_code(
            code, redirect_uri=settings.google_system_mailbox_redirect_uri
        )
        access = token_data.get("access_token")
        refresh = token_data.get("refresh_token")
        if not access:
            raise HTTPException(400, "GOOGLE_OAUTH_FAILED")
        if not refresh and connection is None:
            raise HTTPException(400, "GOOGLE_REFRESH_TOKEN_MISSING")
        if not refresh and connection is not None:
            refresh = decrypt(connection.encrypted_refresh_token)
        profile = await google_json(access, "GET", "https://www.googleapis.com/oauth2/v2/userinfo")
        email = profile.get("email")
        if not email or profile.get("verified_email") is not True:
            raise HTTPException(400, "GOOGLE_EMAIL_NOT_VERIFIED")
        if connection is not None and connection.google_email.lower() != email.lower():
            await revoke_google_token(decrypt(connection.encrypted_refresh_token))

        expires_at = datetime.now(UTC) + timedelta(seconds=int(token_data.get("expires_in", 3600)))
        if connection is None:
            connection = SystemMailbox(
                org_id=org_id,
                google_email=email,
                encrypted_refresh_token=encrypt(refresh),
                encrypted_access_token=encrypt(access),
                access_token_expires_at=expires_at,
            )
            session.add(connection)
        else:
            connection.google_email = email
            connection.encrypted_refresh_token = encrypt(refresh)
            connection.encrypted_access_token = encrypt(access)
            connection.access_token_expires_at = expires_at
            connection.updated_at = datetime.now(UTC)
        session.add(
            OrgActivity(
                org_id=org_id,
                actor_user_id=actor_id,
                event_type="system_mailbox_connected",
                data={"email": email},
            )
        )
        await session.commit()
        return RedirectResponse(f"{frontend}/settings/users?mailbox=connected")
    except HTTPException as exc:
        await session.rollback()
        reason = exc.detail if isinstance(exc.detail, str) else "GOOGLE_OAUTH_FAILED"
        return RedirectResponse(
            f"{frontend}/settings/users?mailbox=error&reason={quote(reason, safe='')}"
        )
    except ValueError, KeyError:
        await session.rollback()
        return RedirectResponse(f"{frontend}/settings/users?mailbox=error")


@router.post("/api/admin/invitations", status_code=201)
async def invite_member(
    body: InviteInput,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict[str, str]:
    _require_admin(ctx)
    email = str(body.email).strip().lower()
    mailbox_org_id = await session.scalar(
        select(SystemMailbox.org_id).where(SystemMailbox.org_id == ctx.org.id)
    )
    if mailbox_org_id is None:
        raise HTTPException(409, "SYSTEM_MAILBOX_NOT_CONNECTED")
    if await session.scalar(select(User.id).where(func.lower(User.email) == email)) is not None:
        raise HTTPException(409, "USER_ALREADY_EXISTS")

    await lock_org(session, ctx.org.id)
    invitation = await session.scalar(
        select(OrgInvitation)
        .where(OrgInvitation.org_id == ctx.org.id, OrgInvitation.email == email)
        .with_for_update()
    )
    if invitation is not None and invitation.accepted_at is not None:
        raise HTTPException(409, "USER_ALREADY_EXISTS")
    if invitation is None:
        _, token_hash, invitation_id = _invite_token(ctx.org.id)
        invitation = OrgInvitation(
            id=invitation_id,
            org_id=ctx.org.id,
            email=email,
            token_hash=token_hash,
            invited_by=ctx.user.id,
            expires_at=datetime.now(UTC) + _INVITE_LIFETIME,
        )
        session.add(invitation)
    else:
        invitation.invited_by = ctx.user.id
        invitation.created_at = datetime.now(UTC)
    await _deliver_invitation(session, invitation, ctx.org.name)
    return {"email": email, "status": "sent"}


@router.post("/api/admin/invitations/{invitation_id}/resend")
async def resend_invitation(
    invitation_id: uuid.UUID,
    ctx: TenantContextDep,
    session: SessionDep,
) -> dict[str, str]:
    _require_admin(ctx)
    invitation = await session.scalar(
        select(OrgInvitation)
        .where(
            OrgInvitation.id == invitation_id,
            OrgInvitation.org_id == ctx.org.id,
            OrgInvitation.accepted_at.is_(None),
        )
        .with_for_update()
    )
    if invitation is None:
        raise HTTPException(404, "INVITATION_NOT_FOUND")
    invitation.invited_by = ctx.user.id
    invitation.created_at = datetime.now(UTC)
    await _deliver_invitation(session, invitation, ctx.org.name)
    return {"email": invitation.email, "status": "sent"}


@router.post("/api/invitations/accept")
async def accept_invitation(
    body: AcceptInvitationInput,
    session: SessionDep,
    user_manager: UserManagerDep,
) -> dict[str, str]:
    org_id, invitation_id, token_hash = _parse_invite_token(body.token)
    await set_current_org(session, org_id)
    invitation = await session.scalar(
        select(OrgInvitation)
        .where(
            OrgInvitation.id == invitation_id,
            OrgInvitation.org_id == org_id,
            OrgInvitation.token_hash == token_hash,
        )
        .with_for_update()
    )
    if invitation is None or invitation.accepted_at is not None:
        raise HTTPException(400, "INVALID_INVITATION")
    if invitation.expires_at <= datetime.now(UTC):
        raise HTTPException(410, "INVITATION_EXPIRED")
    if (
        await session.scalar(select(User.id).where(func.lower(User.email) == invitation.email))
        is not None
    ):
        raise HTTPException(409, "USER_ALREADY_EXISTS")
    try:
        await user_manager.validate_password(body.password, body)
    except InvalidPasswordException as exc:
        raise HTTPException(
            400,
            {"code": "REGISTER_INVALID_PASSWORD", "reason": exc.reason},
        ) from exc

    user = User(
        email=invitation.email,
        hashed_password=user_manager.password_helper.hash(body.password),
        is_active=True,
        is_verified=True,
    )
    session.add(user)
    await session.flush()
    session.add_all(
        [
            Membership(
                user_id=user.id,
                org_id=invitation.org_id,
                role=MembershipRole.MEMBER,
            ),
            OrgActivity(
                org_id=invitation.org_id,
                actor_user_id=user.id,
                event_type="invitation_accepted",
                data={"email": invitation.email},
            ),
        ]
    )
    invitation.accepted_at = datetime.now(UTC)
    await session.commit()
    return {"status": "accepted"}


@router.post("/api/admin/users/{user_id}/deactivate", status_code=204)
async def deactivate_user(
    user_id: uuid.UUID,
    ctx: TenantContextDep,
    session: SessionDep,
) -> None:
    _require_admin(ctx)
    if user_id == ctx.user.id:
        raise HTTPException(409, "CANNOT_DEACTIVATE_SELF")

    await lock_org(session, ctx.org.id)
    target = await session.scalar(
        select(User)
        .options(load_only(User.id, User.email, User.is_active))
        .join(Membership, Membership.user_id == User.id)
        .where(User.id == user_id, Membership.org_id == ctx.org.id)
        .with_for_update(of=User)
    )
    if target is None:
        raise HTTPException(404, "USER_NOT_FOUND")
    if not target.is_active:
        raise HTTPException(409, "USER_ALREADY_INACTIVE")
    if (
        await session.scalar(
            select(Membership.id).where(
                Membership.org_id == ctx.org.id,
                Membership.user_id == user_id,
                Membership.role == MembershipRole.ADMIN,
            )
        )
        is not None
    ):
        active_admins = await session.scalar(
            select(func.count())
            .select_from(Membership)
            .join(User, User.id == Membership.user_id)
            .where(
                Membership.org_id == ctx.org.id,
                Membership.role == MembershipRole.ADMIN,
                User.is_active.is_(True),
            )
        )
        if active_admins <= 1:
            raise HTTPException(409, "LAST_ACTIVE_ADMIN")

    connection = await session.scalar(
        select(GoogleConnection).where(
            GoogleConnection.org_id == ctx.org.id,
            GoogleConnection.user_id == target.id,
        )
    )
    if connection is not None:
        await revoke_google_token(decrypt(connection.encrypted_refresh_token))
        await session.delete(connection)
    await session.execute(delete(AccessToken).where(AccessToken.user_id == target.id))
    target.is_active = False
    session.add(
        OrgActivity(
            org_id=ctx.org.id,
            actor_user_id=ctx.user.id,
            event_type="user_deactivated",
            data={"user_id": str(target.id), "email": target.email},
        )
    )
    await session.commit()
