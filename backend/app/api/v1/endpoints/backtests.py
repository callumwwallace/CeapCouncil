from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.limiter import limiter
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.backtest import Backtest
from app.models.strategy import Strategy
from app.schemas.backtest import BacktestCreate, BacktestResponse, BacktestWithCodeCreate, BacktestEmbedResponse
from app.tasks.backtest import (
    run_backtest_task, run_optimization_task, run_bayesian_optimization_task,
    run_genetic_optimization_task, run_multiobjective_optimization_task,
    run_heatmap_task, run_walk_forward_task, run_monte_carlo_task,
    run_batch_backtest_task, run_oos_validation_task, run_cpcv_task,
    run_factor_attribution_task,
)
from app.services.task_ownership import set_task_owner, verify_task_ownership

router = APIRouter()

# In-memory dataset cache (production would use S3/database)
_dataset_cache: dict[str, dict] = {}
_DATASET_MAX_PER_USER = 5


def _safe_poll_error(result) -> str:
    raw = result.result
    if isinstance(raw, dict) and "error" in raw:
        msg = str(raw["error"])
    else:
        msg = str(raw) if raw is not None else ""
    if any(x in msg for x in ("Traceback", 'File "', "  File ", ".py\"", "\\app\\", "/app/")):
        return "Task failed"
    if len(msg) > 500:
        return msg[:500]
    return msg if msg else "Task failed"


# ---------------------------------------------------------------------------
# Request schemas for advanced features
# ---------------------------------------------------------------------------

class OptimizeRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    param_grid: dict = Field(..., description="e.g. {'fast': [5,10,20], 'slow': [30,50,100]}")
    constraints: dict | None = None
    interval: str = "1d"


class BayesianOptimizeRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    param_ranges: dict = Field(..., description="e.g. {'fast': {'low': 5, 'high': 50, 'type': 'int'}, 'slow': {'low': 20, 'high': 200, 'type': 'int'}}")
    n_trials: int = 50
    objective_metric: str = "sharpe_ratio"
    constraints: dict | None = None
    interval: str = "1d"


class GeneticOptimizeRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    param_ranges: dict = Field(...)
    population_size: int = 50
    n_generations: int = 20
    crossover_prob: float = 0.7
    mutation_prob: float = 0.2
    objective_metric: str = "sharpe_ratio"
    constraints: dict | None = None
    interval: str = "1d"


class MultiObjectiveRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    param_ranges: dict = Field(...)
    n_trials: int = 50
    objective_metrics: list[str] = ["sharpe_ratio", "max_drawdown"]
    directions: list[str] = ["maximize", "minimize"]
    constraints: dict | None = None
    interval: str = "1d"


class HeatmapRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    param_x: str
    param_y: str
    x_range: dict = Field(..., description="{'low': 5, 'high': 50, 'steps': 15}")
    y_range: dict = Field(..., description="{'low': 20, 'high': 200, 'steps': 15}")
    metric: str = "sharpe_ratio"
    constraints: dict | None = None
    interval: str = "1d"


class WalkForwardRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    n_splits: int = Field(default=5, ge=2, le=20)
    train_pct: float = Field(default=0.7, ge=0.5, le=0.9)
    purge_bars: int = Field(default=0, ge=0, le=100)
    window_mode: str = Field(default="rolling", pattern=r"^(rolling|anchored)$")
    interval: str = "1d"
    param_ranges: dict | None = None
    n_trials: int = Field(default=30, ge=5, le=200)


class MonteCarloRequest(BaseModel):
    backtest_id: int
    n_simulations: int = Field(default=1000, ge=100, le=10000)


