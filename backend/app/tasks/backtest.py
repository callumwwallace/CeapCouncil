import ast
import logging
import resource
import signal
import math
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

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
from app.services.strategy_encryption import decrypt_strategy_field

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


def _compile_with_timeout(code: str, params: dict | None = None, restore_alarm_after: int | None = 0):
    timeout = getattr(settings, "COMPILE_TIMEOUT_SECONDS", 30)
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(timeout)
    try:
        return compile_strategy(code, params)
    finally:
        signal.alarm(restore_alarm_after if restore_alarm_after is not None else 0)


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


def _safe_task_error(exc: Exception, generic: str = "Task failed") -> str:
    msg = str(exc)
    if any(x in msg for x in ("Traceback", 'File "', "  File ", ".py\"", "\\app\\", "/app/")):
        return generic
    if isinstance(exc, ValueError) and len(msg) <= 500:
        return msg
    if isinstance(exc, ValueError):
        return msg[:500]
    return generic


def _extract_user_error(exc: Exception, code: str) -> str:
    import linecache
    import sys

    tb = exc.__traceback__
    user_frames: list[str] = []
    while tb is not None:
        frame = tb.tb_frame
        filename = frame.f_code.co_filename
        # Sandbox runs user code as "<string>", so that's the frame we surface
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


# Legacy Backtrader hook: capture trades + mark-to-market equity

class TradeRecorder(bt.Analyzer):
    """Records individual trades and an equity curve for every bar.

    Dates are recorded using the *data feed's own index* so they match
    exactly what yfinance returns (and what the frontend chart shows).
    """

    def __init__(self):
        super().__init__()
        self.trades: list[dict] = []
        self.equity_curve: list[dict] = []
        # Remember how big the position was when the trade opened (ref is Backtrader's id)
        self._open_sizes: dict[int, int] = {}

    def notify_trade(self, trade):
        if trade.isopen and trade.size != 0:
            self._open_sizes[trade.ref] = abs(trade.size)

        if not trade.isclosed:
            return

        # Closed legs report size 0 — use trade.long for side
        is_long = bool(getattr(trade, 'long', True))
        size = self._open_sizes.pop(trade.ref, 1)  # fallback to 1
        entry_price = round(trade.price, 4)

        # Backtrader gives entry + pnl; back out an exit print for the UI
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


def _compute_sortino_ratio(
    equity_curve: list[dict], risk_free_rate: float = 0.0, annualize: bool = True
) -> float | None:
    """Sortino ratio from daily equity values. MAR = risk_free_rate (default 0)."""
    if len(equity_curve) < 2:
        return None
    equities = np.array([p["equity"] for p in equity_curve], dtype=float)
    returns = np.diff(equities) / equities[:-1]
    excess = returns - risk_free_rate / 252
    # Classic Sortino: only downside volatility counts
    downside_std = float(np.sqrt(np.mean(np.minimum(excess, 0) ** 2)))
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
    """Calendar days in market / total. No weekday filter — works for equities, crypto, FX."""
    if not trades or total_bars <= 0:
        return None
    held_dates: set[str] = set()
    for t in trades:
        try:
            entry = datetime.strptime(t["entry_date"], "%Y-%m-%d")
            exit_ = datetime.strptime(t["exit_date"], "%Y-%m-%d")
            d = entry
            while d <= exit_:
                held_dates.add(d.strftime("%Y-%m-%d"))
                d += timedelta(days=1)
        except (ValueError, KeyError):
            continue
    return round(len(held_dates) / total_bars * 100, 2)


# run one backtest through Engine

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
        funding_enabled=is_crypto,
        stop_loss_pct=params.get("stop_loss_pct"),
        take_profit_pct=params.get("take_profit_pct"),
    )

    strategy_cls = _compile_with_timeout(code, params=params)
    strategy = strategy_cls(params=params)

    engine = Engine(config)
    engine.add_data(symbol, data)
    engine.set_strategy(strategy)
    return engine.run()


# downsample equity, drawdown series

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


# mechanical bt -> engine code pass

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

        line = _re.sub(
            r"class\s+(\w+)\s*\(\s*bt\.Strategy\s*\)\s*:",
            r"class \1(StrategyBase):",
            line,
        )

        line = _re.sub(r"def\s+__init__\s*\(\s*self\s*\)\s*:", "def on_init(self):", line)
        line = _re.sub(r"def\s+next\s*\(\s*self\s*\)\s*:", "def on_data(self, bar):", line)

        line = line.replace("self.data.close[0]", "bar.close")
        line = line.replace("self.data.high[0]", "bar.high")
        line = line.replace("self.data.low[0]", "bar.low")
        line = line.replace("self.data.open[0]", "bar.open")

        # Rewrite flat/long checks — do the "not position" form first or regex breaks
        line = _re.sub(r"not\s+self\.position\b", "self.is_flat(bar.symbol)", line)
        line = _re.sub(r"\bself\.position\b", "self.is_long(bar.symbol)", line)

        line = _re.sub(
            r"\bself\.buy\s*\(\s*\)",
            "self.market_order(bar.symbol, max(1, int(self.portfolio.cash * 0.95 / bar.close)))",
            line,
        )
        line = _re.sub(r"\bself\.sell\s*\(\s*\)", "self.close_position(bar.symbol)", line)
        line = _re.sub(r"\bself\.close\s*\(\s*\)", "self.close_position(bar.symbol)", line)

        translated.append(line)

    return "\n".join(translated)


