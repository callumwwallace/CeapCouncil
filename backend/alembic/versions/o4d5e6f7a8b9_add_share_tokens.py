"""Add share_token columns to strategies and backtests.

Revision ID: o4d5e6f7a8b9
Revises: n3c4d5e6f7a8
Create Date: 2026-03-20

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "o4d5e6f7a8b9"
down_revision: Union[str, None] = "n3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add share_token to strategies (nullable first, backfill, then make unique)
    op.add_column("strategies", sa.Column("share_token", sa.String(36), nullable=True))
    # Backfill existing rows with UUIDs
    conn = op.get_bind()
    strategies = conn.execute(sa.text("SELECT id FROM strategies WHERE share_token IS NULL"))
    for row in strategies:
        conn.execute(
            sa.text("UPDATE strategies SET share_token = :token WHERE id = :id"),
            {"token": str(uuid.uuid4()), "id": row[0]},
        )
    op.alter_column("strategies", "share_token", nullable=False)
    op.create_index("ix_strategies_share_token", "strategies", ["share_token"], unique=True)

    # Add share_token to backtests
    op.add_column("backtests", sa.Column("share_token", sa.String(36), nullable=True))
    backtests = conn.execute(sa.text("SELECT id FROM backtests WHERE share_token IS NULL"))
    for row in backtests:
        conn.execute(
            sa.text("UPDATE backtests SET share_token = :token WHERE id = :id"),
            {"token": str(uuid.uuid4()), "id": row[0]},
        )
    op.alter_column("backtests", "share_token", nullable=False)
    op.create_index("ix_backtests_share_token", "backtests", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_backtests_share_token", table_name="backtests")
    op.drop_column("backtests", "share_token")
    op.drop_index("ix_strategies_share_token", table_name="strategies")
    op.drop_column("strategies", "share_token")
