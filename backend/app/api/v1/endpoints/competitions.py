"""Competition, leaderboard, and proposal/voting API endpoints."""

import random
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.limiter import limiter
from app.api.deps import get_current_active_user, get_current_user_optional
from app.models.user import User
from app.models.competition import Competition, CompetitionEntry, CompetitionStatus
from app.models.forum import ForumTopic, ForumThread
from app.models.strategy import Strategy
from app.models.backtest import Backtest
from app.tasks.competition import (
    evaluate_competition_entry_task,
    award_competition_badges_task,
    post_competition_archive_task,
)

router = APIRouter()

# Templates for generated competition previews (matches promote task)
_PROPOSAL_TEMPLATES = [
    {"title": "Blue Chip Showdown — {symbol}", "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META"], "ranking_metric": "sharpe_ratio", "capital": 100000, "period_months": 12},
    {"title": "Momentum Month — {symbol}", "symbols": ["TSLA", "NVDA", "AMD", "COIN", "MSTR"], "ranking_metric": "total_return", "capital": 25000, "period_months": 3},
    {"title": "Drawdown Survivor — {symbol}", "symbols": ["SPY", "QQQ", "IWM", "BTC-USD"], "ranking_metric": "max_drawdown", "capital": 50000, "period_months": 6},
    {"title": "Crypto Gauntlet — {symbol}", "symbols": ["BTC-USD", "ETH-USD", "SOL-USD"], "ranking_metric": "sortino_ratio", "capital": 10000, "period_months": 6},
    {"title": "Balanced Returns — {symbol}", "symbols": ["SPY", "QQQ", "AAPL", "MSFT"], "ranking_metric": "sharpe_ratio", "ranking_metrics": ["sharpe_ratio", "total_return", "win_rate"], "capital": 50000, "period_months": 12},
    {"title": "Small Cap Sprint — {symbol}", "symbols": ["IWM", "ARKK", "XBI"], "ranking_metric": "calmar_ratio", "capital": 25000, "period_months": 6},
    {"title": "Index Tracker — {symbol}", "symbols": ["SPY", "DIA", "QQQ", "VTI"], "ranking_metric": "total_return", "capital": 100000, "period_months": 12},
]


# ─── Schemas ────────────────────────────────────────────────────────

class CompetitionCreate(BaseModel):
    title: str
    description: str | None = None
    symbol: str
    backtest_start: str
    backtest_end: str
    initial_capital: float = 10000
    ranking_metric: str = "sharpe_ratio"
    ranking_metrics: list[str] | None = None
    start_date: str
    end_date: str
    max_entries: int | None = None
    rules: dict | None = None


class CompetitionEntryCreate(BaseModel):
    strategy_id: int


# ─── Competition CRUD ───────────────────────────────────────────────

