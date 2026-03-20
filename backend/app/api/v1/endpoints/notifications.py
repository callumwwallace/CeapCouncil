"""Notifications API."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, desc
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.notification import Notification, NOTIFICATION_CATEGORIES

router = APIRouter()


class NotificationResponse(BaseModel):
    id: int
    type: str
    category: str
    message: str
    link: str
    actor_username: str
    read_at: str | None
    created_at: str
    extra_data: dict | None = None

    class Config:
        from_attributes = True


def _to_response(n: Notification, actor_username: str) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        type=n.type,
        category=n.category,
        message=n.message,
        link=n.link,
        actor_username=actor_username,
        read_at=n.read_at.isoformat() if n.read_at else None,
        created_at=n.created_at.isoformat() if n.created_at else "",
        extra_data=n.extra_data,
    )


@router.get("")
async def list_notifications(
    unread_only: bool = Query(False),
    category: str | None = Query(None, description="Filter by category: competition, forum, strategy, system"),
    group_by: str | None = Query(None, description="Group by 'category' to return grouped dict"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user. Use group_by=category for grouped response."""
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    if category and category in NOTIFICATION_CATEGORIES:
        q = q.where(Notification.category == category)
    q = q.order_by(desc(Notification.created_at))
    fetch_limit = limit if not group_by else min(limit * 4, 100)  # Fetch more when grouping
    q = q.offset(skip).limit(fetch_limit)
    result = await db.execute(q)
    notifications = result.scalars().all()

    # Build response with actor usernames
    out = []
    for n in notifications:
        actor_username = ""
        if n.actor_id:
            actor = await db.get(User, n.actor_id)
            actor_username = actor.username if actor else "?"
        out.append(_to_response(n, actor_username))

    if group_by == "category":
        grouped: dict[str, list[NotificationResponse]] = {c: [] for c in NOTIFICATION_CATEGORIES}
        for item in out:
            if item.category in grouped:
                grouped[item.category].append(item)
        return grouped

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
    result = await db.execute(select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ))
    n = result.scalar_one_or_none()
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