@celery_app.task(bind=True, time_limit=300, soft_time_limit=240)
def run_backtest_task(self, backtest_id: int):
    """Execute a backtest for a given strategy."""
    db = SessionLocal()

    try:
        backtest = db.query(Backtest).filter(Backtest.id == backtest_id).first()
        if not backtest:
            return {"error": "Backtest not found"}

        backtest.status = BacktestStatus.RUNNING
        backtest.started_at = datetime.now()
        db.commit()

        _set_resource_limits()
        
        if backtest.code and backtest.code.strip():
            strategy_code = decrypt_strategy_field(backtest.code) or backtest.code
        elif backtest.strategy_id:
            strategy = db.query(Strategy).filter(Strategy.id == backtest.strategy_id).first()
            if not strategy:
                raise ValueError("Strategy not found")
            strategy_code = decrypt_strategy_field(strategy.code) or strategy.code
        else:
            raise ValueError("Backtest has no code and no strategy_id")

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

        # yfinance often ships tz-aware indexes; we stay naive so dates line up everywhere
        if data.index.tz is not None:
            data.index = data.index.tz_localize(None)

        data = filter_to_trading_days(data, backtest.symbol)
        if data.empty:
            raise ValueError(f"No trading-day data found for {backtest.symbol} (weekends/holidays excluded)")

        try:
            strategy_cls = _compile_with_timeout(
                strategy_code, params=params, restore_alarm_after=settings.BACKTEST_TIMEOUT_SECONDS
            )
            strategy = strategy_cls(params=params)
        except (ValueError, Exception) as e:
            safe_msg = _safe_task_error(e, "Strategy compilation or setup failed")
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = safe_msg[:1000]
            backtest.completed_at = datetime.now(timezone.utc)
            db.commit()
            return {"status": "failed", "error": safe_msg}

        is_crypto = any(
            ind in backtest.symbol.upper()
            for ind in ["-USD", "BTC", "ETH", "SOL", "DOGE", "XRP"]
        )

        user_spread = params.get("spread_model", "auto")
        if user_spread == "auto":
            resolved_spread = "volatility" if is_crypto else "none"
        else:
            resolved_spread = user_spread

        user_slippage_model = params.get("slippage_model", "percentage")
        liquidity_tier = None
        if user_slippage_model == "auto":
            user_slippage_model = "volume_aware"
            # Guess liquidity bucket from dollar volume — only affects cost models
            try:
                dollar_vol = (data["Volume"] * data["Close"]).dropna()
                avg_daily_usd = float(dollar_vol.mean()) if len(dollar_vol) > 0 else 0
                tier = auto_detect_tier(avg_daily_usd)
                liquidity_tier = tier.value
            except Exception:
                liquidity_tier = "high"

        margin_enabled = bool(params.get("margin_enabled", False))
        allow_shorts_without_margin = bool(params.get("allow_shorts_without_margin", False))
        leverage = float(params.get("leverage", 1))

        funding_enabled = bool(params.get("funding_enabled", is_crypto))
        funding_rate = float(params.get("funding_rate_annual_pct", 10.0))

        engine_config = EngineConfig(
            initial_capital=backtest.initial_capital,
            commission_rate=params.get("commission", 0.001),
            slippage_model=user_slippage_model,
            slippage_pct=params.get("slippage", 0.1),
            liquidity_tier=liquidity_tier,
            spread_model=resolved_spread,
            is_crypto=is_crypto,
            funding_enabled=funding_enabled,
            funding_rate_annual_pct=funding_rate,
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

        extra_symbols = params.get("additional_symbols") or []
        failed_symbols: list[str] = []
        # One aligned close series per symbol — we need them all for a fair blended benchmark
        loaded_close_series: list[pd.Series] = [data["Close"].astype(float)]
        for extra_sym in extra_symbols[:5]:  # hard cap so a typo can't fan out 50 downloads
            try:
                extra_ticker = yf.Ticker(extra_sym)
                extra_data = extra_ticker.history(
                    start=backtest.start_date,
                    end=backtest.end_date,
                    interval=interval,
                )
                if extra_data.empty:
                    failed_symbols.append(extra_sym)
                    continue
                if extra_data.index.tz is not None:
                    extra_data.index = extra_data.index.tz_localize(None)
                extra_data = filter_to_trading_days(extra_data, extra_sym)
                # Snap to the primary calendar (BTC weekends vs SPY holidays, etc.)
                extra_data = extra_data.reindex(data.index).ffill()
                if not extra_data.empty and extra_data["Close"].notna().any():
                    engine.add_data(extra_sym, extra_data)
                    loaded_close_series.append(extra_data["Close"].astype(float))
                else:
                    failed_symbols.append(extra_sym)
            except Exception:
                failed_symbols.append(extra_sym)

        engine.set_strategy(strategy)

        # Benchmark returns feed CAPM stats — user override wins, else blend everything we loaded
        explicit_benchmark = params.get("benchmark_symbol")
        benchmark_return = None
        try:
            if explicit_benchmark and explicit_benchmark != backtest.symbol:
                bm_ticker = yf.Ticker(explicit_benchmark)
                bm_data = bm_ticker.history(
                    start=backtest.start_date,
                    end=backtest.end_date,
                    interval=interval,
                )
                if bm_data.index.tz is not None:
                    bm_data.index = bm_data.index.tz_localize(None)
                bm_data = filter_to_trading_days(bm_data, explicit_benchmark)
                bm_closes = bm_data["Close"].values.astype(float)
                bm_daily_returns = list((bm_closes[1:] - bm_closes[:-1]) / bm_closes[:-1])
                bm_daily_returns = [r for r in bm_daily_returns if np.isfinite(r)]
                engine.set_benchmark_returns(bm_daily_returns)
                first_close, last_close = float(bm_closes[0]), float(bm_closes[-1])
                if first_close > 0:
                    benchmark_return = round((last_close - first_close) / first_close * 100, 4)
            elif len(loaded_close_series) > 1:
                combined = pd.concat(loaded_close_series, axis=1).ffill().dropna()
                if len(combined) >= 2:
                    daily_ret_matrix = combined.pct_change().iloc[1:]
                    blended_returns = daily_ret_matrix.mean(axis=1)
                    bm_daily_returns = [r for r in blended_returns.tolist() if np.isfinite(r)]
                    engine.set_benchmark_returns(bm_daily_returns)
                    per_asset_returns = [
                        (float(s.dropna().iloc[-1]) / float(s.dropna().iloc[0]) - 1)
                        for s in loaded_close_series
                        if len(s.dropna()) >= 2 and float(s.dropna().iloc[0]) > 0
                    ]
                    if per_asset_returns:
                        benchmark_return = round(
                            sum(per_asset_returns) / len(per_asset_returns) * 100, 4
                        )
            else:
                bm_closes = data["Close"].values.astype(float)
                bm_daily_returns = list((bm_closes[1:] - bm_closes[:-1]) / bm_closes[:-1])
                bm_daily_returns = [r for r in bm_daily_returns if np.isfinite(r)]
                engine.set_benchmark_returns(bm_daily_returns)
                first_close, last_close = float(bm_closes[0]), float(bm_closes[-1])
                if first_close > 0:
                    benchmark_return = round((last_close - first_close) / first_close * 100, 4)
        except Exception:
            pass

        try:
            result: EngineResult = engine.run()
        except Exception as run_err:
            clean_msg = extract_strategy_error(run_err, strategy_code)
            raise ValueError(f"Strategy runtime error:\n{clean_msg}") from run_err

        results_dict = result.to_results_dict()
        results_dict["benchmark_return"] = benchmark_return
        results_dict["num_symbols"] = len(loaded_close_series)
        if failed_symbols:
            results_dict["warnings"] = [
                f"Symbol '{s}' could not be loaded and was excluded from the backtest."
                for s in failed_symbols
            ]

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
        safe_msg = _safe_task_error(e, "Backtest failed")
        backtest = db.query(Backtest).filter(Backtest.id == backtest_id).first()
        if backtest:
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = safe_msg[:1000]
            backtest.completed_at = datetime.now(timezone.utc)
            db.commit()
        return {"status": "failed", "error": safe_msg}

    finally:
        _clear_resource_limits()
        db.close()


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
    # Integer-looking params must become real ints or pandas rolling() explodes on 14.0
    clean_combo = {}
    for k, v in param_combo.items():
        try:
            f = float(v)
            clean_combo[k] = int(f) if f.is_integer() else f
        except (TypeError, ValueError):
            clean_combo[k] = v

    try:
        strategy_cls = _compile_with_timeout(code, params=clean_combo)
        strategy = strategy_cls(params=clean_combo)
    except (ValueError, Exception) as e:
        return {"params": clean_combo, "error": _safe_task_error(e, "Optimization failed")}

    if data is None:
        if symbol is None:
            return {"params": clean_combo, "error": "No symbol or data provided"}
        data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"params": clean_combo, "error": "No market data for this window"}

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
        return {"params": clean_combo, "error": _safe_task_error(e, "Optimization failed")}

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
        "params": clean_combo,
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

    # One download for the whole grid — each combo mutates a fresh copy
    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    keys = list(param_grid.keys())
    values = [param_grid[k] for k in keys]
    combos = [dict(zip(keys, v)) for v in itertools.product(*values)]

    if len(combos) > 500:
        combos = combos[:500]

    results = []
    # Threads, not processes — Celery tasks don't pickle cleanly across forks here
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

    # DEAP is picky — blow away stale fitness classes between runs
    if hasattr(creator, "GeneticFitness"):
        del creator.GeneticFitness
    if hasattr(creator, "GeneticIndividual"):
        del creator.GeneticIndividual

    creator.create("GeneticFitness", base.Fitness, weights=(1.0,))
    creator.create("GeneticIndividual", list, fitness=creator.GeneticFitness)

    toolbox = base.Toolbox()

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

    def clamp(individual):
        for i in range(len(individual)):
            low, high = param_bounds[i]
            individual[i] = max(low, min(high, individual[i]))
        return individual

    random.seed(42)
    pop = toolbox.population(n=population_size)

    fitnesses = list(map(toolbox.evaluate, pop))
    for ind, fit in zip(pop, fitnesses):
        ind.fitness.values = fit

    for gen in range(n_generations):
        offspring = toolbox.select(pop, len(pop))
        offspring = list(map(toolbox.clone, offspring))

        for c1, c2 in zip(offspring[::2], offspring[1::2]):
            if random.random() < crossover_prob:
                toolbox.mate(c1, c2)
                clamp(c1)
                clamp(c2)
                del c1.fitness.values
                del c2.fitness.values

        for mut in offspring:
            if random.random() < mutation_prob:
                toolbox.mutate(mut)
                clamp(mut)
                del mut.fitness.values

        invalids = [ind for ind in offspring if not ind.fitness.valid]
        fitnesses = list(map(toolbox.evaluate, invalids))
        for ind, fit in zip(invalids, fitnesses):
            ind.fitness.values = fit

        pop[:] = offspring

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

    # Non-dominated trials only
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


