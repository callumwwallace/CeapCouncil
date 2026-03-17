import ast
import resource
import signal
import traceback
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import backtrader as bt
import numpy as np
import yfinance as yf
import pandas as pd

from app.tasks.celery_app import celery_app
from app.core.config import settings
from app.models.backtest import Backtest, BacktestStatus
from app.models.strategy import Strategy

from app.engine.core.engine import Engine, EngineConfig, EngineResult
from app.engine.broker.slippage import auto_detect_tier
from app.engine.data.calendar import filter_to_trading_days
from app.engine.strategy.compiler import compile_strategy, extract_user_error as extract_strategy_error

sync_engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", ""))
SessionLocal = sessionmaker(bind=sync_engine)

_ALLOWED_IMPORTS = {"backtrader", "bt", "math", "numpy", "np", "pandas", "pd"}
_BLOCKED_BUILTINS = {
    "exec", "eval", "compile", "__import__", "open",
    "input", "exit", "quit", "breakpoint", "globals", "locals",
    "getattr", "setattr", "delattr", "vars", "dir",
    "type", "super",
}

_BLOCKED_DUNDER_ATTRS = {
    "__subclasses__", "__bases__", "__mro__", "__base__",
    "__class__", "__dict__", "__globals__", "__code__",
    "__func__", "__self__", "__module__", "__import__",
    "__builtins__", "__qualname__", "__wrapped__",
    "__loader__", "__spec__", "__path__", "__file__",
    "__reduce__", "__reduce_ex__", "__getstate__",
}


def _validate_no_dunder_access(code: str) -> None:
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDER_ATTRS:
                raise ValueError(
                    f"Access to '{node.attr}' is not allowed "
                    f"(line {getattr(node, 'lineno', '?')})"
                )
        if isinstance(node, ast.Subscript):
            if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                if node.slice.value in _BLOCKED_DUNDER_ATTRS:
                    raise ValueError(
                        f"Access to '{node.slice.value}' is not allowed "
                        f"(line {getattr(node, 'lineno', '?')})"
                    )


class BacktestTimeout(Exception):
    pass


def _timeout_handler(signum, frame):
    raise BacktestTimeout("Backtest exceeded maximum execution time")


def _set_resource_limits():
    timeout = settings.BACKTEST_TIMEOUT_SECONDS
    mem_bytes = settings.BACKTEST_MAX_MEMORY_MB * 1024 * 1024
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(timeout)
    try:
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
    except (ValueError, resource.error):
        pass


def _clear_resource_limits():
    signal.alarm(0)
    try:
        resource.setrlimit(resource.RLIMIT_AS, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))
    except (ValueError, resource.error):
        pass


def _build_safe_builtins() -> dict:
    if isinstance(__builtins__, dict):
        src = __builtins__
    else:
        src = {k: getattr(__builtins__, k) for k in dir(__builtins__)}
    safe = {k: v for k, v in src.items() if k not in _BLOCKED_BUILTINS}

    def _safe_import(name, *args, **kwargs):
        if name not in _ALLOWED_IMPORTS:
            raise ImportError(
                f"Import of '{name}' is not allowed. "
                f"Allowed modules: backtrader (bt), math, numpy (np), pandas (pd)"
            )
        return __import__(name, *args, **kwargs)

    safe["__import__"] = _safe_import
    return safe


def _extract_user_error(exc: Exception, code: str) -> str:
    """Extract a clean error message from user strategy code, including line info."""
    import linecache
    import sys

    tb = exc.__traceback__
    user_frames: list[str] = []
    while tb is not None:
        frame = tb.tb_frame
        filename = frame.f_code.co_filename
        # User code runs in exec with filename "<string>"
        if filename == "<string>":
            lineno = tb.tb_lineno
            lines = code.split("\n")
            line_text = lines[lineno - 1].strip() if 0 < lineno <= len(lines) else ""
            user_frames.append(f"  Line {lineno}: {line_text}")
        tb = tb.tb_next

    error_type = type(exc).__name__
    error_msg = str(exc)
    parts = [f"{error_type}: {error_msg}"]
    if user_frames:
        parts.insert(0, "Error in strategy code:")
        parts.extend(user_frames)
    return "\n".join(parts)


def create_user_strategy(code: str) -> type:
    _validate_no_dunder_access(code)

    safe_globals: dict = {
        "__builtins__": _build_safe_builtins(),
        "bt": bt,
    }

    try:
        compiled = compile(code, "<string>", "exec")
        exec(compiled, safe_globals)
    except SyntaxError as e:
        line_info = f" (line {e.lineno})" if e.lineno else ""
        raise ValueError(f"SyntaxError{line_info}: {e.msg}") from e
    except Exception as e:
        raise ValueError(_extract_user_error(e, code)) from e

    strategy_cls = safe_globals.get("MyStrategy")
    if strategy_cls is None:
        raise ValueError(
            "Strategy code must define a class named 'MyStrategy' "
            "that extends bt.Strategy"
        )

    if not (isinstance(strategy_cls, type) and issubclass(strategy_cls, bt.Strategy)):
        raise ValueError("MyStrategy must be a subclass of bt.Strategy")

    return strategy_cls


# ---------------------------------------------------------------------------
# Trade-level / equity-curve analyzer
# ---------------------------------------------------------------------------

class TradeRecorder(bt.Analyzer):
    """Records individual trades and an equity curve for every bar.

    Dates are recorded using the *data feed's own index* so they match
    exactly what yfinance returns (and what the frontend chart shows).
    """

    def __init__(self):
        super().__init__()
        self.trades: list[dict] = []
        self.equity_curve: list[dict] = []
        # Maps trade.ref → opening position size (captured when trade opens)
        self._open_sizes: dict[int, int] = {}

    # -- called on every trade event (open, update, close) --
    def notify_trade(self, trade):
        # When a trade opens, capture the position size for later
        if trade.isopen and trade.size != 0:
            self._open_sizes[trade.ref] = abs(trade.size)

        if not trade.isclosed:
            return

        # On a closed trade, trade.size == 0 (fully closed).
        # Use trade.long (always available) for direction.
        is_long = bool(getattr(trade, 'long', True))
        size = self._open_sizes.pop(trade.ref, 1)  # fallback to 1
        entry_price = round(trade.price, 4)

        # Derive exit price from P&L:
        #   Longs:  pnl = (exit - entry) * size  →  exit = entry + pnl/size
        #   Shorts: pnl = (entry - exit) * size  →  exit = entry - pnl/size
        if is_long:
            exit_price = round(entry_price + trade.pnl / size, 4)
        else:
            exit_price = round(entry_price - trade.pnl / size, 4)

        pnl_pct = (
            round(trade.pnlcomm / (size * entry_price) * 100, 4)
            if entry_price and size
            else 0.0
        )

        entry_date = bt.num2date(trade.dtopen).strftime("%Y-%m-%d")
        exit_date = bt.num2date(trade.dtclose).strftime("%Y-%m-%d")

        self.trades.append({
            "entry_date": entry_date,
            "exit_date": exit_date,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "size": size,
            "pnl": round(trade.pnl, 2),
            "pnl_pct": pnl_pct,
            "commission": round(trade.commission, 4),
            "type": "LONG" if is_long else "SHORT",
        })

    # -- called on every bar --
    def next(self):
        self.equity_curve.append({
            "date": self.data.datetime.date(0).strftime("%Y-%m-%d"),
            "equity": round(self.strategy.broker.getvalue(), 2),
        })

    def get_analysis(self):
        return {
            "trades": self.trades,
            "equity_curve": self.equity_curve,
        }


