import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, and_

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_user_optional
from app.models.user import User
from app.models.forum import ForumTopic, ForumThread, ForumPost, ThreadVote, PostVote
from app.models.notification import Notification
from app.websocket.manager import manager
from app.schemas.forum import (
    ForumTopicResponse,
    ForumThreadSummary,
    ForumThreadCreate,
    ForumThreadDetail,
    ForumPostResponse,
    ForumPostCreate,
    ForumPostUpdate,
    ForumSearchResult,
    ThreadVoteCreate,
    PostVoteCreate,
    ProposalThreadCreate,
)
from app.core.limiter import limiter
from app.services.achievements import check_community_achievements

router = APIRouter()

MENTION_RE = re.compile(r"@([a-zA-Z0-9_]+)")


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def create_mention_notifications(
    db,
    content: str,
    actor_id: int,
    actor_username: str,
    post_id: int,
    topic_slug: str,
    thread_id: int,
):
    """Parse @mentions and create notifications. Dedupes by username."""
    usernames = set(MENTION_RE.findall(content))
    usernames.discard(actor_username)
    if not usernames:
        return
    link = f"/community/{topic_slug}/{thread_id}"
    for username in usernames:
        target = await db.scalar(select(User).where(User.username.ilike(username)))
        if target and target.id != actor_id and getattr(target, "notify_on_mention", True):
            n = Notification(
                user_id=target.id,
                actor_id=actor_id,
                type="mention",
                message=f"{actor_username} mentioned you in a post",
                link=link,
                post_id=post_id,
            )
            db.add(n)
            await db.flush()
            await manager.send_personal(target.id, {
                "type": "notification",
                "id": n.id,
                "message": n.message,
                "link": link,
                "actor_username": actor_username,
                "created_at": n.created_at.isoformat() if n.created_at else "",
            })


