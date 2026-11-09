"""Allow a user to belong to more than one organisation.

Revision ID: 0017
Revises: 0016
"""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table memberships drop constraint memberships_user_id_key")
    op.execute("revoke update(org_id, role) on memberships from hr_app")
    op.execute("grant update(role) on memberships to hr_app")


def downgrade() -> None:
    op.execute("revoke update(role) on memberships from hr_app")
    op.execute("grant update(org_id, role) on memberships to hr_app")
    op.execute("alter table memberships add constraint memberships_user_id_key unique(user_id)")
