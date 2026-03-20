"""Notification model for mentions, quotes, forum replies, strategy comments, competition updates, etc."""

from datetime import datetime
from typing import Any

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Category taxonomy: competition, forum, strategy, system
NOTIFICATION_CATEGORIES = ("competition", "forum", "strategy", "system")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)  # mention, forum_reply, strategy_comment, etc.
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str] = mapped_column(String(500), nullable=False)  # e.g. /community/news/123
    post_id: Mapped[int | None] = mapped_column(ForeignKey("forum_posts.id"))
    extra_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
