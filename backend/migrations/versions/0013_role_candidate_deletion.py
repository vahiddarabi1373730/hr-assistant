"""Allow tenant-scoped deletion of Roles and linked Applications.

Revision ID: 0013
Revises: 0012
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("grant delete on roles to hr_app")
    op.execute("grant delete on candidate_applications to hr_app")


def downgrade() -> None:
    op.execute("revoke delete on candidate_applications from hr_app")
    op.execute("revoke delete on roles from hr_app")