def _heatmap_build_grid(r: dict) -> list[float]:
    """Evenly-spaced param values from a range (low, high, steps)."""
    low = float(r.get("low", 5))
    high = float(r.get("high", 50))
    steps = max(2, min(int(r.get("steps", 15)), 25))

    if low >= high:
        logger.warning("_heatmap_build_grid: low (%s) >= high (%s), swapping.", low, high)
        low, high = high, low

    use_int = low.is_integer() and high.is_integer()

    values = [
        round(low + i * (high - low) / (steps - 1), 6)
        for i in range(steps)
    ]

    # Whole-number ranges should produce int steps so rolling windows stay happy
    if use_int:
        values = [int(round(v)) for v in values]
        # Thin duplicates when the grid is tight
        seen = set()
        values = [v for v in values if not (v in seen or seen.add(v))]

    return values


def _heatmap_crossover_skip_mode(
    param_x: str,
    param_y: str,
    x_range: dict,
    y_range: dict,
) -> str | None:
    """
    Figure out if we're doing crossover params — returns 'fast_on_x', 'fast_on_y', or None.
    Only kicks in when param names suggest crossover AND ranges overlap.
    """
    x_lower, y_lower = param_x.lower(), param_y.lower()
    fast_x = "fast" in x_lower or "short" in x_lower
    slow_x = "slow" in x_lower or "long" in x_lower
    fast_y = "fast" in y_lower or "short" in y_lower
    slow_y = "slow" in y_lower or "long" in y_lower

    is_crossover = (fast_x and slow_y) or (fast_y and slow_x)
    if not is_crossover:
        return None

    x_low = float(x_range.get("low", 0))
    x_high = float(x_range.get("high", 1))
    y_low = float(y_range.get("low", 0))
    y_high = float(y_range.get("high", 1))
    if not (x_low < y_high and y_low < x_high):
        return None

    return "fast_on_x" if (fast_x and slow_y) else "fast_on_y"


