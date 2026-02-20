"""Universe selection module: dynamic asset filtering and scanning.

Filters tradeable assets based on liquidity, volume, volatility, and custom criteria.
Supports scheduled refresh for walk-forward and live trading scenarios.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable

import numpy as np
import pandas as pd


class FilterType(Enum):
    MIN_VOLUME = "min_volume"
    MIN_PRICE = "min_price"
    MAX_PRICE = "max_price"
    MIN_VOLATILITY = "min_volatility"
    MAX_VOLATILITY = "max_volatility"
    MIN_MARKET_CAP = "min_market_cap"
    CUSTOM = "custom"


@dataclass
class UniverseFilter:
    """A single filter criterion."""
    filter_type: FilterType
    value: float = 0
    custom_fn: Callable[[pd.DataFrame], bool] | None = None

    def passes(self, data: pd.DataFrame, symbol: str = "") -> bool:
        if data.empty:
            return False

        if self.filter_type == FilterType.MIN_VOLUME:
            avg_vol = data["Volume"].mean() if "Volume" in data.columns else 0
            return avg_vol >= self.value

        elif self.filter_type == FilterType.MIN_PRICE:
            last_close = data["Close"].iloc[-1] if "Close" in data.columns else 0
            return last_close >= self.value

        elif self.filter_type == FilterType.MAX_PRICE:
            last_close = data["Close"].iloc[-1] if "Close" in data.columns else float("inf")
            return last_close <= self.value

        elif self.filter_type == FilterType.MIN_VOLATILITY:
            if "Close" not in data.columns or len(data) < 20:
                return False
            returns = data["Close"].pct_change().dropna()
            vol = returns.std() * np.sqrt(252) * 100  # annualized %
            return vol >= self.value

        elif self.filter_type == FilterType.MAX_VOLATILITY:
            if "Close" not in data.columns or len(data) < 20:
                return True
            returns = data["Close"].pct_change().dropna()
            vol = returns.std() * np.sqrt(252) * 100
            return vol <= self.value

        elif self.filter_type == FilterType.CUSTOM:
            if self.custom_fn is not None:
                return self.custom_fn(data)
            return True

        return True


@dataclass
class UniverseConfig:
    """Configuration for universe selection."""
    filters: list[UniverseFilter] = field(default_factory=list)
    refresh_frequency: str = "monthly"  # "daily", "weekly", "monthly", "never"
    lookback_days: int = 60             # Data window for filter evaluation
    min_history_days: int = 30          # Minimum required data points


class UniverseSelector:
    """Selects and manages the tradeable universe of assets.

    Usage:
        selector = UniverseSelector(config)
        selected = selector.select(candidate_data)
    """

    def __init__(self, config: UniverseConfig | None = None):
        self.config = config or UniverseConfig()
        self._current_universe: list[str] = []
        self._last_refresh: datetime | None = None
        self._history: list[dict] = []  # Track universe changes over time

    def select(
        self,
        candidate_data: dict[str, pd.DataFrame],
        current_date: datetime | None = None,
    ) -> list[str]:
        """Filter candidates and return symbols that pass all criteria.

        Args:
            candidate_data: Dict mapping symbol -> recent OHLCV DataFrame.
            current_date: Current simulation date (for refresh tracking).

        Returns:
            List of symbols that pass all filters.
        """
        selected = []
        for symbol, data in candidate_data.items():
            if len(data) < self.config.min_history_days:
                continue
            # Use only the lookback window
            window = data.tail(self.config.lookback_days)
            if all(f.passes(window, symbol) for f in self.config.filters):
                selected.append(symbol)

        self._current_universe = sorted(selected)

        if current_date:
            self._history.append({
                "date": current_date.isoformat() if isinstance(current_date, datetime) else str(current_date),
                "count": len(selected),
                "symbols": selected[:20],  # Cap for storage
            })
            self._last_refresh = current_date

        return self._current_universe

    def should_refresh(self, current_date: datetime) -> bool:
        if self._last_refresh is None:
            return True
        freq = self.config.refresh_frequency
        if freq == "never":
            return False
        if freq == "daily":
            return current_date.date() != self._last_refresh.date() if hasattr(self._last_refresh, 'date') else True
        if freq == "weekly":
            delta = current_date - self._last_refresh if isinstance(self._last_refresh, datetime) else None
            return delta is not None and delta.days >= 7
        if freq == "monthly":
            if isinstance(self._last_refresh, datetime):
                return current_date.month != self._last_refresh.month or current_date.year != self._last_refresh.year
            return True
        return True

    @property
    def current_universe(self) -> list[str]:
        return self._current_universe.copy()

    @property
    def history(self) -> list[dict]:
        return self._history.copy()

    def add_filter(self, filter_type: FilterType, value: float) -> None:
        self.config.filters.append(UniverseFilter(filter_type=filter_type, value=value))

    def clear_filters(self) -> None:
        self.config.filters.clear()

    def on_securities_changed(
        self, added: list[str], removed: list[str],
        callback: Any | None = None,
    ) -> None:
        """Notify listeners that the universe changed.

        Strategies can register a callback for this event.
        """
        if callback:
            callback(added, removed)

    def refresh_if_needed(
        self,
        current_date: datetime,
        candidate_data: dict[str, pd.DataFrame],
        callback: Any | None = None,
    ) -> tuple[list[str], list[str]]:
        """Check if refresh is needed and refresh if so.

        Returns (added_symbols, removed_symbols).
        """
        if not self.should_refresh(current_date):
            return [], []

        old_universe = set(self._current_universe)
        new_universe = set(self.select(candidate_data, current_date))

        added = sorted(new_universe - old_universe)
        removed = sorted(old_universe - new_universe)

        if (added or removed) and callback:
            self.on_securities_changed(added, removed, callback)

        return added, removed


class UniverseRanker:
    """Ranks symbols based on various criteria for multi-symbol scanning.

    Usage:
        ranker = UniverseRanker()
        ranked = ranker.rank_by_momentum(candidate_data, top_n=10)
    """

    @staticmethod
    def rank_by_momentum(
        candidate_data: dict[str, pd.DataFrame],
        period: int = 20,
        top_n: int = 10,
    ) -> list[tuple[str, float]]:
        """Rank symbols by momentum (rate of change)."""
        scores: list[tuple[str, float]] = []
        for symbol, data in candidate_data.items():
            if "Close" not in data.columns or len(data) <= period:
                continue
            closes = data["Close"].values
            roc = (closes[-1] - closes[-period - 1]) / closes[-period - 1] * 100
            scores.append((symbol, float(roc)))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_n]

    @staticmethod
    def rank_by_volume(
        candidate_data: dict[str, pd.DataFrame],
        period: int = 20,
        top_n: int = 10,
    ) -> list[tuple[str, float]]:
        """Rank symbols by average volume."""
        scores: list[tuple[str, float]] = []
        for symbol, data in candidate_data.items():
            if "Volume" not in data.columns or len(data) < period:
                continue
            avg_vol = float(data["Volume"].tail(period).mean())
            scores.append((symbol, avg_vol))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_n]

    @staticmethod
    def rank_by_volatility(
        candidate_data: dict[str, pd.DataFrame],
        period: int = 20,
        top_n: int = 10,
        ascending: bool = False,
    ) -> list[tuple[str, float]]:
        """Rank symbols by volatility (annualized std of returns)."""
        scores: list[tuple[str, float]] = []
        for symbol, data in candidate_data.items():
            if "Close" not in data.columns or len(data) < period + 1:
                continue
            returns = data["Close"].pct_change().dropna().tail(period)
            vol = float(returns.std() * np.sqrt(252) * 100)
            scores.append((symbol, vol))
        scores.sort(key=lambda x: x[1], reverse=not ascending)
        return scores[:top_n]

    @staticmethod
    def rank_by_relative_strength(
        candidate_data: dict[str, pd.DataFrame],
        benchmark_data: pd.DataFrame | None = None,
        period: int = 60,
        top_n: int = 10,
    ) -> list[tuple[str, float]]:
        """Rank symbols by relative strength vs benchmark."""
        scores: list[tuple[str, float]] = []
        for symbol, data in candidate_data.items():
            if "Close" not in data.columns or len(data) < period:
                continue
            asset_return = (data["Close"].iloc[-1] / data["Close"].iloc[-period] - 1) * 100
            benchmark_return = 0.0
            if benchmark_data is not None and "Close" in benchmark_data.columns and len(benchmark_data) >= period:
                benchmark_return = (benchmark_data["Close"].iloc[-1] / benchmark_data["Close"].iloc[-period] - 1) * 100
            rs = float(asset_return - benchmark_return)
            scores.append((symbol, rs))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_n]

    @staticmethod
    def find_correlated_pairs(
        candidate_data: dict[str, pd.DataFrame],
        period: int = 60,
        min_correlation: float = 0.8,
    ) -> list[tuple[str, str, float]]:
        """Find correlated pairs for pair trading."""
        symbols = list(candidate_data.keys())
        pairs: list[tuple[str, str, float]] = []
        returns_cache: dict[str, np.ndarray] = {}

        for symbol in symbols:
            data = candidate_data[symbol]
            if "Close" not in data.columns or len(data) < period + 1:
                continue
            r = data["Close"].pct_change().dropna().tail(period).values
            returns_cache[symbol] = r

        checked = set()
        for s1 in returns_cache:
            for s2 in returns_cache:
                if s1 >= s2:
                    continue
                pair_key = (s1, s2)
                if pair_key in checked:
                    continue
                checked.add(pair_key)
                if len(returns_cache[s1]) != len(returns_cache[s2]):
                    continue
                try:
                    corr = float(np.corrcoef(returns_cache[s1], returns_cache[s2])[0, 1])
                    if abs(corr) >= min_correlation:
                        pairs.append((s1, s2, corr))
                except Exception:
                    continue

        pairs.sort(key=lambda x: abs(x[2]), reverse=True)
        return pairs
