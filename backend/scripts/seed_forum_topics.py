"""Seed forum topics. Run: python -m scripts.seed_forum_topics"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text
from app.core.database import async_session_maker
from app.models.forum import ForumTopic

TOPICS = [
    ("news", "News & Announcements", "Platform updates, new features, maintenance", "official", 0),
    ("api-docs", "API & Documentation", "API help and documentation discussions", "official", 1),
    ("feedback", "Platform Feedback", "Suggestions and bug reports", "official", 2),
    ("general", "General Discussion", "Talk about markets, trading, and Ceap Council", "community", 3),
    ("showcase", "Strategy Showcase", "Share strategies and backtest results", "community", 4),
    ("dev-help", "Strategy Development Help", "Coding help, debugging, platform logic", "community", 5),
    ("backtesting", "Backtesting & Data", "Best practices, data sources, metrics", "community", 6),
    ("current", "Current Competitions", "Active competitions and leaderboard chat", "competitions", 7),
    ("archives", "Past Competition Archives", "Historical results and winning strategies", "competitions", 8),
    ("competition-ideas", "Competition Ideas & Feedback", "Suggest future competitions", "competitions", 9),
    ("fundamentals", "Algorithmic Trading Fundamentals", "Beginner concepts, resources, best practices", "education", 10),
    ("advanced", "Advanced Topics & Research", "ML in finance, complex algorithms, research", "education", 11),
    ("bugs", "Bug Reports", "Report bugs and issues", "support", 12),
    ("features", "Feature Requests", "Request new features", "support", 13),
]


async def main():
    async with async_session_maker() as db:
        result = await db.execute(select(ForumTopic).limit(1))
        if result.scalar_one_or_none():
            print("Forum topics already seeded. Skipping.")
            return
        for slug, name, desc, section, sort_order in TOPICS:
            topic = ForumTopic(slug=slug, name=name, description=desc, section=section, sort_order=sort_order)
            db.add(topic)
        await db.commit()
        print(f"Seeded {len(TOPICS)} forum topics.")


if __name__ == "__main__":
    asyncio.run(main())
