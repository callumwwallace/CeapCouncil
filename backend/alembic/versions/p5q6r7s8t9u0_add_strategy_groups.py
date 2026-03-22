"""Add strategy_groups table and group_id to strategies.

Revision ID: p5q6r7s8t9u0
Revises: 2321d8720ab2
Create Date: 2026-03-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p5q6r7s8t9u0"
down_revision: Union[str, None] = "2321d8720ab2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "strategy_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_strategy_groups_id", "strategy_groups", ["id"])
    op.create_index("ix_strategy_groups_user_id", "strategy_groups", ["user_id"])

    op.add_column(
        "strategies",
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("strategy_groups.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_strategies_group_id", "strategies", ["group_id"])


def downgrade() -> None:
    op.drop_index("ix_strategies_group_id", table_name="strategies")
    op.drop_column("strategies", "group_id")
    op.drop_index("ix_strategy_groups_user_id", table_name="strategy_groups")
    op.drop_index("ix_strategy_groups_id", table_name="strategy_groups")
    op.drop_table("strategy_groups")
