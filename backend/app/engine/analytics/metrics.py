"""Compute metrics from engine results: performance, trade stats, rolling metrics, TCA, overfitting (DSR, PBO)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from app.engine.portfolio.position import TradeRecord


@dataclass
class MetricsResult:
    """Complete analytics output compatible with frontend BacktestResults."""
    # Performance
    total_return_pct: float = 0.0
    sharpe_ratio: float | None = None
    sortino_ratio: float | None = None
    calmar_ratio: float | None = None
    max_drawdown_pct: float = 0.0
    information_ratio: float | None = None

    # Trade stats
    total_trades: int = 0
    win_rate: float = 0.0
    profit_factor: float | None = None
    avg_trade_duration: float | None = None
    max_consecutive_losses: int = 0
    exposure_pct: float | None = None
    expectancy: float | None = None
    avg_win: float | None = None
    avg_loss: float | None = None
    loss_rate: float | None = None

    # Performance (extended)
    cagr: float | None = None
    num_days: int | None = None
    treynor_ratio: float | None = None

    # Risk
    volatility_annual: float | None = None
    downside_deviation: float | None = None
    beta: float | None = None
    alpha: float | None = None
    r_squared: float | None = None
    turnover_rate: float | None = None

    # VaR / CVaR (95% and 99% confidence, daily)
    var_95: float | None = None
    cvar_95: float | None = None
    var_99: float | None = None
    cvar_99: float | None = None

    # Adverse/Favorable excursion
    avg_adverse_excursion: float | None = None
    avg_favorable_excursion: float | None = None

    # TCA
    total_commission: float = 0.0
    total_slippage: float = 0.0
    total_spread_cost: float = 0.0
    cost_as_pct_of_pnl: float | None = None

    # Drawdown series
    max_drawdown_duration_days: int | None = None

    # Crypto perpetual funding
    total_funding_paid: float = 0.0
    total_funding_received: float = 0.0
    net_funding: float = 0.0

    # Overfitting detection
    deflated_sharpe_ratio: float | None = None
    robustness_score: float | None = None

    # Rolling metrics arrays
    rolling_sharpe: list[dict] | None = None
    rolling_sortino: list[dict] | None = None
    rolling_beta: list[dict] | None = None
    rolling_alpha: list[dict] | None = None
    rolling_vol: list[dict] | None = None

    def to_dict(self) -> dict:
        d = {}
        for k, v in self.__dict__.items():
            if v is not None:
                d[k] = v
        return d


def compute_metrics(
    equity_curve: list[dict],
    trades: list[dict | TradeRecord],
    initial_capital: float,
    benchmark_returns: list[float] | None = None,
    risk_free_rate: float = 0.0,
    num_backtests_tried: int = 1,
) -> MetricsResult:
    """Compute all analytics from an equity curve and trade list."""
    result = MetricsResult()

    if len(equity_curve) < 2:
        return result

    # Convert trades to dicts if needed
    trade_dicts = []
    for t in trades:
        if isinstance(t, TradeRecord):
            trade_dicts.append(t.to_dict())
        else:
            trade_dicts.append(t)

    equities = np.array([p["equity"] for p in equity_curve], dtype=float)
    # Suppress divide-by-zero/invalid warnings: equity can legitimately be 0
    # (e.g. first bar before any capital is deployed).  The resulting inf/nan
    # values are then removed by finite_mask, so they never affect calculations.
    with np.errstate(divide='ignore', invalid='ignore'):
        raw_returns = np.diff(equities) / equities[:-1]
    finite_mask = np.isfinite(raw_returns)
    returns = raw_returns[finite_mask]
    # Return at position j = change from equity[j] → equity[j+1].
    # Date it as equity_curve[j+1] (the bar where the new value is observed).
    return_dates = [equity_curve[j + 1]["date"] for j in range(len(raw_returns)) if finite_mask[j]]

    if len(returns) == 0:
        return result

    # performance
    final = equities[-1]
    result.total_return_pct = round((final - initial_capital) / initial_capital * 100, 4)

    # Sharpe Ratio (sample std, ddof=1)
    daily_rf = risk_free_rate / 252
    excess = returns - daily_rf
    if np.std(excess, ddof=1) > 0:
        result.sharpe_ratio = round(float(np.mean(excess) / np.std(excess, ddof=1) * math.sqrt(252)), 4)

    # Sortino: downside dev over all returns (zero out wins). np.minimum(excess, 0)
    # gives proper formula — divides by N_total, not just losing days.
    downside_returns = np.minimum(excess, 0)
    downside_std = float(np.sqrt(np.mean(downside_returns ** 2)))
    if downside_std > 0:
        sortino = float(np.mean(excess) / downside_std * math.sqrt(252))
        # Guard against inf/nan from floating-point edge cases (e.g. a single
        # tiny negative return producing a near-zero downside_std)
        if math.isfinite(sortino):
            result.sortino_ratio = round(sortino, 4)

    # Volatility (annualised)
    result.volatility_annual = round(float(np.std(returns, ddof=1) * math.sqrt(252)) * 100, 4)

    # Downside dev: same as Sortino denominator
    result.downside_deviation = round(downside_std * math.sqrt(252) * 100, 4)

    # VaR / CVaR (historical simulation method)
    if len(returns) >= 10:
        sorted_returns = np.sort(returns)
        # 95% VaR: the 5th-percentile loss
        var_95_val = float(np.percentile(sorted_returns, 5))
        result.var_95 = round(var_95_val * 100, 4)
        # CVaR Expected Shortfall, mean of returns below the VaR threshold
        tail_95 = sorted_returns[sorted_returns <= var_95_val]
        if len(tail_95) > 0:
            result.cvar_95 = round(float(np.mean(tail_95)) * 100, 4)

        # 99% VaR / CVaR
        var_99_val = float(np.percentile(sorted_returns, 1))
        result.var_99 = round(var_99_val * 100, 4)
        tail_99 = sorted_returns[sorted_returns <= var_99_val]
        if len(tail_99) > 0:
            result.cvar_99 = round(float(np.mean(tail_99)) * 100, 4)

    # Max Drawdown
    # Use np.where to avoid division by zero when peak == 0 (e.g. strategy
    # starts with zero equity or equity goes negative).
    peak = np.maximum.accumulate(equities)
    with np.errstate(divide='ignore', invalid='ignore'):
        drawdowns = np.where(peak > 0, (peak - equities) / peak * 100, 0.0)
    result.max_drawdown_pct = round(float(np.max(drawdowns)), 4)

    # CAGR & Calmar: use calendar days between first/last bar
    num_days = len(equity_curve)
    result.num_days = num_days
    years = 0.0
    try:
        start_dt = datetime.strptime(equity_curve[0]["date"][:10], "%Y-%m-%d")
        end_dt = datetime.strptime(equity_curve[-1]["date"][:10], "%Y-%m-%d")
        calendar_days = (end_dt - start_dt).days
        years = calendar_days / 365.25 if calendar_days > 0 else 0.0
    except (ValueError, IndexError):
        years = num_days / 252  # fallback if dates are wonky
    if years > 0:
        ann_return = ((final / initial_capital) ** (1 / years) - 1) * 100
        result.cagr = round(ann_return, 4)
        if result.max_drawdown_pct > 0:
            result.calmar_ratio = round(ann_return / result.max_drawdown_pct, 4)

    # Max drawdown duration
    in_dd = drawdowns > 0
    max_dd_dur = 0
    current_dur = 0
    for dd in in_dd:
        if dd:
            current_dur += 1
            max_dd_dur = max(max_dd_dur, current_dur)
        else:
            current_dur = 0
    result.max_drawdown_duration_days = max_dd_dur

    # trade stats
    result.total_trades = len(trade_dicts)
    if trade_dicts:
        winners = [t for t in trade_dicts if t.get("pnl", 0) > 0]
        losers = [t for t in trade_dicts if t.get("pnl", 0) < 0]
        result.win_rate = round(len(winners) / len(trade_dicts) * 100, 2)

        gross_profit = sum(t.get("pnl", 0) for t in winners)
        gross_loss = abs(sum(t.get("pnl", 0) for t in losers))
        if gross_loss > 0:
            result.profit_factor = round(gross_profit / gross_loss, 4)

        # Expectancy and win/loss stats
        avg_win = gross_profit / len(winners) if winners else 0
        avg_loss = gross_loss / len(losers) if losers else 0
        win_pct = len(winners) / len(trade_dicts)
        loss_pct = 1 - win_pct
        result.expectancy = round(avg_win * win_pct - avg_loss * loss_pct, 2)
        result.avg_win = round(avg_win, 2) if winners else None
        result.avg_loss = round(avg_loss, 2) if losers else None
        result.loss_rate = round(loss_pct * 100, 2)

        # Avg trade duration
        durations = []
        for t in trade_dicts:
            try:
                entry = datetime.strptime(t["entry_date"], "%Y-%m-%d")
                exit_ = datetime.strptime(t["exit_date"], "%Y-%m-%d")
                durations.append((exit_ - entry).days)
            except (ValueError, KeyError):
                pass
        if durations:
            result.avg_trade_duration = round(sum(durations) / len(durations), 2)

        # Max consecutive losses
        max_streak = 0
        cur_streak = 0
        for t in trade_dicts:
            if t.get("pnl", 0) < 0:
                cur_streak += 1
                max_streak = max(max_streak, cur_streak)
            else:
                cur_streak = 0
        result.max_consecutive_losses = max_streak

        # TCA
        result.total_commission = round(sum(t.get("commission", 0) for t in trade_dicts), 2)
        result.total_slippage = round(sum(t.get("slippage_cost", 0) for t in trade_dicts), 2)
        result.total_spread_cost = round(sum(t.get("spread_cost", 0) for t in trade_dicts), 2)
        total_cost = result.total_commission + result.total_slippage + result.total_spread_cost
        total_pnl = sum(t.get("pnl", 0) for t in trade_dicts)
        if abs(total_pnl) > 0:
            result.cost_as_pct_of_pnl = round(total_cost / abs(total_pnl) * 100, 2)

    # Exposure % — all calendar days held, divided by total calendar days of the backtest.
    # No weekday filter: correct for equities, crypto, and FX alike.
    if trade_dicts and num_days > 0:
        held_days: set[str] = set()
        for t in trade_dicts:
            try:
                entry = datetime.strptime(t["entry_date"][:10], "%Y-%m-%d")
                exit_ = datetime.strptime(t["exit_date"][:10], "%Y-%m-%d")
                d = entry
                while d <= exit_:
                    held_days.add(d.strftime("%Y-%m-%d"))
                    d += timedelta(days=1)
            except (ValueError, KeyError):
                pass
        try:
            start_dt = datetime.strptime(equity_curve[0]["date"][:10], "%Y-%m-%d")
            end_dt = datetime.strptime(equity_curve[-1]["date"][:10], "%Y-%m-%d")
            total_calendar_days = (end_dt - start_dt).days + 1
        except (ValueError, IndexError):
            total_calendar_days = num_days
        if total_calendar_days > 0:
            result.exposure_pct = round(len(held_days) / total_calendar_days * 100, 2)

    # CAPM decomposition (beta, alpha, R², IR)
    if benchmark_returns is not None and len(benchmark_returns) >= len(returns):
        bm = np.array(benchmark_returns[:len(returns)])
        valid = np.isfinite(bm) & np.isfinite(returns)
        if valid.sum() > 10:
            bm_valid = bm[valid]
            ret_valid = returns[valid]
            cov = np.cov(ret_valid, bm_valid)
            if cov[1, 1] > 0:
                result.beta = round(float(cov[0, 1] / cov[1, 1]), 4)
                result.alpha = round(
                    float((np.mean(ret_valid) - daily_rf - result.beta * (np.mean(bm_valid) - daily_rf)) * 252) * 100, 4
                )
                # R²: predicted = alpha_daily + beta*(bm - rf)
                alpha_daily = result.alpha / 252 / 100
                predicted = daily_rf + alpha_daily + result.beta * (bm_valid - daily_rf)
                ss_res = np.sum((ret_valid - predicted) ** 2)
                ss_tot = np.sum((ret_valid - np.mean(ret_valid)) ** 2)
                if ss_tot > 0:
                    result.r_squared = round(1 - float(ss_res / ss_tot), 4)

            # Information ratio
            tracking = ret_valid - bm_valid
            if np.std(tracking, ddof=1) > 0:
                result.information_ratio = round(
                    float(np.mean(tracking) / np.std(tracking, ddof=1) * math.sqrt(252)), 4
                )

    # Treynor Ratio: (CAGR - Rf) / Beta
    if result.beta and result.beta != 0 and result.cagr is not None:
        result.treynor_ratio = round((result.cagr - risk_free_rate * 100) / result.beta, 4)

    # rolling metrics — 63-bar window (~3 months), or half the data if shorter
    window = min(63, len(returns) // 2)
    if window >= 20:
        result.rolling_sharpe = _compute_rolling_metric(
            returns, return_dates, window, "sharpe", daily_rf
        )
        result.rolling_sortino = _compute_rolling_metric(
            returns, return_dates, window, "sortino", daily_rf
        )
        if benchmark_returns and len(benchmark_returns) >= len(returns):
            result.rolling_beta = _compute_rolling_beta(
                returns, np.array(benchmark_returns[:len(returns)]),
                return_dates, window
            )
        result.rolling_vol = _compute_rolling_vol(returns, return_dates, 21)

    # overfitting checks — only run when there were multiple trial runs
    if result.sharpe_ratio is not None and num_backtests_tried > 1:
        result.deflated_sharpe_ratio = _deflated_sharpe(
            result.sharpe_ratio, len(returns), num_backtests_tried
        )
        result.robustness_score = _robustness_score(result)

    return result


def _compute_rolling_metric(
    returns: np.ndarray, return_dates: list[str], window: int,
    metric: str, daily_rf: float
) -> list[dict]:
    """Rolling metric over returns. return_dates[i] matches returns[i] (NaNs filtered out earlier)."""
    results = []
    for i in range(window, len(returns)):
        r = returns[i - window:i]
        excess = r - daily_rf
        date = return_dates[i] if i < len(return_dates) else return_dates[-1]

        if metric == "sharpe":
            std = float(np.std(excess, ddof=1))
            val = float(np.mean(excess) / std * math.sqrt(252)) if std > 0 else 0
        elif metric == "sortino":
            ds = float(np.sqrt(np.mean(np.minimum(excess, 0) ** 2)))
            val = float(np.mean(excess) / ds * math.sqrt(252)) if ds > 0 else 0
        else:
            val = 0

        results.append({"date": date, "value": round(val, 4)})
    return results


def _compute_rolling_beta(
    returns: np.ndarray, benchmark: np.ndarray,
    return_dates: list[str], window: int
) -> list[dict]:
    results = []
    for i in range(window, len(returns)):
        r = returns[i - window:i]
        b = benchmark[i - window:i]
        valid = np.isfinite(r) & np.isfinite(b)
        if valid.sum() > 5:
            cov = np.cov(r[valid], b[valid])
            if cov[1, 1] > 0:
                beta = float(cov[0, 1] / cov[1, 1])
            else:
                beta = 0
        else:
            beta = 0
        date = return_dates[i] if i < len(return_dates) else return_dates[-1]
        results.append({"date": date, "value": round(beta, 4)})
    return results


def _compute_rolling_vol(
    returns: np.ndarray, return_dates: list[str], window: int
) -> list[dict]:
    """Rolling annualised vol: std of returns × √252 × 100."""
    results = []
    for i in range(window, len(returns)):
        r = returns[i - window:i]
        vol = float(np.std(r, ddof=1) * math.sqrt(252) * 100)
        date = return_dates[i] if i < len(return_dates) else return_dates[-1]
        results.append({"date": date, "value": round(vol, 4)})
    return results


def _deflated_sharpe(sharpe: float, n_obs: int, n_trials: int) -> float:
    """Deflated Sharpe Ratio — Bailey & López de Prado (2014).

    Returns a probability in [0, 1] representing the confidence that the
    observed Sharpe is genuine after correcting for multiple testing.
    Values >= 0.95 indicate high confidence; < 0.5 suggests the result
    may be a product of data-snooping.
    """
    if n_obs <= 1 or n_trials <= 1:
        # not enough runs to adjust — return a neutral 0.5
        return 0.5

    # expected max Sharpe under the null (Gumbel approximation)
    euler_mascheroni = 0.5772
    expected_max_sr = math.sqrt(2 * math.log(n_trials)) - (
        (euler_mascheroni + math.log(math.pi / 2)) / (2 * math.sqrt(2 * math.log(n_trials)))
    ) if n_trials > 1 else 0

    # SE of the Sharpe estimate
    se = math.sqrt((1 + 0.5 * sharpe ** 2) / n_obs) if n_obs > 0 else 1

    # map to a probability via normal CDF
    z = (sharpe - expected_max_sr) / se if se > 0 else 0
    from math import erf
    psr = 0.5 * (1 + erf(z / math.sqrt(2)))

    return round(psr, 4)


def _robustness_score(result: MetricsResult) -> float:
    """Composite score 0-100 from Sharpe, drawdown, trade count, profit factor, win rate."""
    score = 50.0  # Base

    # Sharpe bonus (max +20)
    if result.sharpe_ratio:
        score += min(result.sharpe_ratio * 10, 20)

    # Drawdown penalty (max -20)
    if result.max_drawdown_pct > 0:
        score -= min(result.max_drawdown_pct / 2, 20)

    # Trade count bonus (more trades = more statistical significance)
    if result.total_trades >= 100:
        score += 10
    elif result.total_trades >= 30:
        score += 5

    # Profit factor bonus (max +10)
    if result.profit_factor and result.profit_factor > 1:
        score += min((result.profit_factor - 1) * 5, 10)

    # Win rate balance (40-60% is healthiest)
    if 35 <= result.win_rate <= 65:
        score += 5

    # Deflated Sharpe bonus (DSR is now a probability 0-1; scale to max 10 pts)
    if result.deflated_sharpe_ratio and result.deflated_sharpe_ratio > 0:
        score += min(result.deflated_sharpe_ratio * 10, 10)

    return round(max(0, min(100, score)), 1)


def derive_drawdown_series(equity_curve: list[dict]) -> list[dict]:
    """Compute drawdown percentage series from equity curve."""
    if not equity_curve:
        return []
    peak = equity_curve[0]["equity"]
    series = []
    for point in equity_curve:
        eq = point["equity"]
        if eq > peak:
            peak = eq
        dd = round((peak - eq) / peak * 100, 4) if peak > 0 else 0
        series.append({"date": point["date"], "drawdown_pct": dd})
    return series


def sample_series(series: list[dict], max_points: int = 200) -> list[dict]:
    """Down-sample a list to at most max_points, keeping first and last."""
    n = len(series)
    if n <= max_points:
        return series
    step = (n - 1) / (max_points - 1)
    indices = {0, n - 1}
    for i in range(1, max_points - 1):
        indices.add(round(i * step))
    return [series[i] for i in sorted(indices)]