@router.post("/with-code", response_model=BacktestResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_backtest_with_code(
    request: Request,
    backtest_in: BacktestWithCodeCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create backtest with inline strategy code."""
    data = backtest_in.model_dump()
    data.pop("code", None)
    return await _create_backtest_impl(db, current_user, data, strategy_id=None, code=backtest_in.code)


@router.post("", response_model=BacktestResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_backtest(
    request: Request,
    backtest_in: BacktestCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Must have either strategy_id or code
    if backtest_in.strategy_id is None and (not backtest_in.code or not str(backtest_in.code).strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="strategy_id or code required")
    if backtest_in.strategy_id is not None and backtest_in.code is not None and str(backtest_in.code).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide strategy_id OR code, not both")

    if backtest_in.strategy_id is not None:
        # Verify strategy exists and user has access
        result = await db.execute(select(Strategy).where(Strategy.id == backtest_in.strategy_id))
        strategy = result.scalar_one_or_none()
        if not strategy:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
        if not strategy.is_public and strategy.author_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        strategy_id = backtest_in.strategy_id
        code_override = None
    else:
        strategy_id = None
        code_override = backtest_in.code.strip() if backtest_in.code else None

    data = backtest_in.model_dump()
    data.pop("code", None)
    data.pop("strategy_id", None)
    return await _create_backtest_impl(db, current_user, data, strategy_id=strategy_id, code=code_override)


async def _create_backtest_impl(
    db: AsyncSession,
    current_user: User,
    data: dict,
    *,
    strategy_id: int | None,
    code: str | None,
):
    # Build the backtest record: copy config into parameters for the Celery task
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
        strategy_id=strategy_id,
        code=code.strip() if code and code.strip() else None,
    )
    db.add(backtest)
    await db.flush()
    await db.refresh(backtest)

    # Commit before queuing so the Celery worker can see the backtest (it uses
    # a separate DB connection; without commit, the worker often runs before
    # get_db commits and returns "Backtest not found").
    await db.commit()

    # Queue Celery task
    task = run_backtest_task.delay(backtest.id)
    backtest.celery_task_id = task.id
    await db.commit()

    return backtest


@router.get("", response_model=list[BacktestResponse])
@limiter.limit("60/minute")
async def list_my_backtests(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    result = await db.execute(
        select(Backtest)
        .where(Backtest.user_id == current_user.id)
        .order_by(Backtest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/embed/{share_token}", response_model=BacktestEmbedResponse)
@limiter.limit("60/minute")
async def get_backtest_embed(
    request: Request,
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Token-based endpoint for forum embed cards. The share_token is a UUID
    that cannot be guessed, so no auth is required — the token IS the
    authorization. Only returns summary metrics (no code, no full results)."""
    result = await db.execute(select(Backtest).where(Backtest.share_token == share_token))
    backtest = result.scalar_one_or_none()

    if not backtest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not found")

    if backtest.status != "completed":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not available")

    return backtest


@router.get("/{backtest_id}", response_model=BacktestResponse)
@limiter.limit("60/minute")
async def get_backtest(
    request: Request,
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
@limiter.limit("30/minute")
async def delete_backtest(
    request: Request,
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

async def _resolve_code(
    body_strategy_id: int | None,
    body_code: str | None,
    current_user: User,
    db: AsyncSession,
) -> str:
    """Resolve strategy code from either strategy_id or inline code (for templates)."""
    if body_code:
        return body_code
    if body_strategy_id is None:
        raise HTTPException(status_code=400, detail="Provide strategy_id or code")
    result = await db.execute(select(Strategy).where(Strategy.id == body_strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not strategy.is_public and strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return strategy.code


@router.post("/optimize")
@limiter.limit("5/minute")
async def optimize_strategy(
    request: Request,
    body: OptimizeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run a grid search over parameter combinations."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_optimization_task.delay(
        code=code,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        param_grid=body.param_grid,
        constraints=body.constraints,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.get("/optimize/{task_id}")
async def get_optimization_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll optimization task result."""
    if not await verify_task_ownership(task_id, current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": _safe_poll_error(result)}
    return {"status": result.state.lower()}


@router.post("/optimize/bayesian")
@limiter.limit("3/minute")
async def bayesian_optimize_strategy(
    request: Request,
    body: BayesianOptimizeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run Bayesian optimization (TPE) over parameter ranges."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_bayesian_optimization_task.delay(
        code=code,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        param_ranges=body.param_ranges,
        n_trials=body.n_trials,
        objective_metric=body.objective_metric,
        constraints=body.constraints,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.post("/optimize/genetic")
@limiter.limit("3/minute")
async def genetic_optimize_strategy(
    request: Request,
    body: GeneticOptimizeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run genetic algorithm optimization."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_genetic_optimization_task.delay(
        code=code, symbol=body.symbol,
        start_date=body.start_date, end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission, slippage=body.slippage,
        param_ranges=body.param_ranges,
        population_size=body.population_size,
        n_generations=body.n_generations,
        crossover_prob=body.crossover_prob,
        mutation_prob=body.mutation_prob,
        objective_metric=body.objective_metric,
        constraints=body.constraints,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.post("/optimize/multiobjective")
@limiter.limit("3/minute")
async def multiobjective_optimize_strategy(
    request: Request,
    body: MultiObjectiveRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run multi-objective optimization (NSGA-II)."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_multiobjective_optimization_task.delay(
        code=code, symbol=body.symbol,
        start_date=body.start_date, end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission, slippage=body.slippage,
        param_ranges=body.param_ranges,
        n_trials=body.n_trials,
        objective_metrics=body.objective_metrics,
        directions=body.directions,
        constraints=body.constraints,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.post("/optimize/heatmap")
@limiter.limit("3/minute")
async def parameter_heatmap(
    request: Request,
    body: HeatmapRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate parameter stability heatmap."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_heatmap_task.delay(
        code=code, symbol=body.symbol,
        start_date=body.start_date, end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission, slippage=body.slippage,
        param_x=body.param_x, param_y=body.param_y,
        x_range=body.x_range, y_range=body.y_range,
        metric=body.metric, constraints=body.constraints,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


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
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_walk_forward_task.delay(
        code=code,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        n_splits=body.n_splits,
        train_pct=body.train_pct,
        purge_bars=body.purge_bars,
        window_mode=body.window_mode,
        interval=body.interval,
        param_ranges=body.param_ranges,
        n_trials=body.n_trials,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.get("/walk-forward/{task_id}")
async def get_walk_forward_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll walk-forward task result."""
    if not await verify_task_ownership(task_id, current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": _safe_poll_error(result)}
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
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.get("/monte-carlo/{task_id}")
async def get_monte_carlo_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll Monte Carlo task result."""
    if not await verify_task_ownership(task_id, current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": _safe_poll_error(result)}
    return {"status": result.state.lower()}


# ---------------------------------------------------------------------------
# Batch Strategy Runner
# ---------------------------------------------------------------------------

class BatchRequest(BaseModel):
    strategies: list[dict] = Field(..., description="List of {name, code, params}")
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    interval: str = "1d"


@router.post("/batch")
@limiter.limit("3/minute")
async def batch_run(
    request: Request,
    body: BatchRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Run multiple strategies in batch."""
    task = run_batch_backtest_task.delay(
        strategies=body.strategies,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


# ---------------------------------------------------------------------------
# Out-of-Sample Validation
# ---------------------------------------------------------------------------

class OosRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    oos_ratio: float = Field(default=0.3, ge=0.1, le=0.5)
    n_folds: int = Field(default=1, ge=1, le=10)
    param_ranges: dict | None = None
    n_trials: int = 30
    interval: str = "1d"


@router.post("/oos-validate")
@limiter.limit("3/minute")
async def oos_validate(
    request: Request,
    body: OosRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run out-of-sample validation to detect overfitting."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_oos_validation_task.delay(
        code=code, symbol=body.symbol,
        start_date=body.start_date, end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission, slippage=body.slippage,
        oos_ratio=body.oos_ratio,
        n_folds=body.n_folds,
        param_ranges=body.param_ranges,
        n_trials=body.n_trials,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.get("/oos-validate/{task_id}")
async def get_oos_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll out-of-sample validation task result."""
    if not await verify_task_ownership(task_id, current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": _safe_poll_error(result)}
    return {"status": result.state.lower()}


# ---------------------------------------------------------------------------
# Advanced: Combinatorial Purged Cross-Validation (CPCV)
# ---------------------------------------------------------------------------

class CpcvRequest(BaseModel):
    strategy_id: int | None = None
    code: str | None = None
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001
    n_groups: int = Field(default=6, ge=3, le=20)
    n_test_groups: int = Field(default=2, ge=1, le=5)
    purge_bars: int = Field(default=10, ge=0, le=100)
    embargo_bars: int = Field(default=0, ge=0, le=50)
    param_ranges: dict | None = None
    n_trials: int = Field(default=30, ge=5, le=200)
    interval: str = "1d"


@router.post("/cpcv")
@limiter.limit("3/minute")
async def cpcv_analysis(
    request: Request,
    body: CpcvRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run Combinatorial Purged Cross-Validation."""
    code = await _resolve_code(body.strategy_id, body.code, current_user, db)

    task = run_cpcv_task.delay(
        code=code,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        commission=body.commission,
        slippage=body.slippage,
        n_groups=body.n_groups,
        n_test_groups=body.n_test_groups,
        purge_bars=body.purge_bars,
        embargo_bars=body.embargo_bars,
        param_ranges=body.param_ranges,
        n_trials=body.n_trials,
        interval=body.interval,
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.get("/cpcv/{task_id}")
async def get_cpcv_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll CPCV task result."""
    if not await verify_task_ownership(task_id, current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": _safe_poll_error(result)}
    return {"status": result.state.lower()}


# ---------------------------------------------------------------------------
# Advanced: Factor Attribution
# ---------------------------------------------------------------------------

@router.post("/{backtest_id}/factor-attribution")
@limiter.limit("5/minute")
async def factor_attribution(
    request: Request,
    backtest_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Run multi-factor attribution on a completed backtest."""
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    backtest = result.scalar_one_or_none()
    if not backtest:
        raise HTTPException(status_code=404, detail="Backtest not found")
    if backtest.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not backtest.results or not backtest.results.get("equity_curve"):
        raise HTTPException(status_code=400, detail="Backtest has no equity curve data")

    task = run_factor_attribution_task.delay(
        equity_curve=backtest.results["equity_curve"],
        initial_capital=backtest.initial_capital,
        symbol=backtest.symbol,
        start_date=str(backtest.start_date)[:10],
        end_date=str(backtest.end_date)[:10],
        interval=(backtest.parameters or {}).get("interval", "1d"),
    )
    await set_task_owner(task.id, current_user.id)
    return {"task_id": task.id, "status": "queued"}


@router.get("/factor-attribution/{task_id}")
async def get_factor_attribution_result(
    task_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Poll factor attribution task result."""
    if not await verify_task_ownership(task_id, current_user.id):
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        return {"status": "running", "progress": result.info}
    elif result.state == "SUCCESS":
        return {"status": "completed", **result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": _safe_poll_error(result)}
    return {"status": result.state.lower()}


# ---------------------------------------------------------------------------
# Custom Dataset Upload
# ---------------------------------------------------------------------------

@router.post("/upload-dataset")
@limiter.limit("10/minute")
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    symbol: str = "CUSTOM",
    current_user: User = Depends(get_current_active_user),
):
    """Upload a custom CSV dataset for backtesting.
    
    CSV must have columns: Date, Open, High, Low, Close, Volume
    Date column should be parseable as datetime.
    """
    import io
    import pandas as pd
    
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    if file.content_type and file.content_type not in ("text/csv", "application/vnd.ms-excel", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV files are supported")
    
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV format")
    
    # Validate required columns
    required = {"Open", "High", "Low", "Close"}
    # Try case-insensitive match
    col_map = {}
    for req in required:
        found = False
        for col in df.columns:
            if col.lower() == req.lower():
                col_map[col] = req
                found = True
                break
        if not found:
            raise HTTPException(
                status_code=400,
                detail="Missing required columns. CSV must include Open, High, Low, Close."
            )
    
    # Rename columns to standard names
    df = df.rename(columns=col_map)
    
    # Handle date column
    date_col = None
    for col in df.columns:
        if col.lower() in ("date", "datetime", "timestamp", "time"):
            date_col = col
            break
    
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.set_index(date_col)
    elif df.index.dtype == object:
        try:
            df.index = pd.to_datetime(df.index)
        except Exception:
            raise HTTPException(status_code=400, detail="Could not parse dates from index or columns")
    
    df = df.sort_index()
    
    # Add Volume if missing
    if "Volume" not in df.columns:
        vol_col = None
        for col in df.columns:
            if col.lower() == "volume":
                vol_col = col
                break
        if vol_col:
            df = df.rename(columns={vol_col: "Volume"})
        else:
            df["Volume"] = 0
    
    # Store in a simple in memory cache (keyed by user + symbol)
    # In production this would go to ugh S3/MinIO or database
    cache_key = f"user_{current_user.id}_{symbol}"
    prefix = f"user_{current_user.id}_"
    user_keys = [k for k in _dataset_cache if k.startswith(prefix)]
    if cache_key not in _dataset_cache and len(user_keys) >= _DATASET_MAX_PER_USER:
        oldest_key = min(user_keys, key=lambda k: _dataset_cache[k].get("uploaded_at", ""))
        del _dataset_cache[oldest_key]
    _dataset_cache[cache_key] = {
        "data": df.to_json(),
        "rows": len(df),
        "columns": list(df.columns),
        "start": str(df.index[0]) if len(df) > 0 else None,
        "end": str(df.index[-1]) if len(df) > 0 else None,
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    
    return {
        "status": "uploaded",
        "symbol": symbol,
        "rows": len(df),
        "columns": list(df.columns),
        "date_range": {
            "start": str(df.index[0]) if len(df) > 0 else None,
            "end": str(df.index[-1]) if len(df) > 0 else None,
        },
    }


@router.get("/datasets")
@limiter.limit("60/minute")
async def list_datasets(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    """List uploaded datasets for the current user."""
    prefix = f"user_{current_user.id}_"
    datasets = []
    for key, meta in _dataset_cache.items():
        if key.startswith(prefix):
            symbol = key[len(prefix):]
            datasets.append({
                "symbol": symbol,
                "rows": meta["rows"],
                "start": meta.get("start"),
                "end": meta.get("end"),
                "uploaded_at": meta.get("uploaded_at"),
            })
    return datasets


# ---------------------------------------------------------------------------
# Tear sheet / report generation
# ---------------------------------------------------------------------------

@router.get("/{backtest_id}/tearsheet")
@limiter.limit("30/minute")
async def generate_tearsheet(
    request: Request,
    backtest_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate an HTML tear sheet report for a backtest."""
    result = await db.execute(
        select(Backtest).where(Backtest.id == backtest_id, Backtest.user_id == current_user.id)
    )
    backtest = result.scalar_one_or_none()
    if not backtest:
        raise HTTPException(status_code=404, detail="Backtest not found")
    if not backtest.results:
        raise HTTPException(status_code=400, detail="Backtest has no results")

    from app.engine.analytics.tearsheet import generate_tearsheet as gen_tearsheet
    from fastapi.responses import HTMLResponse

    html_content, nonce = gen_tearsheet(backtest.results, title=f"Backtest #{backtest_id}: {backtest.symbol}")
    csp = (
        f"default-src 'none'; script-src 'nonce-{nonce}'; "
        f"style-src 'nonce-{nonce}'; img-src data:; "
        f"frame-ancestors 'none'"
    )
    return HTMLResponse(
        content=html_content,
        headers={"Content-Security-Policy": csp},
    )


# ---------------------------------------------------------------------------
# Monthly returns data (for frontend heatmap)
# ---------------------------------------------------------------------------

@router.get("/{backtest_id}/monthly-returns")
@limiter.limit("60/minute")
async def get_monthly_returns(
    request: Request,
    backtest_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Compute monthly returns from backtest equity curve."""
    result = await db.execute(
        select(Backtest).where(Backtest.id == backtest_id, Backtest.user_id == current_user.id)
    )
    backtest = result.scalar_one_or_none()
    if not backtest or not backtest.results:
        raise HTTPException(status_code=404, detail="Backtest not found or no results")

    from app.engine.analytics.tearsheet import _compute_monthly_returns
    equity_curve = backtest.results.get("equity_curve", [])
    return _compute_monthly_returns(equity_curve)


@router.get("/{backtest_id}/trade-distribution")
@limiter.limit("60/minute")
async def get_trade_distribution(
    request: Request,
    backtest_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Compute trade P&L distribution for histogram."""
    result = await db.execute(
        select(Backtest).where(Backtest.id == backtest_id, Backtest.user_id == current_user.id)
    )
    backtest = result.scalar_one_or_none()
    if not backtest or not backtest.results:
        raise HTTPException(status_code=404, detail="Backtest not found or no results")

    from app.engine.analytics.tearsheet import _compute_trade_distribution
    trades = backtest.results.get("trades", [])
    return _compute_trade_distribution(trades)