# ---------------------------------------------------------------------------
# Extended metrics computation
# ---------------------------------------------------------------------------

def _compute_sortino_ratio(
    equity_curve: list[dict], risk_free_rate: float = 0.0, annualize: bool = True
) -> float | None:
    """Sortino ratio from daily equity values. MAR = risk_free_rate (default 0)."""
    if len(equity_curve) < 2:
        return None
    equities = [p["equity"] for p in equity_curve]
    returns = np.diff(equities) / equities[:-1]
    excess = returns - risk_free_rate / 252
    downside = excess[excess < 0]
    if len(downside) == 0:
        return None  # no downside => undefined
    downside_std = float(np.sqrt(np.mean(downside ** 2)))
    if downside_std == 0:
        return None
    sortino = float(np.mean(excess)) / downside_std
    if annualize:
        sortino *= math.sqrt(252)
    return round(sortino, 4)


def _compute_profit_factor(trades: list[dict]) -> float | None:
    """Gross profit / |gross loss|. None if no losing trades."""
    if not trades:
        return None
    gross_profit = sum(t["pnl"] for t in trades if t["pnl"] > 0)
    gross_loss = abs(sum(t["pnl"] for t in trades if t["pnl"] < 0))
    if gross_loss == 0:
        return None  # infinite / undefined
    return round(gross_profit / gross_loss, 4)


def _compute_avg_trade_duration(trades: list[dict]) -> float | None:
    """Average holding period in calendar days."""
    if not trades:
        return None
    durations: list[float] = []
    for t in trades:
        try:
            entry = datetime.strptime(t["entry_date"], "%Y-%m-%d")
            exit_ = datetime.strptime(t["exit_date"], "%Y-%m-%d")
            durations.append((exit_ - entry).days)
        except (ValueError, KeyError):
            continue
    if not durations:
        return None
    return round(sum(durations) / len(durations), 2)


def _compute_max_consecutive_losses(trades: list[dict]) -> int:
    """Longest streak of losing trades (pnl < 0)."""
    max_streak = 0
    current = 0
    for t in trades:
        if t["pnl"] < 0:
            current += 1
            max_streak = max(max_streak, current)
        else:
            current = 0
    return max_streak


def _compute_calmar_ratio(
    total_return_pct: float, max_drawdown_pct: float, num_days: int
) -> float | None:
    """Calmar = annualized return / max drawdown. None if max dd is 0."""
    if max_drawdown_pct == 0 or num_days <= 0:
        return None
    years = num_days / 365.25
    if years == 0:
        return None
    annualized = ((1 + total_return_pct / 100) ** (1 / years) - 1) * 100
    return round(annualized / max_drawdown_pct, 4)


def _compute_exposure_pct(trades: list[dict], total_bars: int) -> float | None:
    """Percentage of trading days with an open position."""
    if not trades or total_bars <= 0:
        return None
    held_dates: set[str] = set()
    for t in trades:
        try:
            entry = datetime.strptime(t["entry_date"], "%Y-%m-%d")
            exit_ = datetime.strptime(t["exit_date"], "%Y-%m-%d")
            d = entry
            while d <= exit_:
                if d.weekday() < 5:
                    held_dates.add(d.strftime("%Y-%m-%d"))
                d += timedelta(days=1)
        except (ValueError, KeyError):
            continue
    return round(len(held_dates) / total_bars * 100, 2)


# ---------------------------------------------------------------------------
# Engine runner
# ---------------------------------------------------------------------------

def _run_backtest(
    code: str,
    symbol: str,
    data: pd.DataFrame,
    initial_capital: float,
    params: dict,
) -> EngineResult:
    """Run a backtest using the event-driven engine."""
    is_crypto = any(
        ind in symbol.upper()
        for ind in ["-USD", "BTC", "ETH", "SOL", "DOGE", "XRP"]
    )

    config = EngineConfig(
        initial_capital=initial_capital,
        commission_rate=params.get("commission", 0.001),
        slippage_model="percentage",
        slippage_pct=params.get("slippage", 0.1),
        spread_model="volatility" if is_crypto else "none",
        is_crypto=is_crypto,
        stop_loss_pct=params.get("stop_loss_pct"),
        take_profit_pct=params.get("take_profit_pct"),
    )

    strategy_cls = compile_strategy(code, params)
    strategy = strategy_cls(params=params)

    engine = Engine(config)
    engine.add_data(symbol, data)
    engine.set_strategy(strategy)
    return engine.run()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sample_series(series: list[dict], max_points: int = 200) -> list[dict]:
    """Down-sample a list of dicts to at most *max_points* entries.

    Always keeps the first and last element so the full date range is
    represented.
    """
    n = len(series)
    if n <= max_points:
        return series

    step = (n - 1) / (max_points - 1)
    indices = {0, n - 1}
    for i in range(1, max_points - 1):
        indices.add(round(i * step))
    return [series[i] for i in sorted(indices)]


def _derive_drawdown_series(equity_curve: list[dict]) -> list[dict]:
    """Compute a drawdown-percentage series from an equity curve."""
    if not equity_curve:
        return []

    peak = equity_curve[0]["equity"]
    drawdowns: list[dict] = []
    for point in equity_curve:
        equity = point["equity"]
        if equity > peak:
            peak = equity
        dd_pct = round((peak - equity) / peak * 100, 4) if peak else 0.0
        drawdowns.append({"date": point["date"], "drawdown_pct": dd_pct})
    return drawdowns


# ---------------------------------------------------------------------------
# Backtrader → Engine code translator
# ---------------------------------------------------------------------------

import re as _re


