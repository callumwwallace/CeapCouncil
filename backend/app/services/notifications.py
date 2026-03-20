"""Centralized notification creation and delivery."""

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.notification import Notification, NOTIFICATION_CATEGORIES
from app.models.user import User
from app.websocket.manager import manager

# Maps type -> category when category is not explicitly provided
TYPE_TO_CATEGORY = {
    "mention": "forum",
    "forum_reply": "forum",
    "forum_reply_to_thread": "forum",
    "forum_reply_to_your_post": "forum",
    "strategy_comment": "strategy",
    "strategy_comment_reply": "strategy",
    "competition_start": "competition",
    "competition_end": "competition",
    "competition_rank": "competition",
    "competition_entry": "competition",
    "proposal_promoted": "competition",
    "achievement": "system",
    "follow": "system",
    "system_announcement": "system",
}


async def create_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    message: str,
    link: str,
    *,
    category: str | None = None,
    actor_id: int | None = None,
    post_id: int | None = None,
    extra_data: dict[str, Any] | None = None,
) -> Notification | None:
    """Create a notification and push it via WebSocket. Returns the created Notification or None."""
    resolved_category = category or TYPE_TO_CATEGORY.get(type, "system")
    if resolved_category not in NOTIFICATION_CATEGORIES:
        resolved_category = "system"

    notification = Notification(
        user_id=user_id,
        actor_id=actor_id,
        category=resolved_category,
        type=type,
        message=message,
        link=link,
        post_id=post_id,
        extra_data=extra_data,
    )
    db.add(notification)
    await db.flush()
    await db.refresh(notification)

    # Resolve actor username for WebSocket payload
    actor_username = ""
    if actor_id:
        actor = await db.get(User, actor_id)
        actor_username = actor.username if actor else ""

    try:
        await manager.send_personal(
            user_id,
            {
                "type": "notification",
                "id": notification.id,
                "category": resolved_category,
                "notification_type": type,
                "message": message,
                "link": link,
                "actor_username": actor_username,
                "created_at": notification.created_at.isoformat() if notification.created_at else "",
                "extra_data": extra_data,
            },
        )
    except Exception as e:
        logging.warning("WebSocket push failed for notification %s: %s", notification.id, e)

    return notification


def create_notification_sync(
    db: Session,
    user_id: int,
    type: str,
    message: str,
    link: str,
    *,
    category: str | None = None,
    actor_id: int | None = None,
    post_id: int | None = None,
    extra_data: dict[str, Any] | None = None,
) -> Notification:
    """Create a notification (DB only, no WebSocket). For use in Celery tasks.
    Returns the created Notification."""
    resolved_category = category or TYPE_TO_CATEGORY.get(type, "system")
    if resolved_category not in NOTIFICATION_CATEGORIES:
        resolved_category = "system"

    notification = Notification(
        user_id=user_id,
        actor_id=actor_id,
        category=resolved_category,
        type=type,
        message=message,
        link=link,
        post_id=post_id,
        extra_data=extra_data,
    )
    db.add(notification)
    db.flush()
    db.refresh(notification)
    return notification
