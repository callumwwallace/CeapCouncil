"""add thread_votes, vote_score, proposal_data

Revision ID: g6b8c9d0e1f2
Revises: f5d63918fa05
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g6b8c9d0e1f2"
down_revision: Union[str, None] = "f5d63918fa05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Add columns if not present
    cols = [r[0] for r in conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'forum_threads'"
    )).fetchall()]
    if "vote_score" not in cols:
        op.add_column("forum_threads", sa.Column("vote_score", sa.Integer(), server_default="0"))
    if "proposal_data" not in cols:
        op.add_column("forum_threads", sa.Column("proposal_data", sa.JSON(), nullable=True))

    # Create thread_votes table if not exists
    tables = [r[0] for r in conn.execute(sa.text(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'thread_votes'"
    )).fetchall()]
    if not tables:
        op.create_table(
            "thread_votes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("thread_id", sa.Integer(), sa.ForeignKey("forum_threads.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("value", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_thread_votes_thread_id", "thread_votes", ["thread_id"])
        op.create_index("ix_thread_votes_user_id", "thread_votes", ["user_id"])
        op.create_unique_constraint("uq_thread_vote_user_thread", "thread_votes", ["thread_id", "user_id"])

    # Update competition-ideas topic to "Competition Proposals"
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE forum_topics SET name = 'Competition Proposals', "
            "description = 'Propose competitions for community voting. Top 5 each week become hosted competitions.' "
            "WHERE slug = 'competition-ideas'"
        )
    )


def downgrade() -> None:
    op.drop_constraint("uq_thread_vote_user_thread", "thread_votes", type_="unique")
    op.drop_index("ix_thread_votes_user_id", table_name="thread_votes")
    op.drop_index("ix_thread_votes_thread_id", table_name="thread_votes")
    op.drop_table("thread_votes")
    op.drop_column("forum_threads", "proposal_data")
    op.drop_column("forum_threads", "vote_score")

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE forum_topics SET name = 'Competition Ideas & Feedback', "  # Revert to original
            "description = 'Suggest future competitions' WHERE slug = 'competition-ideas'"
        )
    )
