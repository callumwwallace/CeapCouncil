"""Add notification categories and extra_data.

Revision ID: n3c4d5e6f7a8
Revises: m2b3c4d5e6f7
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n3c4d5e6f7a8"
down_revision: Union[str, None] = "m2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add category column (nullable first for backfill)
    op.add_column("notifications", sa.Column("category", sa.String(20), nullable=True))
    # Add extra_data column
    op.add_column("notifications", sa.Column("extra_data", sa.JSON(), nullable=True))
    # Expand type column from 20 to 40 chars
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(40)")
    else:
        # SQLite: recreate column
        op.alter_column(
            "notifications",
            "type",
            existing_type=sa.String(20),
            type_=sa.String(40),
            existing_nullable=False,
        )

    # Backfill category from existing type
    op.execute(
        """
        UPDATE notifications SET category = CASE
            WHEN type = 'mention' THEN 'forum'
            WHEN type IN ('follow', 'achievement') THEN 'system'
            ELSE 'system'
        END
        WHERE category IS NULL
        """
    )

    # Make category non-nullable
    op.alter_column(
        "notifications",
        "category",
        existing_type=sa.String(20),
        nullable=False,
    )

    # Make actor_id nullable (for system announcements)
    op.alter_column(
        "notifications",
        "actor_id",
        existing_type=sa.Integer(),
        nullable=True,
    )

    # Create index on category for filtering
    op.create_index("ix_notifications_category", "notifications", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notifications_category", table_name="notifications")
    op.drop_column("notifications", "extra_data")
    op.drop_column("notifications", "category")
    op.alter_column(
        "notifications",
        "actor_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    # Shrink type back to 20 - may fail if data exceeds
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(20)")
