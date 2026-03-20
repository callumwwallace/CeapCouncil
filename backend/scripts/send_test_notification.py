"""Send a test notification to a user. Run: python -m scripts.send_test_notification [username]"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.user import User
from app.models.notification import Notification


async def main():
    username = (sys.argv[1] if len(sys.argv) > 1 else "testuser").strip()
    async with async_session_maker() as db:
        user = await db.scalar(select(User).where(User.username == username))
        if not user:
            print(f"User '{username}' not found.")
            return
        # Need another user as actor; use first other user or self for test
        other = await db.scalar(select(User).where(User.id != user.id).limit(1))
        actor_id = other.id if other else user.id
        n = Notification(
            user_id=user.id,
            actor_id=actor_id,
            category="forum",
            type="mention",
            message=f"{other.username} sent you a test notification" if other else "Test notification",
            link="/community",
        )
        db.add(n)
        await db.commit()
        print(f"Sent test notification to {username} (user_id={user.id})")


if __name__ == "__main__":
    asyncio.run(main())
