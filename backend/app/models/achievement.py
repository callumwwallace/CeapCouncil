"""Achievement system: milestone-based awards beyond competition badges."""

from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# Achievement definitions: key -> (title, description, icon, category)
ACHIEVEMENTS: dict[str, dict] = {
    # Strategy milestones
    "first_strategy": {
        "title": "Strategist",
        "description": "Published your first public strategy",
        "icon": "lightbulb",
        "category": "strategy",
    },
    "five_strategies": {
        "title": "Strategy Architect",
        "description": "Published 5 public strategies",
        "icon": "layers",
        "category": "strategy",
    },
    "strategy_forked": {
        "title": "Trendsetter",
        "description": "Had a strategy forked by another user",
        "icon": "git-branch",
        "category": "strategy",
    },
    "ten_votes": {
        "title": "Community Favorite",
        "description": "Received 10 upvotes on strategies",
        "icon": "heart",
        "category": "strategy",
    },
    # Backtest milestones
    "first_backtest": {
        "title": "Tester",
        "description": "Ran your first backtest",
        "icon": "play",
        "category": "backtest",
    },
    "hundred_backtests": {
        "title": "Data Driven",
        "description": "Ran 100 backtests",
        "icon": "bar-chart-2",
        "category": "backtest",
    },
    "profitable_strategy": {
        "title": "In the Green",
        "description": "Achieved a positive return on a backtest",
        "icon": "trending-up",
        "category": "backtest",
    },
    "sharpe_above_2": {
        "title": "Risk Master",
        "description": "Achieved a Sharpe ratio above 2.0",
        "icon": "shield",
        "category": "backtest",
    },
    "sharpe_above_3": {
        "title": "Quant Elite",
        "description": "Achieved a Sharpe ratio above 3.0",
        "icon": "zap",
        "category": "backtest",
    },
    # Competition milestones
    "first_competition": {
        "title": "Competitor",
        "description": "Entered your first competition",
        "icon": "flag",
        "category": "competition",
    },
    "competition_win": {
        "title": "Champion",
        "description": "Won a competition",
        "icon": "trophy",
        "category": "competition",
    },
    "five_competitions": {
        "title": "Veteran",
        "description": "Entered 5 competitions",
        "icon": "award",
        "category": "competition",
    },
    # Community milestones
    "first_post": {
        "title": "Conversation Starter",
        "description": "Made your first forum post",
        "icon": "message-square",
        "category": "community",
    },
    "ten_posts": {
        "title": "Community Helper",
        "description": "Made 10 forum posts",
        "icon": "users",
        "category": "community",
    },
    "fifty_posts": {
        "title": "Forum Regular",
        "description": "Made 50 forum posts",
        "icon": "coffee",
        "category": "community",
    },
    "first_follower": {
        "title": "Influencer",
        "description": "Gained your first follower",
        "icon": "user-plus",
        "category": "community",
    },
    "ten_followers": {
        "title": "Rising Star",
        "description": "Gained 10 followers",
        "icon": "star",
        "category": "community",
    },
}


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_key", name="uq_user_achievement"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    achievement_key: Mapped[str] = mapped_column(String(50), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="achievements")
