"""Follow system and skill endorsement API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, union_all

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_user_optional
from app.models.user import User
from app.models.follow import UserFollow, SkillEndorsement, ENDORSABLE_SKILLS, SKILL_LABELS
from app.models.strategy import Strategy
from app.models.competition import CompetitionEntry, Competition, CompetitionStatus
from app.models.forum import ForumThread, ForumPost, ForumTopic
from app.services.achievements import check_follower_achievements
from app.services.notifications import create_notification

router = APIRouter()


# ─── Follow / Unfollow ────────────────────────────────────────────

class FollowResponse(BaseModel):
    is_following: bool
    follower_count: int
    following_count: int


@router.post("/{username}/follow", response_model=FollowResponse)
async def follow_user(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Follow a user."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "You cannot follow yourself")

    existing = await db.scalar(
        select(UserFollow).where(
            UserFollow.follower_id == current_user.id,
            UserFollow.following_id == target.id,
        )
    )
    if existing:
        raise HTTPException(400, "Already following this user")

    follow = UserFollow(follower_id=current_user.id, following_id=target.id)
    db.add(follow)

    # Notify the followed user
    await create_notification(
        db,
        target.id,
        "follow",
        f"{current_user.username} started following you",
        f"/profile/{current_user.username}",
        category="system",
        actor_id=current_user.id,
    )

    await check_follower_achievements(db, target.id)

    follower_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.following_id == target.id)
    ) or 0
    following_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.follower_id == target.id)
    ) or 0

    return FollowResponse(is_following=True, follower_count=follower_count, following_count=following_count)


@router.delete("/{username}/follow", response_model=FollowResponse)
async def unfollow_user(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Unfollow a user."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")

    existing = await db.scalar(
        select(UserFollow).where(
            UserFollow.follower_id == current_user.id,
            UserFollow.following_id == target.id,
        )
    )
    if not existing:
        raise HTTPException(400, "Not following this user")

    await db.delete(existing)
    await db.flush()

    follower_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.following_id == target.id)
    ) or 0
    following_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.follower_id == target.id)
    ) or 0

    return FollowResponse(is_following=False, follower_count=follower_count, following_count=following_count)


@router.get("/{username}/follow-stats")
async def get_follow_stats(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get follower/following counts and whether current user follows this user."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")

    follower_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.following_id == target.id)
    ) or 0
    following_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.follower_id == target.id)
    ) or 0

    is_following = False
    if current_user and current_user.id != target.id:
        existing = await db.scalar(
            select(UserFollow.id).where(
                UserFollow.follower_id == current_user.id,
                UserFollow.following_id == target.id,
            )
        )
        is_following = existing is not None

    return {
        "follower_count": follower_count,
        "following_count": following_count,
        "is_following": is_following,
    }


@router.get("/{username}/followers")
async def get_followers(
    username: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get list of users following this user."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")

    result = await db.execute(
        select(User)
        .join(UserFollow, UserFollow.follower_id == User.id)
        .where(UserFollow.following_id == target.id)
        .order_by(desc(UserFollow.created_at))
        .offset(skip)
        .limit(limit)
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
        }
        for u in users
    ]


@router.get("/{username}/following")
async def get_following(
    username: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get list of users this user follows."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")

    result = await db.execute(
        select(User)
        .join(UserFollow, UserFollow.following_id == User.id)
        .where(UserFollow.follower_id == target.id)
        .order_by(desc(UserFollow.created_at))
        .offset(skip)
        .limit(limit)
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
        }
        for u in users
    ]


# ─── Activity Feed ────────────────────────────────────────────────

@router.get("/me/feed")
async def get_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get activity feed from users you follow: new public strategies and competition entries."""
    # Get IDs of users we follow
    following_result = await db.execute(
        select(UserFollow.following_id).where(UserFollow.follower_id == current_user.id)
    )
    following_ids = [r[0] for r in following_result.all()]

    if not following_ids:
        return []

    # Fetch recent public strategies from followed users
    strats_result = await db.execute(
        select(Strategy, User.username)
        .join(User, Strategy.author_id == User.id)
        .where(
            Strategy.author_id.in_(following_ids),
            Strategy.is_public == True,
        )
        .order_by(desc(Strategy.created_at))
        .limit(limit * 2)
    )
    strategy_items = [
        {
            "type": "strategy",
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "username": uname,
            "user_id": s.author_id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "link": f"/strategies/{s.id}",
            "extra": {
                "vote_count": s.vote_count,
                "fork_count": s.fork_count,
            },
        }
        for s, uname in strats_result.all()
    ]

    # Fetch recent competition entries from followed users
    entries_result = await db.execute(
        select(CompetitionEntry, Competition, User.username, Strategy.title)
        .join(Competition, CompetitionEntry.competition_id == Competition.id)
        .join(User, CompetitionEntry.user_id == User.id)
        .join(Strategy, CompetitionEntry.strategy_id == Strategy.id)
        .where(CompetitionEntry.user_id.in_(following_ids))
        .order_by(desc(CompetitionEntry.submitted_at))
        .limit(limit * 2)
    )
    entry_items = [
        {
            "type": "competition_entry",
            "id": entry.id,
            "title": f"Entered {comp.title}",
            "description": f"Strategy: {strat_title}",
            "username": uname,
            "user_id": entry.user_id,
            "created_at": entry.submitted_at.isoformat() if entry.submitted_at else None,
            "link": f"/competitions/{comp.id}",
            "extra": {
                "rank": entry.rank,
                "total_return": entry.total_return,
                "competition_status": comp.status.value,
            },
        }
        for entry, comp, uname, strat_title in entries_result.all()
    ]

    # Fetch recent forum threads from followed users
    threads_result = await db.execute(
        select(ForumThread, ForumTopic, User.username)
        .join(ForumTopic, ForumThread.topic_id == ForumTopic.id)
        .join(User, ForumThread.author_id == User.id)
        .where(ForumThread.author_id.in_(following_ids))
        .order_by(desc(ForumThread.created_at))
        .limit(limit * 2)
    )
    thread_items = [
        {
            "type": "thread",
            "id": t.id,
            "title": t.title,
            "description": f"New thread in {topic.name}",
            "username": uname,
            "user_id": t.author_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "link": f"/community/{topic.slug}/{t.id}",
            "extra": {
                "topic_name": topic.name,
                "topic_slug": topic.slug,
            },
        }
        for t, topic, uname in threads_result.all()
    ]

    # Fetch recent forum posts (replies) from followed users
    posts_result = await db.execute(
        select(ForumPost, ForumThread, ForumTopic, User.username)
        .join(ForumThread, ForumPost.thread_id == ForumThread.id)
        .join(ForumTopic, ForumThread.topic_id == ForumTopic.id)
        .join(User, ForumPost.author_id == User.id)
        .where(ForumPost.author_id.in_(following_ids))
        .order_by(desc(ForumPost.created_at))
        .limit(limit * 2)
    )
    # Skip the first post of each thread (that's the thread itself, already covered above)
    post_items = []
    for p, t, topic, uname in posts_result.all():
        post_items.append({
            "type": "post",
            "id": p.id,
            "title": f"Replied in {t.title}",
            "description": p.content[:120] + ("..." if len(p.content) > 120 else ""),
            "username": uname,
            "user_id": p.author_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "link": f"/community/{topic.slug}/{t.id}",
            "extra": {
                "thread_title": t.title,
                "topic_name": topic.name,
            },
        })

    # Merge and sort by created_at
    combined = sorted(
        strategy_items + entry_items + thread_items + post_items,
        key=lambda x: x["created_at"] or "",
        reverse=True,
    )

    return combined[skip : skip + limit]


