from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.strategy import Strategy
from app.models.social import Vote, Comment
from app.schemas.social import VoteCreate, VoteResponse, CommentCreate, CommentResponse, CommentUpdate
from app.services.notifications import create_notification

router = APIRouter()


# Votes
@router.post("/votes", response_model=VoteResponse)
async def vote_on_strategy(
    vote_in: VoteCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify strategy exists
    result = await db.execute(select(Strategy).where(Strategy.id == vote_in.strategy_id))
    strategy = result.scalar_one_or_none()
    
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    if not strategy.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot vote on private strategy")
    
    # Check for existing vote
    result = await db.execute(
        select(Vote).where(Vote.user_id == current_user.id, Vote.strategy_id == vote_in.strategy_id)
    )
    existing_vote = result.scalar_one_or_none()
    
    if vote_in.value == 0:
        # Remove vote
        if existing_vote:
            strategy.vote_count -= existing_vote.value
            await db.delete(existing_vote)
            await db.flush()
        raise HTTPException(status_code=status.HTTP_204_NO_CONTENT)
    
    if existing_vote:
        # Update vote
        strategy.vote_count -= existing_vote.value
        strategy.vote_count += vote_in.value
        existing_vote.value = vote_in.value
        await db.flush()
        await db.refresh(existing_vote)
        return existing_vote
    
    # Create new vote
    vote = Vote(
        user_id=current_user.id,
        strategy_id=vote_in.strategy_id,
        value=vote_in.value,
    )
    strategy.vote_count += vote_in.value
    db.add(vote)
    await db.flush()
    await db.refresh(vote)
    
    return vote


# Comments
@router.post("/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    comment_in: CommentCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify strategy exists
    result = await db.execute(select(Strategy).where(Strategy.id == comment_in.strategy_id))
    strategy = result.scalar_one_or_none()
    
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    if not strategy.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot comment on private strategy")
    
    parent = None
    if comment_in.parent_id:
        result = await db.execute(select(Comment).where(Comment.id == comment_in.parent_id))
        parent = result.scalar_one_or_none()
        if not parent or parent.strategy_id != comment_in.strategy_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid parent comment")

    comment = Comment(
        user_id=current_user.id,
        strategy_id=comment_in.strategy_id,
        content=comment_in.content,
        parent_id=comment_in.parent_id,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)

    # Notify strategy author when someone comments (unless it's the author)
    strategy_author_id = strategy.author_id
    link = f"/strategies/{strategy.id}"
    if strategy_author_id != current_user.id:
        await create_notification(
            db,
            strategy_author_id,
            "strategy_comment",
            f"{current_user.username} commented on your strategy \"{(strategy.title or '')[:50]}{'...' if len(strategy.title or '') > 50 else ''}\"",
            link,
            category="strategy",
            actor_id=current_user.id,
            extra_data={"strategy_id": strategy.id, "strategy_title": strategy.title, "comment_id": comment.id},
        )

    # If replying to a comment, also notify the parent comment author
    if parent and parent.user_id != current_user.id and parent.user_id != strategy_author_id:
        await create_notification(
            db,
            parent.user_id,
            "strategy_comment_reply",
                f"{current_user.username} replied to your comment on \"{(strategy.title or '')[:50]}{'...' if len(strategy.title or '') > 50 else ''}\"",
            link,
            category="strategy",
            actor_id=current_user.id,
            extra_data={"strategy_id": strategy.id, "strategy_title": strategy.title, "comment_id": comment.id, "parent_comment_id": parent.id},
        )

    return comment


@router.get("/strategies/{strategy_id}/comments", response_model=list[CommentResponse])
async def list_strategy_comments(
    strategy_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Comment)
        .where(Comment.strategy_id == strategy_id)
        .order_by(Comment.created_at.asc())
    )
    return result.scalars().all()


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: int,
    comment_update: CommentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    comment.content = comment_update.content
    await db.flush()
    await db.refresh(comment)
    
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    await db.delete(comment)
