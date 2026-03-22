"""Add is_default to strategy_groups and create default groups for all users.

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-03-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q6r7s8t9u0v1"
down_revision: Union[str, None] = "p5q6r7s8t9u0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_default column
    op.add_column(
        "strategy_groups",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()

    # Get all user IDs
    result = conn.execute(sa.text("SELECT id FROM users"))
    user_ids = [row[0] for row in result.fetchall()]

    for user_id in user_ids:
        # Check if user already has a default group
        check = conn.execute(
            sa.text(
                "SELECT id FROM strategy_groups WHERE user_id = :uid AND is_default = true"
            ),
            {"uid": user_id},
        )
        existing = check.fetchone()
        if existing:
            default_group_id = existing[0]
        else:
            # Create default group
            conn.execute(
                sa.text(
                    """
                    INSERT INTO strategy_groups (name, user_id, is_default, created_at, updated_at)
                    VALUES ('My Strategies', :uid, true, NOW(), NOW())
                    """
                ),
                {"uid": user_id},
            )
            # Get the new group id
            get_id = conn.execute(
                sa.text(
                    "SELECT id FROM strategy_groups WHERE user_id = :uid AND is_default = true"
                ),
                {"uid": user_id},
            )
            default_group_id = get_id.fetchone()[0]

        # Assign ungrouped strategies to default group
        conn.execute(
            sa.text(
                """
                UPDATE strategies
                SET group_id = :gid
                WHERE author_id = :uid AND group_id IS NULL
                """
            ),
            {"gid": default_group_id, "uid": user_id},
        )


def downgrade() -> None:
    op.drop_column("strategy_groups", "is_default")
