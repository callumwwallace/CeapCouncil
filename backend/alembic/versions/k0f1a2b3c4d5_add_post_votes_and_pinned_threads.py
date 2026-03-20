"""Add post votes, post vote_score, and thread is_pinned."""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "k0f1a2b3c4d5"
down_revision = "j9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("forum_posts", sa.Column("vote_score", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("forum_threads", sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"))

    op.create_table(
        "post_votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("forum_posts.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_vote_user_post"),
    )
    op.create_index("ix_post_votes_id", "post_votes", ["id"])


def downgrade() -> None:
    op.drop_table("post_votes")
    op.drop_column("forum_threads", "is_pinned")
    op.drop_column("forum_posts", "vote_score")
