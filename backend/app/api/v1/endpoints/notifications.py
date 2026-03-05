"""Notifications API."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, desc

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.notification import Notification
from app.models.forum import ForumPost, ForumThread
from app.models.forum import ForumTopic
from pydantic import BaseModel

router = APIRouter()


class NotificationResponse(BaseModel):
    id: int
    type: str
    message: str
    link: str
    actor_username: str
    read_at: str | None
    created_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    unread_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user."""
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    q = q.order_by(desc(Notification.created_at)).offset(skip).limit(limit)
    result = await db.execute(q)
    notifications = result.scalars().all()

    # Need actor usernames
    out = []
    for n in notifications:
        actor = await db.get(User, n.actor_id)
        out.append(NotificationResponse(
            id=n.id,
            type=n.type,
            message=n.message,
            link=n.link,
            actor_username=actor.username if actor else "?",
            read_at=n.read_at.isoformat() if n.read_at else None,
            created_at=n.created_at.isoformat() if n.created_at else "",
        ))
    return out


@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get count of unread notifications."""
    from sqlalchemy import func
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
    )
    return {"count": result.scalar() or 0}


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    n = await db.scalar(select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ))
    if not n:
        raise HTTPException(404, "Notification not found")
    n.read_at = datetime.utcnow()
    await db.flush()
    return None


@router.post("/read-all", status_code=204)
async def mark_all_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.utcnow())
    )
    await db.flush()
    return None


@router.delete("/clear", status_code=204)
async def clear_all(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all notifications for the current user."""
    from sqlalchemy import delete
    await db.execute(delete(Notification).where(Notification.user_id == current_user.id))
    await db.flush()
    return None
