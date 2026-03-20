"""Admin-only endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.limiter import limiter
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
    user_ids: list[int] | None = None  # If None, broadcast to all active users

    @field_validator("user_ids")
    @classmethod
    def limit_user_ids(cls, v: list[int] | None) -> list[int] | None:
        if v is not None and len(v) > 1000:
            raise ValueError("user_ids must not exceed 1000 entries; use broadcast (omit user_ids) for larger audiences")
        return v

    @field_validator("link")
    @classmethod
    def link_must_be_safe(cls, v: str) -> str:
        v = (v or "/").strip()
        if v.startswith("/") or v.startswith("https://") or v.startswith("http://"):
            return v
        raise ValueError("Link must be a relative path (/) or https:// or http:// URL")


@router.post("/announcements")
@limiter.limit("5/minute")
async def create_announcement(
    request: Request,
    data: AnnouncementCreate,
    current_user: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Create system announcement notifications. Superuser only.
    If user_ids is provided, notify only those users; otherwise notify all active users."""
    if data.user_ids:
        result = await db.execute(
            select(User.id).where(User.id.in_(data.user_ids), User.is_active == True)
        )
        user_ids = [r[0] for r in result.all()]
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
