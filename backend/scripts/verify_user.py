"""Verify a user's email (for testing). Run: python -m scripts.verify_user <username>"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.user import User


async def main():
    username = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    if not username:
        print("Usage: python -m scripts.verify_user <username>")
        return
    async with async_session_maker() as db:
        user = await db.scalar(select(User).where(User.username == username))
        if not user:
            print(f"User '{username}' not found.")
            return
        user.is_verified = True
        await db.commit()
        print(f"Verified {username} (user_id={user.id})")


if __name__ == "__main__":
    asyncio.run(main())
