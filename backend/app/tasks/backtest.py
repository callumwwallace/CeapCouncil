import traceback
import math
from datetime import datetime, timedelta

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

# Sync engine for Celery tasks
sync_engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", ""))
SessionLocal = sessionmaker(bind=sync_engine)

# ---------------------------------------------------------------------------
# Allowed imports / builtins for user strategy code
# ---------------------------------------------------------------------------
_ALLOWED_IMPORTS = {"backtrader", "bt", "math", "numpy", "np", "pandas", "pd"}
_BLOCKED_BUILTINS = {
    "exec", "eval", "compile", "__import__", "open",
    "input", "exit", "quit", "breakpoint", "globals", "locals",
    "getattr", "setattr", "delattr", "vars", "dir",
}


def _build_safe_builtins() -> dict:
    """Return a restricted __builtins__ dict for user strategy execution."""
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
    """Safely compile user strategy code into a Backtrader Strategy class.

    The user code **must** define a class named ``MyStrategy`` that extends
    ``bt.Strategy``.  Only a restricted set of builtins and imports is
    available inside the executed code.

    Note: Strategy parameters are baked directly into the code string by the
    frontend (via ``updateCodeWithParams``), so no runtime param injection is
    needed.  Attempting to mutate ``strategy_cls.params`` after class creation
    breaks Backtrader's metaclass machinery.
    """
    safe_globals: dict = {
        "__builtins__": _build_safe_builtins(),
        "bt": bt,
    }

    try:
        compiled = compile(code, "<string>", "exec")
        exec(compiled, safe_globals)  # noqa: S102 – intentional; sandboxed
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
    # Build set of dates that fall within any trade's holding period
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
        backtest.started_at = datetime.utcnow()
        db.commit()

        # -- fetch strategy --
        strategy = db.query(Strategy).filter(Strategy.id == backtest.strategy_id).first()
        if not strategy:
            raise ValueError("Strategy not found")

        # -- compile user strategy code --
        # Params are already baked into the code by the frontend.
        try:
            user_strategy = create_user_strategy(strategy.code)
        except ValueError as e:
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = str(e)[:1000]
            backtest.completed_at = datetime.utcnow()
            db.commit()
            return {"status": "failed", "error": str(e)}

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

        # -- configure Cerebro --
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(backtest.initial_capital)

        commission = params.get("commission", 0.001)   # default 0.1 %
        slippage = params.get("slippage", 0.001)       # default 0.1 %
        cerebro.broker.setcommission(commission=commission)
        cerebro.broker.set_slippage_perc(slippage)

        # -- position sizing --
        sizing_method = params.get("sizing_method", "full")
        sizing_value = params.get("sizing_value")
        if sizing_method == "percent_equity" and sizing_value:
            cerebro.addsizer(bt.sizers.PercentSizer, percents=sizing_value)
        elif sizing_method == "fixed_shares" and sizing_value:
            cerebro.addsizer(bt.sizers.FixedSize, stake=int(sizing_value))
        elif sizing_method == "fixed_dollar" and sizing_value:
            # Custom: compute shares = dollar_amount / price at order time
            # Backtrader doesn't have a built-in dollar sizer, so we use
            # PercentSizer as approximation: pct = (dollar / cash) * 100
            pct = (sizing_value / backtest.initial_capital) * 100
            cerebro.addsizer(bt.sizers.PercentSizer, percents=min(pct, 100))

        # -- data feed(s) --
        data_feed = bt.feeds.PandasData(dataname=data, name=backtest.symbol)
        cerebro.adddata(data_feed)

        # Add additional data feeds for multi-symbol strategies
        additional_symbols = params.get("additional_symbols") or []
        for extra_sym in additional_symbols[:4]:  # Max 4 additional symbols
            if extra_sym == backtest.symbol:
                continue
            try:
                extra_data = yf.Ticker(extra_sym).history(
                    start=backtest.start_date,
                    end=backtest.end_date,
                    interval=interval,
                )
                if not extra_data.empty:
                    if extra_data.index.tz is not None:
                        extra_data.index = extra_data.index.tz_localize(None)
                    extra_feed = bt.feeds.PandasData(dataname=extra_data, name=extra_sym)
                    cerebro.adddata(extra_feed)
            except Exception:
                pass  # Skip symbols that fail to load

        # -- analyzers --
        cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe")
        cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
        cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
        cerebro.addanalyzer(bt.analyzers.Returns, _name="returns")
        cerebro.addanalyzer(TradeRecorder, _name="trade_recorder")

        # -- wrap user strategy with stop-loss / take-profit if requested --
        stop_loss_pct = params.get("stop_loss_pct")
        take_profit_pct = params.get("take_profit_pct")

        if stop_loss_pct or take_profit_pct:
            # Dynamically create a wrapper that injects SL/TP logic
            _orig_strategy = user_strategy
            _sl = stop_loss_pct
            _tp = take_profit_pct

            class SLTPStrategy(_orig_strategy):  # type: ignore[misc]
                """Wraps user strategy with automatic stop-loss / take-profit."""

                def next(self):
                    # Check existing position for SL/TP before user logic
                    if self.position:
                        entry = self.position.price
                        current = self.data.close[0]
                        if entry and entry > 0:
                            pnl_pct = ((current - entry) / entry) * 100
                            if self.position.size > 0:  # long
                                if _sl and pnl_pct <= -_sl:
                                    self.close()
                                    return
                                if _tp and pnl_pct >= _tp:
                                    self.close()
                                    return
                            else:  # short
                                if _sl and pnl_pct >= _sl:
                                    self.close()
                                    return
                                if _tp and pnl_pct <= -_tp:
                                    self.close()
                                    return
                    super().next()

            cerebro.addstrategy(SLTPStrategy)
        else:
            cerebro.addstrategy(user_strategy)

        # -- run --
        try:
            results = cerebro.run()
        except Exception as run_err:
            clean_msg = _extract_user_error(run_err, strategy.code)
            raise ValueError(f"Strategy runtime error:\n{clean_msg}") from run_err
        strat = results[0]

        # -- extract built-in analyzer data --
        final_value = cerebro.broker.getvalue()
        total_return = (
            (final_value - backtest.initial_capital) / backtest.initial_capital
        ) * 100

        sharpe_analysis = strat.analyzers.sharpe.get_analysis()
        sharpe_ratio_val = sharpe_analysis.get("sharperatio")
        # SharpeRatio can return None when there are no trades / not enough data
        if sharpe_ratio_val is not None:
            try:
                sharpe_ratio_val = round(float(sharpe_ratio_val), 4)
            except (TypeError, ValueError):
                sharpe_ratio_val = None

        drawdown_analysis = strat.analyzers.drawdown.get_analysis()
        max_dd = drawdown_analysis.get("max", {}).get("drawdown", 0.0)

        trade_analysis = strat.analyzers.trades.get_analysis()
        total_trade_count = trade_analysis.get("total", {}).get("total", 0)
        won_count = trade_analysis.get("won", {}).get("total", 0)
        win_rate = round(won_count / max(total_trade_count, 1) * 100, 2)

        # -- extract trade-level data from TradeRecorder --
        recorder = strat.analyzers.trade_recorder.get_analysis()
        trades_list = recorder["trades"]
        equity_curve_full = recorder["equity_curve"]

        # Sample equity curve to avoid huge JSON payloads
        equity_curve = _sample_series(equity_curve_full, max_points=200)

        # Derive drawdown series (sampled to same cadence as equity curve)
        drawdown_series = _derive_drawdown_series(equity_curve)

        # -- compute benchmark (buy & hold) return --
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
            if not bm_data.empty and len(bm_data) >= 2:
                first_close = float(bm_data["Close"].iloc[0])
                last_close = float(bm_data["Close"].iloc[-1])
                if first_close > 0:
                    benchmark_return = round(
                        ((last_close - first_close) / first_close) * 100, 4
                    )
        except Exception:
            pass  # non-critical — leave as None

        # -- compute extended metrics --
        sortino = _compute_sortino_ratio(equity_curve_full)
        profit_factor = _compute_profit_factor(trades_list)
        avg_duration = _compute_avg_trade_duration(trades_list)
        max_consec_losses = _compute_max_consecutive_losses(trades_list)
        num_bars = len(equity_curve_full)
        num_days = (data.index[-1] - data.index[0]).days if len(data) >= 2 else 0
        calmar = _compute_calmar_ratio(total_return, max_dd, num_days)
        exposure = _compute_exposure_pct(trades_list, num_bars)

        # -- persist results --
        backtest.status = BacktestStatus.COMPLETED
        backtest.completed_at = datetime.utcnow()
        backtest.total_return = total_return
        backtest.sharpe_ratio = sharpe_ratio_val
        backtest.max_drawdown = max_dd
        backtest.total_trades = total_trade_count
        backtest.win_rate = win_rate
        backtest.sortino_ratio = sortino
        backtest.profit_factor = profit_factor
        backtest.avg_trade_duration = avg_duration
        backtest.max_consecutive_losses = max_consec_losses
        backtest.calmar_ratio = calmar
        backtest.exposure_pct = exposure
        backtest.results = {
            "final_value": round(final_value, 2),
            "initial_capital": backtest.initial_capital,
            "total_return_pct": round(total_return, 4),
            "sharpe_ratio": sharpe_ratio_val,
            "max_drawdown_pct": round(max_dd, 4),
            "total_trades": total_trade_count,
            "win_rate": win_rate,
            "trades": trades_list,
            "equity_curve": equity_curve,
            "drawdown_series": drawdown_series,
            "benchmark_return": benchmark_return,
            "sortino_ratio": sortino,
            "profit_factor": profit_factor,
            "avg_trade_duration": avg_duration,
            "max_consecutive_losses": max_consec_losses,
            "calmar_ratio": calmar,
            "exposure_pct": exposure,
        }

        db.commit()
        return {"status": "completed", "backtest_id": backtest_id}

    except Exception as e:
        backtest = db.query(Backtest).filter(Backtest.id == backtest_id).first()
        if backtest:
            backtest.status = BacktestStatus.FAILED
            backtest.error_message = str(e)[:1000]
            backtest.completed_at = datetime.utcnow()
            db.commit()
        return {"status": "failed", "error": str(e), "traceback": traceback.format_exc()}

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Parameter Optimization (Grid Search) task
# ---------------------------------------------------------------------------

