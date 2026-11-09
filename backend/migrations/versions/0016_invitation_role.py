"""Persist the role selected for an organisation invitation.

Revision ID: 0016
Revises: 0015
"""

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing invitations keep the original behaviour: they create members.
    op.execute(
        "alter table org_invitations add column role membership_role not null default 'member'"
    )


def downgrade() -> None:
    op.execute("alter table org_invitations drop column role")