@router.get("/search", response_model=list[ForumSearchResult])
async def search_threads(
    q: str | None = Query(None, description="Keywords to search in thread title and post content"),
    sections: str | None = Query(None, description="Comma-separated sections: official,community,competitions,education,support"),
    date_from: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    posted_by: str | None = Query(None, description="Filter by author username"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Advanced search for forum threads. All filters are optional."""
    base = (
        select(ForumThread, ForumTopic, User.username, func.count(ForumPost.id).label("post_count"))
        .join(ForumTopic, ForumThread.topic_id == ForumTopic.id)
        .join(User, ForumThread.author_id == User.id)
        .outerjoin(ForumPost, ForumPost.thread_id == ForumThread.id)
        .group_by(ForumThread.id, ForumTopic.id, User.username)
    )

    filters = []

    if sections:
        section_list = [s.strip().lower() for s in sections.split(",") if s.strip()]
        if section_list:
            filters.append(ForumTopic.section.in_(section_list))

    if date_from:
        try:
            dt = datetime.strptime(date_from, "%Y-%m-%d")
            filters.append(ForumThread.created_at >= dt)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d")
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            filters.append(ForumThread.created_at <= dt)
        except ValueError:
            pass

    if posted_by and posted_by.strip():
        match = f"%{_escape_like(posted_by.strip())}%"
        subq_thread_author = (
            select(ForumThread.id)
            .join(User, ForumThread.author_id == User.id)
            .where(User.username.ilike(match))
        )
        subq_post_author = (
            select(ForumPost.thread_id)
            .join(User, ForumPost.author_id == User.id)
            .where(User.username.ilike(match))
        )
        filters.append(or_(ForumThread.id.in_(subq_thread_author), ForumThread.id.in_(subq_post_author)))

    if q and q.strip():
        kw = f"%{_escape_like(q.strip())}%"
        subq_title = select(ForumThread.id).where(ForumThread.title.ilike(kw))
        subq_content = (
            select(ForumPost.thread_id).where(ForumPost.content.ilike(kw))
        )
        filters.append(or_(ForumThread.id.in_(subq_title), ForumThread.id.in_(subq_content)))

    for f in filters:
        base = base.where(f)

    base = base.order_by(desc(ForumThread.updated_at)).offset(skip).limit(limit)
    result = await db.execute(base)
    rows = result.all()

    return [
        ForumSearchResult(
            id=thr.id,
            topic_id=thr.topic_id,
            topic_slug=topic.slug,
            topic_name=topic.name,
            section=topic.section,
            author_id=thr.author_id,
            author_username=uname,
            title=thr.title,
            post_count=pc or 0,
            created_at=thr.created_at,
            updated_at=thr.updated_at,
        )
        for thr, topic, uname, pc in rows
    ]


@router.get("/topics", response_model=list[ForumTopicResponse])
async def list_topics(db: AsyncSession = Depends(get_db)):
    """List all forum topics with thread/post counts and latest thread."""
    result = await db.execute(
        select(ForumTopic).order_by(ForumTopic.sort_order, ForumTopic.id)
    )
    topics = result.scalars().all()

    out = []
    for t in topics:
        thread_count = await db.scalar(
            select(func.count(ForumThread.id)).where(ForumThread.topic_id == t.id)
        )
        post_count = await db.scalar(
            select(func.count(ForumPost.id))
            .join(ForumThread, ForumPost.thread_id == ForumThread.id)
            .where(ForumThread.topic_id == t.id)
        )
        latest = await db.execute(
            select(ForumThread, User.username)
            .join(User, ForumThread.author_id == User.id)
            .where(ForumThread.topic_id == t.id)
            .order_by(desc(ForumThread.updated_at))
            .limit(1)
        )
        row = latest.one_or_none()
        latest_thread = None
        if row:
            thr, uname = row
            post_cnt = await db.scalar(select(func.count(ForumPost.id)).where(ForumPost.thread_id == thr.id))
            latest_thread = {
                "id": thr.id,
                "title": thr.title,
                "author_username": uname,
                "updated_at": thr.updated_at.isoformat() if thr.updated_at else None,
                "post_count": post_cnt or 0,
            }
        out.append(ForumTopicResponse(
            id=t.id,
            slug=t.slug,
            name=t.name,
            description=t.description,
            section=t.section,
            sort_order=t.sort_order,
            thread_count=thread_count or 0,
            post_count=post_count or 0,
            latest_thread=latest_thread,
        ))
    return out


@router.get("/topics/{slug}/threads", response_model=list[ForumThreadSummary])
async def list_threads(
    slug: str,
    sort_by: str = Query("updated_at", pattern="^(updated_at|created_at|vote_score)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """List threads in a topic. Default sort by updated_at; use sort_by=vote_score for proposal topics."""
    topic = await db.scalar(select(ForumTopic).where(ForumTopic.slug == slug))
    if not topic:
        raise HTTPException(404, "Topic not found")

    order_col = (
        ForumThread.vote_score if sort_by == "vote_score"
        else ForumThread.created_at if sort_by == "created_at"
        else ForumThread.updated_at
    )
    result = await db.execute(
        select(ForumThread, User.username, func.count(ForumPost.id).label("post_count"))
        .join(User, ForumThread.author_id == User.id)
        .outerjoin(ForumPost, ForumPost.thread_id == ForumThread.id)
        .where(ForumThread.topic_id == topic.id)
        .group_by(ForumThread.id, User.username)
        .order_by(desc(ForumThread.is_pinned), desc(order_col))
        .offset(skip)
        .limit(limit)
    )
    rows = result.all()

    user_votes: dict[int, int] = {}
    if current_user:
        thread_ids = [thr.id for thr, _, _ in rows]
        votes_result = await db.execute(
            select(ThreadVote.thread_id, ThreadVote.value).where(
                ThreadVote.thread_id.in_(thread_ids),
                ThreadVote.user_id == current_user.id,
            )
        )
        user_votes = {r[0]: r[1] for r in votes_result.all()}

    return [
        ForumThreadSummary(
            id=thr.id,
            topic_id=thr.topic_id,
            author_id=thr.author_id,
            author_username=uname,
            title=thr.title,
            post_count=pc or 0,
            vote_score=thr.vote_score or 0,
            your_vote=user_votes.get(thr.id),
            is_pinned=thr.is_pinned or False,
            proposal_data=thr.proposal_data,
            created_at=thr.created_at,
            updated_at=thr.updated_at,
        )
        for thr, uname, pc in rows
    ]


ARCHIVES_TOPIC_SLUG = "archives"


@router.post("/topics/{slug}/threads", response_model=ForumThreadSummary, status_code=201)
@limiter.limit("10/minute")
async def create_thread(
    request: Request,
    slug: str,
    data: ForumThreadCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new thread (and its first post as the body)."""
    if slug == ARCHIVES_TOPIC_SLUG:
        raise HTTPException(403, "Past Competition Archives are read-only. Threads are added automatically when competitions complete.")
    topic = await db.scalar(select(ForumTopic).where(ForumTopic.slug == slug))
    if not topic:
        raise HTTPException(404, "Topic not found")

    thread = ForumThread(
        topic_id=topic.id,
        author_id=current_user.id,
        title=data.title,
    )
    db.add(thread)
    await db.flush()

    post = ForumPost(
        thread_id=thread.id,
        author_id=current_user.id,
        content=data.body,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    await db.refresh(thread)
    await create_mention_notifications(
        db, data.body, current_user.id, current_user.username,
        post.id, topic.slug, thread.id,
    )
    await check_community_achievements(db, current_user.id)

    return ForumThreadSummary(
        id=thread.id,
        topic_id=thread.topic_id,
        author_id=thread.author_id,
        author_username=current_user.username,
        title=thread.title,
        post_count=1,
        vote_score=0,
        your_vote=None,
        is_pinned=False,
        proposal_data=thread.proposal_data,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


PROPOSAL_TOPIC_SLUG = "competition-ideas"


@router.post("/topics/{slug}/proposals", response_model=ForumThreadSummary, status_code=201)
@limiter.limit("5/minute")
async def create_proposal_thread(
    request: Request,
    slug: str,
    data: ProposalThreadCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a competition proposal thread. Only available for competition-ideas topic."""
    if slug != PROPOSAL_TOPIC_SLUG:
        raise HTTPException(404, "Proposal creation only available for Competition Proposals topic")
    topic = await db.scalar(select(ForumTopic).where(ForumTopic.slug == slug))
    if not topic:
        raise HTTPException(404, "Topic not found")

    from datetime import datetime as dt
    try:
        start_dt = dt.strptime(data.backtest_start, "%Y-%m-%d")
        end_dt = dt.strptime(data.backtest_end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format for backtest period")
    if start_dt >= end_dt:
        raise HTTPException(400, "backtest_start must be before backtest_end")

    # Normalize symbols: prefer symbols list, fallback to single symbol
    symbols_list = data.symbols if data.symbols and len(data.symbols) > 0 else (
        [data.symbol.strip().upper()] if data.symbol and data.symbol.strip() else []
    )
    if not symbols_list:
        raise HTTPException(400, "At least one symbol is required")
    if len(symbols_list) > 5:
        raise HTTPException(400, "Maximum 5 symbols allowed")
    symbols_list = [s.strip().upper() for s in symbols_list if s.strip()][:5]
    primary_symbol = symbols_list[0]

    VALID_METRICS = {"sharpe_ratio", "total_return", "calmar_ratio", "sortino_ratio", "win_rate", "max_drawdown"}
    metrics_list = data.ranking_metrics if data.ranking_metrics and len(data.ranking_metrics) > 0 else [data.ranking_metric]
    metrics_list = [m for m in metrics_list if m in VALID_METRICS]
    if not metrics_list:
        raise HTTPException(400, f"At least one valid ranking metric required. Valid: {VALID_METRICS}")
    primary_metric = metrics_list[0]

    proposal_data = {
        "symbol": primary_symbol,  # For backward compat; competitions use first symbol
        "symbols": symbols_list,
        "backtest_start": data.backtest_start,
        "backtest_end": data.backtest_end,
        "initial_capital": data.initial_capital,
        "ranking_metric": primary_metric,
        "ranking_metrics": metrics_list if len(metrics_list) > 1 else None,
    }

    body_parts = [data.body.strip(), ""]
    body_parts.append("---")
    body_parts.append("**Proposal details:**")
    body_parts.append(f"- Symbol(s): {', '.join(symbols_list)}")
    body_parts.append(f"- Backtest period: {data.backtest_start} to {data.backtest_end}")
    body_parts.append(f"- Initial capital: ${data.initial_capital:,.0f}")
    body_parts.append(f"- Ranking metric(s): {', '.join(metrics_list)}")
    body = "\n".join(body_parts)

    thread = ForumThread(
        topic_id=topic.id,
        author_id=current_user.id,
        title=data.title,
        proposal_data=proposal_data,
    )
    db.add(thread)
    await db.flush()

    post = ForumPost(
        thread_id=thread.id,
        author_id=current_user.id,
        content=body,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    await db.refresh(thread)
    await create_mention_notifications(
        db, body, current_user.id, current_user.username,
        post.id, topic.slug, thread.id,
    )
    await check_community_achievements(db, current_user.id)

    return ForumThreadSummary(
        id=thread.id,
        topic_id=thread.topic_id,
        author_id=thread.author_id,
        author_username=current_user.username,
        title=thread.title,
        post_count=1,
        vote_score=0,
        your_vote=None,
        is_pinned=False,
        proposal_data=thread.proposal_data,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.get("/threads/{thread_id}", response_model=ForumThreadDetail)
async def get_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Get thread with all posts."""
    result = await db.execute(
        select(ForumThread, User.username)
        .join(User, ForumThread.author_id == User.id)
        .where(ForumThread.id == thread_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, "Thread not found")
    thread, author_username = row

    your_vote = None
    if current_user:
        vote_row = await db.scalar(
            select(ThreadVote.value).where(
                ThreadVote.thread_id == thread_id,
                ThreadVote.user_id == current_user.id,
            )
        )
        your_vote = vote_row

    posts_result = await db.execute(
        select(ForumPost, User.username)
        .join(User, ForumPost.author_id == User.id)
        .where(ForumPost.thread_id == thread_id)
        .order_by(ForumPost.created_at)
    )
    posts_data = posts_result.all()
    post_ids = [p.id for p, _ in posts_data]

    # Get user's votes on posts
    post_vote_map: dict[int, int] = {}
    if current_user and post_ids:
        pv_result = await db.execute(
            select(PostVote.post_id, PostVote.value).where(
                PostVote.post_id.in_(post_ids),
                PostVote.user_id == current_user.id,
            )
        )
        post_vote_map = {r[0]: r[1] for r in pv_result.all()}

    posts = [
        ForumPostResponse(
            id=p.id,
            thread_id=p.thread_id,
            author_id=p.author_id,
            author_username=uname,
            content=p.content,
            vote_score=p.vote_score or 0,
            your_vote=post_vote_map.get(p.id),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p, uname in posts_data
    ]

    return ForumThreadDetail(
        id=thread.id,
        topic_id=thread.topic_id,
        author_id=thread.author_id,
        author_username=author_username,
        title=thread.title,
        post_count=len(posts),
        vote_score=thread.vote_score or 0,
        your_vote=your_vote,
        is_pinned=thread.is_pinned or False,
        proposal_data=thread.proposal_data,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        posts=posts,
    )


@router.post("/threads/{thread_id}/vote")
async def vote_thread(
    thread_id: int,
    data: ThreadVoteCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Upvote (+1), downvote (-1), or remove (0) vote on a thread."""
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread:
        raise HTTPException(404, "Thread not found")
    if thread.author_id == current_user.id:
        raise HTTPException(400, "Cannot vote on your own thread")

    existing = await db.scalar(
        select(ThreadVote).where(
            ThreadVote.thread_id == thread_id,
            ThreadVote.user_id == current_user.id,
        )
    )

    if data.value == 0:
        if existing:
            thread.vote_score = (thread.vote_score or 0) - existing.value
            await db.delete(existing)
        await db.flush()
        await db.refresh(thread)
        return {"vote_score": thread.vote_score or 0, "your_vote": None}
    elif existing:
        old_val = existing.value
        existing.value = data.value
        thread.vote_score = (thread.vote_score or 0) - old_val + data.value
        await db.flush()
        await db.refresh(thread)
        return {"vote_score": thread.vote_score or 0, "your_vote": data.value}
    else:
        vote = ThreadVote(thread_id=thread_id, user_id=current_user.id, value=data.value)
        db.add(vote)
        thread.vote_score = (thread.vote_score or 0) + data.value
        await db.flush()
        await db.refresh(thread)
        return {"vote_score": thread.vote_score or 0, "your_vote": data.value}


@router.post("/posts/{post_id}/vote")
async def vote_post(
    post_id: int,
    data: PostVoteCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Upvote (+1), downvote (-1), or remove (0) vote on a post."""
    post = await db.scalar(select(ForumPost).where(ForumPost.id == post_id))
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id == current_user.id:
        raise HTTPException(400, "Cannot vote on your own post")

    existing = await db.scalar(
        select(PostVote).where(
            PostVote.post_id == post_id,
            PostVote.user_id == current_user.id,
        )
    )

    if data.value == 0:
        if existing:
            post.vote_score = (post.vote_score or 0) - existing.value
            await db.delete(existing)
        await db.flush()
        await db.refresh(post)
        return {"vote_score": post.vote_score or 0, "your_vote": None}
    elif existing:
        old_val = existing.value
        existing.value = data.value
        post.vote_score = (post.vote_score or 0) - old_val + data.value
        await db.flush()
        await db.refresh(post)
        return {"vote_score": post.vote_score or 0, "your_vote": data.value}
    else:
        vote = PostVote(post_id=post_id, user_id=current_user.id, value=data.value)
        db.add(vote)
        post.vote_score = (post.vote_score or 0) + data.value
        await db.flush()
        await db.refresh(post)
        return {"vote_score": post.vote_score or 0, "your_vote": data.value}


@router.post("/threads/{thread_id}/pin")
async def toggle_pin_thread(
    thread_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Pin or unpin a thread. Only thread author or superuser can pin."""
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread:
        raise HTTPException(404, "Thread not found")
    if not current_user.is_superuser:
        raise HTTPException(403, "Only admins can pin threads")
    thread.is_pinned = not thread.is_pinned
    await db.flush()
    await db.refresh(thread)
    return {"is_pinned": thread.is_pinned}


@router.post("/threads/{thread_id}/posts", response_model=ForumPostResponse, status_code=201)
@limiter.limit("20/minute")
async def create_post(
    request: Request,
    thread_id: int,
    data: ForumPostCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a reply to a thread."""
    thread = await db.scalar(select(ForumThread).where(ForumThread.id == thread_id))
    if not thread:
        raise HTTPException(404, "Thread not found")

    post = ForumPost(
        thread_id=thread_id,
        author_id=current_user.id,
        content=data.content,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    topic = await db.scalar(select(ForumTopic).where(ForumTopic.id == thread.topic_id))
    if topic:
        await create_mention_notifications(
            db, data.content, current_user.id, current_user.username,
            post.id, topic.slug, thread_id,
        )
    await check_community_achievements(db, current_user.id)

    return ForumPostResponse(
        id=post.id,
        thread_id=post.thread_id,
        author_id=post.author_id,
        author_username=current_user.username,
        content=post.content,
        vote_score=0,
        your_vote=None,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.patch("/posts/{post_id}", response_model=ForumPostResponse)
async def update_post(
    post_id: int,
    data: ForumPostUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit own post."""
    post = await db.scalar(select(ForumPost).where(ForumPost.id == post_id))
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(403, "Not authorized")
    post.content = data.content
    await db.flush()
    await db.refresh(post)
    return ForumPostResponse(
        id=post.id,
        thread_id=post.thread_id,
        author_id=post.author_id,
        author_username=current_user.username,
        content=post.content,
        vote_score=post.vote_score or 0,
        your_vote=None,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete own reply. The main post cannot be deleted."""
    post = await db.scalar(select(ForumPost).where(ForumPost.id == post_id))
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(403, "Not authorized")

    first_post_id = await db.scalar(
        select(func.min(ForumPost.id)).where(ForumPost.thread_id == post.thread_id)
    )
    if post.id == first_post_id:
        raise HTTPException(403, "Cannot delete the main post")

    await db.delete(post)
    await db.flush()
