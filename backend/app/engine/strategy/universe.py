"""Dynamic universe selection.

Filter and manage the tradable universe based on volume, price, volatility.
Supports scheduled refresh for periodic rebalancing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np

from app.engine.data.feed import BarData


@dataclass
class UniverseFilter:
    """Criteria for filtering the tradable universe."""
    min_price: float | None = None
    max_price: float | None = None
    min_avg_volume: float | None = None
    max_avg_volume: float | None = None
    max_volatility: float | None = None     # Annualized %
    min_market_cap: float | None = None     # Future: fundamental filter
    sectors: list[str] | None = None        # Future: sector filter


class UniverseSelector:
    """Manages a dynamic universe of tradable symbols."""

    def __init__(
        self,
        filter_config: UniverseFilter | None = None,
        refresh_interval_bars: int = 20,  # Re-evaluate every 20 bars (~1 month daily)
    ):
        self.filter = filter_config or UniverseFilter()
        self.refresh_interval = refresh_interval_bars
        self._universe: set[str] = set()
        self._all_symbols: set[str] = set()
        self._last_refresh: int = -1

        # Cached stats per symbol
        self._symbol_stats: dict[str, dict[str, float]] = {}

    @property
    def symbols(self) -> list[str]:
        return sorted(self._universe)

    def add_candidates(self, symbols: list[str]) -> None:
        self._all_symbols.update(symbols)

    def update_stats(self, symbol: str, bars: list[BarData]) -> None:
        """Update cached statistics for a symbol from recent bars."""
        if not bars:
            return

        prices = [b.close for b in bars]
        volumes = [b.volume for b in bars]

        stats: dict[str, float] = {
            "last_price": prices[-1],
            "avg_volume": float(np.mean(volumes)) if volumes else 0,
        }

        if len(prices) >= 2:
            returns = np.diff(prices) / prices[:-1]
            returns = returns[np.isfinite(returns)]
            if len(returns) > 0:
                stats["volatility_annual"] = float(np.std(returns) * np.sqrt(252) * 100)
            else:
                stats["volatility_annual"] = 0
        else:
            stats["volatility_annual"] = 0

        self._symbol_stats[symbol] = stats

    def refresh(self, bar_index: int) -> list[str]:
        """Re-evaluate universe based on current stats. Returns new universe."""
        if bar_index - self._last_refresh < self.refresh_interval and self._last_refresh >= 0:
            return self.symbols

        self._last_refresh = bar_index
        new_universe: set[str] = set()

        for symbol in self._all_symbols:
            stats = self._symbol_stats.get(symbol)
            if stats is None:
                continue

            # Apply filters
            price = stats.get("last_price", 0)
            volume = stats.get("avg_volume", 0)
            vol = stats.get("volatility_annual", 0)

            if self.filter.min_price and price < self.filter.min_price:
                continue
            if self.filter.max_price and price > self.filter.max_price:
                continue
            if self.filter.min_avg_volume and volume < self.filter.min_avg_volume:
                continue
            if self.filter.max_avg_volume and volume > self.filter.max_avg_volume:
                continue
            if self.filter.max_volatility and vol > self.filter.max_volatility:
                continue

            new_universe.add(symbol)

        self._universe = new_universe
        return self.symbols
