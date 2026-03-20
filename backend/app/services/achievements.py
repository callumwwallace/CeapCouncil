"""Achievement checking and awarding service."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.achievement import UserAchievement, ACHIEVEMENTS
from app.models.strategy import Strategy
from app.models.backtest import Backtest
from app.models.competition import CompetitionEntry
from app.models.forum import ForumPost
from app.models.follow import UserFollow
from app.models.social import Vote
from app.models.notification import Notification
from app.websocket.manager import manager


async def _has(db: AsyncSession, user_id: int, key: str) -> bool:
    return await db.scalar(
        select(UserAchievement.id).where(
            UserAchievement.user_id == user_id,
            UserAchievement.achievement_key == key,
        )
    ) is not None


async def _award(db: AsyncSession, user_id: int, key: str) -> UserAchievement | None:
    """Award an achievement if not already earned. Returns the achievement or None."""
    if key not in ACHIEVEMENTS:
        return None
    if await _has(db, user_id, key):
        return None

    ua = UserAchievement(user_id=user_id, achievement_key=key)
    db.add(ua)

    # Send notification
    info = ACHIEVEMENTS[key]
    notification = Notification(
        user_id=user_id,
        actor_id=user_id,
        type="achievement",
        message=f"Achievement unlocked: {info['title']}",
        link="/profile",
    )
    db.add(notification)
    await db.flush()

    await manager.send_personal(user_id, {
        "type": "notification",
        "id": notification.id,
        "message": notification.message,
        "link": notification.link,
        "actor_username": "",
        "created_at": notification.created_at.isoformat() if notification.created_at else "",
    })

    return ua


async def check_strategy_achievements(db: AsyncSession, user_id: int) -> list[str]:
    """Check and award strategy-related achievements. Call after creating/publishing a strategy."""
    awarded = []

    public_count = await db.scalar(
        select(func.count(Strategy.id)).where(
            Strategy.author_id == user_id,
            Strategy.is_public == True,
        )
    ) or 0

    if public_count >= 1:
        if await _award(db, user_id, "first_strategy"):
            awarded.append("first_strategy")
    if public_count >= 5:
        if await _award(db, user_id, "five_strategies"):
            awarded.append("five_strategies")

    # Check if any strategy has been forked
    fork_count = await db.scalar(
        select(func.count(Strategy.id)).where(
            Strategy.forked_from_id.in_(
                select(Strategy.id).where(Strategy.author_id == user_id)
            )
        )
    ) or 0
    if fork_count >= 1:
        if await _award(db, user_id, "strategy_forked"):
            awarded.append("strategy_forked")

    # Check total votes on strategies
    total_votes = await db.scalar(
        select(func.coalesce(func.sum(Strategy.vote_count), 0)).where(
            Strategy.author_id == user_id,
        )
    ) or 0
    if total_votes >= 10:
        if await _award(db, user_id, "ten_votes"):
            awarded.append("ten_votes")

    return awarded


async def check_backtest_achievements(db: AsyncSession, user_id: int, backtest: Backtest | None = None) -> list[str]:
    """Check and award backtest-related achievements. Call after a backtest completes."""
    awarded = []

    bt_count = await db.scalar(
        select(func.count(Backtest.id)).where(
            Backtest.user_id == user_id,
            Backtest.status == "completed",
        )
    ) or 0

    if bt_count >= 1:
        if await _award(db, user_id, "first_backtest"):
            awarded.append("first_backtest")
    if bt_count >= 100:
        if await _award(db, user_id, "hundred_backtests"):
            awarded.append("hundred_backtests")

    # Check for profitable and high-sharpe backtests
    if backtest and backtest.status == "completed":
        if backtest.total_return is not None and backtest.total_return > 0:
            if await _award(db, user_id, "profitable_strategy"):
                awarded.append("profitable_strategy")
        if backtest.sharpe_ratio is not None and backtest.sharpe_ratio > 2.0:
            if await _award(db, user_id, "sharpe_above_2"):
                awarded.append("sharpe_above_2")
        if backtest.sharpe_ratio is not None and backtest.sharpe_ratio > 3.0:
            if await _award(db, user_id, "sharpe_above_3"):
                awarded.append("sharpe_above_3")

    return awarded


async def check_competition_achievements(db: AsyncSession, user_id: int) -> list[str]:
    """Check and award competition-related achievements. Call after entering a competition."""
    awarded = []

    entry_count = await db.scalar(
        select(func.count(CompetitionEntry.id)).where(CompetitionEntry.user_id == user_id)
    ) or 0

    if entry_count >= 1:
        if await _award(db, user_id, "first_competition"):
            awarded.append("first_competition")
    if entry_count >= 5:
        if await _award(db, user_id, "five_competitions"):
            awarded.append("five_competitions")

    # Check for wins (rank == 1)
    win_count = await db.scalar(
        select(func.count(CompetitionEntry.id)).where(
            CompetitionEntry.user_id == user_id,
            CompetitionEntry.rank == 1,
        )
    ) or 0
    if win_count >= 1:
        if await _award(db, user_id, "competition_win"):
            awarded.append("competition_win")

    return awarded


async def check_community_achievements(db: AsyncSession, user_id: int) -> list[str]:
    """Check and award community-related achievements. Call after creating a forum post."""
    awarded = []

    post_count = await db.scalar(
        select(func.count(ForumPost.id)).where(ForumPost.author_id == user_id)
    ) or 0

    if post_count >= 1:
        if await _award(db, user_id, "first_post"):
            awarded.append("first_post")
    if post_count >= 10:
        if await _award(db, user_id, "ten_posts"):
            awarded.append("ten_posts")
    if post_count >= 50:
        if await _award(db, user_id, "fifty_posts"):
            awarded.append("fifty_posts")

    return awarded


async def check_follower_achievements(db: AsyncSession, user_id: int) -> list[str]:
    """Check and award follower-related achievements. Call when someone gains a follower."""
    awarded = []

    follower_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.following_id == user_id)
    ) or 0

    if follower_count >= 1:
        if await _award(db, user_id, "first_follower"):
            awarded.append("first_follower")
    if follower_count >= 10:
        if await _award(db, user_id, "ten_followers"):
            awarded.append("ten_followers")

    return awarded