def _translate_bt_to_engine(code: str) -> str:
    """Best-effort translation of Backtrader strategy code to Engine format.

    Converts common Backtrader patterns so that the strategy can be run by
    :class:`Engine` which expects a :class:`StrategyBase` subclass.
    """
    lines = code.split("\n")
    translated: list[str] = []

    translated.append(
        "# Backtrader indicators unavailable : use self.history() for manual calculation."
    )

    for line in lines:
        stripped = line.strip()

        if _re.match(r"^import\s+backtrader\s+as\s+bt\s*$", stripped):
            continue
        if _re.match(r"^from\s+backtrader\s+import\s+", stripped):
            continue

        if "bt.ind." in stripped or "bt.indicators." in stripped:
            indent = len(line) - len(line.lstrip())
            translated.append(" " * indent + "# [removed: bt.ind not available] " + stripped)
            continue

        # Class definition: bt.Strategy → StrategyBase
        line = _re.sub(
            r"class\s+(\w+)\s*\(\s*bt\.Strategy\s*\)\s*:",
            r"class \1(StrategyBase):",
            line,
        )

        # Lifecycle methods
        line = _re.sub(r"def\s+__init__\s*\(\s*self\s*\)\s*:", "def on_init(self):", line)
        line = _re.sub(r"def\s+next\s*\(\s*self\s*\)\s*:", "def on_data(self, bar):", line)

        # Data accessors → bar fields
        line = line.replace("self.data.close[0]", "bar.close")
        line = line.replace("self.data.high[0]", "bar.high")
        line = line.replace("self.data.low[0]", "bar.low")
        line = line.replace("self.data.open[0]", "bar.open")

        # Position checks (order matters : do 'not self.position' before 'self.position')
        line = _re.sub(r"not\s+self\.position\b", "self.is_flat(bar.symbol)", line)
        line = _re.sub(r"\bself\.position\b", "self.is_long(bar.symbol)", line)

        # Order methods
        line = _re.sub(
            r"\bself\.buy\s*\(\s*\)",
            "self.market_order(bar.symbol, max(1, int(self.portfolio.cash * 0.95 / bar.close)))",
            line,
        )
        line = _re.sub(r"\bself\.sell\s*\(\s*\)", "self.close_position(bar.symbol)", line)
        line = _re.sub(r"\bself\.close\s*\(\s*\)", "self.close_position(bar.symbol)", line)

        translated.append(line)

    return "\n".join(translated)


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=300, soft_time_limit=240)
def run_backtest_task(self, backtest_id: int):
    """Execute a backtest for a given strategy."""
    db = SessionLocal()

    try:
        # -- fetch backtest record --
        backtest = db.query(Backtest).filter(Backtest.id == backtest_id).first()
        if not backtest:
            return {"error": "Backtest not found"}

        backtest.status = BacktestStatus.RUNNING
        backtest.started_at = datetime.now()
        db.commit()

        _set_resource_limits()

        # Get strategy code: inline or from saved strategy
        if backtest.code and backtest.code.strip():
            strategy_code = backtest.code
        elif backtest.strategy_id:
            strategy = db.query(Strategy).filter(Strategy.id == backtest.strategy_id).first()
            if not strategy:
                raise ValueError("Strategy not found")
            strategy_code = strategy.code
        else:
            raise ValueError("Backtest has no code and no strategy_id")

        # -- fetch market data --
        params = backtest.parameters or {}
        interval = params.get("interval", "1d")
        ticker = yf.Ticker(backtest.symbol)
        data = ticker.history(
            start=backtest.start_date,
            end=backtest.end_date,
            interval=interval,
        )

        if data.empty:
            raise ValueError(f"No data found for symbol {backtest.symbol}")

        # Strip timezone from the index so Backtrader's internal date math
        # stays timezone-naive and produces dates matching yfinance's index.
        if data.index.tz is not None:
            data.index = data.index.tz_localize(None)

        # Filter to valid trading days per asset type (exclude weekends/holidays for equities)
        data = filter_to_trading_days(data, backtest.symbol)
        if data.empty:
            raise ValueError(f"No trading-day data found for {backtest.symbol} (weekends/holidays excluded)")

        try:
            strategy_cls = compile_strategy(strategy_code)
            strategy = strategy_cls(params=params)
        except (ValueError, Exception) as e:
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = str(e)[:1000]
            backtest.completed_at = datetime.now(timezone.utc)
            db.commit()
            return {"status": "failed", "error": str(e)}

        is_crypto = any(
            ind in backtest.symbol.upper()
            for ind in ["-USD", "BTC", "ETH", "SOL", "DOGE", "XRP"]
        )

        # Resolve spread model: "auto" means volatility for crypto, none for equities
        user_spread = params.get("spread_model", "auto")
        if user_spread == "auto":
            resolved_spread = "volatility" if is_crypto else "none"
        else:
            resolved_spread = user_spread

        # Resolve slippage model from user config
        user_slippage_model = params.get("slippage_model", "percentage")
        liquidity_tier = None
        if user_slippage_model == "auto":
            user_slippage_model = "volume_aware"
            # Infer tier from avg daily volume (cost-only; never rejects orders)
            try:
                dollar_vol = (data["Volume"] * data["Close"]).dropna()
                avg_daily_usd = float(dollar_vol.mean()) if len(dollar_vol) > 0 else 0
                tier = auto_detect_tier(avg_daily_usd)
                liquidity_tier = tier.value
            except Exception:
                liquidity_tier = "high"

        # Margin settings
        margin_enabled = bool(params.get("margin_enabled", False))
        allow_shorts_without_margin = bool(params.get("allow_shorts_without_margin", False))
        leverage = float(params.get("leverage", 1))

        engine_config = EngineConfig(
            initial_capital=backtest.initial_capital,
            commission_rate=params.get("commission", 0.001),
            slippage_model=user_slippage_model,
            slippage_pct=params.get("slippage", 0.1),
            liquidity_tier=liquidity_tier,
            spread_model=resolved_spread,
            is_crypto=is_crypto,
            stop_loss_pct=params.get("stop_loss_pct"),
            take_profit_pct=params.get("take_profit_pct"),
            max_drawdown_pct=float(params.get("max_drawdown_pct", 100)),
            max_position_pct=float(params.get("max_position_pct", 100)),
            margin_enabled=margin_enabled,
            allow_shorts_without_margin=allow_shorts_without_margin,
            max_leverage=leverage if margin_enabled else 1.0,
            warmup_bars=int(params.get("warmup_bars", 0)),
            pdt_enabled=bool(params.get("pdt_enabled", False)),
        )

        engine = Engine(engine_config)
        engine.add_data(backtest.symbol, data)
        engine.set_strategy(strategy)

        try:
            result: EngineResult = engine.run()
        except Exception as run_err:
            clean_msg = extract_strategy_error(run_err, strategy_code)
            raise ValueError(f"Strategy runtime error:\n{clean_msg}") from run_err

        results_dict = result.to_results_dict()

        # Compute benchmark return
        benchmark_symbol = params.get("benchmark_symbol") or backtest.symbol
        benchmark_return = None
        try:
            if benchmark_symbol == backtest.symbol:
                bm_data = data
            else:
                bm_ticker = yf.Ticker(benchmark_symbol)
                bm_data = bm_ticker.history(
                    start=backtest.start_date,
                    end=backtest.end_date,
                    interval=interval,
                )
                if bm_data.index.tz is not None:
                    bm_data.index = bm_data.index.tz_localize(None)
                bm_data = filter_to_trading_days(bm_data, benchmark_symbol)
            if not bm_data.empty and len(bm_data) >= 2:
                first_close = float(bm_data["Close"].iloc[0])
                last_close = float(bm_data["Close"].iloc[-1])
                if first_close > 0:
                    benchmark_return = round(
                        ((last_close - first_close) / first_close) * 100, 4
                    )
        except Exception:
            pass

        results_dict["benchmark_return"] = benchmark_return

        # Backtest versioning: tie run to exact code, params, data, config for reproducibility
        from app.core.data_cache import compute_config_hash, compute_data_hash, compute_code_hash
        versioning = {
            "code_hash": compute_code_hash(strategy_code),
            "data_hash": compute_data_hash(data),
            "config_hash": compute_config_hash({
                **params,
                "initial_capital": backtest.initial_capital,
                "commission": params.get("commission", 0.001),
                "slippage": params.get("slippage", 0.1),
            }),
        }
        results_dict["versioning"] = versioning

        # Map result fields to database columns (convert numpy to plain Python)
        def _safe(val, default=None):
            """Convert value to plain Python type, handling numpy scalars."""
            if val is None:
                return default
            try:
                import numpy as _np
                if isinstance(val, _np.integer):
                    return int(val)
                if isinstance(val, _np.floating):
                    v = float(val)
                    return default if (_np.isnan(v) or _np.isinf(v)) else v
            except Exception:
                pass
            if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                return default
            return val

        backtest.status = BacktestStatus.COMPLETED
        backtest.completed_at = datetime.now(timezone.utc)
        backtest.total_return = _safe(results_dict.get("total_return_pct"), 0.0)
        backtest.sharpe_ratio = _safe(results_dict.get("sharpe_ratio"))
        backtest.max_drawdown = _safe(results_dict.get("max_drawdown_pct"), 0.0)
        backtest.total_trades = _safe(results_dict.get("total_trades"), 0)
        backtest.win_rate = _safe(results_dict.get("win_rate"), 0.0)
        backtest.sortino_ratio = _safe(results_dict.get("sortino_ratio"))
        backtest.profit_factor = _safe(results_dict.get("profit_factor"))
        backtest.avg_trade_duration = _safe(results_dict.get("avg_trade_duration"))
        backtest.max_consecutive_losses = _safe(results_dict.get("max_consecutive_losses"), 0)
        backtest.calmar_ratio = _safe(results_dict.get("calmar_ratio"))
        backtest.exposure_pct = _safe(results_dict.get("exposure_pct"))
        backtest.results = results_dict

        db.commit()
        return {"status": "completed", "backtest_id": backtest_id}

    except Exception as e:
        backtest = db.query(Backtest).filter(Backtest.id == backtest_id).first()
        if backtest:
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = str(e)[:1000]
            backtest.completed_at = datetime.now(timezone.utc)
            db.commit()
        return {"status": "failed", "error": str(e), "traceback": traceback.format_exc()}

    finally:
        _clear_resource_limits()
        db.close()


