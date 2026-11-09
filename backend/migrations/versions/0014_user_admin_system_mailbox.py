"""System mailbox, invitations and user deactivation grants.

Revision ID: 0014
Revises: 0013
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def _tenant_table(table: str) -> None:
    op.execute(f"alter table {table} enable row level security")
    op.execute(f"alter table {table} force row level security")
    op.execute(
        f"""
        create policy {table}_tenant_isolation on {table}
            for all to hr_app
            using (
                org_id = (select nullif(current_setting('app.current_org_id', true), '')::uuid)
            )
            with check (
                org_id = (select nullif(current_setting('app.current_org_id', true), '')::uuid)
            )
        """
    )


def upgrade() -> None:
    op.create_table(
        "org_invitations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("org_id", "email", name="org_invitations_org_email_key"),
        sa.UniqueConstraint("token_hash", name="org_invitations_token_hash_key"),
    )
    op.create_index("org_invitations_org_id_idx", "org_invitations", ["org_id"])
    op.create_table(
        "system_mailboxes",
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("google_email", sa.Text(), nullable=False),
        sa.Column("encrypted_refresh_token", sa.LargeBinary(), nullable=False),
        sa.Column("encrypted_access_token", sa.LargeBinary(), nullable=True),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    for table in ("org_invitations", "system_mailboxes"):
        _tenant_table(table)
    op.execute("grant select, insert, delete on org_invitations to hr_app")
    op.execute(
        "grant update(token_hash, invited_by, created_at, expires_at, accepted_at) "
        "on org_invitations to hr_app"
    )
    op.execute("grant select, insert, delete on system_mailboxes to hr_app")
    op.execute(
        "grant update(google_email, encrypted_refresh_token, encrypted_access_token, "
        "access_token_expires_at, updated_at) on system_mailboxes to hr_app"
    )
    op.execute("grant update(is_active, is_verified, hashed_password) on users to hr_app")


def downgrade() -> None:
    op.execute("revoke update(is_active, is_verified, hashed_password) on users from hr_app")
    op.drop_table("system_mailboxes")
    op.drop_index("org_invitations_org_id_idx", table_name="org_invitations")
    op.drop_table("org_invitations")
