"""User reputation (+rep / -rep) model."""

from datetime import datetime
from sqlalchemy import ForeignKey, Integer, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserReputation(Base):
    """One user's vote (+1 or -1) on another user's reputation. Anonymous; voters are never exposed."""

    __tablename__ = "user_reputation"
    __table_args__ = (UniqueConstraint("voter_id", "target_id", name="uq_reputation_voter_target"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    voter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    target_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    value: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 or -1
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    voter: Mapped["User"] = relationship("User", foreign_keys=[voter_id])
    target: Mapped["User"] = relationship("User", foreign_keys=[target_id])
