from fastapi import APIRouter, Depends, HTTPException, Request, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.limiter import limiter
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.backtest import Backtest
from app.models.strategy import Strategy
from app.schemas.backtest import BacktestCreate, BacktestResponse
from app.tasks.backtest import run_backtest_task, run_optimization_task, run_walk_forward_task, run_monte_carlo_task

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas for advanced features
# ---------------------------------------------------------------------------

class OptimizeRequest(BaseModel):
    strategy_id: int
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    param_grid: dict = Field(..., description="e.g. {'fast': [5,10,20], 'slow': [30,50,100]}")
    interval: str = "1d"


class WalkForwardRequest(BaseModel):
    strategy_id: int
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    n_splits: int = Field(default=5, ge=2, le=20)
    train_pct: float = Field(default=0.7, ge=0.5, le=0.9)
    interval: str = "1d"


class MonteCarloRequest(BaseModel):
    backtest_id: int
    n_simulations: int = Field(default=1000, ge=100, le=10000)


@router.post("/", response_model=BacktestResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_backtest(
    request: Request,
    backtest_in: BacktestCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify strategy exists and user has access
    result = await db.execute(select(Strategy).where(Strategy.id == backtest_in.strategy_id))
    strategy = result.scalar_one_or_none()

    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")

    if not strategy.is_public and strategy.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Build the backtest record — copy config into parameters for the Celery task
    data = backtest_in.model_dump()
    additional_symbols = data.pop("symbols", None)
    data["parameters"] = {
        **data.get("parameters", {}),
        "slippage": data.get("slippage", 0.001),
        "commission": data.get("commission", 0.001),
        "sizing_method": data.pop("sizing_method", "full"),
        "sizing_value": data.pop("sizing_value", None),
        "stop_loss_pct": data.pop("stop_loss_pct", None),
        "take_profit_pct": data.pop("take_profit_pct", None),
        "benchmark_symbol": data.pop("benchmark_symbol", None),
        "interval": data.pop("interval", "1d"),
        "additional_symbols": additional_symbols,
    }

    backtest = Backtest(
        **data,
        user_id=current_user.id,
    )
    db.add(backtest)
    await db.flush()
    await db.refresh(backtest)

    # Queue Celery task
    task = run_backtest_task.delay(backtest.id)
    backtest.celery_task_id = task.id
    await db.flush()

    return backtest


@router.get("/", response_model=list[BacktestResponse])
async def list_my_backtests(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Backtest)
        .where(Backtest.user_id == current_user.id)
        .order_by(Backtest.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{backtest_id}", response_model=BacktestResponse)
async def get_backtest(
    backtest_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    backtest = result.scalar_one_or_none()

    if not backtest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not found")

    if backtest.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return backtest


@router.delete("/{backtest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_backtest(
    backtest_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    backtest = result.scalar_one_or_none()

    if not backtest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not found")

    if backtest.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await db.delete(backtest)
    await db.commit()


# ---------------------------------------------------------------------------
# Advanced: Optimization
# ---------------------------------------------------------------------------

@router.post("/optimize")
@limiter.limit("5/minute")
async def optimize_strategy(
    request: Request,
    body: OptimizeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run a grid search over parameter combinations."""
    result = await db.execute(select(Strategy).where(Strategy.id == body.strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not strategy.is_public and strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    task = run_optimization_task.delay(
        code=strategy.code,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        param_grid=body.param_grid,
        interval=body.interval,
    )
    return {"task_id": task.id, "status": "queued"}


@router.get("/optimize/{task_id}")
async def get_optimization_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll optimization task result."""
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": str(result.result)}
    return {"status": result.state.lower()}


# ---------------------------------------------------------------------------
# Advanced: Walk-Forward Analysis
# ---------------------------------------------------------------------------

@router.post("/walk-forward")
@limiter.limit("5/minute")
async def walk_forward_analysis(
    request: Request,
    body: WalkForwardRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run walk-forward analysis on a strategy."""
    result = await db.execute(select(Strategy).where(Strategy.id == body.strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not strategy.is_public and strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    task = run_walk_forward_task.delay(
        code=strategy.code,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        n_splits=body.n_splits,
        train_pct=body.train_pct,
        interval=body.interval,
    )
    return {"task_id": task.id, "status": "queued"}


@router.get("/walk-forward/{task_id}")
async def get_walk_forward_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll walk-forward task result."""
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": str(result.result)}
    return {"status": result.state.lower()}


# ---------------------------------------------------------------------------
# Advanced: Monte Carlo Simulation
# ---------------------------------------------------------------------------

@router.post("/{backtest_id}/monte-carlo")
@limiter.limit("5/minute")
async def monte_carlo_simulation(
    request: Request,
    backtest_id: int,
    body: MonteCarloRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run Monte Carlo simulation on a completed backtest's trades."""
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    backtest = result.scalar_one_or_none()
    if not backtest:
        raise HTTPException(status_code=404, detail="Backtest not found")
    if backtest.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not backtest.results or not backtest.results.get("trades"):
        raise HTTPException(status_code=400, detail="Backtest has no trade data")

    task = run_monte_carlo_task.delay(
        trades=backtest.results["trades"],
        initial_capital=backtest.initial_capital,
        n_simulations=body.n_simulations,
    )
    return {"task_id": task.id, "status": "queued"}


@router.get("/monte-carlo/{task_id}")
async def get_monte_carlo_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll Monte Carlo task result."""
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": str(result.result)}
    return {"status": result.state.lower()}
