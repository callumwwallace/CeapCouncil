"""Store and verify Celery task ownership for secure result polling."""

TASK_OWNER_PREFIX = "task_owner:"
TTL_SECONDS = 86400  # 24 hours


async def set_task_owner(task_id: str, user_id: int) -> None:
    """Record that a task was created by this user."""
    from app.core.redis import redis_client
    await redis_client.setex(
        f"{TASK_OWNER_PREFIX}{task_id}",
        TTL_SECONDS,
        str(user_id),
    )


async def get_task_owner(task_id: str) -> int | None:
    """Return the user_id who created the task, or None if unknown/expired."""
    from app.core.redis import redis_client
    val = await redis_client.get(f"{TASK_OWNER_PREFIX}{task_id}")
    if val is None:
        return None
    try:
        return int(val)
    except ValueError:
        return None


async def verify_task_ownership(task_id: str, user_id: int) -> bool:
    """Return True if the user owns this task. Denies when ownership unknown/expired."""
    owner = await get_task_owner(task_id)
    if owner is None:
        return False
    return owner == user_id