# ---------------------------------------------------------------------------
# Parameter Optimization (Grid Search) task
# ---------------------------------------------------------------------------

def _fetch_data(symbol: str, start_date, end_date, interval: str = "1d"):
    """Download market data (or serve from cache), returning a clean DataFrame or None.

    Caches OHLCV by (symbol, start, end, interval) to reduce API calls and ensure
    reproducible runs. Filters to valid trading days per asset type.
    """
    from app.core.data_cache import get_cached, set_cached

    start_s = str(start_date)[:10] if start_date else ""
    end_s = str(end_date)[:10] if end_date else ""

    cached = get_cached(symbol, start_s, end_s, interval)
    if cached is not None:
        return cached

    ticker = yf.Ticker(symbol)
    data = ticker.history(start=start_date, end=end_date, interval=interval)
    if data.empty:
        return None
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)
    data = filter_to_trading_days(data, symbol)

    set_cached(symbol, start_s, end_s, interval, data)
    return data


def _run_single_backtest(
    code: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    param_combo: dict,
    *,
    data=None,
    symbol: str | None = None,
    start_date=None,
    end_date=None,
    interval: str = "1d",
    include_equity_curve: bool = False,
) -> dict:
    """Run a single backtest with specific params.

    Either pass a pre-fetched ``data`` DataFrame **or** ``symbol`` /
    ``start_date`` / ``end_date`` to let this helper download it.
    """
    try:
        strategy_cls = compile_strategy(code)
        strategy = strategy_cls(params=param_combo)
    except (ValueError, Exception) as e:
        return {"params": param_combo, "error": str(e)}

    # Use pre-fetched data if available, otherwise download
    if data is None:
        if symbol is None:
            return {"params": param_combo, "error": "No symbol or data provided"}
        data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"params": param_combo, "error": "No market data for this window"}

    # Determine primary symbol from data or fallback
    sym = symbol or "SYM"
    if hasattr(data, 'name') and data.name:
        sym = data.name

    config = EngineConfig(
        initial_capital=initial_capital,
        commission_rate=commission,
        slippage_model="percentage",
        slippage_pct=slippage * 100 if slippage < 1 else slippage,
    )

    engine = Engine(config)
    engine.add_data(sym, data)
    engine.set_strategy(strategy)

    try:
        result: EngineResult = engine.run()
    except Exception as e:
        return {"params": param_combo, "error": str(e)[:200]}

    m = result.metrics

    def _p(val, default=0):
        if val is None:
            return default
        try:
            import numpy as _np
            if isinstance(val, (_np.floating, _np.integer)):
                v = float(val)
                return default if (_np.isnan(v) or _np.isinf(v)) else v
        except Exception:
            pass
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return default
        return val

    return {
        "params": param_combo,
        "total_return": _p(round(result.total_return_pct, 4)),
        "sharpe_ratio": _p(m.sharpe_ratio),
        "max_drawdown": _p(round(m.max_drawdown_pct, 4)),
        "total_trades": _p(m.total_trades, 0),
        "win_rate": _p(m.win_rate, 0),
        "final_value": _p(round(result.final_value, 2)),
        **({"equity_curve": result.equity_curve} if include_equity_curve else {}),
    }


def _check_constraints(result: dict, constraints: dict) -> bool:
    """Check if a backtest result violates any constraints. Returns True if violated."""
    if not constraints:
        return False
    dd = abs(result.get("max_drawdown", 0))
    if "max_drawdown" in constraints and dd > constraints["max_drawdown"]:
        return True
    if "min_trades" in constraints and (result.get("total_trades", 0) or 0) < constraints["min_trades"]:
        return True
    if "min_win_rate" in constraints and (result.get("win_rate", 0) or 0) < constraints["min_win_rate"]:
        return True
    if "max_exposure" in constraints and (result.get("exposure_pct") or 0) > constraints.get("max_exposure", 100):
        return True
    return False


@celery_app.task(bind=True, time_limit=600, soft_time_limit=540)
def run_optimization_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    param_grid: dict,
    constraints: dict | None = None,
    interval: str = "1d",
):
    """Grid search over parameter combinations."""
    import itertools

    # Pre-fetch data once (shared across all combos)
    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    # Generate all combinations
    keys = list(param_grid.keys())
    values = [param_grid[k] for k in keys]
    combos = [dict(zip(keys, v)) for v in itertools.product(*values)]

    # Limit to 500 combinations max
    if len(combos) > 500:
        combos = combos[:500]

    results = []
    # Use thread pool for parallel execution (processes can't pickle Celery task)
    from concurrent.futures import ThreadPoolExecutor, as_completed
    max_workers = min(4, len(combos))

    def _run_combo(combo_with_idx):
        idx, combo = combo_with_idx
        result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=combo,
            data=data.copy(),
            symbol=symbol,
        )
        if constraints:
            violated = _check_constraints(result, constraints)
            if violated:
                result["constraint_violated"] = True
        return idx, result

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_run_combo, (i, combo)): i for i, combo in enumerate(combos)}
        for future in as_completed(futures):
            idx, result = future.result()
            results.append(result)
            if len(results) % 5 == 0:
                self.update_state(
                    state="PROGRESS",
                    meta={"current": len(results), "total": len(combos)},
                )

    # Sort by Sharpe ratio (best first), then by return
    valid_results = [r for r in results if "error" not in r and not r.get("constraint_violated")]
    valid_results.sort(
        key=lambda r: (r.get("sharpe_ratio") or -999, r.get("total_return", -999)),
        reverse=True,
    )
    error_results = [r for r in results if "error" in r]

    return {
        "status": "completed",
        "total_combinations": len(combos),
        "results": valid_results + error_results,
        "best": valid_results[0] if valid_results else None,
    }


