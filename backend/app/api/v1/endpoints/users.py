from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Path, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.limiter import limiter
from app.api.deps import get_current_active_user, get_current_user_optional
from app.models.user import User
from app.models.competition import Badge, CompetitionEntry, Competition
from app.models.achievement import UserAchievement, ACHIEVEMENTS
from app.models.strategy import Strategy
from app.models.forum import ForumThread, ForumPost
from app.models.reputation import UserReputation
from app.models.strategy import Strategy
from app.schemas.user import UserResponse, UserPrivateResponse, UserUpdate, EmailChange, PasswordChange, NotificationPreferencesUpdate
from app.core.security import verify_password, get_password_hash
from app.core import storage
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Username in path: letters, numbers, underscore (same as registration)
UsernamePath = Annotated[str, Path(pattern=r'^[a-zA-Z0-9_]+$', min_length=3, max_length=50)]

REP_MIN_ACCOUNT_DAYS = 7
REP_MAX_PER_24H = 10


class RepGive(BaseModel):
    value: int  # 1 or -1


@router.get("/me", response_model=UserPrivateResponse)
@limiter.limit("60/minute")
async def get_current_user_info(request: Request, current_user: User = Depends(get_current_active_user)):
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def delete_account(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the authenticated user's account and all associated data (GDPR right to erasure)."""
    user_id = current_user.id
    username = current_user.username
    await db.delete(current_user)
    await db.flush()
    logger.info("Account deleted: user_id=%s username=%s", user_id, username)


@router.patch("/me", response_model=UserPrivateResponse)
@limiter.limit("30/minute")
async def update_current_user(
    request: Request,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = user_update.model_dump(exclude_unset=True)
    if "full_name" in update_data:
        current_user.full_name = update_data["full_name"]
    if "bio" in update_data:
        current_user.bio = update_data["bio"]
    if "avatar_url" in update_data:
        current_user.avatar_url = update_data["avatar_url"]
    await db.flush()
    await db.refresh(current_user)
    
    return current_user


# Allowed MIME types and their magic-byte signatures for avatar uploads
_AVATAR_ALLOWED: dict[str, tuple[str, bytes]] = {
    "image/jpeg": ("jpg", bytes([0xFF, 0xD8, 0xFF])),
    "image/png":  ("png", bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
    "image/webp": ("webp", b"RIFF"),  # full check done in endpoint
}
_AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB

_storage_executor = ThreadPoolExecutor(max_workers=2)


@router.post("/me/avatar", response_model=UserPrivateResponse)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a profile avatar (JPEG / PNG / WebP, max 2 MB).

    Security measures:
    - Content-Type header must be an allowed image type
    - Magic bytes are verified against the actual file content
    - File size is capped at 2 MB before storing
    - Old avatar is deleted from MinIO on success
    - Unique, non-guessable object key prevents enumeration
    """
    # 1. Check declared content-type
    content_type = (file.content_type or "").lower()
    if content_type not in _AVATAR_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
        )

    # 2. Read and enforce size limit
    file_bytes = await file.read()
    if len(file_bytes) > _AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail="File too large. Avatar must be 2 MB or smaller.",
        )
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    # 3. Verify magic bytes (prevents content-type spoofing)
    ext, magic = _AVATAR_ALLOWED[content_type]
    if not file_bytes[: len(magic)].startswith(magic):
        raise HTTPException(
            status_code=400,
            detail="File content does not match the declared type. Upload a valid image.",
        )
    # Extra check for WebP: bytes 8-12 must be b"WEBP"
    if content_type == "image/webp":
        if len(file_bytes) < 12 or file_bytes[8:12] != b"WEBP":
            raise HTTPException(
                status_code=400,
                detail="Invalid WebP file.",
            )

    # 4. Build a unique object key and upload to MinIO (in thread pool)
    object_key = storage.build_avatar_key(current_user.id, ext)
    loop = asyncio.get_event_loop()
    try:
        avatar_url = await loop.run_in_executor(
            _storage_executor,
            lambda: storage.upload_file(file_bytes, object_key, content_type),
        )
    except Exception as exc:
        logger.error("Avatar upload failed for user %s: %s", current_user.id, exc)
        raise HTTPException(status_code=500, detail="Failed to upload avatar. Please try again.")

    # 5. Delete the previous avatar from MinIO (best-effort, don't fail the request)
    old_url = current_user.avatar_url
    if old_url:
        old_key = storage.extract_key_from_url(old_url)
        if old_key:
            try:
                await loop.run_in_executor(
                    _storage_executor,
                    lambda: storage.delete_file(old_key),
                )
            except Exception:
                pass  # Non-fatal

    # 6. Persist new avatar URL
    current_user.avatar_url = avatar_url
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/email", response_model=UserPrivateResponse)
@limiter.limit("30/minute")
async def change_email(
    request: Request,
    data: EmailChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Change email. Requires current password. Use new email for future logins."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    existing = await db.execute(select(User).where(User.email == data.new_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    current_user.email = data.new_email
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/notification-preferences", response_model=UserPrivateResponse)
@limiter.limit("30/minute")
async def update_notification_preferences(
    request: Request,
    data: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences (mentions, emails)."""
    update_data = data.model_dump(exclude_unset=True)
    if "notify_on_mention" in update_data:
        current_user.notify_on_mention = update_data["notify_on_mention"]
    if "email_on_mention" in update_data:
        current_user.email_on_mention = update_data["email_on_mention"]
    if "email_marketing" in update_data:
        current_user.email_marketing = update_data["email_marketing"]
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/password", response_model=dict)
@limiter.limit("30/minute")
async def change_password(
    request: Request,
    data: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password. Requires current password."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    current_user.hashed_password = get_password_hash(data.new_password)
    await db.flush()
    return {"message": "Password updated"}


@router.get("/me/badges")
@limiter.limit("60/minute")
async def get_my_badges(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's competition badges."""
    result = await db.execute(
        select(Badge).where(Badge.user_id == current_user.id).order_by(Badge.earned_at.desc())
    )
    badges = result.scalars().all()
    return [
        {
            "id": b.id,
            "competition_title": b.competition_title,
            "badge_tier": b.badge_tier,
            "rank": b.rank,
            "earned_at": b.earned_at.isoformat() if b.earned_at else None,
        }
        for b in badges
    ]


@router.get("/{username}/forum-stats")
@limiter.limit("60/minute")
async def get_user_forum_stats(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's forum thread and post counts."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    thread_count = await db.scalar(select(func.count(ForumThread.id)).where(ForumThread.author_id == user.id))
    post_count = await db.scalar(select(func.count(ForumPost.id)).where(ForumPost.author_id == user.id))
    return {"thread_count": thread_count or 0, "post_count": post_count or 0}


@router.get("/{username}/forum-activity")
@limiter.limit("60/minute")
async def get_user_forum_activity(
    request: Request,
    username: UsernamePath,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's recent forum threads and posts for Latest activity."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from app.models.forum import ForumTopic

    threads_result = await db.execute(
        select(ForumThread, ForumTopic.slug)
        .join(ForumTopic, ForumThread.topic_id == ForumTopic.id)
        .where(ForumThread.author_id == user.id)
        .order_by(ForumThread.updated_at.desc())
        .limit(limit)
    )
    threads = [
        {
            "type": "thread",
            "id": t.id,
            "topic_slug": slug,
            "title": t.title,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t, slug in threads_result.all()
    ]

    posts_result = await db.execute(
        select(ForumPost, ForumThread, ForumTopic.slug)
        .join(ForumThread, ForumPost.thread_id == ForumThread.id)
        .join(ForumTopic, ForumThread.topic_id == ForumTopic.id)
        .where(ForumPost.author_id == user.id)
        .order_by(ForumPost.created_at.desc())
        .limit(limit)
    )
    posts = [
        {
            "type": "post",
            "id": p.id,
            "thread_id": t.id,
            "thread_title": t.title,
            "topic_slug": slug,
            "content_preview": p.content[:100] + ("..." if len(p.content) > 100 else ""),
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p, t, slug in posts_result.all()
    ]

    combined = sorted(
        threads + posts,
        key=lambda x: x["created_at"] or "",
        reverse=True,
    )[:limit]
    return combined


@router.get("/{username}/strategy-count")
@limiter.limit("60/minute")
async def get_user_strategy_count(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get strategy count for a user. Returns all strategies if viewing own profile, else public only."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_owner = current_user and current_user.id == user.id
    q = select(func.count(Strategy.id)).where(Strategy.author_id == user.id)
    if not is_owner:
        q = q.where(Strategy.is_public == True)
    count_result = await db.execute(q)
    count = count_result.scalar() or 0
    return {"count": count}


@router.get("/{username}/competition-history")
@limiter.limit("60/minute")
async def get_user_competition_history(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's competition entry history (entries with competition and strategy info)."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    entries_result = await db.execute(
        select(CompetitionEntry, Competition, Strategy)
        .join(Competition, CompetitionEntry.competition_id == Competition.id)
        .join(Strategy, CompetitionEntry.strategy_id == Strategy.id)
        .where(CompetitionEntry.user_id == user.id)
        .order_by(CompetitionEntry.submitted_at.desc())
    )
    rows = entries_result.all()

    return [
        {
            "id": entry.id,
            "competition_id": entry.competition_id,
            "competition_title": comp.title,
            "competition_status": comp.status.value,
            "strategy_id": entry.strategy_id,
            "strategy_title": strat.title,
            "rank": entry.rank,
            "score": entry.score,
            "total_return": entry.total_return,
            "sharpe_ratio": entry.sharpe_ratio,
            "submitted_at": entry.submitted_at.isoformat() if entry.submitted_at else None,
            "evaluated_at": entry.evaluated_at.isoformat() if entry.evaluated_at else None,
        }
        for entry, comp, strat in rows
    ]


@router.get("/{username}/badges")
@limiter.limit("60/minute")
async def get_user_badges(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
):
    """Get badges for a user by username."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    badge_result = await db.execute(
        select(Badge).where(Badge.user_id == user.id).order_by(Badge.earned_at.desc())
    )
    badges = badge_result.scalars().all()
    return [
        {
            "id": b.id,
            "competition_title": b.competition_title,
            "badge_tier": b.badge_tier,
            "rank": b.rank,
            "earned_at": b.earned_at.isoformat() if b.earned_at else None,
        }
        for b in badges
    ]


@router.get("/{username}/achievements")
@limiter.limit("60/minute")
async def get_user_achievements(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
):
    """Get achievements for a user by username."""
    user = await db.scalar(select(User).where(User.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(UserAchievement)
        .where(UserAchievement.user_id == user.id)
        .order_by(UserAchievement.earned_at.desc())
    )
    earned = result.scalars().all()
    earned_keys = {ua.achievement_key for ua in earned}
    earned_map = {ua.achievement_key: ua for ua in earned}

    achievements = []
    for key, info in ACHIEVEMENTS.items():
        is_earned = key in earned_keys
        achievements.append({
            "key": key,
            "title": info["title"],
            "description": info["description"],
            "icon": info["icon"],
            "category": info["category"],
            "earned": is_earned,
            "earned_at": earned_map[key].earned_at.isoformat() if is_earned and earned_map[key].earned_at else None,
        })

    return achievements


@router.get("/{username}/rep")
@limiter.limit("60/minute")
async def get_user_rep(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get a user's reputation score. If logged in, includes your_vote."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    score_result = await db.execute(
        select(func.coalesce(func.sum(UserReputation.value), 0)).where(
            UserReputation.target_id == user.id
        )
    )
    score = int(score_result.scalar() or 0)

    your_vote: int | None = None
    if current_user:
        vote_result = await db.execute(
            select(UserReputation.value).where(
                UserReputation.voter_id == current_user.id,
                UserReputation.target_id == user.id,
            )
        )
        row = vote_result.scalar_one_or_none()
        if row is not None:
            your_vote = row

    return {"score": score, "your_vote": your_vote}


@router.post("/{username}/rep")
@limiter.limit("20/minute")
async def give_rep(
    request: Request,
    username: UsernamePath,
    body: RepGive,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Give or update +rep (1) or -rep (-1). Abuse protection: no self-rep, account age >= 7 days, max 10 reps per 24h."""
    if body.value not in (1, -1):
        raise HTTPException(status_code=400, detail="value must be 1 or -1")

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot rep yourself")

    # Abuse prevention: account must be at least 7 days old
    now = datetime.now(timezone.utc)
    created = current_user.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    account_age = now - created
    if account_age.days < REP_MIN_ACCOUNT_DAYS:
        raise HTTPException(
            status_code=403,
            detail=f"Account must be at least {REP_MIN_ACCOUNT_DAYS} days old to give rep",
        )

    # Abuse prevention: max 10 new reps per 24h (count only newly created, not updates)
    cutoff = now - timedelta(hours=24)
    count_result = await db.execute(
        select(func.count(UserReputation.id)).where(
            UserReputation.voter_id == current_user.id,
            UserReputation.created_at >= cutoff,
        )
    )
    reps_last_24h = count_result.scalar() or 0

    existing = await db.execute(
        select(UserReputation).where(
            UserReputation.voter_id == current_user.id,
            UserReputation.target_id == target.id,
        )
    )
    existing_row = existing.scalar_one_or_none()

    if existing_row:
        existing_row.value = body.value
        await db.flush()
        await db.refresh(existing_row)
    else:
        if reps_last_24h >= REP_MAX_PER_24H:
            raise HTTPException(
                status_code=429,
                detail=f"You can only give {REP_MAX_PER_24H} reps per 24 hours",
            )
        rep = UserReputation(
            voter_id=current_user.id,
            target_id=target.id,
            value=body.value,
        )
        db.add(rep)
        await db.flush()

    score_result = await db.execute(
        select(func.coalesce(func.sum(UserReputation.value), 0)).where(
            UserReputation.target_id == target.id
        )
    )
    score = int(score_result.scalar() or 0)
    return {"score": score, "your_vote": body.value}


@router.get("/{username}", response_model=UserResponse)
@limiter.limit("60/minute")
async def get_user_by_username(
    request: Request,
    username: UsernamePath,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user
