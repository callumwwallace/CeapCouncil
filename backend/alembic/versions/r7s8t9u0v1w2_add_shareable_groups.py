"""Add share_token and is_shareable to strategy_groups.

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-03-22

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "r7s8t9u0v1w2"
down_revision: Union[str, None] = "q6r7s8t9u0v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "strategy_groups",
        sa.Column("share_token", sa.String(36), nullable=True),
    )
    op.add_column(
        "strategy_groups",
        sa.Column("is_shareable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM strategy_groups WHERE share_token IS NULL"))
    for (row_id,) in rows:
        conn.execute(
            sa.text("UPDATE strategy_groups SET share_token = :token WHERE id = :id"),
            {"token": str(uuid.uuid4()), "id": row_id},
        )

    op.alter_column(
        "strategy_groups",
        "share_token",
        nullable=False,
    )
    op.create_index("ix_strategy_groups_share_token", "strategy_groups", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_strategy_groups_share_token", table_name="strategy_groups")
    op.drop_column("strategy_groups", "share_token")
    op.drop_column("strategy_groups", "is_shareable")
