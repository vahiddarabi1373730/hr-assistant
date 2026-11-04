"""Google-backed interview booking pages.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

ORG = "org_id=(select nullif(current_setting('app.current_org_id',true),'')::uuid)"


def tenant_table(table: str) -> None:
    op.execute(f"alter table {table} enable row level security")
    op.execute(f"alter table {table} force row level security")
    op.execute(f"revoke all on {table} from public")
    op.execute(
        f"create policy {table}_isolation on {table} for all to hr_app "
        f"using ({ORG}) with check ({ORG})"
    )


def upgrade() -> None:
    op.create_table(
        "google_connections",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("google_email", sa.Text()),
        sa.Column("encrypted_refresh_token", sa.LargeBinary(), nullable=False),
        sa.Column("encrypted_access_token", sa.LargeBinary()),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("org_id", "user_id"),
    )
    op.create_table(
        "interviews",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("application_id", UUID(), nullable=False),
        sa.Column(
            "proposer_user_id",
            UUID(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="open"),
        sa.Column("booking_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("encrypted_booking_token", sa.LargeBinary(), nullable=False),
        sa.Column("booked_slot_id", UUID()),
        sa.Column("google_event_id", sa.Text()),
        sa.Column("meet_url", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("booked_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("duration_minutes between 15 and 240"),
        sa.CheckConstraint("status in ('open','booked','cancelled')"),
        sa.UniqueConstraint("org_id", "id"),
        sa.ForeignKeyConstraint(
            ["org_id", "application_id"],
            ["candidate_applications.org_id", "candidate_applications.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_table(
        "interview_slots",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("interview_id", UUID(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="offered"),
        sa.CheckConstraint("ends_at > starts_at"),
        sa.CheckConstraint("status in ('offered','booked','released')"),
        sa.UniqueConstraint("org_id", "id"),
        sa.ForeignKeyConstraint(
            ["org_id", "interview_id"], ["interviews.org_id", "interviews.id"], ondelete="CASCADE"
        ),
    )
    op.create_table(
        "interview_interviewers",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("interview_id", UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.UniqueConstraint("org_id", "interview_id", "email"),
        sa.ForeignKeyConstraint(
            ["org_id", "interview_id"], ["interviews.org_id", "interviews.id"], ondelete="CASCADE"
        ),
    )
    for table in ("google_connections", "interviews", "interview_slots", "interview_interviewers"):
        tenant_table(table)
        op.execute(f"grant select,insert,delete on {table} to hr_app")
    op.execute(
        "grant update(google_email,encrypted_refresh_token,encrypted_access_token,"
        "access_token_expires_at,updated_at) on google_connections to hr_app"
    )
    op.execute(
        "grant update(status,booked_slot_id,google_event_id,meet_url,booked_at) "
        "on interviews to hr_app"
    )
    op.execute("grant update(status) on interview_slots to hr_app")
    op.create_index("google_connections_member_idx", "google_connections", ["org_id", "user_id"])
    op.create_index(
        "interviews_application_idx", "interviews", ["org_id", "application_id", "created_at"]
    )
    op.create_index(
        "interview_slots_open_idx", "interview_slots", ["org_id", "interview_id", "starts_at"]
    )


def downgrade() -> None:
    op.drop_table("interview_interviewers")
    op.drop_table("interview_slots")
    op.drop_table("interviews")
    op.drop_table("google_connections")
