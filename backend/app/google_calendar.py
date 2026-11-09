"""Small server-side Google OAuth, Calendar and Gmail client.

No browser token is ever returned.  Refresh tokens are Fernet-encrypted before
they touch Postgres; a missing/invalid configuration is a recoverable API error.
"""

import base64
import json
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from urllib.parse import quote, urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from app.config import settings
from app.models import GoogleConnection, SystemMailbox

SCOPES = (
    "openid email https://www.googleapis.com/auth/calendar.events "
    "https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/gmail.send"
)
SYSTEM_MAILBOX_SCOPES = "openid email https://www.googleapis.com/auth/gmail.send"


def _fernet() -> Fernet:
    if not settings.google_token_encryption_key:
        raise HTTPException(503, "GOOGLE_NOT_CONFIGURED")
    try:
        return Fernet(settings.google_token_encryption_key.encode())
    except ValueError as exc:
        raise HTTPException(503, "GOOGLE_NOT_CONFIGURED") from exc


def encrypt(value: str) -> bytes:
    return _fernet().encrypt(value.encode())


def decrypt(value: bytes) -> str:
    try:
        return _fernet().decrypt(value).decode()
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise HTTPException(409, "GOOGLE_RECONNECT_REQUIRED") from exc


def make_state(payload: dict[str, str]) -> str:
    return encrypt(json.dumps(payload, separators=(",", ":"))).decode()


def read_state(value: str) -> dict[str, str]:
    try:
        payload = json.loads(decrypt(value.encode()))
    except (json.JSONDecodeError, HTTPException) as exc:
        raise HTTPException(400, "INVALID_GOOGLE_STATE") from exc
    if not {"org_id", "user_id"}.issubset(payload):
        raise HTTPException(400, "INVALID_GOOGLE_STATE")
    return payload


def authorization_url(state: str, redirect_uri: str | None = None, scopes: str = SCOPES) -> str:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(503, "GOOGLE_NOT_CONFIGURED")
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri or settings.google_redirect_uri,
            "response_type": "code",
            "scope": scopes,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )


async def exchange_code(code: str, redirect_uri: str | None = None) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri or settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if response.is_error:
        raise HTTPException(400, "GOOGLE_OAUTH_FAILED")
    return response.json()


async def access_token(session, connection: GoogleConnection | SystemMailbox) -> str:
    if connection.encrypted_access_token and connection.access_token_expires_at:
        if connection.access_token_expires_at > datetime.now(UTC) + timedelta(seconds=60):
            return decrypt(connection.encrypted_access_token)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": decrypt(connection.encrypted_refresh_token),
                "grant_type": "refresh_token",
            },
        )
    if response.is_error:
        raise HTTPException(409, "GOOGLE_RECONNECT_REQUIRED")
    token = response.json()
    connection.encrypted_access_token = encrypt(token["access_token"])
    connection.access_token_expires_at = datetime.now(UTC) + timedelta(
        seconds=int(token.get("expires_in", 3600))
    )
    connection.updated_at = datetime.now(UTC)
    await session.flush()
    return token["access_token"]


async def google_json(token: str, method: str, url: str, payload: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.request(
            method, url, headers={"Authorization": f"Bearer {token}"}, json=payload
        )
    if response.is_error:
        raise HTTPException(502, "GOOGLE_API_FAILED")
    return response.json()


async def delete_calendar_event(token: str, event_id: str) -> None:
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/"
        f"{quote(event_id, safe='')}?sendUpdates=all"
    )
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.delete(url, headers={"Authorization": f"Bearer {token}"})
    if response.status_code in (404, 410):
        return
    if response.is_error:
        raise HTTPException(502, "GOOGLE_API_FAILED")


def booking_message(booking_url: str, candidate_name: str, title: str) -> str:
    return (
        f"سلام {candidate_name}،\n\n"
        f"برای هماهنگی «{title}» لطفاً از لینک زیر یک زمان پیشنهادی را انتخاب کنید:\n"
        f"{booking_url}\n\n"
        "پس از انتخاب، دعوت‌نامهٔ تقویم و لینک Google Meet برای شما ارسال می‌شود."
    )


async def send_booking_email(token: str, recipient: str, subject: str, body: str) -> None:
    await send_email(token, recipient, subject, body)


async def send_email(token: str, recipient: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
    await google_json(
        token, "POST", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {"raw": raw}
    )


async def revoke_google_token(token: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/revoke", data={"token": token}
            )
    except httpx.RequestError as exc:
        raise HTTPException(502, "GOOGLE_TOKEN_REVOKE_FAILED") from exc
    if response.status_code not in (200, 400):
        raise HTTPException(502, "GOOGLE_TOKEN_REVOKE_FAILED")