@celery_app.task(bind=True, time_limit=600, soft_time_limit=540)
def run_bayesian_optimization_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    param_ranges: dict,
    n_trials: int = 50,
    objective_metric: str = "sharpe_ratio",
    constraints: dict | None = None,
    interval: str = "1d",
):
    """Bayesian optimization using optuna TPE sampler."""
    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        return {"status": "failed", "error": "optuna is not installed. Run: pip install optuna"}

    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    n_trials = min(n_trials, 200)
    all_results = []

    def objective(trial):
        combo = {}
        for key, rng in param_ranges.items():
            if isinstance(rng, dict):
                low = rng.get("low", rng.get("min", 1))
                high = rng.get("high", rng.get("max", 100))
                step = rng.get("step", None)
                param_type = rng.get("type", "float")
                if param_type == "int":
                    combo[key] = trial.suggest_int(key, int(low), int(high), step=int(step) if step else 1)
                else:
                    combo[key] = trial.suggest_float(key, float(low), float(high), step=float(step) if step else None)
            elif isinstance(rng, list) and len(rng) >= 2:
                combo[key] = trial.suggest_float(key, float(min(rng)), float(max(rng)))
            else:
                combo[key] = rng[0] if isinstance(rng, list) else rng

        result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
            param_combo=combo,
            data=data.copy(),
            symbol=symbol,
        )
        result["params"] = combo
        all_results.append(result)

        if "error" in result:
            return float("-inf")

        if constraints:
            violated = _check_constraints(result, constraints)
            if violated:
                result["constraint_violated"] = True
                return float("-inf")

        value = result.get(objective_metric, result.get("sharpe_ratio", 0))
        if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
            return float("-inf")

        # Report progress
        self.update_state(
            state="PROGRESS",
            meta={"current": len(all_results), "total": n_trials},
        )
        return value

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=42),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    # Sort by objective metric
    valid_results = [r for r in all_results if "error" not in r and not r.get("constraint_violated")]
    valid_results.sort(
        key=lambda r: (r.get(objective_metric, r.get("sharpe_ratio", 0)) or -999),
        reverse=True,
    )
    error_results = [r for r in all_results if "error" in r]

    best_params = study.best_params if study.best_trial else None
    best_value = study.best_value if study.best_trial else None

    return {
        "status": "completed",
        "method": "bayesian",
        "total_trials": len(all_results),
        "objective_metric": objective_metric,
        "best_params": best_params,
        "best_value": best_value,
        "results": valid_results[:50] + error_results[:5],
        "best": valid_results[0] if valid_results else None,
    }


# ---------------------------------------------------------------------------
# Genetic Algorithm Optimization task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=900, soft_time_limit=840)
def run_genetic_optimization_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    param_ranges: dict,
    population_size: int = 50,
    n_generations: int = 20,
    crossover_prob: float = 0.7,
    mutation_prob: float = 0.2,
    objective_metric: str = "sharpe_ratio",
    constraints: dict | None = None,
    interval: str = "1d",
):
    """Genetic algorithm optimization using DEAP."""
    try:
        from deap import base, creator, tools, algorithms
    except ImportError:
        return {"status": "failed", "error": "deap is not installed. Run: pip install deap"}

    import random

    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    population_size = min(population_size, 200)
    n_generations = min(n_generations, 100)

    # Build param info
    param_keys = list(param_ranges.keys())
    param_bounds = []
    param_types = []
    for key in param_keys:
        rng = param_ranges[key]
        if isinstance(rng, dict):
            param_bounds.append((rng.get("low", 0), rng.get("high", 100)))
            param_types.append(rng.get("type", "float"))
        elif isinstance(rng, list) and len(rng) >= 2:
            param_bounds.append((min(rng), max(rng)))
            param_types.append("float")
        else:
            param_bounds.append((0, 100))
            param_types.append("float")

    # DEAP setup : use unique names to avoid conflicts
    if hasattr(creator, "GeneticFitness"):
        del creator.GeneticFitness
    if hasattr(creator, "GeneticIndividual"):
        del creator.GeneticIndividual

    creator.create("GeneticFitness", base.Fitness, weights=(1.0,))
    creator.create("GeneticIndividual", list, fitness=creator.GeneticFitness)

    toolbox = base.Toolbox()

    # Register attribute generators for each parameter
    for i, (low, high) in enumerate(param_bounds):
        toolbox.register(f"attr_{i}", random.uniform, low, high)

    def create_individual():
        ind = []
        for i, (low, high) in enumerate(param_bounds):
            ind.append(random.uniform(low, high))
        return creator.GeneticIndividual(ind)

    toolbox.register("individual", create_individual)
    toolbox.register("population", tools.initRepeat, list, toolbox.individual)

    all_results = []
    generation_history = []

    def evaluate(individual):
        combo = {}
        for i, key in enumerate(param_keys):
            val = individual[i]
            if param_types[i] == "int":
                val = int(round(val))
            combo[key] = val

        result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=combo, data=data.copy(), symbol=symbol,
        )
        result["params"] = combo
        all_results.append(result)

        if "error" in result:
            return (float("-inf"),)

        # Check constraints
        if constraints:
            violated = _check_constraints(result, constraints)
            if violated:
                result["constraint_violated"] = True
                return (float("-inf"),)

        value = result.get(objective_metric, result.get("sharpe_ratio", 0))
        if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
            return (float("-inf"),)
        return (float(value),)

    toolbox.register("evaluate", evaluate)
    toolbox.register("mate", tools.cxBlend, alpha=0.5)
    toolbox.register("mutate", tools.mutGaussian, mu=0, sigma=1, indpb=0.2)
    toolbox.register("select", tools.selTournament, tournsize=3)

    # Clamp values after crossover/mutation
    def clamp(individual):
        for i in range(len(individual)):
            low, high = param_bounds[i]
            individual[i] = max(low, min(high, individual[i]))
        return individual

    random.seed(42)
    pop = toolbox.population(n=population_size)

    # Evaluate initial population
    fitnesses = list(map(toolbox.evaluate, pop))
    for ind, fit in zip(pop, fitnesses):
        ind.fitness.values = fit

    for gen in range(n_generations):
        offspring = toolbox.select(pop, len(pop))
        offspring = list(map(toolbox.clone, offspring))

        # Crossover
        for c1, c2 in zip(offspring[::2], offspring[1::2]):
            if random.random() < crossover_prob:
                toolbox.mate(c1, c2)
                clamp(c1)
                clamp(c2)
                del c1.fitness.values
                del c2.fitness.values

        # Mutation
        for mut in offspring:
            if random.random() < mutation_prob:
                toolbox.mutate(mut)
                clamp(mut)
                del mut.fitness.values

        # Evaluate new individuals
        invalids = [ind for ind in offspring if not ind.fitness.valid]
        fitnesses = list(map(toolbox.evaluate, invalids))
        for ind, fit in zip(invalids, fitnesses):
            ind.fitness.values = fit

        pop[:] = offspring

        # Track best per generation
        best_fit = max(ind.fitness.values[0] for ind in pop)
        generation_history.append({"generation": gen + 1, "best_fitness": best_fit if best_fit != float("-inf") else None})

        self.update_state(
            state="PROGRESS",
            meta={"current": gen + 1, "total": n_generations},
        )

    valid_results = [r for r in all_results if "error" not in r and not r.get("constraint_violated")]
    valid_results.sort(key=lambda r: (r.get(objective_metric, r.get("sharpe_ratio", 0)) or -999), reverse=True)
    error_results = [r for r in all_results if "error" in r]

    return {
        "status": "completed",
        "method": "genetic",
        "total_evaluations": len(all_results),
        "generations": n_generations,
        "objective_metric": objective_metric,
        "results": valid_results[:50] + error_results[:5],
        "best": valid_results[0] if valid_results else None,
        "generation_history": generation_history,
    }


