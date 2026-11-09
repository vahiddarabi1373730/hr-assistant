"""Independent organisational events, invitees and preparation checklist.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "org_events",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organiser_id", UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("location", sa.Text(), nullable=False, server_default=""),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("capacity", sa.Integer()),
        sa.Column("budget_toman", sa.BigInteger()),
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("org_id", "id"),
        sa.ForeignKeyConstraint(
            ["org_id", "organiser_id"], ["memberships.org_id", "memberships.user_id"]
        ),
        sa.CheckConstraint("ends_at > starts_at"),
        sa.CheckConstraint("capacity is null or capacity > 0"),
        sa.CheckConstraint("budget_toman is null or budget_toman >= 0"),
        sa.CheckConstraint("status in ('draft','published','completed','cancelled')"),
    )
    op.create_table(
        "event_guests",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("response", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("attended", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("token_hash", sa.String(64), unique=True),
        sa.Column("rating", sa.Integer()),
        sa.Column("feedback", sa.Text()),
        sa.UniqueConstraint("org_id", "event_id", "email"),
        sa.ForeignKeyConstraint(
            ["org_id", "event_id"], ["org_events.org_id", "org_events.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint("response in ('pending','accepted','declined')"),
        sa.CheckConstraint("rating is null or rating between 1 and 5"),
    )
    op.create_table(
        "event_tasks",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("assignee_id", UUID()),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(
            ["org_id", "event_id"], ["org_events.org_id", "org_events.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["org_id", "assignee_id"], ["memberships.org_id", "memberships.user_id"]
        ),
    )
    op.create_index("org_events_schedule_idx", "org_events", ["org_id", "status", "starts_at"])
    op.create_index("org_events_organiser_idx", "org_events", ["org_id", "organiser_id"])
    op.create_index("event_tasks_event_idx", "event_tasks", ["org_id", "event_id"])
    op.create_index("event_tasks_assignee_idx", "event_tasks", ["org_id", "assignee_id"])
    scope = "org_id=(select nullif(current_setting('app.current_org_id',true),'')::uuid)"
    for table in ("org_events", "event_guests", "event_tasks"):
        op.execute(f"alter table {table} enable row level security")
        op.execute(f"alter table {table} force row level security")
        op.execute(f"revoke all on {table} from public")
        op.execute(
            f"create policy {table}_isolation on {table} for all to hr_app "
            f"using ({scope}) with check ({scope})"
        )
        op.execute(f"grant select,insert on {table} to hr_app")
    op.execute(
        "grant update(title,description,location,starts_at,ends_at,capacity,budget_toman,"
        "status,revision) on org_events to hr_app"
    )
    op.execute(
        "grant update(response,attended,token_hash,rating,feedback) on event_guests to hr_app"
    )
    op.execute("grant update(done) on event_tasks to hr_app")
    op.execute("grant delete on event_guests,event_tasks to hr_app")


def downgrade():
    op.drop_table("event_tasks")
    op.drop_table("event_guests")
    op.drop_table("org_events")