def _fetch_data(symbol: str, start_date, end_date, interval: str = "1d"):
    """Download market data once, returning a clean DataFrame or None."""
    ticker = yf.Ticker(symbol)
    data = ticker.history(start=start_date, end=end_date, interval=interval)
    if data.empty:
        return None
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)
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
) -> dict:
    """Run a single backtest with specific params, returning key metrics.

    Either pass a pre-fetched ``data`` DataFrame **or** ``symbol`` /
    ``start_date`` / ``end_date`` to let this helper download it.
    """
    import re

    modified_code = code
    if param_combo:
        params_str = ", ".join(f"('{k}', {v})" for k, v in param_combo.items())
        # Greedy match (no ?) captures the full params = ((...), (...))
        modified_code = re.sub(
            r"params\s*=\s*\(.*\)",
            f"params = ({params_str})",
            modified_code,
        )

    try:
        strategy_cls = create_user_strategy(modified_code)
    except ValueError as e:
        return {"params": param_combo, "error": str(e)}

    # Use pre-fetched data if available, otherwise download
    if data is None:
        if symbol is None:
            return {"params": param_combo, "error": "No symbol or data provided"}
        data = _fetch_data(symbol, start_date, end_date, interval)
    if data is None or data.empty:
        return {"params": param_combo, "error": "No market data for this window"}

    cerebro = bt.Cerebro()
    cerebro.broker.setcash(initial_capital)
    cerebro.broker.setcommission(commission=commission)
    cerebro.broker.set_slippage_perc(slippage)
    cerebro.adddata(bt.feeds.PandasData(dataname=data))
    cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe")
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
    cerebro.addstrategy(strategy_cls)

    try:
        results = cerebro.run()
    except Exception as e:
        return {"params": param_combo, "error": str(e)[:200]}

    strat = results[0]
    final_value = cerebro.broker.getvalue()
    total_return = ((final_value - initial_capital) / initial_capital) * 100

    sharpe = strat.analyzers.sharpe.get_analysis().get("sharperatio")
    if sharpe is not None:
        try:
            sharpe = round(float(sharpe), 4)
        except (TypeError, ValueError):
            sharpe = None

    dd = strat.analyzers.drawdown.get_analysis().get("max", {}).get("drawdown", 0)
    ta = strat.analyzers.trades.get_analysis()
    total_trades = ta.get("total", {}).get("total", 0)
    won = ta.get("won", {}).get("total", 0)
    win_rate = round(won / max(total_trades, 1) * 100, 2)

    return {
        "params": param_combo,
        "total_return": round(total_return, 4),
        "sharpe_ratio": sharpe,
        "max_drawdown": round(dd, 4),
        "total_trades": total_trades,
        "win_rate": win_rate,
        "final_value": round(final_value, 2),
    }


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
    for i, combo in enumerate(combos):
        result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo=combo,
            data=data.copy(),
        )
        results.append(result)
        # Update progress
        if i % 5 == 0:
            self.update_state(
                state="PROGRESS",
                meta={"current": i + 1, "total": len(combos)},
            )

    # Sort by Sharpe ratio (best first), then by return
    valid_results = [r for r in results if "error" not in r]
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