def _heatmap_should_skip(mode: str | None, xv: float, yv: float) -> bool:
    if mode == "fast_on_x":
        return xv >= yv
    if mode == "fast_on_y":
        return yv >= xv
    return False


def _heatmap_extract_metric(
    result: dict,
    metric: str,
    xv: float,
    yv: float,
    param_x: str,
    param_y: str,
) -> tuple[float | None, str | None]:
    """Returns (value, error_reason). error_reason is None when it worked."""
    if "error" in result:
        return None, f"backtest_error: {result['error']}"

    raw = result.get(metric)
    if raw is None:
        return None, f"metric_missing: {metric} not in result for {param_x}={xv}, {param_y}={yv}"

    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None, f"metric_not_numeric: {metric}={raw!r} for {param_x}={xv}, {param_y}={yv}"

    if math.isnan(val) or math.isinf(val):
        return None, f"metric_invalid: {metric}={val} for {param_x}={xv}, {param_y}={yv}"

    return val, None


def _heatmap_record_diagnostic(
    diagnostics: list[dict],
    reason: str,
    xv: float,
    yv: float,
    param_x: str,
    param_y: str,
    detail: str = "",
    max_records: int = 10,
) -> None:
    if len(diagnostics) >= max_records:
        return
    entry: dict = {"reason": reason, param_x: xv, param_y: yv}
    if detail:
        entry["detail"] = detail
    diagnostics.append(entry)


def _heatmap_std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(variance)


