"""rename competition proposals topic to Competition Proposals

Revision ID: h7c9d0e1f2a3
Revises: g6b8c9d0e1f2
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h7c9d0e1f2a3"
down_revision: Union[str, None] = "g6b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE forum_topics SET name = 'Competition Proposals' "
            "WHERE slug = 'competition-ideas'"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE forum_topics SET name = 'Competition Proposals and Feedback' "
            "WHERE slug = 'competition-ideas'"
        )
    )