# ---------------------------------------------------------------------------
# Walk-Forward Analysis task
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, time_limit=600, soft_time_limit=540)
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
    interval: str = "1d",
):
    """Walk-forward analysis: split data into N windows, train+test each."""
    # Pre-fetch all data once
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

    # Lookback bars to warm up indicators in each sub-window.
    # Most strategies need 20-50 bars of history before indicators are valid.
    lookback = min(50, window_size)

    windows = []
    for i in range(n_splits):
        start_idx = i * window_size
        end_idx = min(start_idx + window_size, total_bars)
        if end_idx - start_idx < 10:
            continue

        split = int((end_idx - start_idx) * train_pct)
        train_end = start_idx + split
        test_start = train_end

        # Include lookback bars before each window so indicators can warm up.
        # Training slice: pull lookback bars from *before* this window.
        train_lb_start = max(0, start_idx - lookback)
        train_data = data.iloc[train_lb_start:train_end].copy()

        # Test slice: pull lookback bars from the end of the training window
        # so the test run has enough history for indicators like SMA(30).
        test_lb_start = max(0, test_start - lookback)
        test_data = data.iloc[test_lb_start:end_idx].copy()

        train_period = {
            "start": data.index[start_idx].strftime("%Y-%m-%d"),
            "end": data.index[min(train_end - 1, total_bars - 1)].strftime("%Y-%m-%d"),
        }
        test_period = {
            "start": data.index[min(test_start, total_bars - 1)].strftime("%Y-%m-%d"),
            "end": data.index[min(end_idx - 1, total_bars - 1)].strftime("%Y-%m-%d"),
        }

        # Run backtest on training slice (with lookback warmup)
        train_result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo={},
            data=train_data,
        )

        # Run backtest on test slice (with lookback warmup)
        test_result = _run_single_backtest(
            code=code,
            initial_capital=initial_capital,
            commission=commission, slippage=slippage,
            param_combo={},
            data=test_data,
        )

        windows.append({
            "window": i + 1,
            "train_period": train_period,
            "test_period": test_period,
            "train_return": train_result.get("total_return"),
            "test_return": test_result.get("total_return"),
            "train_sharpe": train_result.get("sharpe_ratio"),
            "test_sharpe": test_result.get("sharpe_ratio"),
            "train_trades": train_result.get("total_trades"),
            "test_trades": test_result.get("total_trades"),
            "train_error": train_result.get("error"),
            "test_error": test_result.get("error"),
        })

        self.update_state(state="PROGRESS", meta={"current": i + 1, "total": n_splits})

    # Aggregate
    test_returns = [w["test_return"] for w in windows if w["test_return"] is not None]
    avg_oos_return = round(sum(test_returns) / len(test_returns), 4) if test_returns else None

    return {
        "status": "completed",
        "n_splits": n_splits,
        "train_pct": train_pct,
        "windows": windows,
        "avg_oos_return": avg_oos_return,
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
    """Monte Carlo simulation: shuffle trade order to assess robustness."""
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
