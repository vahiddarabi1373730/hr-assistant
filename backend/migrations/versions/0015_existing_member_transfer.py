"""Allow the app role to transfer memberships and change member roles.

Revision ID: 0015
Revises: 0014
"""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep the application role least-privileged: user administration needs to
    # change only the organisation and role fields of a membership.
    op.execute("grant update(org_id, role) on memberships to hr_app")


def downgrade() -> None:
    op.execute("revoke update(org_id, role) on memberships from hr_app")