# ---------------------------------------------------------------------------
# Multi-Objective Optimization task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=600, soft_time_limit=540)
def run_multiobjective_optimization_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    param_ranges: dict,
    n_trials: int = 50,
    objective_metrics: list | None = None,
    directions: list | None = None,
    constraints: dict | None = None,
    interval: str = "1d",
):
    """Multi-objective optimization using NSGA-II via optuna."""
    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        return {"status": "failed", "error": "optuna is not installed"}

    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    if not objective_metrics or len(objective_metrics) < 2:
        objective_metrics = ["sharpe_ratio", "max_drawdown"]
    if not directions or len(directions) != len(objective_metrics):
        directions = ["maximize" if m != "max_drawdown" else "minimize" for m in objective_metrics]

    n_trials = min(n_trials, 200)
    all_results = []

    def objective(trial):
        combo = {}
        for key, rng in param_ranges.items():
            if isinstance(rng, dict):
                low = rng.get("low", rng.get("min", 1))
                high = rng.get("high", rng.get("max", 100))
                step = rng.get("step")
                param_type = rng.get("type", "float")
                if param_type == "int":
                    combo[key] = trial.suggest_int(key, int(low), int(high), step=int(step) if step else 1)
                else:
                    combo[key] = trial.suggest_float(key, float(low), float(high), step=float(step) if step else None)
            elif isinstance(rng, list) and len(rng) >= 2:
                combo[key] = trial.suggest_float(key, float(min(rng)), float(max(rng)))
            else:
                combo[key] = rng[0] if isinstance(rng, list) else rng

        result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=combo, data=data.copy(), symbol=symbol,
        )
        result["params"] = combo
        all_results.append(result)

        if "error" in result:
            return tuple(float("inf") if d == "minimize" else float("-inf") for d in directions)

        if constraints:
            violated = _check_constraints(result, constraints)
            if violated:
                result["constraint_violated"] = True
                return tuple(float("inf") if d == "minimize" else float("-inf") for d in directions)

        values = []
        for metric in objective_metrics:
            v = result.get(metric, 0)
            if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                v = 0
            values.append(float(v))

        self.update_state(state="PROGRESS", meta={"current": len(all_results), "total": n_trials})
        return tuple(values)

    study = optuna.create_study(
        directions=directions,
        sampler=optuna.samplers.NSGAIISampler(seed=42),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    # Extract Pareto front
    pareto_front = []
    for trial in study.best_trials:
        pf_entry = {"values": {m: v for m, v in zip(objective_metrics, trial.values)}}
        pf_entry["params"] = trial.params
        pareto_front.append(pf_entry)

    valid_results = [r for r in all_results if "error" not in r and not r.get("constraint_violated")]

    return {
        "status": "completed",
        "method": "multiobjective",
        "total_trials": len(all_results),
        "objective_metrics": objective_metrics,
        "directions": directions,
        "pareto_front": pareto_front,
        "results": valid_results[:50],
        "best": valid_results[0] if valid_results else None,
    }


# ---------------------------------------------------------------------------
# Parameter Heatmap task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=600, soft_time_limit=540)
def run_heatmap_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    param_x: str,
    param_y: str,
    x_range: dict,
    y_range: dict,
    metric: str = "sharpe_ratio",
    constraints: dict | None = None,
    interval: str = "1d",
):
    """Generate a 2D parameter stability heatmap."""
    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    x_low, x_high = x_range.get("low", 5), x_range.get("high", 50)
    x_steps = min(x_range.get("steps", 15), 25)
    y_low, y_high = y_range.get("low", 5), y_range.get("high", 50)
    y_steps = min(y_range.get("steps", 15), 25)

    x_values = [round(x_low + i * (x_high - x_low) / max(x_steps - 1, 1), 4) for i in range(x_steps)]
    y_values = [round(y_low + i * (y_high - y_low) / max(y_steps - 1, 1), 4) for i in range(y_steps)]

    z_values = []
    total = len(x_values) * len(y_values)
    count = 0

    for yi, yv in enumerate(y_values):
        row = []
        for xi, xv in enumerate(x_values):
            combo = {param_x: xv, param_y: yv}
            result = _run_single_backtest(
                code=code, initial_capital=initial_capital,
                commission=commission, slippage=slippage,
                param_combo=combo, data=data.copy(), symbol=symbol,
            )
            val = result.get(metric, 0) if "error" not in result else None

            if constraints and val is not None and "error" not in result:
                violated = _check_constraints(result, constraints)
                if violated:
                    val = None

            if val is not None:
                try:
                    val = float(val)
                    if math.isnan(val) or math.isinf(val):
                        val = None
                except (TypeError, ValueError):
                    val = None

            row.append(val)
            count += 1
            if count % 10 == 0:
                self.update_state(state="PROGRESS", meta={"current": count, "total": total})

        z_values.append(row)

    return {
        "status": "completed",
        "param_x": param_x,
        "param_y": param_y,
        "x_values": x_values,
        "y_values": y_values,
        "z_values": z_values,
        "metric": metric,
    }


