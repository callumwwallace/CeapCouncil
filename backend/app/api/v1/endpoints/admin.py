"""Admin-only endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.services.notifications import create_notification

router = APIRouter()


def require_superuser(current_user: User = Depends(get_current_active_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class AnnouncementCreate(BaseModel):
    message: str
    link: str = "/"
    user_ids: list[int] | None = None  # If None, broadcast to all users


@router.post("/announcements")
async def create_announcement(
    data: AnnouncementCreate,
    current_user: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Create system announcement notifications. Superuser only.
    If user_ids is provided, notify only those users; otherwise notify all active users."""
    if data.user_ids:
        user_ids = data.user_ids
    else:
        result = await db.execute(select(User.id).where(User.is_active == True))
        user_ids = [r[0] for r in result.all()]

    count = 0
    for user_id in user_ids:
        await create_notification(
            db,
            user_id,
            "system_announcement",
            data.message,
            data.link,
            category="system",
            actor_id=None,
        )
        count += 1

    return {"sent": count, "recipients": len(user_ids)}
