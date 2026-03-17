from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_user_optional
from app.models.user import User
from app.models.competition import Badge, CompetitionEntry, Competition
from app.models.strategy import Strategy
from app.models.forum import ForumThread, ForumPost
from app.models.reputation import UserReputation
from app.models.strategy import Strategy
from app.schemas.user import UserResponse, UserPrivateResponse, UserUpdate, EmailChange, PasswordChange, NotificationPreferencesUpdate
from app.core.security import verify_password, get_password_hash

router = APIRouter()

REP_MIN_ACCOUNT_DAYS = 7
REP_MAX_PER_24H = 10


class RepGive(BaseModel):
    value: int  # 1 or -1


@router.get("/me", response_model=UserPrivateResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.patch("/me", response_model=UserPrivateResponse)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = user_update.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    await db.flush()
    await db.refresh(current_user)
    
    return current_user


@router.patch("/me/email", response_model=UserPrivateResponse)
async def change_email(
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
async def update_notification_preferences(
    data: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences (mentions, emails)."""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/password", response_model=dict)
async def change_password(
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
async def get_my_badges(
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
async def get_user_forum_stats(
    username: str,
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
async def get_user_forum_activity(
    username: str,
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
async def get_user_strategy_count(
    username: str,
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
async def get_user_competition_history(
    username: str,
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
async def get_user_badges(
    username: str,
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


@router.get("/{username}/rep")
async def get_user_rep(
    username: str,
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
async def give_rep(
    username: str,
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
async def get_user_by_username(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user