# ---------------------------------------------------------------------------
# Walk-Forward Analysis task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=900, soft_time_limit=840, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def run_walk_forward_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    n_splits: int = 5,
    train_pct: float = 0.7,
    purge_bars: int = 0,
    window_mode: str = "rolling",
    interval: str = "1d",
    param_ranges: dict | None = None,
    n_trials: int = 30,
):
    """Walk-forward analysis with optional parameter optimization.

    Splits data into windows, optimizes on train Sharpe via Optuna, and
    evaluates on an OOS test then uses defaults if param_ranges is None.

    """
    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        if param_ranges:
            return {"status": "failed", "error": "optuna required for walk-forward optimization"}

    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    total_bars = len(data)
    window_size = total_bars // n_splits
    if window_size < 30:
        return {
            "status": "failed",
            "error": (
                f"Not enough data for walk-forward splits "
                f"({total_bars} bars / {n_splits} splits = {window_size} bars per window, need ≥30). "
                f"Try a longer date range or fewer splits."
            ),
        }

    lookback = min(50, window_size)
    anchored = window_mode == "anchored"

    def _adjust_return(result, warmup_bars):
        ret = result.get("total_return")
        curve = result.get("equity_curve") or []
        if warmup_bars > 0 and warmup_bars < len(curve):
            eq_start = curve[warmup_bars].get("equity", initial_capital)
            eq_end = curve[-1].get("equity", initial_capital)
            if eq_start > 0:
                ret = round((eq_end - eq_start) / eq_start * 100, 4)
        return ret

    def _optimize_on_train(train_data_slice):
        if not param_ranges:
            return {}
        def objective(trial):
            combo = {}
            for key, rng in param_ranges.items():
                if isinstance(rng, dict):
                    low, high = rng.get("low", 1), rng.get("high", 100)
                    pt = rng.get("type", "float")
                    if pt == "int":
                        combo[key] = trial.suggest_int(key, int(low), int(high))
                    else:
                        combo[key] = trial.suggest_float(key, float(low), float(high))
                else:
                    combo[key] = rng[0] if isinstance(rng, list) else rng
            r = _run_single_backtest(
                code=code, initial_capital=initial_capital,
                commission=commission, slippage=slippage,
                param_combo=combo, data=train_data_slice.copy(), symbol=symbol,
            )
            if "error" in r:
                return float("-inf")
            return r.get("sharpe_ratio", 0) or 0

        study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=42),
        )
        study.optimize(objective, n_trials=min(n_trials, 100), show_progress_bar=False)
        return study.best_params if study.best_trial else {}

    windows = []
    for i in range(n_splits):
        start_idx = i * window_size
        end_idx = min(start_idx + window_size, total_bars)
        if end_idx - start_idx < 10:
            continue

        if anchored:
            train_start_idx = 0
            train_end = start_idx + int((end_idx - start_idx) * train_pct)
        else:
            train_start_idx = start_idx
            split = int((end_idx - start_idx) * train_pct)
            train_end = start_idx + split

        test_start = min(train_end + purge_bars, end_idx)
        if test_start >= end_idx:
            continue

        train_lb_start = max(0, train_start_idx - lookback)
        train_data = data.iloc[train_lb_start:train_end].copy()

        test_lb_start = max(0, test_start - lookback)
        test_data = data.iloc[test_lb_start:end_idx].copy()

        train_period = {
            "start": data.index[train_start_idx].strftime("%Y-%m-%d"),
            "end": data.index[min(train_end - 1, total_bars - 1)].strftime("%Y-%m-%d"),
        }
        test_period = {
            "start": data.index[min(test_start, total_bars - 1)].strftime("%Y-%m-%d"),
            "end": data.index[min(end_idx - 1, total_bars - 1)].strftime("%Y-%m-%d"),
        }

        best_params = _optimize_on_train(train_data)

        train_result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=best_params,
            data=train_data,
            symbol=symbol,
            include_equity_curve=True,
        )
        train_warmup = train_start_idx - train_lb_start
        train_return = _adjust_return(train_result, train_warmup)

        test_result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=best_params,
            data=test_data,
            symbol=symbol,
            include_equity_curve=True,
        )
        test_warmup = test_start - test_lb_start
        test_return = _adjust_return(test_result, test_warmup)

        train_sharpe = train_result.get("sharpe_ratio") or 0
        test_sharpe = test_result.get("sharpe_ratio") or 0
        overfit_score = None
        if train_sharpe > 0:
            overfit_score = round(max(0, 1 - (test_sharpe / train_sharpe)) * 100, 1)

        windows.append({
            "window": i + 1,
            "train_period": train_period,
            "test_period": test_period,
            "best_params": best_params,
            "train_return": train_return,
            "test_return": test_return,
            "train_sharpe": train_result.get("sharpe_ratio"),
            "test_sharpe": test_result.get("sharpe_ratio"),
            "train_trades": train_result.get("total_trades"),
            "test_trades": test_result.get("total_trades"),
            "overfit_score": overfit_score,
            "train_error": train_result.get("error"),
            "test_error": test_result.get("error"),
        })

        self.update_state(state="PROGRESS", meta={"current": i + 1, "total": n_splits})

    test_returns = [w["test_return"] for w in windows if w["test_return"] is not None]
    test_sharpes = [w["test_sharpe"] for w in windows if w["test_sharpe"] is not None]
    train_sharpes = [w["train_sharpe"] for w in windows if w["train_sharpe"] is not None]
    avg_oos_return = round(sum(test_returns) / len(test_returns), 4) if test_returns else None
    avg_oos_sharpe = round(sum(test_sharpes) / len(test_sharpes), 4) if test_sharpes else None
    avg_is_sharpe = round(sum(train_sharpes) / len(train_sharpes), 4) if train_sharpes else None

    overall_overfit = None
    if avg_is_sharpe and avg_is_sharpe > 0 and avg_oos_sharpe is not None:
        overall_overfit = round(max(0, 1 - (avg_oos_sharpe / avg_is_sharpe)) * 100, 1)

    return {
        "status": "completed",
        "n_splits": n_splits,
        "train_pct": train_pct,
        "purge_bars": purge_bars,
        "window_mode": window_mode,
        "windows": windows,
        "avg_oos_return": avg_oos_return,
        "avg_oos_sharpe": avg_oos_sharpe,
        "avg_is_sharpe": avg_is_sharpe,
        "overall_overfit_score": overall_overfit,
    }


# ---------------------------------------------------------------------------
# Monte Carlo Simulation task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=300, soft_time_limit=240)
def run_monte_carlo_task(
    self,
    trades: list[dict],
    initial_capital: float,
    n_simulations: int = 1000,
):
    """Monte Carlo simulation: shuffle trade order for stability assessment."""
    if not trades:
        return {"status": "failed", "error": "No trades to simulate"}

    pnls = [t["pnl"] for t in trades]
    rng = np.random.default_rng(42)

    final_values = []
    # Store a few equity curves for visualization
    sample_curves: list[list[float]] = []
    sample_indices = set(range(0, n_simulations, max(1, n_simulations // 10)))

    for i in range(n_simulations):
        shuffled = rng.permutation(pnls)
        equity = initial_capital
        curve = [equity]
        for pnl in shuffled:
            equity += pnl
            curve.append(round(equity, 2))
        final_values.append(equity)
        if i in sample_indices:
            # Downsample curve to 100 points
            if len(curve) > 100:
                step = len(curve) / 100
                curve = [curve[round(j * step)] for j in range(100)]
            sample_curves.append(curve)

        if i % 100 == 0:
            self.update_state(state="PROGRESS", meta={"current": i, "total": n_simulations})

    fv = np.array(final_values)
    percentiles = {
        "p5": round(float(np.percentile(fv, 5)), 2),
        "p25": round(float(np.percentile(fv, 25)), 2),
        "p50": round(float(np.percentile(fv, 50)), 2),
        "p75": round(float(np.percentile(fv, 75)), 2),
        "p95": round(float(np.percentile(fv, 95)), 2),
    }

    return {
        "status": "completed",
        "n_simulations": n_simulations,
        "percentiles": percentiles,
        "mean_final": round(float(np.mean(fv)), 2),
        "std_final": round(float(np.std(fv)), 2),
        "sample_curves": sample_curves,
        "probability_of_loss": round(float(np.mean(fv < initial_capital)) * 100, 2),
    }


# ---------------------------------------------------------------------------
# Batch Strategy Runner
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=1800, soft_time_limit=1740)
def run_batch_backtest_task(
    self,
    strategies: list[dict],
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 10000,
    commission: float = 0.001,
    slippage: float = 0.001,
    interval: str = "1d",
):
    """Run multiple strategies in batch and return comparative results.
    
    Each strategy dict: {"name": str, "code": str, "params": dict}
    """
    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data"}

    results = []
    for i, strat in enumerate(strategies[:20]):  # Cap at 20 strategies
        name = strat.get("name", f"Strategy {i+1}")
        code = strat.get("code", "")
        params = strat.get("params", {})

        result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=params, data=data.copy(), symbol=symbol,
        )
        result["strategy_name"] = name
        results.append(result)

        self.update_state(
            state="PROGRESS",
            meta={"current": i + 1, "total": len(strategies[:20])},
        )

    # Sort by Sharpe
    valid = [r for r in results if "error" not in r]
    valid.sort(key=lambda r: (r.get("sharpe_ratio") or -999), reverse=True)
    errors = [r for r in results if "error" in r]

    return {
        "status": "completed",
        "total_strategies": len(results),
        "results": valid + errors,
        "best": valid[0] if valid else None,
    }


# ---------------------------------------------------------------------------
# Out-of-Sample Enforcement
# ---------------------------------------------------------------------------

def _run_kfold_oos(
    code: str,
    data: pd.DataFrame,
    symbol: str,
    initial_capital: float,
    commission: float,
    slippage: float,
    n_folds: int,
    param_ranges: dict,
    n_trials: int,
    task_self,
) -> dict:
    """K-fold cross-validation: optimize on train, test on holdout, report mean ± std."""
    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        return {"status": "failed", "error": "optuna required"}

    n = len(data)
    fold_size = n // n_folds
    oos_sharpes: list[float] = []
    oos_returns: list[float] = []
    fold_results: list[dict] = []

    for k in range(n_folds):
        test_start = k * fold_size
        test_end = (k + 1) * fold_size if k < n_folds - 1 else n
        train_indices = list(range(0, test_start)) + list(range(test_end, n))
        if len(train_indices) < 50 or (test_end - test_start) < 20:
            continue

        train_data = data.iloc[train_indices].copy()
        test_data = data.iloc[test_start:test_end].copy()

        def objective(trial):
            combo = {}
            for key, rng in param_ranges.items():
                if isinstance(rng, dict):
                    low, high = rng.get("low", 1), rng.get("high", 100)
                    pt = rng.get("type", "float")
                    combo[key] = trial.suggest_int(key, int(low), int(high)) if pt == "int" else trial.suggest_float(key, float(low), float(high))
                else:
                    combo[key] = rng[0] if isinstance(rng, list) else rng

            r = _run_single_backtest(
                code=code, initial_capital=initial_capital,
                commission=commission, slippage=slippage,
                param_combo=combo, data=train_data.copy(), symbol=symbol,
            )
            return r.get("sharpe_ratio", 0) or 0 if "error" not in r else float("-inf")

        study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42 + k))
        study.optimize(objective, n_trials=min(n_trials, 50), show_progress_bar=False)
        best_params = study.best_params if study.best_trial else {}

        oos_r = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=best_params, data=test_data.copy(), symbol=symbol,
        )
        sr = oos_r.get("sharpe_ratio") or 0
        ret = oos_r.get("total_return") or 0
        oos_sharpes.append(float(sr))
        oos_returns.append(float(ret))
        fold_results.append({"fold": k + 1, "oos_sharpe": sr, "oos_return": ret, "best_params": best_params})

        if task_self:
            task_self.update_state(state="PROGRESS", meta={"current": k + 1, "total": n_folds})

    if not oos_sharpes:
        return {"status": "failed", "error": "No valid folds"}

    import numpy as np
    return {
        "status": "completed",
        "n_folds": len(oos_sharpes),
        "oos_sharpe_mean": round(float(np.mean(oos_sharpes)), 4),
        "oos_sharpe_std": round(float(np.std(oos_sharpes)), 4),
        "oos_return_mean": round(float(np.mean(oos_returns)), 4),
        "oos_return_std": round(float(np.std(oos_returns)), 4),
        "fold_results": fold_results,
        "is_result": None,
        "oos_result": {"sharpe_ratio": np.mean(oos_sharpes), "total_return": np.mean(oos_returns)},
        "is_sharpe": None,
        "oos_sharpe": np.mean(oos_sharpes),
        "best_params": fold_results[0]["best_params"] if fold_results else {},
        "overfit_score": None,
    }


