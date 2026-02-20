"""Competition and leaderboard API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.competition import Competition, CompetitionEntry, CompetitionStatus

router = APIRouter()


class CompetitionCreate(BaseModel):
    title: str
    description: str | None = None
    symbol: str
    backtest_start: str
    backtest_end: str
    initial_capital: float = 10000
    ranking_metric: str = "sharpe_ratio"
    start_date: str
    end_date: str
    max_entries: int | None = None
    rules: dict | None = None


class CompetitionEntryCreate(BaseModel):
    strategy_id: int


@router.get("/")
async def list_competitions(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all competitions, optionally filtered by status."""
    query = select(Competition).order_by(desc(Competition.created_at))
    if status:
        query = query.where(Competition.status == CompetitionStatus(status))
    result = await db.execute(query)
    competitions = result.scalars().all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "symbol": c.symbol,
            "status": c.status.value,
            "ranking_metric": c.ranking_metric,
            "start_date": c.start_date.isoformat(),
            "end_date": c.end_date.isoformat(),
            "backtest_start": c.backtest_start.isoformat(),
            "backtest_end": c.backtest_end.isoformat(),
            "initial_capital": c.initial_capital,
            "max_entries": c.max_entries,
            "entry_count": len(c.entries) if c.entries else 0,
            "created_at": c.created_at.isoformat(),
        }
        for c in competitions
    ]


@router.post("/")
async def create_competition(
    data: CompetitionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new competition."""
    competition = Competition(
        title=data.title,
        description=data.description,
        symbol=data.symbol,
        start_date=datetime.fromisoformat(data.start_date),
        end_date=datetime.fromisoformat(data.end_date),
        backtest_start=datetime.fromisoformat(data.backtest_start),
        backtest_end=datetime.fromisoformat(data.backtest_end),
        initial_capital=data.initial_capital,
        ranking_metric=data.ranking_metric,
        max_entries=data.max_entries,
        rules=data.rules,
        created_by=current_user.id,
    )
    db.add(competition)
    await db.commit()
    await db.refresh(competition)
    return {"id": competition.id, "title": competition.title, "status": competition.status.value}


@router.get("/{competition_id}")
async def get_competition(
    competition_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get competition details."""
    result = await db.execute(select(Competition).where(Competition.id == competition_id))
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return {
        "id": competition.id,
        "title": competition.title,
        "description": competition.description,
        "symbol": competition.symbol,
        "status": competition.status.value,
        "ranking_metric": competition.ranking_metric,
        "start_date": competition.start_date.isoformat(),
        "end_date": competition.end_date.isoformat(),
        "backtest_start": competition.backtest_start.isoformat(),
        "backtest_end": competition.backtest_end.isoformat(),
        "initial_capital": competition.initial_capital,
        "max_entries": competition.max_entries,
        "rules": competition.rules,
        "entry_count": len(competition.entries) if competition.entries else 0,
    }


@router.post("/{competition_id}/enter")
async def enter_competition(
    competition_id: int,
    data: CompetitionEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Submit a strategy entry to a competition."""
    result = await db.execute(select(Competition).where(Competition.id == competition_id))
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    if competition.status != CompetitionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Competition is not accepting entries")

    # Check max entries
    if competition.max_entries:
        existing = await db.execute(
            select(CompetitionEntry).where(CompetitionEntry.competition_id == competition_id)
        )
        if len(existing.scalars().all()) >= competition.max_entries:
            raise HTTPException(status_code=400, detail="Competition is full")

    # Check duplicate entry
    existing_entry = await db.execute(
        select(CompetitionEntry).where(
            CompetitionEntry.competition_id == competition_id,
            CompetitionEntry.user_id == current_user.id,
        )
    )
    if existing_entry.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already have an entry in this competition")

    entry = CompetitionEntry(
        competition_id=competition_id,
        user_id=current_user.id,
        strategy_id=data.strategy_id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {"id": entry.id, "status": "submitted"}


@router.get("/{competition_id}/leaderboard")
async def get_leaderboard(
    competition_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get the competition leaderboard (ranked entries)."""
    result = await db.execute(select(Competition).where(Competition.id == competition_id))
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")

    entries_result = await db.execute(
        select(CompetitionEntry)
        .where(CompetitionEntry.competition_id == competition_id)
        .order_by(desc(CompetitionEntry.score))
    )
    entries = entries_result.scalars().all()

    leaderboard = []
    for i, entry in enumerate(entries):
        leaderboard.append({
            "rank": entry.rank or (i + 1),
            "user_id": entry.user_id,
            "strategy_id": entry.strategy_id,
            "score": entry.score,
            "total_return": entry.total_return,
            "sharpe_ratio": entry.sharpe_ratio,
            "max_drawdown": entry.max_drawdown,
            "win_rate": entry.win_rate,
            "sortino_ratio": entry.sortino_ratio,
            "total_trades": entry.total_trades,
            "submitted_at": entry.submitted_at.isoformat() if entry.submitted_at else None,
        })
    return {
        "competition_id": competition_id,
        "title": competition.title,
        "ranking_metric": competition.ranking_metric,
        "leaderboard": leaderboard,
    }
