"""User follow and skill endorsement models."""

from datetime import datetime
from sqlalchemy import ForeignKey, Integer, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserFollow(Base):
    """One user following another. Unique per (follower, following) pair."""

    __tablename__ = "user_follows"
    __table_args__ = (UniqueConstraint("follower_id", "following_id", name="uq_follow_pair"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    following_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    follower: Mapped["User"] = relationship("User", foreign_keys=[follower_id])
    following: Mapped["User"] = relationship("User", foreign_keys=[following_id])


# Predefined skill categories for endorsements
ENDORSABLE_SKILLS = [
    "risk_management",
    "mean_reversion",
    "momentum",
    "crypto",
    "machine_learning",
    "fundamental_analysis",
    "technical_analysis",
    "options",
    "high_frequency",
    "portfolio_optimization",
    "backtesting",
    "data_engineering",
]

SKILL_LABELS = {
    "risk_management": "Risk Management",
    "mean_reversion": "Mean Reversion",
    "momentum": "Momentum",
    "crypto": "Crypto",
    "machine_learning": "Machine Learning",
    "fundamental_analysis": "Fundamental Analysis",
    "technical_analysis": "Technical Analysis",
    "options": "Options",
    "high_frequency": "High Frequency",
    "portfolio_optimization": "Portfolio Optimization",
    "backtesting": "Backtesting",
    "data_engineering": "Data Engineering",
}


class SkillEndorsement(Base):
    """One user endorsing another user for a specific skill. One endorsement per skill per pair."""

    __tablename__ = "skill_endorsements"
    __table_args__ = (
        UniqueConstraint("endorser_id", "target_id", "skill", name="uq_endorsement_skill_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    endorser_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    skill: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    endorser: Mapped["User"] = relationship("User", foreign_keys=[endorser_id])
    target: Mapped["User"] = relationship("User", foreign_keys=[target_id])