@router.get("/")
@limiter.limit("60/minute")
async def list_competitions(
    request: Request,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all competitions, optionally filtered by status."""
    query = (
        select(Competition)
        .options(selectinload(Competition.entries))
        .order_by(desc(Competition.created_at))
    )
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
            "symbols": c.symbols if c.symbols and len(c.symbols) > 1 else None,
            "status": c.status.value,
            "ranking_metric": c.ranking_metric,
            "ranking_metrics": c.ranking_metrics,
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


@router.get("/upcoming-preview")
@limiter.limit("60/minute")
async def get_upcoming_preview(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Live top 5 competition proposals from the last 7 days (by vote_score).
    Updates as votes change. These become next week's competitions when promote runs Monday."""
    topic = await db.scalar(
        select(ForumTopic).where(ForumTopic.slug == "competition-ideas")
    )
    if not topic:
        return []

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    result = await db.execute(
        select(ForumThread)
        .options(joinedload(ForumThread.author))
        .where(
            ForumThread.topic_id == topic.id,
            ForumThread.proposal_data.isnot(None),
            ForumThread.created_at >= week_ago,
            ForumThread.created_at <= now,
        )
        .order_by(ForumThread.vote_score.desc().nullslast())
        .limit(5)
    )
    threads = result.scalars().all()

    # Next Monday for display
    days_until_monday = (7 - now.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = (now + timedelta(days=days_until_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end_date = next_monday + timedelta(days=7)

    out = []
    for thr in threads:
        pd = thr.proposal_data
        if not pd or not isinstance(pd, dict):
            continue
        symbols = pd.get("symbols")
        symbol = pd.get("symbol")
        if symbols and isinstance(symbols, list) and len(symbols) > 0:
            symbol = symbols[0]
        backtest_start = pd.get("backtest_start")
        backtest_end = pd.get("backtest_end")
        if not all([symbol, backtest_start, backtest_end]):
            continue
        symbols_list = symbols if symbols and isinstance(symbols, list) else [str(symbol).upper()]
        symbols_list = [str(s).upper() for s in symbols_list if s]
        out.append({
            "thread_id": thr.id,
            "title": thr.title,
            "description": None,
            "symbol": str(symbol).upper(),
            "symbols": symbols_list if len(symbols_list) > 1 else None,
            "ranking_metric": pd.get("ranking_metric") or "sharpe_ratio",
            "ranking_metrics": pd.get("ranking_metrics") if isinstance(pd.get("ranking_metrics"), list) else None,
            "start_date": next_monday.isoformat(),
            "end_date": end_date.isoformat(),
            "backtest_start": str(backtest_start),
            "backtest_end": str(backtest_end),
            "initial_capital": float(pd.get("initial_capital", 10000)),
            "vote_score": thr.vote_score or 0,
            "author_username": thr.author.username if thr.author else None,
            "is_placeholder": False,
        })

    # Fill to 5 with generated placeholders (deterministic per week - only replaced by community proposals)
    fill_count = 5 - len(out)
    if fill_count > 0:
        community_titles = {o["title"] for o in out}
        recent_titles_result = await db.execute(
            select(Competition.title).where(
                Competition.created_at >= now - relativedelta(weeks=8)
            )
        )
        recent_titles = {r[0] for r in recent_titles_result.fetchall()}
        used_titles = community_titles | recent_titles

        # Deterministic seed from next week's ISO year+week so placeholders stay fixed all week
        iso = next_monday.isocalendar()
        seed = iso[0] * 100 + iso[1]
        rng = random.Random(seed)

        templates = list(_PROPOSAL_TEMPLATES)
        rng.shuffle(templates)
        end_dt = now - relativedelta(months=1)
        placeholder_pool = []
        for tmpl in templates:
            if len(placeholder_pool) >= 8:
                break
            for symbol in tmpl["symbols"]:
                if len(placeholder_pool) >= 8:
                    break
                title = tmpl["title"].format(symbol=symbol)
                if title in recent_titles:
                    continue
                if any(p["title"] == title for p in placeholder_pool):
                    continue
                start_dt = end_dt - relativedelta(months=tmpl["period_months"])
                placeholder_pool.append({
                    "thread_id": None,
                    "title": title,
                    "description": None,
                    "symbol": symbol,
                    "symbols": None,
                    "ranking_metric": tmpl.get("ranking_metric", "sharpe_ratio"),
                    "ranking_metrics": tmpl.get("ranking_metrics"),
                    "start_date": next_monday.isoformat(),
                    "end_date": end_date.isoformat(),
                    "backtest_start": start_dt.strftime("%Y-%m-%d"),
                    "backtest_end": end_dt.strftime("%Y-%m-%d"),
                    "initial_capital": tmpl.get("capital", 10000),
                    "vote_score": 0,
                    "author_username": None,
                    "is_placeholder": True,
                })

        for p in placeholder_pool:
            if len(out) >= 5:
                break
            if p["title"] not in used_titles:
                out.append(p)
                used_titles.add(p["title"])
    return out


@router.post("/")
@limiter.limit("10/minute")
async def create_competition(
    request: Request,
    data: CompetitionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new competition. Admin only."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can create competitions directly")

    # Validate dates
    try:
        start_dt = datetime.fromisoformat(data.start_date)
        end_dt = datetime.fromisoformat(data.end_date)
        bt_start = datetime.fromisoformat(data.backtest_start)
        bt_end = datetime.fromisoformat(data.backtest_end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format (YYYY-MM-DD)")
    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")
    if bt_start >= bt_end:
        raise HTTPException(status_code=400, detail="backtest_start must be before backtest_end")

    competition = Competition(
        title=data.title,
        description=data.description,
        symbol=data.symbol,
        start_date=start_dt,
        end_date=end_dt,
        backtest_start=bt_start,
        backtest_end=bt_end,
        initial_capital=data.initial_capital,
        ranking_metric=data.ranking_metric,
        ranking_metrics=data.ranking_metrics,
        max_entries=data.max_entries,
        rules=data.rules,
        created_by=current_user.id,
    )
    db.add(competition)
    await db.commit()
    await db.refresh(competition)
    return {"id": competition.id, "title": competition.title, "status": competition.status.value}


# ─── Competition Detail Routes ──────────────────────────────────────

@router.get("/{competition_id}")
@limiter.limit("60/minute")
async def get_competition(
    request: Request,
    competition_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get competition details."""
    result = await db.execute(
        select(Competition)
        .options(selectinload(Competition.entries))
        .where(Competition.id == competition_id)
    )
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return {
        "id": competition.id,
        "title": competition.title,
        "description": competition.description,
        "symbol": competition.symbol,
        "symbols": competition.symbols if competition.symbols and len(competition.symbols) > 1 else None,
        "status": competition.status.value,
        "ranking_metric": competition.ranking_metric,
        "ranking_metrics": competition.ranking_metrics,
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
@limiter.limit("20/minute")
async def enter_competition(
    request: Request,
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

    # Reject entries after end_date even if status hasn't been swept to COMPLETED yet
    if competition.end_date and datetime.utcnow() >= competition.end_date:
        raise HTTPException(status_code=400, detail="Competition entry period has ended")

    # Lock the competition row to prevent race conditions on entry count
    from sqlalchemy import func as sa_func
    locked_comp = await db.scalar(
        select(Competition).where(Competition.id == competition_id).with_for_update()
    )
    if not locked_comp:
        raise HTTPException(status_code=404, detail="Competition not found")

    if locked_comp.max_entries:
        entry_count = await db.scalar(
            select(sa_func.count(CompetitionEntry.id)).where(CompetitionEntry.competition_id == competition_id)
        )
        if (entry_count or 0) >= locked_comp.max_entries:
            raise HTTPException(status_code=400, detail="Competition is full")

    existing_entry = await db.execute(
        select(CompetitionEntry).where(
            CompetitionEntry.competition_id == competition_id,
            CompetitionEntry.user_id == current_user.id,
        )
    )
    if existing_entry.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already have an entry in this competition")

    strat_result = await db.execute(select(Strategy).where(Strategy.id == data.strategy_id))
    strategy = strat_result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only submit your own strategies")

    entry = CompetitionEntry(
        competition_id=competition_id,
        user_id=current_user.id,
        strategy_id=data.strategy_id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    evaluate_competition_entry_task.delay(entry.id)
    return {"id": entry.id, "status": "submitted", "message": "Entry submitted. Evaluation will run shortly."}


@router.get("/{competition_id}/leaderboard")
@limiter.limit("60/minute")
async def get_leaderboard(
    request: Request,
    competition_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get the competition leaderboard."""
    result = await db.execute(select(Competition).where(Competition.id == competition_id))
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")

    entries_result = await db.execute(
        select(CompetitionEntry, User, Strategy)
        .join(User, CompetitionEntry.user_id == User.id)
        .join(Strategy, CompetitionEntry.strategy_id == Strategy.id)
        .where(CompetitionEntry.competition_id == competition_id)
        .order_by(desc(CompetitionEntry.score))
    )
    rows = entries_result.all()

    leaderboard = []
    for i, (entry, user, strategy) in enumerate(rows):
        leaderboard.append({
            "rank": entry.rank,
            "user_id": entry.user_id,
            "username": user.username,
            "strategy_id": entry.strategy_id,
            "strategy_title": strategy.title,
            "score": entry.score,
            "total_return": entry.total_return,
            "sharpe_ratio": entry.sharpe_ratio,
            "max_drawdown": entry.max_drawdown,
            "win_rate": entry.win_rate,
            "sortino_ratio": entry.sortino_ratio,
            "total_trades": entry.total_trades,
            "evaluated_at": entry.evaluated_at.isoformat() if entry.evaluated_at else None,
            "submitted_at": entry.submitted_at.isoformat() if entry.submitted_at else None,
        })
    return {
        "competition_id": competition_id,
        "title": competition.title,
        "ranking_metric": competition.ranking_metric,
        "ranking_metrics": competition.ranking_metrics,
        "leaderboard": leaderboard,
    }


@router.patch("/{competition_id}/status")
@limiter.limit("30/minute")
async def update_competition_status(
    request: Request,
    competition_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update competition status. Creator/admin only."""
    status_val = body.get("status")
    if status_val not in ("draft", "active", "judging", "completed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.execute(select(Competition).where(Competition.id == competition_id))
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    if competition.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only competition creator or admin can update status")
    competition.status = CompetitionStatus(status_val)
    if status_val == "completed":
        award_competition_badges_task.delay(competition_id)
        post_competition_archive_task.delay(competition_id)
    await db.commit()
    return {"status": competition.status.value}


@router.get("/{competition_id}/equity-curves")
@limiter.limit("60/minute")
async def get_competition_equity_curves(
    request: Request,
    competition_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Return equity curves for all evaluated entries in a competition."""
    result = await db.execute(select(Competition).where(Competition.id == competition_id))
    competition = result.scalar_one_or_none()
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")

    entries_result = await db.execute(
        select(CompetitionEntry, User, Backtest)
        .join(User, CompetitionEntry.user_id == User.id)
        .outerjoin(Backtest, CompetitionEntry.backtest_id == Backtest.id)
        .where(CompetitionEntry.competition_id == competition_id)
        .order_by(desc(CompetitionEntry.score))
    )
    rows = entries_result.all()

    curves = []
    for entry, user, backtest in rows:
        if not backtest or not backtest.results:
            continue
        equity_curve = backtest.results.get("equity_curve")
        if not equity_curve or not isinstance(equity_curve, list):
            continue

        max_points = 200
        raw = equity_curve
        if len(raw) > max_points:
            step = len(raw) / max_points
            raw = [raw[int(i * step)] for i in range(max_points)]
            if raw[-1] != equity_curve[-1]:
                raw[-1] = equity_curve[-1]

        curves.append({
            "username": user.username,
            "rank": entry.rank,
            "total_return": entry.total_return,
            "equity_curve": raw,
        })

    return {"competition_id": competition_id, "curves": curves}
