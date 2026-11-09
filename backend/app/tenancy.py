"""Tenant context: app-layer scoping + the Postgres RLS GUC, hand in hand.

Every authenticated request resolves the user's Org (via their Membership —
one Org per User in v1), then pins ``app.current_org_id`` for the lifetime of
the request transaction. Because the setting is transaction-local it can never
leak onto another pooled connection; because the RLS policy reads it, even a
query that forgets its ``WHERE org_id = ...`` cannot cross tenants.
"""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Membership, Org, User
from app.rls import set_current_org
from app.users import CurrentUserDep


@dataclass
class TenantContext:
    user: User
    org: Org
    membership: Membership


async def load_membership_with_org(
    session: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID | None = None
) -> tuple[Membership, Org] | None:
    """One selected membership, or the user's oldest membership by default."""
    statement = select(Membership, Org).join(Org, Membership.org_id == Org.id).where(
        Membership.user_id == user_id
    )
    if org_id is not None:
        statement = statement.where(Membership.org_id == org_id)
    else:
        statement = statement.order_by(Membership.created_at)
    row = (await session.execute(statement)).first()
    return (row[0], row[1]) if row is not None else None


async def get_tenant_context(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    x_organization_id: Annotated[uuid.UUID | None, Header()] = None,
) -> TenantContext:
    loaded = await load_membership_with_org(session, user.id, x_organization_id)
    if loaded is None and x_organization_id is not None:
        # The browser may retain a previous user's selected organisation.
        # Fall back to this user's default membership rather than trusting it.
        loaded = await load_membership_with_org(session, user.id)
    if loaded is None:
        raise HTTPException(status_code=403, detail="ORGANIZATION_ACCESS_DENIED")
    membership, org = loaded
    await set_current_org(session, membership.org_id)
    await session.execute(
        text("select set_config('app.current_user_id', :user_id, true)"),
        {"user_id": str(user.id)},
    )
    return TenantContext(user=user, org=org, membership=membership)


TenantContextDep = Annotated[TenantContext, Depends(get_tenant_context)]
