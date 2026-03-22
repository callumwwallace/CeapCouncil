from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.strategy_group import StrategyGroup
from app.models.strategy import Strategy
from app.schemas.strategy_group import (
    StrategyGroupCreate,
    StrategyGroupUpdate,
    StrategyGroupResponse,
    GroupEmbedResponse,
    StrategySummaryForEmbed,
    ForkGroupResponse,
)
from app.core.limiter import limiter

router = APIRouter()


async def get_or_create_default_group(db: AsyncSession, user_id: int) -> StrategyGroup:
    """Create "My Strategies" if the user doesn't have one yet."""
    result = await db.execute(
        select(StrategyGroup)
        .where(StrategyGroup.user_id == user_id, StrategyGroup.is_default == True)
    )
    group = result.scalar_one_or_none()
    if group:
        return group
    group = StrategyGroup(name="My Strategies", user_id=user_id, is_default=True)
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return group


@router.get("/embed/{share_token}", response_model=GroupEmbedResponse)
@limiter.limit("60/minute")
async def get_group_by_token(
    request: Request,
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Look up a group by share token for forum embeds. Only returns shared groups with public strategies."""
    result = await db.execute(
        select(StrategyGroup)
        .where(StrategyGroup.share_token == share_token)
        .options(selectinload(StrategyGroup.user), selectinload(StrategyGroup.strategies))
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if not group.is_shareable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This group is not shared")
    public_strategies = [s for s in group.strategies if s.is_public]
    return GroupEmbedResponse(
        id=group.id,
        name=group.name,
        share_token=group.share_token,
        author_username=group.user.username,
        strategy_count=len(public_strategies),
        strategies=[
            StrategySummaryForEmbed(id=s.id, title=s.title, share_token=s.share_token, is_public=s.is_public)
            for s in public_strategies
        ],
    )


_FORK_GROUP_MAX_STRATEGIES = 50


@router.post("/embed/{share_token}/fork", response_model=ForkGroupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def fork_group(
    request: Request,
    share_token: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy a shared group into the current user's lab with all its public strategies."""
    result = await db.execute(
        select(StrategyGroup)
        .where(StrategyGroup.share_token == share_token)
        .options(selectinload(StrategyGroup.strategies))
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if not group.is_shareable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This group is not shared")

    strategies_to_fork = [s for s in group.strategies if s.is_public]
    if not strategies_to_fork:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No public strategies to fork",
        )
    if len(strategies_to_fork) > _FORK_GROUP_MAX_STRATEGIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot fork more than {_FORK_GROUP_MAX_STRATEGIES} strategies at once",
        )

    new_group = StrategyGroup(
        name=f"{group.name} (Fork)",
        user_id=current_user.id,
        is_shareable=False,
    )
    db.add(new_group)
    await db.flush()

    forked_strategies = []
    for original in strategies_to_fork:
        forked = Strategy(
            title=f"{original.title} (Fork)",
            description=original.description,
            code=original.code,
            parameters=original.parameters or {},
            is_public=False,
            author_id=current_user.id,
            forked_from_id=original.id,
            group_id=new_group.id,
        )
        db.add(forked)
        original.fork_count += 1
    await db.flush()

    result = await db.execute(
        select(Strategy)
        .where(Strategy.group_id == new_group.id)
        .options(selectinload(Strategy.group))
    )
    forked_list = result.scalars().unique().all()
    await db.refresh(new_group)

    return ForkGroupResponse(
        group=new_group,
        strategies=forked_list,
        forked_count=len(forked_list),
    )


@router.get("/", response_model=list[StrategyGroupResponse])
@limiter.limit("60/minute")
async def list_strategy_groups(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List the user's groups. Creates "My Strategies" if they have none."""
    result = await db.execute(
        select(StrategyGroup)
        .where(StrategyGroup.user_id == current_user.id)
        .order_by(StrategyGroup.name)
    )
    groups = result.scalars().all()
    if not groups:
        default = await get_or_create_default_group(db, current_user.id)
        await db.commit()
        return [default]
    return groups


@router.post("/", response_model=StrategyGroupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_strategy_group(
    request: Request,
    group_in: StrategyGroupCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group."""
    group = StrategyGroup(
        name=group_in.name,
        description=group_in.description,
        user_id=current_user.id,
    )
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return group


@router.patch("/{group_id}", response_model=StrategyGroupResponse)
@limiter.limit("30/minute")
async def update_strategy_group(
    request: Request,
    group_id: int,
    group_update: StrategyGroupUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update group name/description or sharing."""
    result = await db.execute(
        select(StrategyGroup).where(StrategyGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if group.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if group_update.name is not None:
        group.name = group_update.name

    if group_update.description is not None:
        group.description = group_update.description

    if group_update.is_shareable is not None:
        group.is_shareable = group_update.is_shareable

    await db.flush()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_strategy_group(
    request: Request,
    group_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group. Default can't be deleted. Strategies move to default."""
    result = await db.execute(
        select(StrategyGroup).where(StrategyGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if group.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if group.is_default:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete default group")

    default_group = await get_or_create_default_group(db, current_user.id)
    from app.models.strategy import Strategy
    await db.execute(
        update(Strategy).where(Strategy.group_id == group_id).values(group_id=default_group.id)
    )
    await db.delete(group)
