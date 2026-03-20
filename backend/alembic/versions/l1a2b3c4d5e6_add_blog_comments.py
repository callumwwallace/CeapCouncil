"""Add blog comments table."""

from alembic import op
import sqlalchemy as sa

revision = "l1a2b3c4d5e6"
down_revision = "k0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blog_comments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("blog_post_id", sa.Integer(), sa.ForeignKey("blog_posts.id"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("blog_comments.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_blog_comments_id", "blog_comments", ["id"])
    op.create_index("ix_blog_comments_blog_post_id", "blog_comments", ["blog_post_id"])


def downgrade() -> None:
    op.drop_table("blog_comments")