@celery_app.task(bind=True, time_limit=900, soft_time_limit=840, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def run_oos_validation_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 10000,
    commission: float = 0.001,
    slippage: float = 0.001,
    oos_ratio: float = 0.3,
    n_folds: int = 1,
    param_ranges: dict | None = None,
    n_trials: int = 30,
    interval: str = "1d",
):
    """Run optimization on in-sample, then validate best params on out-of-sample.

    n_folds=1: single IS/OOS split. n_folds>1: k-fold cross-validation, report mean ± std.
    """
    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data"}

    # Split data
    n = len(data)
    split_idx = int(n * (1 - oos_ratio))
    is_data = data.iloc[:split_idx]
    oos_data = data.iloc[split_idx:]

    if is_data.empty or oos_data.empty:
        return {"status": "failed", "error": "Not enough data for IS/OOS split"}

    # K-fold cross-validation (report mean ± std across folds)
    if n_folds > 1 and param_ranges:
        return _run_kfold_oos(
            code=code, data=data, symbol=symbol,
            initial_capital=initial_capital, commission=commission, slippage=slippage,
            n_folds=min(n_folds, max(1, n // 50)),
            param_ranges=param_ranges, n_trials=n_trials,
            task_self=self,
        )

    is_start = str(is_data.index[0].date()) if hasattr(is_data.index[0], 'date') else str(is_data.index[0])
    is_end = str(is_data.index[-1].date()) if hasattr(is_data.index[-1], 'date') else str(is_data.index[-1])
    oos_start = str(oos_data.index[0].date()) if hasattr(oos_data.index[0], 'date') else str(oos_data.index[0])
    oos_end = str(oos_data.index[-1].date()) if hasattr(oos_data.index[-1], 'date') else str(oos_data.index[-1])

    # If no param_ranges, just run IS and OOS with default params
    if not param_ranges:
        is_result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo={}, data=is_data.copy(), symbol=symbol,
        )
        oos_result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo={}, data=oos_data.copy(), symbol=symbol,
        )
        return {
            "status": "completed",
            "is_period": f"{is_start} to {is_end}",
            "oos_period": f"{oos_start} to {oos_end}",
            "is_result": is_result,
            "oos_result": oos_result,
            "best_params": {},
            "overfit_score": None,
        }

    # Optimize on IS data
    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        return {"status": "failed", "error": "optuna required"}

    is_results = []

    def objective(trial):
        combo = {}
        for key, rng in param_ranges.items():
            if isinstance(rng, dict):
                low = rng.get("low", 1)
                high = rng.get("high", 100)
                param_type = rng.get("type", "float")
                if param_type == "int":
                    combo[key] = trial.suggest_int(key, int(low), int(high))
                else:
                    combo[key] = trial.suggest_float(key, float(low), float(high))
            else:
                combo[key] = rng[0] if isinstance(rng, list) else rng

        result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=combo, data=is_data.copy(), symbol=symbol,
        )
        result["params"] = combo
        is_results.append(result)

        if "error" in result:
            return float("-inf")
        return result.get("sharpe_ratio", 0) or 0

    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    best_params = study.best_params if study.best_trial else {}

    # Run best params on OOS
    oos_result = _run_single_backtest(
        code=code, initial_capital=initial_capital,
        commission=commission, slippage=slippage,
        param_combo=best_params, data=oos_data.copy(), symbol=symbol,
    )

    # Run best params on IS for comparison
    is_best = _run_single_backtest(
        code=code, initial_capital=initial_capital,
        commission=commission, slippage=slippage,
        param_combo=best_params, data=is_data.copy(), symbol=symbol,
    )

    # Compute overfit score and multiple-testing note
    is_sharpe = is_best.get("sharpe_ratio", 0) or 0
    oos_sharpe = oos_result.get("sharpe_ratio", 0) or 0
    overfit_score = None
    if is_sharpe > 0:
        overfit_score = round(max(0, 1 - (oos_sharpe / is_sharpe)) * 100, 1)

    multiple_testing_note = None
    if n_trials > 1:
        multiple_testing_note = f"Deflated Sharpe recommended: {n_trials} trials may inflate best result."

    return {
        "status": "completed",
        "is_period": f"{is_start} to {is_end}",
        "oos_period": f"{oos_start} to {oos_end}",
        "best_params": best_params,
        "is_result": is_best,
        "oos_result": oos_result,
        "is_sharpe": is_sharpe,
        "oos_sharpe": oos_sharpe,
        "overfit_score": overfit_score,
        "multiple_testing_note": multiple_testing_note,
        "total_is_trials": len(is_results),
    }