def _heatmap_build_output(
    param_x: str,
    param_y: str,
    x_values: list,
    y_values: list,
    z_values: list,
    metric: str,
    total: int,
    diagnostics: list[dict],
) -> dict:
    valid_cells = [v for row in z_values for v in row if v is not None]
    valid_count = len(valid_cells)
    failure_rate = 1.0 - valid_count / total if total else 1.0

    out: dict = {
        "status": "completed",
        "param_x": param_x,
        "param_y": param_y,
        "x_values": x_values,
        "y_values": y_values,
        "z_values": z_values,
        "metric": metric,
        "valid_count": valid_count,
        "total_count": total,
    }

    if valid_cells:
        sorted_vals = sorted(valid_cells)
        out["stats"] = {
            "best": max(valid_cells),
            "worst": min(valid_cells),
            "median": sorted_vals[len(sorted_vals) // 2],
            "mean": sum(valid_cells) / valid_count,
            "std": _heatmap_std(valid_cells),
        }
        best_val = out["stats"]["best"]
        for yi, row in enumerate(z_values):
            for xi, v in enumerate(row):
                if v == best_val:
                    out["optimal"] = {
                        "xi": xi,
                        "yi": yi,
                        param_x: x_values[xi],
                        param_y: y_values[yi],
                        "value": best_val,
                    }
                    break
            else:
                continue
            break

    if valid_count == 0:
        out["status"] = "failed"
        out["error"] = (
            diagnostics[0]["reason"] if diagnostics
            else "All cells returned None. Check your strategy code, metric name, and date range."
        )
        if diagnostics:
            d0 = diagnostics[0]
            out["first_failing_combo"] = {param_x: d0.get(param_x), param_y: d0.get(param_y)}
    elif failure_rate > 0.5:
        out["warning"] = (
            f"{failure_rate:.0%} of parameter combinations failed. "
            f"First failure: {diagnostics[0]['reason'] if diagnostics else 'unknown'}"
        )

    if diagnostics:
        out["diagnostics"] = diagnostics

    return out


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
) -> dict:
    """
    Generate a 2D parameter stability heatmap for a trading strategy.

    Returns a grid of metric values across all (param_x, param_y) combinations.
    Cells are None when the combo is invalid, violates constraints, or errors.
    """
    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range."}

    x_values = _heatmap_build_grid(x_range)
    y_values = _heatmap_build_grid(y_range)

    if not x_values or not y_values:
        return {
            "status": "failed",
            "error": "Parameter range produced an empty grid. Check low/high/steps.",
        }

    total = len(x_values) * len(y_values)
    skip_mode = _heatmap_crossover_skip_mode(param_x, param_y, x_range, y_range)

    z_values: list[list[float | None]] = []
    diagnostics: list[dict] = []
    count = 0

    for yi, yv in enumerate(y_values):
        row: list[float | None] = []
        for xi, xv in enumerate(x_values):
            count += 1

            if _heatmap_should_skip(skip_mode, xv, yv):
                row.append(None)
                if count % 10 == 0:
                    self.update_state(state="PROGRESS", meta={"current": count, "total": total})
                continue

            try:
                result = _run_single_backtest(
                    code=code,
                    initial_capital=initial_capital,
                    commission=commission,
                    slippage=slippage,
                    param_combo={param_x: xv, param_y: yv},
                    data=data.copy(deep=True),
                    symbol=symbol,
                )
            except Exception as exc:
                _heatmap_record_diagnostic(
                    diagnostics, "exception", xv, yv, param_x, param_y, detail=str(exc)
                )
                row.append(None)
                if count % 10 == 0:
                    self.update_state(state="PROGRESS", meta={"current": count, "total": total})
                continue

            val, reason = _heatmap_extract_metric(result, metric, xv, yv, param_x, param_y)

            if reason:
                _heatmap_record_diagnostic(diagnostics, reason, xv, yv, param_x, param_y)

            if val is not None and constraints:
                violated = _check_constraints(result, constraints)
                if violated:
                    _heatmap_record_diagnostic(
                        diagnostics, "constraint_violated", xv, yv, param_x, param_y
                    )
                    val = None

            row.append(val)
            if count % 10 == 0:
                self.update_state(state="PROGRESS", meta={"current": count, "total": total})

        z_values.append(row)

    self.update_state(state="PROGRESS", meta={"current": total, "total": total})

    return _heatmap_build_output(
        param_x=param_x,
        param_y=param_y,
        x_values=x_values,
        y_values=y_values,
        z_values=z_values,
        metric=metric,
        total=total,
        diagnostics=diagnostics,
    )


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

    n_steps = 100  # normalised curve length

    final_values = []
    # Keep a handful of sample paths for the chart (10)
    sample_curves: list[list[float]] = []
    sample_indices = set(range(0, n_simulations, max(1, n_simulations // 10)))
    # Resample every path to n_steps so percentiles line up
    all_curves: list[list[float]] = []

    for i in range(n_simulations):
        shuffled = rng.permutation(pnls)
        equity = initial_capital
        curve = [equity]
        for pnl in shuffled:
            equity += pnl
            curve.append(round(equity, 2))
        final_values.append(equity)

        # Fan chart wants a fixed number of x positions
        if len(curve) > n_steps:
            step = len(curve) / n_steps
            downsampled = [curve[round(j * step)] for j in range(n_steps)]
        else:
            downsampled = curve + [curve[-1]] * (n_steps - len(curve))
        all_curves.append(downsampled)

        if i in sample_indices:
            sample_curves.append(downsampled)

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

    # p05 / p50 / p95 through time
    curves_matrix = np.array(all_curves)  # (n_simulations, n_steps)
    percentile_curves = {
        "p5":  [round(float(v), 2) for v in np.percentile(curves_matrix, 5, axis=0)],
        "p25": [round(float(v), 2) for v in np.percentile(curves_matrix, 25, axis=0)],
        "p50": [round(float(v), 2) for v in np.percentile(curves_matrix, 50, axis=0)],
        "p75": [round(float(v), 2) for v in np.percentile(curves_matrix, 75, axis=0)],
        "p95": [round(float(v), 2) for v in np.percentile(curves_matrix, 95, axis=0)],
    }

    return {
        "status": "completed",
        "n_simulations": n_simulations,
        "percentiles": percentiles,
        "mean_final": round(float(np.mean(fv)), 2),
        "std_final": round(float(np.std(fv)), 2),
        "sample_curves": sample_curves,
        "percentile_curves": percentile_curves,
        "probability_of_loss": round(float(np.mean(fv < initial_capital)) * 100, 2),
    }


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

    # Best Sharpe on top
    valid = [r for r in results if "error" not in r]
    valid.sort(key=lambda r: (r.get("sharpe_ratio") or -999), reverse=True)
    errors = [r for r in results if "error" in r]

    return {
        "status": "completed",
        "total_strategies": len(results),
        "results": valid + errors,
        "best": valid[0] if valid else None,
    }


# IS/OOS + k-fold helpers

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

    # In-sample vs out-of-sample slices
    n = len(data)
    split_idx = int(n * (1 - oos_ratio))
    is_data = data.iloc[:split_idx]
    oos_data = data.iloc[split_idx:]

    if is_data.empty or oos_data.empty:
        return {"status": "failed", "error": "Not enough data for IS/OOS split"}

    # K folds — we'll average metrics across them
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

    # Nothing to tune? Still compare IS vs OOS on defaults
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

    # Grid search only on the in-sample window
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

    # Walk the winner forward on unseen data
    oos_result = _run_single_backtest(
        code=code, initial_capital=initial_capital,
        commission=commission, slippage=slippage,
        param_combo=best_params, data=oos_data.copy(), symbol=symbol,
    )

    # Same params back on IS — sanity check the peak wasn't a fluke
    is_best = _run_single_backtest(
        code=code, initial_capital=initial_capital,
        commission=commission, slippage=slippage,
        param_combo=best_params, data=is_data.copy(), symbol=symbol,
    )

    # How much Sharpe deflates OOS vs IS, plus a gentle multiple-testing warning
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


@celery_app.task(bind=True, time_limit=1200, soft_time_limit=1140)
def run_cpcv_task(
    self,
    code: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 10000,
    commission: float = 0.001,
    slippage: float = 0.001,
    n_groups: int = 6,
    n_test_groups: int = 2,
    purge_bars: int = 10,
    embargo_bars: int = 0,
    param_ranges: dict | None = None,
    n_trials: int = 30,
    interval: str = "1d",
):
    """Combinatorial Purged Cross-Validation (López de Prado).

    Splits data into n_groups contiguous blocks, then tests every C(n_groups, n_test_groups)
    combination of held-out test groups. For each combination, bars adjacent to
    train/test boundaries are purged (and optionally embargoed) to prevent
    look-ahead bias. Optionally optimizes parameters on the training set.

    Returns a distribution of OOS Sharpe ratios across all paths.
    """
    from itertools import combinations

    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        if param_ranges:
            return {"status": "failed", "error": "optuna required for CPCV with parameter optimization"}

    data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"status": "failed", "error": "No market data for the selected date range"}

    total_bars = len(data)
    n_groups = min(n_groups, 20)
    n_test_groups = min(n_test_groups, n_groups - 1)
    group_size = total_bars // n_groups

    if group_size < 20:
        return {
            "status": "failed",
            "error": (
                f"Not enough data for CPCV: {total_bars} bars / {n_groups} groups = "
                f"{group_size} bars per group (need ≥20). "
                f"Try a longer date range or fewer groups."
            ),
        }

    groups = []
    for g in range(n_groups):
        g_start = g * group_size
        g_end = (g + 1) * group_size if g < n_groups - 1 else total_bars
        groups.append((g_start, g_end))

    combos = list(combinations(range(n_groups), n_test_groups))
    max_combos = 120
    if len(combos) > max_combos:
        import random
        random.seed(42)
        combos = random.sample(combos, max_combos)

    def _optimize_params(train_data_slice):
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
        study.optimize(objective, n_trials=min(n_trials, 50), show_progress_bar=False)
        return study.best_params if study.best_trial else {}

    path_results = []
    for ci, test_group_indices in enumerate(combos):
        test_indices_set = set(test_group_indices)
        train_group_indices = [g for g in range(n_groups) if g not in test_indices_set]

        train_idx = []
        for g in train_group_indices:
            g_start, g_end = groups[g]

            # Trim the tail of a train chunk if it touches the next test chunk
            purge_end = 0
            if (g + 1) in test_indices_set:
                purge_end = purge_bars + embargo_bars

            # Same idea on the leading edge
            purge_start = 0
            if (g - 1) in test_indices_set:
                purge_start = purge_bars + embargo_bars

            adj_start = min(g_start + purge_start, g_end)
            adj_end = max(g_start, g_end - purge_end)

            if adj_start < adj_end:
                train_idx.extend(range(adj_start, adj_end))

        test_idx = []
        for g in test_group_indices:
            g_start, g_end = groups[g]
            test_idx.extend(range(g_start, g_end))

        if len(train_idx) < 30 or len(test_idx) < 10:
            continue

        train_data = data.iloc[train_idx].copy()
        test_data = data.iloc[test_idx].copy()

        best_params = _optimize_params(train_data)

        train_result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=best_params, data=train_data, symbol=symbol,
        )
        test_result = _run_single_backtest(
            code=code, initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=best_params, data=test_data, symbol=symbol,
        )

        train_sharpe = train_result.get("sharpe_ratio") or 0
        test_sharpe = test_result.get("sharpe_ratio") or 0
        test_return = test_result.get("total_return") or 0

        path_results.append({
            "path": ci + 1,
            "test_groups": list(test_group_indices),
            "train_bars": len(train_idx),
            "test_bars": len(test_idx),
            "best_params": best_params,
            "train_sharpe": train_sharpe if "error" not in train_result else None,
            "test_sharpe": test_sharpe if "error" not in test_result else None,
            "test_return": test_return if "error" not in test_result else None,
            "train_error": train_result.get("error"),
            "test_error": test_result.get("error"),
        })

        if (ci + 1) % 5 == 0 or ci == len(combos) - 1:
            self.update_state(
                state="PROGRESS",
                meta={"current": ci + 1, "total": len(combos)},
            )

    if not path_results:
        return {"status": "failed", "error": "No valid CPCV paths could be evaluated"}

    oos_sharpes = [p["test_sharpe"] for p in path_results if p["test_sharpe"] is not None]
    oos_returns = [p["test_return"] for p in path_results if p["test_return"] is not None]
    train_sharpes = [p["train_sharpe"] for p in path_results if p["train_sharpe"] is not None]

    oos_sharpe_mean = round(float(np.mean(oos_sharpes)), 4) if oos_sharpes else None
    oos_sharpe_std = round(float(np.std(oos_sharpes)), 4) if oos_sharpes else None
    oos_sharpe_median = round(float(np.median(oos_sharpes)), 4) if oos_sharpes else None
    oos_return_mean = round(float(np.mean(oos_returns)), 4) if oos_returns else None
    train_sharpe_mean = round(float(np.mean(train_sharpes)), 4) if train_sharpes else None

    prob_oos_loss = round(float(np.mean(np.array(oos_sharpes) < 0)) * 100, 1) if oos_sharpes else None

    overfit_score = None
    if train_sharpe_mean and train_sharpe_mean > 0 and oos_sharpe_mean is not None:
        overfit_score = round(max(0, 1 - (oos_sharpe_mean / train_sharpe_mean)) * 100, 1)

    return {
        "status": "completed",
        "method": "cpcv",
        "n_groups": n_groups,
        "n_test_groups": n_test_groups,
        "purge_bars": purge_bars,
        "embargo_bars": embargo_bars,
        "total_paths": len(combos),
        "valid_paths": len(path_results),
        "paths": path_results,
        "oos_sharpe_mean": oos_sharpe_mean,
        "oos_sharpe_std": oos_sharpe_std,
        "oos_sharpe_median": oos_sharpe_median,
        "oos_return_mean": oos_return_mean,
        "train_sharpe_mean": train_sharpe_mean,
        "prob_oos_loss": prob_oos_loss,
        "overfit_score": overfit_score,
    }


def _ols_regression(y: np.ndarray, X: np.ndarray) -> dict:
    """Ordinary least-squares via numpy. Returns coefficients, t-stats, p-values, R²."""
    from scipy import stats as sp_stats

    n, k = X.shape
    X_aug = np.column_stack([np.ones(n), X])
    k_aug = k + 1

    try:
        beta = np.linalg.lstsq(X_aug, y, rcond=None)[0]
    except np.linalg.LinAlgError:
        return {"error": "Singular matrix — factor data may be collinear"}

    residuals = y - X_aug @ beta
    dof = max(n - k_aug, 1)
    mse = float(np.sum(residuals ** 2) / dof)

    try:
        cov = mse * np.linalg.inv(X_aug.T @ X_aug)
        se = np.sqrt(np.diag(cov))
    except np.linalg.LinAlgError:
        se = np.full(k_aug, np.nan)

    t_stats = beta / np.where(se > 0, se, np.nan)
    p_values = np.array([
        2 * (1 - sp_stats.t.cdf(abs(t), dof)) if np.isfinite(t) else np.nan
        for t in t_stats
    ])

    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    adj_r_squared = 1 - (1 - r_squared) * (n - 1) / dof if dof > 0 else r_squared

    return {
        "beta": beta.tolist(),
        "se": se.tolist(),
        "t_stats": t_stats.tolist(),
        "p_values": p_values.tolist(),
        "r_squared": r_squared,
        "adj_r_squared": adj_r_squared,
        "residuals": residuals.tolist(),
    }


@celery_app.task(bind=True, time_limit=300, soft_time_limit=240)
def run_factor_attribution_task(
    self,
    equity_curve: list[dict],
    initial_capital: float,
    symbol: str,
    start_date: str,
    end_date: str,
    interval: str = "1d",
):
    """Multi-factor attribution using ETF proxies for Fama-French + Momentum.

    Regresses strategy daily returns against:
      - Market (SPY excess return)
      - SMB  (IWM - SPY, size factor proxy)
      - HML  (IVE - IVW, value factor proxy)
      - Momentum (MTUM - SPY)

    Risk-free rate approximated from ^IRX (13-week T-bill).
    """
    if not equity_curve or len(equity_curve) < 30:
        return {"status": "failed", "error": "Need at least 30 equity curve points for factor attribution"}

    equities = np.array([p["equity"] for p in equity_curve], dtype=float)
    dates = [p["date"] for p in equity_curve]
    strat_returns = np.diff(equities) / equities[:-1]
    strat_dates = dates[1:]

    factor_etfs = ["SPY", "IWM", "IVE", "IVW", "MTUM"]
    factor_data = {}
    for etf in factor_etfs:
        try:
            ticker = yf.Ticker(etf)
            hist = ticker.history(start=start_date, end=end_date, interval=interval)
            if hist.index.tz is not None:
                hist.index = hist.index.tz_localize(None)
            if not hist.empty:
                factor_data[etf] = hist
        except Exception:
            pass

    if "SPY" not in factor_data:
        return {"status": "failed", "error": "Could not fetch market data (SPY) for factor attribution"}

    self.update_state(state="PROGRESS", meta={"current": 1, "total": 3})

    rf_daily = 0.0
    try:
        irx = yf.Ticker("^IRX")
        irx_hist = irx.history(start=start_date, end=end_date, interval=interval)
        if not irx_hist.empty:
            rf_annual = float(irx_hist["Close"].mean()) / 100
            rf_daily = rf_annual / 252
    except Exception:
        pass

    strat_df = pd.DataFrame({"date": strat_dates, "strategy": strat_returns})
    strat_df["date"] = pd.to_datetime(strat_df["date"])
    strat_df = strat_df.set_index("date")

    factor_returns = {}
    for etf, hist in factor_data.items():
        closes = hist["Close"]
        rets = closes.pct_change().dropna()
        rets.index = pd.to_datetime(rets.index)
        factor_returns[etf] = rets

    merged = strat_df.copy()
    for etf in factor_etfs:
        if etf in factor_returns:
            col = factor_returns[etf].rename(etf)
            merged = merged.join(col, how="inner")

    available_factors = [f for f in factor_etfs if f in merged.columns]
    merged = merged.dropna(subset=["strategy"] + available_factors)

    if len(merged) < 30:
        return {"status": "failed", "error": f"Only {len(merged)} overlapping data points — need at least 30"}

    self.update_state(state="PROGRESS", meta={"current": 2, "total": 3})

    factor_names = []
    factor_cols = []

    if "SPY" in merged.columns:
        merged["Mkt_RF"] = merged["SPY"] - rf_daily
        factor_names.append("Market (Mkt-RF)")
        factor_cols.append("Mkt_RF")

    if "IWM" in merged.columns and "SPY" in merged.columns:
        merged["SMB"] = merged["IWM"] - merged["SPY"]
        factor_names.append("Size (SMB)")
        factor_cols.append("SMB")

    if "IVE" in merged.columns and "IVW" in merged.columns:
        merged["HML"] = merged["IVE"] - merged["IVW"]
        factor_names.append("Value (HML)")
        factor_cols.append("HML")

    if "MTUM" in merged.columns and "SPY" in merged.columns:
        merged["MOM"] = merged["MTUM"] - merged["SPY"]
        factor_names.append("Momentum (MOM)")
        factor_cols.append("MOM")

    if not factor_cols:
        return {"status": "failed", "error": "No factor data could be constructed"}

    y = (merged["strategy"] - rf_daily).values
    X = merged[factor_cols].values

    reg = _ols_regression(y, X)
    if "error" in reg:
        return {"status": "failed", "error": reg["error"]}

    self.update_state(state="PROGRESS", meta={"current": 3, "total": 3})

    alpha_daily = reg["beta"][0]
    alpha_annual = round(((1 + alpha_daily) ** 252 - 1) * 100, 4)
    factor_betas = reg["beta"][1:]

    contributions = []
    for i, (name, col) in enumerate(zip(factor_names, factor_cols)):
        mean_factor = float(merged[col].mean())
        beta_val = factor_betas[i]
        annual_contrib = round(beta_val * mean_factor * 252 * 100, 4)
        sig = "***" if reg["p_values"][i + 1] < 0.01 else "**" if reg["p_values"][i + 1] < 0.05 else "*" if reg["p_values"][i + 1] < 0.1 else ""
        contributions.append({
            "factor": name,
            "beta": round(float(beta_val), 4),
            "t_stat": round(float(reg["t_stats"][i + 1]), 2),
            "p_value": round(float(reg["p_values"][i + 1]), 4),
            "significance": sig,
            "annual_contribution_pct": annual_contrib,
        })

    total_strat_return = round(float((equities[-1] / equities[0] - 1) * 100), 4)
    n_days = len(merged)
    annual_strat_return = round(float(((equities[-1] / equities[0]) ** (252 / max(n_days, 1)) - 1) * 100), 4)

    factor_sum = sum(c["annual_contribution_pct"] for c in contributions)
    unexplained = round(alpha_annual, 4)

    return {
        "status": "completed",
        "n_observations": n_days,
        "alpha_daily_pct": round(alpha_daily * 100, 6),
        "alpha_annual_pct": alpha_annual,
        "alpha_t_stat": round(float(reg["t_stats"][0]), 2),
        "alpha_p_value": round(float(reg["p_values"][0]), 4),
        "alpha_significant": reg["p_values"][0] < 0.05,
        "r_squared": round(reg["r_squared"], 4),
        "adj_r_squared": round(reg["adj_r_squared"], 4),
        "factors": contributions,
        "factor_contribution_sum_pct": round(factor_sum, 4),
        "unexplained_alpha_pct": unexplained,
        "strategy_annual_return_pct": annual_strat_return,
        "strategy_total_return_pct": total_strat_return,
        "rf_daily": round(rf_daily * 100, 6),
    }
