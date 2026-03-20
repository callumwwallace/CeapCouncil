"""Add user achievements table."""

from alembic import op
import sqlalchemy as sa

revision = "m2b3c4d5e6f7"
down_revision = "l1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_achievements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("achievement_key", sa.String(50), nullable=False),
        sa.Column("earned_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "achievement_key", name="uq_user_achievement"),
    )
    op.create_index("ix_user_achievements_id", "user_achievements", ["id"])
    op.create_index("ix_user_achievements_user_id", "user_achievements", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_achievements")