# ─── Skill Endorsements ──────────────────────────────────────────

class EndorseRequest(BaseModel):
    skill: str


@router.get("/{username}/endorsements")
async def get_user_endorsements(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get skill endorsements for a user, grouped by skill with counts."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")

    # Get counts per skill
    counts_result = await db.execute(
        select(SkillEndorsement.skill, func.count(SkillEndorsement.id))
        .where(SkillEndorsement.target_id == target.id)
        .group_by(SkillEndorsement.skill)
        .order_by(desc(func.count(SkillEndorsement.id)))
    )
    counts = {skill: count for skill, count in counts_result.all()}

    # Get which skills current user has endorsed
    your_endorsements: set[str] = set()
    if current_user and current_user.id != target.id:
        your_result = await db.execute(
            select(SkillEndorsement.skill).where(
                SkillEndorsement.endorser_id == current_user.id,
                SkillEndorsement.target_id == target.id,
            )
        )
        your_endorsements = {r[0] for r in your_result.all()}

    # Build response: all endorsed skills + available skills
    endorsements = []
    for skill in ENDORSABLE_SKILLS:
        count = counts.get(skill, 0)
        if count > 0 or (current_user and current_user.id != target.id):
            endorsements.append({
                "skill": skill,
                "label": SKILL_LABELS.get(skill, skill),
                "count": count,
                "endorsed_by_you": skill in your_endorsements,
            })

    return endorsements


@router.post("/{username}/endorsements")
async def endorse_skill(
    username: str,
    data: EndorseRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Endorse a user for a specific skill."""
    if data.skill not in ENDORSABLE_SKILLS:
        raise HTTPException(400, f"Invalid skill. Valid: {', '.join(ENDORSABLE_SKILLS)}")

    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "You cannot endorse yourself")

    existing = await db.scalar(
        select(SkillEndorsement).where(
            SkillEndorsement.endorser_id == current_user.id,
            SkillEndorsement.target_id == target.id,
            SkillEndorsement.skill == data.skill,
        )
    )
    if existing:
        raise HTTPException(400, "Already endorsed this skill")

    endorsement = SkillEndorsement(
        endorser_id=current_user.id,
        target_id=target.id,
        skill=data.skill,
    )
    db.add(endorsement)
    await db.flush()

    count = await db.scalar(
        select(func.count(SkillEndorsement.id)).where(
            SkillEndorsement.target_id == target.id,
            SkillEndorsement.skill == data.skill,
        )
    ) or 0

    return {"skill": data.skill, "count": count, "endorsed_by_you": True}


@router.delete("/{username}/endorsements/{skill}")
async def remove_endorsement(
    username: str,
    skill: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove your endorsement of a user for a specific skill."""
    target = await db.scalar(select(User).where(User.username == username))
    if not target:
        raise HTTPException(404, "User not found")

    existing = await db.scalar(
        select(SkillEndorsement).where(
            SkillEndorsement.endorser_id == current_user.id,
            SkillEndorsement.target_id == target.id,
            SkillEndorsement.skill == skill,
        )
    )
    if not existing:
        raise HTTPException(400, "Endorsement not found")

    await db.delete(existing)
    await db.flush()

    count = await db.scalar(
        select(func.count(SkillEndorsement.id)).where(
            SkillEndorsement.target_id == target.id,
            SkillEndorsement.skill == skill,
        )
    ) or 0

    return {"skill": skill, "count": count, "endorsed_by_you": False}
